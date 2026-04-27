const { Pool } = require("pg");

const ssl =
  (process.env.DB_SSL || "false").toLowerCase() === "true"
    ? { rejectUnauthorized: false }
    : false;

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl
});

pool.on("error", (err) => {
  console.error("[db] unexpected error on idle client", err);
});

module.exports = pool;