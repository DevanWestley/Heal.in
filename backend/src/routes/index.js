const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const { detectRisk } = require("../utils/riskDetector");

// health
router.get("/health", async (_req, res, next) => {
  try {
    const q = await pool.query(
      `select now() as db_time, current_database() as db_name, current_user as db_user`
    );
    return res.json({ ok: true, ...q.rows[0] });
  } catch (e) {
    next(e);
  }
});

// users anonymous
router.post("/users/anonymous", async (_req, res, next) => {
  try {
    const handle = `anon_${Math.random().toString(36).slice(2, 8)}`;
    const q = await pool.query(
      `insert into users (anon_handle) values ($1) returning id, anon_handle, created_at`,
      [handle]
    );
    return res.status(201).json(q.rows[0]);
  } catch (e) {
    next(e);
  }
});

// create session
router.post("/sessions", async (req, res, next) => {
  try {
    const { user_id, topic } = req.body;
    if (!user_id) return res.status(400).json({ error: "user_id is required" });

    const user = await pool.query(`select id from users where id = $1`, [user_id]);
    if (!user.rowCount) return res.status(404).json({ error: "user not found" });

    const q = await pool.query(
      `insert into sessions (user_id, topic) values ($1, $2)
       returning id, user_id, counselor_id, topic, status, created_at, matched_at, closed_at`,
      [user_id, topic || null]
    );

    return res.status(201).json(q.rows[0]);
  } catch (e) {
    next(e);
  }
});

// assign counselor
router.post("/sessions/:id/assign", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { counselor_id } = req.body;
    if (!counselor_id) return res.status(400).json({ error: "counselor_id is required" });

    const c = await pool.query(`select id from counselors where id = $1`, [counselor_id]);
    if (!c.rowCount) return res.status(404).json({ error: "counselor not found" });

    const q = await pool.query(
      `update sessions
       set counselor_id = $1, status = 'matched', matched_at = now()
       where id = $2
       returning id, user_id, counselor_id, topic, status, created_at, matched_at, closed_at`,
      [counselor_id, id]
    );
    if (!q.rowCount) return res.status(404).json({ error: "session not found" });

    return res.json(q.rows[0]);
  } catch (e) {
    next(e);
  }
});

// close session
router.post("/sessions/:id/close", async (req, res, next) => {
  try {
    const { id } = req.params;
    const q = await pool.query(
      `update sessions
       set status = 'closed', closed_at = now()
       where id = $1
       returning id, user_id, counselor_id, topic, status, created_at, matched_at, closed_at`,
      [id]
    );
    if (!q.rowCount) return res.status(404).json({ error: "session not found" });
    return res.json(q.rows[0]);
  } catch (e) {
    next(e);
  }
});

// send message
router.post("/sessions/:id/messages", async (req, res, next) => {
  try {
    const { id: session_id } = req.params;
    const { sender, body } = req.body;

    if (!sender || !body) {
      return res.status(400).json({ error: "sender and body are required" });
    }

    const s = await pool.query(`select id, status from sessions where id = $1`, [session_id]);
    if (!s.rowCount) return res.status(404).json({ error: "session not found" });
    if (s.rows[0].status === "closed") {
      return res.status(400).json({ error: "session is closed" });
    }

    const m = await pool.query(
      `insert into messages (session_id, sender, body)
       values ($1, $2, $3)
       returning id, session_id, sender, body, created_at`,
      [session_id, sender, body]
    );
    const message = m.rows[0];

    let risk_flag = null;
    if (sender === "user") {
      const risk = detectRisk(body);
      if (risk.flagged) {
        const rf = await pool.query(
          `insert into risk_flags (session_id, message_id, level, score, reason)
           values ($1, $2, $3, $4, $5)
           returning id, level, score, reason, created_at`,
          [session_id, message.id, risk.level, risk.score, risk.reason]
        );
        risk_flag = rf.rows[0];
      }
    }

    return res.status(201).json({ message, risk_flag });
  } catch (e) {
    next(e);
  }
});

// get messages
router.get("/sessions/:id/messages", async (req, res, next) => {
  try {
    const { id: session_id } = req.params;

    const s = await pool.query(`select id from sessions where id = $1`, [session_id]);
    if (!s.rowCount) return res.status(404).json({ error: "session not found" });

    const q = await pool.query(
      `select
         m.id, m.session_id, m.sender, m.body, m.created_at,
         rf.level as risk_level, rf.score as risk_score, rf.reason as risk_reason
       from messages m
       left join risk_flags rf on rf.message_id = m.id
       where m.session_id = $1
       order by m.created_at asc`,
      [session_id]
    );

    return res.json({ data: q.rows });
  } catch (e) {
    next(e);
  }
});

// report
router.post("/sessions/:id/report", async (req, res, next) => {
  try {
    const { id: session_id } = req.params;
    const { reporter_user_id, category, detail } = req.body;

    if (!category || !detail) {
      return res.status(400).json({ error: "category and detail are required" });
    }

    const s = await pool.query(`select id from sessions where id = $1`, [session_id]);
    if (!s.rowCount) return res.status(404).json({ error: "session not found" });

    const q = await pool.query(
      `insert into reports (session_id, reporter_user_id, category, detail)
       values ($1, $2, $3, $4)
       returning id, session_id, reporter_user_id, category, detail, status, created_at`,
      [session_id, reporter_user_id || null, category, detail]
    );

    return res.status(201).json(q.rows[0]);
  } catch (e) {
    next(e);
  }
});

module.exports = router;