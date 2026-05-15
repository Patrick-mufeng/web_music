/**
 * MusicPlayer — 音频频谱可视化模块
 * 基于 Web Audio API 的实时频谱分析
 * 注意：MediaElementSource 只能创建一次，不能重复创建
 */

class SpectrumVisualizer {
  constructor() {
    this.canvas = document.getElementById('spectrumCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.audioContext = null;
    this.analyser = null;
    this.source = null;
    this.animationId = null;
    this.bars = 48;
    this.dataArray = null;
    this.width = 0;
    this.height = 0;
    this._connected = false;  // 标记 source 是否已创建
    this._boundDraw = this._draw.bind(this);
    this._boundResize = this._resize.bind(this);

    this._resize();
    window.addEventListener('resize', this._boundResize);
  }

  _resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.width = rect.width;
    this.height = rect.height;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  connect(audioElement) {
    if (!audioElement) return;

    // AudioContext 只创建一次
    if (!this.audioContext || this.audioContext.state === 'closed') {
      try {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        console.warn('[Spectrum] AudioContext 创建失败:', e);
        return;
      }
    }

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }

    // 如果已有 source，先断开旧的 analyser
    if (this.analyser) {
      try { this.analyser.disconnect(); } catch(e) {}
    }

    // MediaElementSource 只能创建一次！
    if (!this._connected) {
      try {
        this.analyser = this.audioContext.createAnalyser();
        this.source = this.audioContext.createMediaElementSource(audioElement);
        this.source.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);
        this._connected = true;
      } catch (e) {
        console.warn('[Spectrum] 连接 audio element 失败:', e);
        return;
      }
    } else {
      // 已连接过，只更新 analyser
      this.analyser = this.audioContext.createAnalyser();
      // 把 source 连到新的 analyser（source 不能重建，但可以连新的 analyser）
      try {
        this.source.disconnect();
        this.source.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);
      } catch(e) {
        console.warn('[Spectrum] 重新连接analyser失败:', e);
        return;
      }
    }

    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.8;
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.start();
  }

  start() {
    if (this.animationId) return;
    this._draw();
  }

  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.width || 500, this.height || 60);
    }
  }

  _draw() {
    this.animationId = requestAnimationFrame(this._boundDraw);

    if (!this.analyser || !this.dataArray || !this.ctx) return;

    const ctx = this.ctx;
    const w = this.width || 500;
    const h = this.height || 60;

    ctx.clearRect(0, 0, w, h);

    this.analyser.getByteFrequencyData(this.dataArray);

    const barCount = this.bars;
    const barWidth = (w / barCount) * 0.65;
    const gap = (w / barCount) * 0.35;
    const step = Math.floor(this.dataArray.length / barCount);

    const style = getComputedStyle(document.body);
    const accentColor = style.getPropertyValue('--accent').trim() || '#00d4ff';

    for (let i = 0; i < barCount; i++) {
      let value = 0;
      const startIdx = i * step;
      for (let j = 0; j < step; j++) {
        value += this.dataArray[startIdx + j] || 0;
      }
      value = value / step / 255;

      const barHeight = Math.max(2, value * h * 0.85);
      const x = i * (barWidth + gap) + gap / 2;
      const y = h - barHeight;

      const gradient = ctx.createLinearGradient(x, h, x, y);
      gradient.addColorStop(0, accentColor + '33');
      gradient.addColorStop(0.5, accentColor + '88');
      gradient.addColorStop(1, accentColor);

      const radius = Math.min(barWidth / 2, 2.5);
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.lineTo(x + barWidth - radius, y);
      ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
      ctx.lineTo(x + barWidth, h);
      ctx.closePath();

      ctx.fillStyle = gradient;
      ctx.shadowColor = accentColor;
      ctx.shadowBlur = value * 8;
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  disconnect() {
    this.stop();
    // 不断开 source，只清理 analyser
    if (this.analyser) {
      try { this.analyser.disconnect(); } catch(e) {}
      this.analyser = null;
    }
    this.dataArray = null;
  }

  destroy() {
    this.disconnect();
    if (this.source) {
      try { this.source.disconnect(); } catch(e) {}
      this.source = null;
    }
    this._connected = false;
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
    }
    this.audioContext = null;
    window.removeEventListener('resize', this._boundResize);
  }
}

const spectrum = new SpectrumVisualizer();
