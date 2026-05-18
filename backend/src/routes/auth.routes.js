const router = require("express").Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../db/pool");

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

// POST /api/auth/register
// body: { username, password, role: 'counselor' (default) }
router.post("/register", async (req, res, next) => {
  try {
    const { username, password, role } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const userRole = role === "admin" ? "admin" : "counselor";

    if (userRole === "counselor") {
      const q = `
        insert into counselors (name, email, specialization, is_active, is_available, display_name, password_hash)
        values ($1, $2, 'General', true, true, $1, $3)
        returning id, name as username, 'counselor' as role, created_at
      `;
      // Use username as placeholder email if not provided
      const email = req.body.email || `${username}@healin.local`;
      const r = await pool.query(q, [username, email, passwordHash]);
      const user = r.rows[0];
      const token = generateToken(user);
      return res.status(201).json({ token, user });
    }

    // admin
    const q = `
      insert into users (username, email, password_hash, role)
      values ($1, $2, $3, $4)
      returning id, username, role, created_at
    `;
    const email = req.body.email || `${username}@healin.local`;
    const r = await pool.query(q, [username, email, passwordHash, userRole]);
    const user = r.rows[0];
    const token = generateToken(user);
    res.status(201).json({ token, user });
  } catch (e) {
    if (e.code === "23505") {
      return res.status(409).json({ error: "Username already exists" });
    }
    next(e);
  }
});

// POST /api/auth/login
// body: { username, password }
router.post("/login", async (req, res, next) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    // Check counselors table first (name field)
    const counselorQ = `
      select id, name as username, 'counselor' as role, password_hash, created_at
      from counselors
      where name = $1 and is_active = true
      limit 1
    `;
    const counselorR = await pool.query(counselorQ, [username]);

    if (counselorR.rowCount > 0) {
      const counselor = counselorR.rows[0];
      if (!counselor.password_hash) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const valid = await bcrypt.compare(password, counselor.password_hash);
      if (!valid) return res.status(401).json({ error: "Invalid credentials" });
      delete counselor.password_hash;
      const token = generateToken(counselor);
      return res.json({ token, user: counselor });
    }

    // Check users table (admin)
    const userQ = `
      select id, username, role, password_hash, created_at
      from users
      where username = $1
      limit 1
    `;
    const userR = await pool.query(userQ, [username]);

    if (userR.rowCount === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const dbUser = userR.rows[0];
    const valid = await bcrypt.compare(password, dbUser.password_hash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });

    const user = {
      id: dbUser.id,
      username: dbUser.username,
      role: dbUser.role || "admin",
      created_at: dbUser.created_at
    };
    const token = generateToken(user);
    res.json({ token, user });
  } catch (e) {
    next(e);
  }
});

// POST /api/auth/register-user
// Register user biasa (bukan counselor/admin) — tetap anonim di sesi
// body: { username, email, password }
router.post("/register-user", async (req, res, next) => {
  try {
    const { username, email, password } = req.body || {};

    if (!username || !email || !password) {
      return res.status(400).json({ error: "Username, email, and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const anonHandle = `Anon-${Math.floor(1000 + Math.random() * 9000)}`;

    const q = `
      insert into users (username, email, password_hash, anon_handle, role)
      values ($1, $2, $3, $4, 'user')
      returning id, username, email, anon_handle, role, created_at
    `;
    const r = await pool.query(q, [username, email, passwordHash, anonHandle]);
    const user = r.rows[0];
    const token = generateToken({ ...user, role: "user" });
    res.status(201).json({ token, user });
  } catch (e) {
    if (e.code === "23505") {
      if (e.constraint && e.constraint.includes("username")) {
        return res.status(409).json({ error: "Username already exists" });
      }
      if (e.constraint && e.constraint.includes("email")) {
        return res.status(409).json({ error: "Email already exists" });
      }
      return res.status(409).json({ error: "User already exists" });
    }
    next(e);
  }
});

// POST /api/auth/login-user
// Login user biasa
// body: { username, password }
router.post("/login-user", async (req, res, next) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const q = `
      select id, username, email, anon_handle, role, password_hash, created_at
      from users
      where username = $1 and role = 'user'
      limit 1
    `;
    const r = await pool.query(q, [username]);

    if (r.rowCount === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const dbUser = r.rows[0];
    const valid = await bcrypt.compare(password, dbUser.password_hash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });

    const user = {
      id: dbUser.id,
      username: dbUser.username,
      email: dbUser.email,
      anon_handle: dbUser.anon_handle,
      role: "user",
      created_at: dbUser.created_at
    };
    const token = generateToken(user);
    res.json({ token, user });
  } catch (e) {
    next(e);
  }
});

// GET /api/auth/me
router.get("/me", (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }
  try {
    const decoded = jwt.verify(authHeader.substring(7), process.env.JWT_SECRET);
    res.json({ user: { id: decoded.id, username: decoded.username, role: decoded.role } });
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
});

module.exports = router;
