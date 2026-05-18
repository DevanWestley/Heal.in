const pool = require("./db/pool");
const { detectRisk } = require("./services/riskDetection.service");

function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    console.log(`[socket] connected: ${socket.id}`);

    // Join a session room
    // Client emits: join_session { sessionId, role: 'user'|'counselor', senderId? }
    socket.on("join_session", ({ sessionId, role, senderId }) => {
      if (!sessionId) return;
      socket.join(sessionId);
      socket.data.sessionId = sessionId;
      socket.data.role = role;
      socket.data.senderId = senderId || null;

      console.log(`[socket] ${socket.id} joined session ${sessionId} as ${role}`);

      // Notify the other party
      socket.to(sessionId).emit("user_joined", { role, sessionId });
    });

    // Send a message
    // Client emits: send_message { sessionId, body, sender, sender_id? }
    socket.on("send_message", async ({ sessionId, body, sender, sender_id }) => {
      if (!sessionId || !body || !sender) return;

      const client = await pool.connect();
      try {
        await client.query("begin");

        const msgR = await client.query(
          `insert into messages (session_id, sender, sender_id, body)
           values ($1, $2, $3, $4) returning *`,
          [sessionId, sender, sender_id || null, body]
        );
        const message = msgR.rows[0];

        let flag = null;
        if (sender === "user") {
          const risk = detectRisk(body);
          if (risk) {
            const flagR = await client.query(
              `insert into risk_flags (session_id, message_id, level, score, reasons)
               values ($1, $2, $3::risk_level, $4, $5) returning *`,
              [sessionId, message.id, risk.level, risk.score, risk.reasons]
            );
            flag = flagR.rows[0];
          }
        }

        await client.query("commit");

        // Broadcast ke semua yang ada di room (termasuk pengirim)
        io.to(sessionId).emit("new_message", { message, risk_flag: flag });
      } catch (e) {
        await client.query("rollback");
        console.error("[socket] send_message error:", e.message);
        socket.emit("error", { message: "Failed to send message" });
      } finally {
        client.release();
      }
    });

    // Counselor assigns themselves to a session
    socket.on("session_assigned", ({ sessionId }) => {
      if (!sessionId) return;
      io.to(sessionId).emit("session_matched", { sessionId });
    });

    // Session closed
    socket.on("session_closed", ({ sessionId }) => {
      if (!sessionId) return;
      io.to(sessionId).emit("session_ended", { sessionId });
    });

    socket.on("disconnect", () => {
      console.log(`[socket] disconnected: ${socket.id}`);
    });
  });
}

module.exports = { registerSocketHandlers };
