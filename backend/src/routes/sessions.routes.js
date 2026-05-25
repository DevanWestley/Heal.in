const router = require("express").Router();
const pool = require("../db/pool");
const { detectRisk } = require("../services/riskDetection.service");
const { summarizeSession } = require("../services/summarize.service");
const { verifyToken, requireRole } = require("../middleware/auth");

// POST /api/sessions
// body: { user_id, topic }
router.post("/", async (req, res, next) => {
  try {
    const { user_id, topic } = req.body || {};
    if (!user_id) return res.status(400).json({ error: "user_id is required" });

    const q = `
      insert into sessions (user_id, topic, status)
      values ($1, $2, 'waiting')
      returning *
    `;
    const r = await pool.query(q, [user_id, topic || null]);
    res.status(201).json(r.rows[0]);
  } catch (e) {
    next(e);
  }
});

// GET /api/sessions
// - ?user_id=<uuid>     → sessions for a specific user (public)
// - ?status=waiting     → waiting queue for counselors (requires auth)
// - no params           → all sessions for admin (requires auth)
router.get("/", async (req, res, next) => {
  try {
    const { user_id, status } = req.query || {};

    if (user_id) {
      const q = `select * from sessions where user_id = $1 order by created_at desc`;
      const r = await pool.query(q, [user_id]);
      return res.json({ data: r.rows });
    }

    if (status) {
      const q = `
        select s.*,
          count(e.id) filter (where e.status = 'open') as open_escalations
        from sessions s
        left join escalations e on e.session_id = s.id
        where s.status = $1
        group by s.id
        order by open_escalations desc, s.created_at asc
      `;
      const r = await pool.query(q, [status]);
      return res.json({ data: r.rows });
    }

    const { counselor_id } = req.query;
    if (counselor_id) {
      const q = `
        select s.*,
          count(rf.id) filter (where rf.level = 'high') as high_risk_count
        from sessions s
        left join risk_flags rf on rf.session_id = s.id
        where s.counselor_id = $1 and s.status != 'closed'
        group by s.id
        order by s.matched_at desc
      `;
      const r = await pool.query(q, [counselor_id]);
      return res.json({ data: r.rows });
    }

    // No filter — admin only
    const q = `select * from sessions order by created_at desc`;
    const r = await pool.query(q);
    res.json({ data: r.rows });
  } catch (e) {
    next(e);
  }
});

// GET /api/sessions/escalations — open escalations (admin)
router.get("/escalations", verifyToken, requireRole("admin"), async (req, res, next) => {
  try {
    const q = `
      select e.*,
        s.status as session_status,
        s.counselor_id,
        m.body as message_body
      from escalations e
      join sessions s on e.session_id = s.id
      left join messages m on e.message_id = m.id
      where e.status = 'open'
      order by e.created_at desc
    `;
    const r = await pool.query(q);
    res.json({ data: r.rows });
  } catch (e) {
    next(e);
  }
});

// PATCH /api/sessions/escalations/:id/resolve — resolve escalation (admin)
router.patch("/escalations/:id/resolve", verifyToken, requireRole("admin"), async (req, res, next) => {
  try {
    const r = await pool.query(
      `update escalations set status = 'resolved' where id = $1 returning *`,
      [req.params.id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "Escalation not found" });
    res.json(r.rows[0]);
  } catch (e) {
    next(e);
  }
});

// --- Report sub-resource (must be above /:id to avoid conflict) ---

// GET /api/sessions/reports — counselors see only their sessions' reports; admin sees all
router.get("/reports", verifyToken, requireRole("counselor", "admin"), async (req, res, next) => {
  try {
    if (req.user.role === "counselor") {
      const q = `
        select r.* from reports r
        join sessions s on r.session_id = s.id
        where s.counselor_id = $1
        order by r.created_at desc
      `;
      const r = await pool.query(q, [req.user.id]);
      return res.json({ data: r.rows });
    }

    const q = `select * from reports order by created_at desc`;
    const r = await pool.query(q);
    res.json({ data: r.rows });
  } catch (e) {
    next(e);
  }
});

// PATCH /api/sessions/reports/:id/review — mark report as reviewed
router.patch("/reports/:id/review", verifyToken, requireRole("counselor", "admin"), async (req, res, next) => {
  try {
    const q = `
      update reports set status = 'reviewed'
      where id = $1
      returning *
    `;
    const r = await pool.query(q, [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: "Report not found" });
    res.json(r.rows[0]);
  } catch (e) {
    next(e);
  }
});

// DELETE /api/sessions/reports/:id — delete report (admin)
router.delete("/reports/:id", verifyToken, requireRole("admin"), async (req, res, next) => {
  try {
    const q = `delete from reports where id = $1`;
    const r = await pool.query(q, [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: "Report not found" });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

// GET /api/sessions/:id
router.get("/:id", async (req, res, next) => {
  try {
    const q = `select * from sessions where id = $1 limit 1`;
    const r = await pool.query(q, [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: "Session not found" });
    res.json(r.rows[0]);
  } catch (e) {
    next(e);
  }
});

// POST /api/sessions/:id/assign
// body: { counselor_id } — counselors are forced to self-assign
router.post("/:id/assign", verifyToken, requireRole("counselor", "admin"), async (req, res, next) => {
  try {
    // Counselors can only assign themselves, admins can assign anyone
    const counselor_id = req.user.role === "counselor" ? req.user.id : (req.body?.counselor_id);
    if (!counselor_id) return res.status(400).json({ error: "counselor_id is required" });

    const q = `
      update sessions
      set counselor_id = $2, status = 'matched', matched_at = now()
      where id = $1 and status = 'waiting'
      returning *
    `;
    const r = await pool.query(q, [req.params.id, counselor_id]);
    if (r.rowCount === 0) return res.status(404).json({ error: "Session not found or already assigned" });

    const io = req.app.get("io");
    if (io) io.to(req.params.id).emit("session_matched", { sessionId: req.params.id });

    res.json(r.rows[0]);
  } catch (e) {
    next(e);
  }
});

// POST /api/sessions/:id/close
router.post("/:id/close", verifyToken, requireRole("counselor", "admin"), async (req, res, next) => {
  try {
    // Counselors can only close sessions assigned to them
    let whereClause = `where id = $1`;
    const params = [req.params.id];
    if (req.user.role === "counselor") {
      whereClause += ` and counselor_id = $2`;
      params.push(req.user.id);
    }

    const q = `update sessions set status = 'closed', closed_at = now() ${whereClause} returning *`;
    const r = await pool.query(q, params);
    if (r.rowCount === 0) return res.status(404).json({ error: "Session not found or access denied" });

    const io = req.app.get("io");
    if (io) io.to(req.params.id).emit("session_ended", { sessionId: req.params.id });

    res.json(r.rows[0]);
  } catch (e) {
    next(e);
  }
});

// PATCH /api/sessions/:id — update session topic/status (admin)
router.patch("/:id", verifyToken, requireRole("admin"), async (req, res, next) => {
  try {
    const { topic, status } = req.body || {};
    const validStatuses = ["waiting", "matched", "active", "closed"];

    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${validStatuses.join(", ")}` });
    }

    const q = `
      update sessions
      set
        topic = coalesce($2, topic),
        status = coalesce($3, status)
      where id = $1
      returning *
    `;
    const r = await pool.query(q, [req.params.id, topic ?? null, status ?? null]);
    if (r.rowCount === 0) return res.status(404).json({ error: "Session not found" });
    res.json(r.rows[0]);
  } catch (e) {
    next(e);
  }
});

// DELETE /api/sessions/:id — delete session (admin)
router.delete("/:id", verifyToken, requireRole("admin"), async (req, res, next) => {
  try {
    const q = `delete from sessions where id = $1`;
    const r = await pool.query(q, [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: "Session not found" });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

// GET /api/sessions/:id/messages
router.get("/:id/messages", async (req, res, next) => {
  try {
    const q = `
      select
        m.*,
        rf.level as risk_level,
        rf.score as risk_score,
        rf.reasons as risk_reasons
      from messages m
      left join risk_flags rf on rf.message_id = m.id
      where m.session_id = $1
      order by m.created_at asc
    `;
    const r = await pool.query(q, [req.params.id]);
    res.json({ data: r.rows });
  } catch (e) {
    next(e);
  }
});

// POST /api/sessions/:id/messages
// body: { sender: 'user'|'counselor'|'system', sender_id?, body }
router.post("/:id/messages", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { sender, sender_id, body } = req.body || {};
    if (!sender) return res.status(400).json({ error: "sender is required" });
    if (!body) return res.status(400).json({ error: "body is required" });

    await client.query("begin");

    const msgR = await client.query(
      `insert into messages (session_id, sender, sender_id, body)
       values ($1, $2, $3, $4) returning *`,
      [req.params.id, sender, sender_id || null, body]
    );
    const message = msgR.rows[0];

    let flag = null;
    if (sender === "user") {
      const risk = await detectRisk(body);
      if (risk) {
        const flagR = await client.query(
          `insert into risk_flags (session_id, message_id, level, score, reasons)
           values ($1, $2, $3::risk_level, $4, $5) returning *`,
          [req.params.id, message.id, risk.level, risk.score, risk.reasons]
        );
        flag = flagR.rows[0];

        if (risk.level === "high") {
          await client.query(
            `insert into escalations (session_id, message_id, level, status)
             values ($1, $2, 'high', 'open')`,
            [req.params.id, message.id]
          );
        }
      }
    }

    await client.query("commit");

    const enrichedMessage = {
      ...message,
      risk_level: flag?.level ?? null,
      risk_score: flag?.score ?? null,
      risk_reasons: flag?.reasons ?? null,
    };

    res.status(201).json({ message: enrichedMessage, risk_flag: flag });
  } catch (e) {
    await client.query("rollback");
    next(e);
  } finally {
    client.release();
  }
});

// POST /api/sessions/:id/summarize — generate AI summary via Gemini
router.post("/:id/summarize", async (req, res, next) => {
  try {
    const sessionCheck = await pool.query(`select id, status from sessions where id = $1`, [req.params.id]);
    if (sessionCheck.rowCount === 0) return res.status(404).json({ error: "Session not found" });

    const msgResult = await pool.query(
      `select sender, body from messages where session_id = $1 order by created_at asc`,
      [req.params.id]
    );
    const messages = msgResult.rows;

    try {
      const result = await summarizeSession(messages);

      await pool.query(
        `update sessions set topic = coalesce($2, topic) where id = $1`,
        [req.params.id, result.topic]
      );

      // Simpan atau update ringkasan di session_summaries
      const existing = await pool.query(
        `select id from session_summaries where session_id = $1 limit 1`,
        [req.params.id]
      );
      if (existing.rowCount > 0) {
        await pool.query(
          `update session_summaries
           set ai_summary = $2, counselor_suggestion = $3, updated_at = now()
           where session_id = $1`,
          [req.params.id, result.summary, result.topic]
        );
      } else {
        await pool.query(
          `insert into session_summaries (session_id, ai_summary, counselor_suggestion)
           values ($1, $2, $3)`,
          [req.params.id, result.summary, result.topic]
        );
      }

      res.json(result);
    } catch (aiErr) {
      const msg = aiErr.message || "";
      if (msg.includes("503") || msg.includes("Service Unavailable")) {
        return res.status(503).json({ error: "Layanan AI sedang sibuk, coba lagi dalam beberapa detik." });
      }
      if (msg.includes("429") || msg.includes("quota")) {
        return res.status(429).json({ error: "Quota Gemini habis. Cek pengaturan billing di Google AI Studio." });
      }
      if (msg.includes("API_KEY") || msg.includes("not configured")) {
        return res.status(501).json({ error: "GEMINI_API_KEY belum dikonfigurasi." });
      }
      throw aiErr;
    }
  } catch (e) {
    next(e);
  }
});

// POST /api/sessions/:id/report
// body: { reporter_user_id?, category, detail }
router.post("/:id/report", async (req, res, next) => {
  try {
    const { reporter_user_id, category, detail } = req.body || {};
    if (!category) return res.status(400).json({ error: "category is required" });
    if (!detail) return res.status(400).json({ error: "detail is required" });

    const s = await pool.query(`select id from sessions where id = $1`, [req.params.id]);
    if (s.rowCount === 0) return res.status(404).json({ error: "Session not found" });

    const q = `
      insert into reports (session_id, reporter_user_id, category, detail, status)
      values ($1, $2, $3, $4, 'open') returning *
    `;
    const r = await pool.query(q, [req.params.id, reporter_user_id || null, category, detail]);
    res.status(201).json(r.rows[0]);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
