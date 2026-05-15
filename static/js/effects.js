/**
 * MusicPlayer — 背景特效模块
 * 星空粒子背景 Canvas
 */

class StarfieldBackground {
  constructor() {
    this.canvas = document.getElementById('starfieldCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.stars = [];
    this.animationId = null;
    this.width = 0;
    this.height = 0;
    this._resizeHandler = null;
    this._boundAnimate = this._animate.bind(this);

    this._resize();
    this._initStars();
    this._resizeHandler = () => this._resize();
    window.addEventListener('resize', this._resizeHandler);
    this.start();
  }

  _resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  _initStars() {
    const count = 150;
    this.stars = [];
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        radius: Math.random() * 1.8 + 0.3,
        opacity: Math.random() * 0.7 + 0.1,
        speedX: (Math.random() - 0.5) * 0.15,
        speedY: (Math.random() - 0.5) * 0.15,
        twinkleSpeed: Math.random() * 0.02 + 0.005,
        twinklePhase: Math.random() * Math.PI * 2
      });
    }
  }

  start() {
    if (this.animationId) return;
    this._animate();
  }

  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  _animate() {
    this.animationId = requestAnimationFrame(this._boundAnimate);

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    const style = getComputedStyle(document.body);
    const accentColor = style.getPropertyValue('--accent').trim() || '#00d4ff';
    const theme = document.body.dataset.theme;

    if (theme === 'minimal') return;

    for (const star of this.stars) {
      star.x += star.speedX;
      star.y += star.speedY;

      // 循环边界
      if (star.x < -10) star.x = this.width + 10;
      if (star.x > this.width + 10) star.x = -10;
      if (star.y < -10) star.y = this.height + 10;
      if (star.y > this.height + 10) star.y = -10;

      // 闪烁
      const twinkle = Math.sin(Date.now() * star.twinkleSpeed + star.twinklePhase) * 0.3 + 0.7;
      const alpha = star.opacity * twinkle;

      ctx.beginPath();
      ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);

      if (star.radius > 1.2) {
        ctx.fillStyle = accentColor.replace(')', `, ${alpha})`).replace('rgb', 'rgba');
        ctx.shadowColor = accentColor;
        ctx.shadowBlur = star.radius * 3;
      } else {
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.7})`;
        ctx.shadowBlur = 0;
      }

      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  destroy() {
    this.stop();
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
    }
  }
}

let starfield = null;

function initStarfield() {
  if (starfield) starfield.destroy();
  starfield = new StarfieldBackground();
}
