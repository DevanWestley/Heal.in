const router = require("express").Router();
const pool = require("../db/pool");
const { verifyToken, requireRole } = require("../middleware/auth");

// POST /api/users/anonymous
router.post("/anonymous", async (req, res, next) => {
  try {
    const handle = `Anon-${Math.floor(1000 + Math.random() * 9000)}`;
    const q = `
      insert into users (anon_handle)
      values ($1)
      returning id, anon_handle, created_at
    `;
    const r = await pool.query(q, [handle]);
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.code === "23505") {
      return res.status(409).json({ error: "Handle collision, retry request" });
    }
    next(e);
  }
});

// GET /api/users/:id — anonymous user lookup for "continue session"
router.get("/:id", async (req, res, next) => {
  try {
    const q = `
      select id, anon_handle, created_at
      from users
      where id = $1
      limit 1
    `;
    const r = await pool.query(q, [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: "User not found" });
    res.json(r.rows[0]);
  } catch (e) {
    next(e);
  }
});

// --- Admin-only endpoints ---

// GET /api/users — list all anonymous users
router.get("/", verifyToken, requireRole("admin"), async (req, res, next) => {
  try {
    const q = `
      select id, anon_handle, username, email, role, created_at
      from users
      order by created_at desc
    `;
    const r = await pool.query(q);
    res.json({ data: r.rows });
  } catch (e) {
    next(e);
  }
});

// PATCH /api/users/:id — update user
router.patch("/:id", verifyToken, requireRole("admin"), async (req, res, next) => {
  try {
    const { anon_handle } = req.body || {};
    if (!anon_handle) return res.status(400).json({ error: "anon_handle is required" });

    const q = `
      update users set anon_handle = $2
      where id = $1
      returning id, anon_handle, created_at
    `;
    const r = await pool.query(q, [req.params.id, anon_handle]);
    if (r.rowCount === 0) return res.status(404).json({ error: "User not found" });
    res.json(r.rows[0]);
  } catch (e) {
    next(e);
  }
});

// DELETE /api/users/:id — delete user
router.delete("/:id", verifyToken, requireRole("admin"), async (req, res, next) => {
  try {
    const q = `delete from users where id = $1`;
    const r = await pool.query(q, [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: "User not found" });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

module.exports = router;
