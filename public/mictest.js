class MicTester {
  constructor() {
    this.stream = null;
    this.audioContext = null;
    this.analyser = null;
    this.microphone = null;
    this.animationId = null;
    this.isActive = false;

    this.setupUI();
  }

  setupUI() {
    this.panel = document.getElementById("micTestPanel");
    this.testBtn = document.getElementById("testMicBtn");
    this.closeBtn = document.getElementById("closeMicTest");
    this.stopBtn = document.getElementById("stopMicTest");
    this.audioLevel = document.getElementById("audioLevel");
    this.micStatus = document.getElementById("micStatus");

    this.testBtn.addEventListener("click", () => this.start());
    this.closeBtn.addEventListener("click", () => this.stop());
    this.stopBtn.addEventListener("click", () => this.stop());
  }

  async start() {
    if (this.isActive) {
      return;
    }

    try {
      this.micStatus.textContent = "Requesting microphone access...";
      this.panel.classList.remove("hidden");

      // Get microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Setup audio context and analyser
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;

      this.microphone = this.audioContext.createMediaStreamSource(this.stream);
      this.microphone.connect(this.analyser);

      // Optional: Enable audio feedback (hear yourself)
      // Uncomment the next line if you want to hear your own voice
      // this.analyser.connect(this.audioContext.destination);

      this.isActive = true;
      this.micStatus.textContent = "✅ Microphone working! Speak to see the meter move.";
      
      // Start visualization
      this.visualize();

    } catch (err) {
      console.error("Microphone test error:", err);
      this.micStatus.textContent = "❌ Cannot access microphone. Check permissions.";
      
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

      // Update status based on level
      if (percentage > 5) {
        this.micStatus.textContent = `✅ Microphone working! Level: ${Math.round(percentage)}%`;
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
    this.micStatus.textContent = "Test stopped.";
    this.panel.classList.add("hidden");
  }
}
