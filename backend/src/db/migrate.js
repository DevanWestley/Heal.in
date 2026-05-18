require("dotenv").config();
const pool = require("./pool");

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("[migrate] Connecting to database...");

    await client.query(`
      ALTER TABLE public.counselors
        ADD COLUMN IF NOT EXISTS password_hash text
    `);
    console.log("[migrate] counselors.password_hash: OK");

    await client.query(`
      ALTER TABLE public.users
        ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user'
    `);
    console.log("[migrate] users.role: OK");

    // Seed default admin (password: 1234567890)
    await client.query(`
      INSERT INTO public.users (username, email, password_hash, role)
      VALUES (
        'admin',
        'admin@healin.com',
        '$2b$10$VCtTO3xNC5LcGg45ApZZ2u56.YTHmRGcToXYK/dFGCFkRR05.SCCe',
        'admin'
      )
      ON CONFLICT (username) DO UPDATE
        SET password_hash = EXCLUDED.password_hash,
            role = 'admin'
    `);
    console.log("[migrate] admin user seeded: OK");

    console.log("[migrate] All migrations complete.");
  } catch (e) {
    console.error("[migrate] ERROR:", e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
