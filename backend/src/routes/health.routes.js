const router = require("express").Router();
const pool = require("../db/pool");

router.get("/health", async (req, res, next) => {
  try {
    const result = await pool.query("select now() as now");
    res.json({ ok: true, db_time: result.rows[0].now });
  } catch (e) {
    next(e);
  }
});

module.exports = router;