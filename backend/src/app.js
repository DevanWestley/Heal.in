const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const healthRoutes = require("./routes/health.routes");
const usersRoutes = require("./routes/users.routes");
const sessionsRoutes = require("./routes/sessions.routes");
const authRoutes = require("./routes/auth.routes");
const errorHandler = require("./middleware/errorHandler");

const app = express();

// Security headers
app.use(helmet());

// Enable CORS for frontend
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
}));

app.use(express.json({ limit: "1mb" }));

// Rate limiting — global: 100 request per 15 menit per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Terlalu banyak request. Coba lagi dalam 15 menit." },
});

// Rate limiting ketat untuk auth endpoint (cegah brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Terlalu banyak percobaan login. Coba lagi dalam 15 menit." },
});

// Rate limiting untuk pesan chat (cegah spam)
const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Terlalu banyak pesan. Tunggu sebentar." },
});

app.use("/api", globalLimiter);
app.use("/api/auth", authLimiter);
app.use("/api/sessions/:id/messages", messageLimiter);

// Routes
app.use("/api", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/sessions", sessionsRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ error: "Not Found" });
});

// Error handler
app.use(errorHandler);

module.exports = app;