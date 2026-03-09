class VoiceChat {
  constructor(socket) {
    this.socket = socket;
    this.localStream = null;
    this.processedStream = null;
    this.audioContext = null;
    this.noiseGate = null;
    this.compressor = null;
    this.peers = new Map();
    this.roomId = null;
    this.isActive = false;
    this.peerId = null;
    this.noiseSuppressionEnabled = true;

    this.setupSocketListeners();
    this.setupNoiseSuppressionToggle();
  }

  setupNoiseSuppressionToggle() {
    const toggle = document.getElementById("noiseSuppressionToggle");
    if (toggle) {
      this.noiseSuppressionEnabled = toggle.checked;
      toggle.addEventListener("change", (e) => {
        this.noiseSuppressionEnabled = e.target.checked;
        if (this.isActive) {
          // Restart voice chat to apply changes
          const currentRoom = this.roomId;
          this.stop();
          setTimeout(() => this.start(currentRoom), 100);
        }
      });
    }
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

    // Use processed stream if available, otherwise use local stream
    const streamToSend = this.processedStream || this.localStream;
    
    if (streamToSend) {
      streamToSend.getTracks().forEach((track) => {
        pc.addTrack(track, streamToSend);
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

  async applyAdvancedNoiseFiltering(stream) {
    // Create audio context for advanced processing
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    const source = this.audioContext.createMediaStreamSource(stream);
    
    // Create a compressor to normalize audio levels
    this.compressor = this.audioContext.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-50, this.audioContext.currentTime);
    this.compressor.knee.setValueAtTime(40, this.audioContext.currentTime);
    this.compressor.ratio.setValueAtTime(12, this.audioContext.currentTime);
    this.compressor.attack.setValueAtTime(0, this.audioContext.currentTime);
    this.compressor.release.setValueAtTime(0.25, this.audioContext.currentTime);
    
    // Create a noise gate using GainNode
    this.noiseGate = this.audioContext.createGain();
    
    // Analyze audio to implement noise gate
    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.9;
    
    // Connect the audio processing chain
    source.connect(analyser);
    analyser.connect(this.noiseGate);
    this.noiseGate.connect(this.compressor);
    
    // Create destination for processed audio
    const destination = this.audioContext.createMediaStreamDestination();
    this.compressor.connect(destination);
    
    // Implement noise gate logic
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const noiseThreshold = 30; // Adjust this value for sensitivity
    
    const updateGate = () => {
      if (!this.isActive) return;
      
      analyser.getByteFrequencyData(dataArray);
      
      // Calculate average volume
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const average = sum / bufferLength;
      
      // Apply gate: if volume is below threshold, reduce gain
      if (average < noiseThreshold) {
        this.noiseGate.gain.linearRampToValueAtTime(0.1, this.audioContext.currentTime + 0.05);
      } else {
        this.noiseGate.gain.linearRampToValueAtTime(1.0, this.audioContext.currentTime + 0.05);
      }
      
      requestAnimationFrame(updateGate);
    };
    
    updateGate();
    
    return destination.stream;
  }

  async start(roomId) {
    if (this.isActive) {
      return;
    }

    try {
      // Get microphone with basic noise suppression
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: this.noiseSuppressionEnabled,
          autoGainControl: true
        }
      });

      // Apply advanced noise filtering if enabled
      if (this.noiseSuppressionEnabled) {
        this.processedStream = await this.applyAdvancedNoiseFiltering(this.localStream);
      } else {
        this.processedStream = this.localStream;
      }

      this.roomId = roomId;
      this.isActive = true;

      this.socket.emit("voice_join", { roomId }, (result) => {
        if (result?.ok) {
          this.peerId = result.peerId;
          console.log("Voice chat started, peerId:", this.peerId);
          console.log("Noise suppression:", this.noiseSuppressionEnabled ? "ENABLED (Krisp mode)" : "DISABLED");
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

    // Stop all tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    if (this.processedStream && this.processedStream !== this.localStream) {
      this.processedStream.getTracks().forEach((track) => track.stop());
      this.processedStream = null;
    }

    // Close audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.noiseGate = null;
    this.compressor = null;

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
