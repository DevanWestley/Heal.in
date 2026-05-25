const router = require("express").Router();
const pool = require("../db/pool");
const { verifyToken, requireRole } = require("../middleware/auth");

// GET /api/counselors — list all counselors (admin)
router.get("/", verifyToken, requireRole("admin"), async (req, res, next) => {
  try {
    const q = `
      select id, name, email, specialization, is_active, is_available, display_name, created_at
      from counselors
      order by created_at desc
    `;
    const r = await pool.query(q);
    res.json({ data: r.rows });
  } catch (e) {
    next(e);
  }
});

// PATCH /api/counselors/:id/suspend — suspend counselor (admin)
router.patch("/:id/suspend", verifyToken, requireRole("admin"), async (req, res, next) => {
  try {
    const q = `
      update counselors
      set is_active = false, is_available = false
      where id = $1
      returning id, name, email, is_active, is_available, created_at
    `;
    const r = await pool.query(q, [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: "Counselor not found" });
    res.json(r.rows[0]);
  } catch (e) {
    next(e);
  }
});

// PATCH /api/counselors/:id/unsuspend — reactivate counselor (admin)
router.patch("/:id/unsuspend", verifyToken, requireRole("admin"), async (req, res, next) => {
  try {
    const q = `
      update counselors
      set is_active = true, is_available = true
      where id = $1
      returning id, name, email, is_active, is_available, created_at
    `;
    const r = await pool.query(q, [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: "Counselor not found" });
    res.json(r.rows[0]);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
