const router = require("express").Router();
const pool = require("../db/pool");
const { detectRisk } = require("../services/riskDetection.service");

// POST /sessions
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

// POST /sessions/:id/assign
// body: { counselor_id }
router.post("/:id/assign", async (req, res, next) => {
  try {
    const { counselor_id } = req.body || {};
    if (!counselor_id) return res.status(400).json({ error: "counselor_id is required" });

    const q = `
      update sessions
      set counselor_id = $2,
          status = 'matched',
          matched_at = now()
      where id = $1
      returning *
    `;
    const r = await pool.query(q, [req.params.id, counselor_id]);
    if (r.rowCount === 0) return res.status(404).json({ error: "session not found" });

    res.json(r.rows[0]);
  } catch (e) {
    next(e);
  }
});

// POST /sessions/:id/messages
// body: { sender: 'user'|'counselor'|'system', sender_id?, body }
router.post("/:id/messages", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { sender, sender_id, body } = req.body || {};
    if (!sender) return res.status(400).json({ error: "sender is required" });
    if (!body) return res.status(400).json({ error: "body is required" });

    await client.query("begin");

    const insertMsgQ = `
      insert into messages (session_id, sender, sender_id, body)
      values ($1, $2, $3, $4)
      returning *
    `;
    const msgR = await client.query(insertMsgQ, [
      req.params.id,
      sender,
      sender_id || null,
      body
    ]);

    const message = msgR.rows[0];

    // run risk detection for user messages only (can adjust)
    let risk = null;
    if (sender === "user") risk = detectRisk(body);

    let flag = null;
    if (risk) {
      const insertFlagQ = `
        insert into risk_flags (message_id, level, score, reasons)
        values ($1, $2::risk_level, $3, $4)
        returning *
      `;
      const flagR = await client.query(insertFlagQ, [
        message.id,
        risk.level,
        risk.score,
        risk.reasons
      ]);
      flag = flagR.rows[0];
    }

    await client.query("commit");
    res.status(201).json({ message, risk_flag: flag });
  } catch (e) {
    await client.query("rollback");
    next(e);
  } finally {
    client.release();
  }
});

// GET /sessions/:id/messages
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

// GET /sessions/:id
router.get("/:id", async (req, res, next) => {
  try {
    const q = `select * from sessions where id = $1 limit 1`;
    const r = await pool.query(q, [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: "session not found" });
    res.json(r.rows[0]);
  } catch (e) {
    next(e);
  }
});

// GET /sessions?user_id=<uuid>
router.get("/", async (req, res, next) => {
  try {
    const { user_id } = req.query || {};
    if (!user_id) return res.status(400).json({ error: "user_id is required" });

    const q = `
      select *
      from sessions
      where user_id = $1
      order by created_at desc
    `;
    const r = await pool.query(q, [user_id]);
    res.json({ data: r.rows });
  } catch (e) {
    next(e);
  }
});

// POST /sessions/:id/close
// body: { reason? }
router.post("/:id/close", async (req, res, next) => {
  try {
    const q = `
      update sessions
      set status = 'closed',
          closed_at = now()
      where id = $1
      returning *
    `;
    const r = await pool.query(q, [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: "session not found" });

    res.json(r.rows[0]);
  } catch (e) {
    next(e);
  }
});

// POST /sessions/:id/report
// body: { reporter_user_id?, category, detail }
router.post("/:id/report", async (req, res, next) => {
  try {
    const { reporter_user_id, category, detail } = req.body || {};
    if (!category) return res.status(400).json({ error: "category is required" });
    if (!detail) return res.status(400).json({ error: "detail is required" });

    // pastikan session ada
    const s = await pool.query(`select id from sessions where id = $1`, [req.params.id]);
    if (s.rowCount === 0) return res.status(404).json({ error: "session not found" });

    const q = `
      insert into reports (session_id, reporter_user_id, category, detail, status)
      values ($1, $2, $3, $4, 'open')
      returning *
    `;
    const r = await pool.query(q, [req.params.id, reporter_user_id || null, category, detail]);
    res.status(201).json(r.rows[0]);
  } catch (e) {
    next(e);
  }
});

module.exports = router;