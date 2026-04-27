const express = require("express");

const healthRoutes = require("./routes/health.routes");
const usersRoutes = require("./routes/users.routes");
const sessionsRoutes = require("./routes/sessions.routes");
const errorHandler = require("./middleware/errorHandler");

const app = express();

app.use(express.json({ limit: "1mb" }));

app.use(healthRoutes);
app.use("/users", usersRoutes);
app.use("/sessions", sessionsRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ error: "Not Found" });
});

// error handler
app.use(errorHandler);

module.exports = app;