const router = require("express").Router();
const pool = require("../db/pool");

// POST /users/anonymous
// Creates an anonymous user with a generated anon_handle.
router.post("/anonymous", async (req, res, next) => {
  try {
    // generate simple handle
    const handle = `Anon-${Math.floor(1000 + Math.random() * 9000)}`;

    const q = `
      insert into users (anon_handle)
      values ($1)
      returning id, anon_handle, created_at
    `;
    const r = await pool.query(q, [handle]);

    res.status(201).json(r.rows[0]);
  } catch (e) {
    // if unique collision (rare), just retry once
    if (e && e.code === "23505") {
      return res.status(409).json({ error: "Handle collision, retry request" });
    }
    next(e);
  }
});

module.exports = router;