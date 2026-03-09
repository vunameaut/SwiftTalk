class MicTester {
  constructor() {
    this.stream = null;
    this.audioContext = null;
    this.analyser = null;
    this.microphone = null;
    this.gainNode = null;
    this.animationId = null;
    this.isActive = false;
    this.playbackEnabled = true;

    this.setupUI();
  }

  setupUI() {
    this.panel = document.getElementById("micTestPanel");
    this.testBtn = document.getElementById("testMicBtn");
    this.closeBtn = document.getElementById("closeMicTest");
    this.stopBtn = document.getElementById("stopMicTest");
    this.audioLevel = document.getElementById("audioLevel");
    this.micStatus = document.getElementById("micStatus");
    this.playbackToggle = document.getElementById("playbackToggle");

    this.testBtn.addEventListener("click", () => this.start());
    this.closeBtn.addEventListener("click", () => this.stop());
    this.stopBtn.addEventListener("click", () => this.stop());
    this.playbackToggle.addEventListener("change", (e) => this.togglePlayback(e.target.checked));
  }

  togglePlayback(enabled) {
    this.playbackEnabled = enabled;
    
    if (!this.isActive || !this.gainNode) {
      return;
    }

    if (enabled) {
      // Connect to speakers to hear yourself
      this.gainNode.connect(this.audioContext.destination);
      this.micStatus.textContent = "✅ Đang nghe lại giọng của bạn. Hãy nói thử!";
    } else {
      // Disconnect from speakers
      this.gainNode.disconnect(this.audioContext.destination);
      this.micStatus.textContent = "✅ Chỉ hiển thị âm lượng (không phát lại âm thanh)";
    }
  }

  async start() {
    if (this.isActive) {
      return;
    }

    try {
      this.micStatus.textContent = "Đang yêu cầu quyền truy cập micro...";
      this.panel.classList.remove("hidden");

      // Get microphone access without echo cancellation for testing
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false, // Disable to hear yourself clearly
          noiseSuppression: false,  // Disable for raw mic test
          autoGainControl: true
        }
      });

      // Setup audio context and analyser
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;

      // Create gain node for volume control
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 0.8; // Set to 80% to prevent feedback

      this.microphone = this.audioContext.createMediaStreamSource(this.stream);
      this.microphone.connect(this.analyser);
      this.microphone.connect(this.gainNode);

      // Connect to speakers if playback is enabled (Discord style - hear yourself)
      if (this.playbackToggle.checked) {
        this.gainNode.connect(this.audioContext.destination);
        this.micStatus.textContent = "✅ Đang nghe lại giọng của bạn. Hãy nói thử!";
      } else {
        this.micStatus.textContent = "✅ Chỉ hiển thị âm lượng";
      }

      this.isActive = true;
      
      // Start visualization
      this.visualize();

    } catch (err) {
      console.error("Microphone test error:", err);
      this.micStatus.textContent = "❌ Không thể truy cập micro. Kiểm tra quyền truy cập.";
      
      setTimeout(() => {
        if (!this.isActive) {
          this.panel.classList.add("hidden");
        }
      }, 3000);
    }
  }

  visualize() {
    if (!this.isActive || !this.analyser) {
      return;
    }

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const updateLevel = () => {
      if (!this.isActive) {
        return;
      }

      this.analyser.getByteFrequencyData(dataArray);

      // Calculate average volume
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const average = sum / bufferLength;
      
      // Convert to percentage (0-100)
      const percentage = Math.min(100, (average / 128) * 100);
      
      // Update visual meter
      this.audioLevel.style.width = `${percentage}%`;

      // Update status based on level (only if in default mode)
      if (percentage > 5 && this.micStatus.textContent.includes("✅")) {
        if (this.playbackToggle.checked) {
          this.micStatus.textContent = `✅ Nghe thấy micro! Âm lượng: ${Math.round(percentage)}%`;
        } else {
          this.micStatus.textContent = `✅ Micro hoạt động! Âm lượng: ${Math.round(percentage)}%`;
        }
      }

      this.animationId = requestAnimationFrame(updateLevel);
    };

    updateLevel();
  }

  stop() {
    this.isActive = false;

    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.microphone) {
      this.microphone.disconnect();
      this.microphone = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.analyser = null;
    this.audioLevel.style.width = "0%";
    this.micStatus.textContent = "Test đã dừng.";
    this.panel.classList.add("hidden");
  }
}
