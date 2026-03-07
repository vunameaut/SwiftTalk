const socket = io();

// Voice chat instance
let voiceChat = null;

// Mic tester instance
let micTester = null;

const createRoomBtn = document.getElementById("createRoomBtn");
const copyLinkBtn = document.getElementById("copyLinkBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const roomInput = document.getElementById("roomInput");
const roomBadge = document.getElementById("roomBadge");
const nicknameInput = document.getElementById("nicknameInput");
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");
const messagesEl = document.getElementById("messages");
const statusText = document.getElementById("statusText");
const voiceToggleBtn = document.getElementById("voiceToggleBtn");

let currentRoomId = null;

function getRoomIdFromPath() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] === "room" && parts[1]) {
    return parts[1];
  }
  return null;
}

function setStatus(text) {
  statusText.textContent = text;
}

function formatTime(iso) {
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function addSystemMessage(text, timestamp = new Date().toISOString()) {
  const li = document.createElement("li");
  li.className = "system";
  li.textContent = `[${formatTime(timestamp)}] ${text}`;
  messagesEl.appendChild(li);
  messagesEl.parentElement.scrollTop = messagesEl.parentElement.scrollHeight;
}

function addMessage(message) {
  const li = document.createElement("li");
  li.className = "message";

  const head = document.createElement("div");
  head.className = "message-head";

  const name = document.createElement("span");
  name.className = "message-name";
  name.textContent = message.nickname;

  const time = document.createElement("span");
  time.className = "message-time";
  time.textContent = formatTime(message.timestamp);

  const body = document.createElement("p");
  body.textContent = message.text;
  body.style.margin = "0";

  head.append(name, time);
  li.append(head, body);
  messagesEl.appendChild(li);
  messagesEl.parentElement.scrollTop = messagesEl.parentElement.scrollHeight;
}

function clearMessages() {
  messagesEl.innerHTML = "";
}

function getNickname() {
  const value = nicknameInput.value.trim();
  if (!value) {
    return "Guest";
  }
  return value.slice(0, 30);
}

function joinRoom(roomId) {
  const nickname = getNickname();

  socket.emit("join_room", { roomId, nickname }, (result) => {
    if (!result?.ok) {
      setStatus(result?.error || "Unable to join room.");
      return;
    }

    currentRoomId = roomId;
    roomInput.value = roomId;
    roomBadge.textContent = `Room ${roomId.slice(0, 8)}...`;
    setStatus(`Connected as ${nickname}`);
    window.history.replaceState({}, "", `/room/${roomId}`);
    
    // Enable voice chat button
    voiceToggleBtn.disabled = false;
  });
}

async function createRoom() {
  setStatus("Creating room...");

  try {
    const response = await fetch("/api/rooms", { 
      method: "POST",
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Create room failed:", response.status, errorText);
      setStatus(`Failed to create room: ${response.status}`);
      return;
    }

    const data = await response.json();

    if (!data.roomId) {
      console.error("No roomId in response:", data);
      setStatus(data?.error || "Cannot create room right now.");
      return;
    }

    joinRoom(data.roomId);
  } catch (error) {
    console.error("Network error:", error);
    setStatus("Network error while creating room. Check console.");
  }
}

createRoomBtn.addEventListener("click", async () => {
  try {
    await createRoom();
  } catch (_err) {
    setStatus("Network error while creating room.");
  }
});

joinRoomBtn.addEventListener("click", () => {
  const roomId = roomInput.value.trim();
  if (!roomId) {
    setStatus("Enter a room ID first.");
    return;
  }
  joinRoom(roomId);
});

copyLinkBtn.addEventListener("click", async () => {
  if (!currentRoomId) {
    setStatus("Join a room first to copy link.");
    return;
  }

  try {
    await navigator.clipboard.writeText(window.location.href);
    setStatus("Room link copied.");
  } catch (_err) {
    setStatus("Could not copy link.");
  }
});

messageForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const message = messageInput.value.trim();
  if (!message) {
    return;
  }

  socket.emit("send_message", { message }, (result) => {
    if (!result?.ok) {
      setStatus(result?.error || "Cannot send message.");
      return;
    }

    messageInput.value = "";
  });
});

socket.on("connect", () => {
  console.log("Socket connected with ID:", socket.id);
  setStatus("Socket connected.");

  const roomIdFromPath = getRoomIdFromPath();
  if (roomIdFromPath) {
    joinRoom(roomIdFromPath);
  }
});

socket.on("disconnect", () => {
  console.log("Socket disconnected");
  setStatus("Socket disconnected.");
  roomBadge.textContent = "Not connected";
  currentRoomId = null;
});

socket.on("connect_error", (error) => {
  console.error("Socket connection error:", error);
  setStatus("Connection error. Check console.");
});

socket.on("room_history", (messages) => {
  clearMessages();
  for (const message of messages) {
    addMessage(message);
  }
});

socket.on("receive_message", (message) => {
  addMessage(message);
});

socket.on("system_message", (message) => {
  addSystemMessage(message.text, message.timestamp);
});

// Voice chat initialization
voiceChat = new VoiceChat(socket);

// Mic tester initialization
micTester = new MicTester();

voiceToggleBtn.addEventListener("click", async () => {
  if (!currentRoomId) {
    setStatus("Join a room first to use voice chat.");
    return;
  }

  try {
    if (voiceChat.isActive) {
      voiceChat.stop();
      setStatus("Voice chat stopped.");
    } else {
      await voiceChat.start(currentRoomId);
      setStatus("Voice chat started. Speak freely!");
    }
  } catch (err) {
    console.error("Voice chat error:", err);
    setStatus("Voice chat error. Check microphone permissions.");
  }
});

// Auto-fill room input from URL when opening a shared room link.
const roomIdFromPath = getRoomIdFromPath();
if (roomIdFromPath) {
  roomInput.value = roomIdFromPath;
}
