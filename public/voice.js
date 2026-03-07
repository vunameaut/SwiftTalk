class VoiceChat {
  constructor(socket) {
    this.socket = socket;
    this.localStream = null;
    this.peers = new Map();
    this.roomId = null;
    this.isActive = false;
    this.peerId = null;

    this.setupSocketListeners();
  }

  setupSocketListeners() {
    this.socket.on("voice_user_joined", ({ peerId, nickname }) => {
      console.log(`Voice: ${nickname} joined`);
      this.createPeerConnection(peerId, true);
      this.updateVoiceUI();
    });

    this.socket.on("voice_offer", async ({ from, offer, nickname }) => {
      console.log(`Voice: Received offer from ${nickname}`);
      const pc = this.createPeerConnection(from, false);
      
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this.socket.emit("voice_answer", {
        to: from,
        answer: pc.localDescription
      });
    });

    this.socket.on("voice_answer", async ({ from, answer }) => {
      console.log(`Voice: Received answer from ${from}`);
      const pc = this.peers.get(from);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    this.socket.on("voice_ice_candidate", async ({ from, candidate }) => {
      const pc = this.peers.get(from);
      if (pc && candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    this.socket.on("voice_user_left", ({ peerId }) => {
      console.log(`Voice: User ${peerId} left`);
      this.removePeer(peerId);
      this.updateVoiceUI();
    });
  }

  createPeerConnection(peerId, isInitiator) {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
      ]
    });

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit("voice_ice_candidate", {
          to: peerId,
          candidate: event.candidate
        });
      }
    };

    pc.ontrack = (event) => {
      console.log(`Voice: Receiving audio from ${peerId}`);
      const audio = new Audio();
      audio.srcObject = event.streams[0];
      audio.play().catch((err) => console.error("Audio play error:", err));
    };

    pc.onconnectionstatechange = () => {
      console.log(`Peer ${peerId} connection state: ${pc.connectionState}`);
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        this.removePeer(peerId);
      }
    };

    this.peers.set(peerId, pc);

    if (isInitiator) {
      this.initiateCall(peerId, pc);
    }

    return pc;
  }

  async initiateCall(peerId, pc) {
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      this.socket.emit("voice_offer", {
        to: peerId,
        offer: pc.localDescription
      });
    } catch (err) {
      console.error("Error creating offer:", err);
    }
  }

  removePeer(peerId) {
    const pc = this.peers.get(peerId);
    if (pc) {
      pc.close();
      this.peers.delete(peerId);
    }
  }

  async start(roomId) {
    if (this.isActive) {
      return;
    }

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      this.roomId = roomId;
      this.isActive = true;

      this.socket.emit("voice_join", { roomId }, (result) => {
        if (result?.ok) {
          this.peerId = result.peerId;
          console.log("Voice chat started, peerId:", this.peerId);
          this.updateVoiceUI();
        } else {
          this.stop();
        }
      });
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Cannot access microphone. Please check permissions.");
      throw err;
    }
  }

  stop() {
    if (!this.isActive) {
      return;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    for (const [peerId, pc] of this.peers.entries()) {
      pc.close();
    }
    this.peers.clear();

    if (this.roomId) {
      this.socket.emit("voice_leave", { roomId: this.roomId });
    }

    this.isActive = false;
    this.roomId = null;
    this.peerId = null;
    this.updateVoiceUI();
  }

  updateVoiceUI() {
    const voiceBtn = document.getElementById("voiceToggleBtn");
    const voiceStatus = document.getElementById("voiceStatus");
    const activePeers = document.getElementById("activePeers");

    if (this.isActive) {
      voiceBtn.textContent = "🔇 Stop Voice";
      voiceBtn.classList.add("voice-active");
      voiceStatus.textContent = `In voice (${this.peers.size} peer${this.peers.size !== 1 ? "s" : ""})`;
    } else {
      voiceBtn.textContent = "🎤 Start Voice";
      voiceBtn.classList.remove("voice-active");
      voiceStatus.textContent = "Voice inactive";
    }

    activePeers.textContent = `${this.peers.size} peer${this.peers.size !== 1 ? "s" : ""} connected`;
  }
}
