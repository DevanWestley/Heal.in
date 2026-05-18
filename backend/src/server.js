require("dotenv").config();
const http = require("http");
const { Server } = require("socket.io");
const app = require("./app");
const { registerSocketHandlers } = require("./socket");

const port = process.env.PORT || 8000;

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  },
});

registerSocketHandlers(io);
app.set("io", io);

server.listen(port, () => {
  console.log(`[server] listening on http://localhost:${port}`);
});
