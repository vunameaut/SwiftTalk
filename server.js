const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const rateLimit = require("express-rate-limit");
const { v4: uuidv4, validate: isUuid } = require("uuid");

const PORT = Number(process.env.PORT || 3001);
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_MESSAGES_PER_ROOM = 200;
const MAX_MESSAGE_LENGTH = 500;
const MESSAGE_COOLDOWN_MS = 400;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"]
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files with proper MIME types
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    }
  }
}));

const roomCreationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many room creation requests. Try again shortly." }
});

const rooms = new Map();

function sanitizeMessage(input) {
  if (typeof input !== "string") {
    return "";
  }

  const normalized = input.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  const truncated = normalized.slice(0, MAX_MESSAGE_LENGTH);

  return truncated
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getOrCreateRoom(roomId) {
  const now = Date.now();
  const existing = rooms.get(roomId);

  if (existing) {
    existing.lastActivity = now;
    return existing;
  }

  const roomState = {
    messages: [],
    createdAt: now,
    lastActivity: now
  };

  rooms.set(roomId, roomState);
  return roomState;
}

function cleanupRooms() {
  const now = Date.now();

  for (const [roomId, roomState] of rooms.entries()) {
    if (now - roomState.lastActivity > ROOM_TTL_MS) {
      rooms.delete(roomId);
    }
  }
}

setInterval(cleanupRooms, 5 * 60 * 1000).unref();

app.post("/api/rooms", roomCreationLimiter, (_req, res) => {
  const roomId = uuidv4();
  getOrCreateRoom(roomId);
  res.status(201).json({ roomId });
});

app.get("/room/:roomId", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

// Catch-all route for SPA - must be last
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

io.on("connection", (socket) => {
  socket.data.nickname = "Guest";
  socket.data.roomId = null;
  socket.data.lastMessageAt = 0;

  socket.on("join_room", ({ roomId, nickname }, ack = () => {}) => {
    if (!isUuid(roomId)) {
      ack({ ok: false, error: "Invalid room ID." });
      return;
    }

    const cleanName = sanitizeMessage(String(nickname || "Guest")).slice(0, 30) || "Guest";
    const room = getOrCreateRoom(roomId);

    if (socket.data.roomId) {
      socket.leave(socket.data.roomId);
    }

    socket.join(roomId);
    socket.data.nickname = cleanName;
    socket.data.roomId = roomId;

    socket.emit("room_history", room.messages);
    socket.to(roomId).emit("system_message", {
      text: `${cleanName} joined the room.`,
      timestamp: new Date().toISOString()
    });

    ack({ ok: true });
  });

  socket.on("send_message", (payload, ack = () => {}) => {
    const roomId = socket.data.roomId;

    if (!roomId) {
      ack({ ok: false, error: "Join a room first." });
      return;
    }

    const now = Date.now();
    if (now - socket.data.lastMessageAt < MESSAGE_COOLDOWN_MS) {
      ack({ ok: false, error: "You are sending too fast. Slow down." });
      return;
    }

    const text = sanitizeMessage(String(payload?.message || ""));
    if (!text) {
      ack({ ok: false, error: "Message cannot be empty." });
      return;
    }

    socket.data.lastMessageAt = now;

    const room = getOrCreateRoom(roomId);
    const message = {
      id: uuidv4(),
      roomId,
      nickname: socket.data.nickname,
      text,
      timestamp: new Date().toISOString()
    };

    room.messages.push(message);
    if (room.messages.length > MAX_MESSAGES_PER_ROOM) {
      room.messages.shift();
    }

    io.to(roomId).emit("receive_message", message);
    ack({ ok: true });
  });

  socket.on("voice_join", ({ roomId }, ack = () => {}) => {
    if (!isUuid(roomId)) {
      ack({ ok: false });
      return;
    }

    socket.join(`voice_${roomId}`);
    socket.to(`voice_${roomId}`).emit("voice_user_joined", {
      peerId: socket.id,
      nickname: socket.data.nickname
    });

    ack({ ok: true, peerId: socket.id });
  });

  socket.on("voice_offer", ({ to, offer }) => {
    io.to(to).emit("voice_offer", {
      from: socket.id,
      offer,
      nickname: socket.data.nickname
    });
  });

  socket.on("voice_answer", ({ to, answer }) => {
    io.to(to).emit("voice_answer", {
      from: socket.id,
      answer
    });
  });

  socket.on("voice_ice_candidate", ({ to, candidate }) => {
    io.to(to).emit("voice_ice_candidate", {
      from: socket.id,
      candidate
    });
  });

  socket.on("voice_leave", ({ roomId }) => {
    if (!roomId) {
      return;
    }

    socket.leave(`voice_${roomId}`);
    socket.to(`voice_${roomId}`).emit("voice_user_left", {
      peerId: socket.id
    });
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    if (!roomId) {
      return;
    }

    socket.to(roomId).emit("system_message", {
      text: `${socket.data.nickname} left the room.`,
      timestamp: new Date().toISOString()
    });

    socket.to(`voice_${roomId}`).emit("voice_user_left", {
      peerId: socket.id
    });
  });
});

server.listen(PORT, () => {
  console.log(`SwiftTalk server is running on port ${PORT}`);
});
