/**
 * MusicPlayer — 全屏歌词
 * 模式1: 3D空间 | 模式2: 毛玻璃+雨水
 */
const FS = {
  overlay: null, scene: null,
  visible: false, currentMode: '3d',
  idleTimer: null,

  // 歌词数据
  displayedIdx: -1,
  transitioning: false,

  // ============ 初始化 ============
  init() {
    this.overlay = document.getElementById('fsOverlay');
    this.scene = document.getElementById('fsScene');

    // 退出
    document.getElementById('fsExitBtn').addEventListener('click', () => this.hide());

    // 设置按钮 → 打开当前模式的设置面板
    document.getElementById('fsSettingsBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      const panel = this.currentMode === '3d'
        ? document.getElementById('fs3dSettingsPanel')
        : document.getElementById('fsGlassSettingsPanel');
      panel.classList.toggle('hidden');
    });

    // 模式切换
    document.querySelectorAll('.fs-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        if (mode === this.currentMode) return;
        this._switchMode(mode);
      });
    });

    // 全屏按钮
    document.getElementById('fullscreenBtn').addEventListener('click', () => this.toggle());

    // 键盘 ESC
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.visible) this.hide();
    });

    // 鼠标移动重置空闲
    this.scene.addEventListener('mousemove', () => this._resetIdle());

    // 点击关闭设置面板
    this.scene.addEventListener('click', e => {
      if (!e.target.closest('.fs-settings-panel') && !e.target.closest('#fsSettingsBtn')) {
        document.querySelectorAll('.fs-settings-panel').forEach(p => p.classList.add('hidden'));
      }
    });

    // 初始化两个模式
    Mode3D.init();
    ModeGlass.init();
  },

  show() {
    if (this.visible) return;
    this.visible = true;
    this.displayedIdx = -1;
    this.overlay.classList.remove('hidden');
    this._resetIdle();

    // 加载上次使用的模式
    const saved = localStorage.getItem('fs_mode') || '3d';
    this._switchMode(saved);

    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  },

  hide() {
    if (!this.visible) return;
    this.visible = false;
    this.overlay.classList.add('hidden');
    if (this.idleTimer) clearTimeout(this.idleTimer);
    ModeGlass.stopRain();
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  },

  toggle() { this.visible ? this.hide() : this.show(); },

  _resetIdle() {
    this.scene.classList.remove('idle');
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.scene.classList.add('idle'), 5000);
  },

  _switchMode(mode) {
    this.currentMode = mode;
    localStorage.setItem('fs_mode', mode);

    // 更新按钮
    document.querySelectorAll('.fs-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));

    // 切换显示
    document.getElementById('fsMode3D').classList.toggle('hidden', mode !== '3d');
    document.getElementById('fsModeGlass').classList.toggle('hidden', mode !== 'glass');

    // 关闭所有设置面板
    document.querySelectorAll('.fs-settings-panel').forEach(p => p.classList.add('hidden'));

    // 雨水
    if (mode === 'glass') ModeGlass.startRain(); else ModeGlass.stopRain();

    // 重置歌词
    this.displayedIdx = -1;
    if (mode === '3d') Mode3D.renderCurrentLine(true);
    if (mode === 'glass') ModeGlass.renderAllLyrics();
  },

  // 歌词更新（由 ui.js 调用）
  update() {
    if (!this.visible || this.transitioning) return;
    if (this.currentMode === '3d') Mode3D.update();
    if (this.currentMode === 'glass') ModeGlass.update();
    // 更新时间
    const td = document.getElementById('fsTimeDisplay');
    if (td) td.textContent = `${formatTime(player.getCurrentTime())} / ${formatTime(player.getDuration())}`;
  },

  // 歌词数据就绪
  refresh() {
    if (!this.visible) return;
    this.displayedIdx = -1;
    if (this.currentMode === '3d') Mode3D.renderCurrentLine(true);
    if (this.currentMode === 'glass') ModeGlass.renderAllLyrics();
  }
};

// =============================================
// 模式1: 3D空间
// =============================================
const Mode3D = {
  block: null, mainEl: null, subEl: null,

  cfg: { font: "'Orbitron','Noto Sans SC',sans-serif", color: '#1a1a2e', size: 48, shadow: 10, anim: 'slide' },

  init() {
    this.block = document.getElementById('fs3dLyricBlock');
    this.mainEl = document.getElementById('fs3dLineMain');
    this.subEl = document.getElementById('fs3dLineSub');
    this._loadCfg(); this._applyCfg();
    this._initSettings();
  },

  _loadCfg() {
    try { const s = localStorage.getItem('fs_3d_cfg'); if (s) Object.assign(this.cfg, JSON.parse(s)); } catch (_) {}
  },
  _saveCfg() { localStorage.setItem('fs_3d_cfg', JSON.stringify(this.cfg)); },

  _applyCfg() {
    const s = this.cfg;
    this.mainEl.style.fontFamily = s.font; this.mainEl.style.color = s.color; this.mainEl.style.fontSize = s.size + 'px';
    this.mainEl.style.textShadow = `2px 3px ${s.shadow*0.6}px rgba(0,0,0,0.1), 4px 6px ${s.shadow*1.4}px rgba(0,0,0,0.05)`;
    const all = ['anim-slide','anim-fade','anim-scale','anim-blur','anim-rotate','anim-typewriter','anim-bounce','anim-flyIn'];
    this.block.classList.remove(...all); this.block.classList.add('anim-' + s.anim);
  },

  _initSettings() {
    const panel = document.getElementById('fs3dSettingsPanel');
    // 滑块
    ['fs3dSetSize','fs3dSetShadow'].forEach(id => {
      const key = id === 'fs3dSetSize' ? 'size' : 'shadow';
      const suf = key === 'size' ? 'px' : '';
      document.getElementById(id).addEventListener('input', () => {
        this.cfg[key] = parseInt(document.getElementById(id).value);
        document.getElementById(id + 'Val').textContent = this.cfg[key] + suf;
        this._applyCfg();
      });
    });
    document.getElementById('fs3dSetColor').addEventListener('input', () => { this.cfg.color = document.getElementById('fs3dSetColor').value; this._applyCfg(); });
    document.getElementById('fs3dSetFont').addEventListener('change', () => { this.cfg.font = document.getElementById('fs3dSetFont').value; this._applyCfg(); });
    document.getElementById('fs3dSetAnim').addEventListener('change', () => { this.cfg.anim = document.getElementById('fs3dSetAnim').value; this._applyCfg(); });
    document.getElementById('fs3dSetSave').addEventListener('click', () => { this._saveCfg(); panel.classList.add('hidden'); });
    document.getElementById('fs3dSetReset').addEventListener('click', () => {
      this.cfg = { font: "'Orbitron','Noto Sans SC',sans-serif", color: '#1a1a2e', size: 48, shadow: 10, anim: 'slide' };
      this._applyCfg(); this._syncUI();
    });
  },

  _syncUI() {
    const s = this.cfg;
    document.getElementById('fs3dSetFont').value = s.font;
    document.getElementById('fs3dSetColor').value = s.color;
    document.getElementById('fs3dSetSize').value = s.size; document.getElementById('fs3dSetSizeVal').textContent = s.size + 'px';
    document.getElementById('fs3dSetShadow').value = s.shadow; document.getElementById('fs3dSetShadowVal').textContent = s.shadow;
    document.getElementById('fs3dSetAnim').value = s.anim;
  },

  renderCurrentLine(instant) {
    const idx = lyrics.currentLine, line = lyrics.getCurrentLine();
    if (!line) { this.mainEl.textContent = ''; this.subEl.textContent = ''; return; }
    if (idx === FS.displayedIdx && !instant) return;
    const isFirst = FS.displayedIdx < 0 || instant;
    FS.displayedIdx = idx;

    this.block.classList.remove('entering', 'exiting');

    if (isFirst) {
      this._set(line); void this.block.offsetWidth; this.block.classList.add('entering'); this._onEnterEnd();
    } else {
      FS.transitioning = true;
      this.block.classList.add('exiting');
      const onEnd = () => { this.block.removeEventListener('animationend', onEnd); this.block.classList.remove('exiting'); this._set(line); void this.block.offsetWidth; this.block.classList.add('entering'); this._onEnterEnd(); };
      this.block.addEventListener('animationend', onEnd); setTimeout(onEnd, 500);
    }
  },

  _onEnterEnd() {
    const h = () => { this.block.removeEventListener('animationend', h); this.block.classList.remove('entering'); FS.transitioning = false; };
    this.block.addEventListener('animationend', h); setTimeout(h, 800);
  },

  _set(line) { this.mainEl.textContent = line.text; this.subEl.textContent = line.subText || ''; this.subEl.style.display = line.subText ? '' : 'none'; },

  update() {
    if (FS.transitioning) return;
    const idx = lyrics.currentLine;
    if (idx !== FS.displayedIdx) this.renderCurrentLine(false);
  }
};

// =============================================
// 模式2: 毛玻璃 + 雨水
// =============================================
const ModeGlass = {
  stage: null, inner: null, rainCanvas: null, cover: null,
  _userScrolling: false, _scrollTimer: null,

  cfg: { font: "'Orbitron','Noto Sans SC',sans-serif", color: '#ffffff', size: 42, blur: 8, bgImage: '' },

  init() {
    this.stage = document.getElementById('fsGlassLyricStage');
    this.inner = document.getElementById('fsGlassLyricInner');
    this.rainCanvas = document.getElementById('fsRainCanvas');
    this.cover = document.getElementById('fsGlassCover');
    this._loadCfg();
    this._applyBg();
    this._applyLyricStyle();
    this._initRain();
    this._initSettings();
    this._bindLyricEvents();
    if (lyrics.lines.length) this._renderAllLines();
  },

  _loadCfg() {
    try { const s = localStorage.getItem('fs_glass_cfg'); if (s) Object.assign(this.cfg, JSON.parse(s)); } catch (_) {}
  },
  _saveCfg() { localStorage.setItem('fs_glass_cfg', JSON.stringify(this.cfg)); },

  _applyCfg() {
    this._applyBg();
    this._applyLyricStyle();
  },

  // 仅背景切换（视频/图片/默认）
  _applyBg() {
    const s = this.cfg;
    if (!this.cover) return;

    if (s.bgImage) {
      this.cover.style.backgroundImage = `url(${s.bgImage})`;
      this.cover.style.backgroundSize = 'cover';
      this.cover.style.backgroundPosition = 'center';
      this.cover.style.backgroundColor = '#000';
    } else {
      this.cover.style.backgroundImage = '';
      this.cover.style.backgroundSize = '';
      this.cover.style.backgroundColor = '#1a1a2e';
    }
  },

  // 仅歌词样式 + 毛玻璃模糊（字体参数变化时调用）
  _applyLyricStyle() {
    const s = this.cfg;
    const frost = document.querySelector('.fs-glass-frost');
    if (frost) {
      frost.style.backdropFilter = `blur(${s.blur}px) saturate(1.2)`;
      frost.style.webkitBackdropFilter = `blur(${s.blur}px) saturate(1.2)`;
    }
    // 重新渲染歌词（应用字体/颜色/大小）
    if (lyrics.lines.length) this._renderAllLines();
  },

  _initSettings() {
    const panel = document.getElementById('fsGlassSettingsPanel');
    // 字体参数 → 只更新歌词样式，不动背景
    document.getElementById('fsGlassSetSize').addEventListener('input', () => {
      this.cfg.size = parseInt(document.getElementById('fsGlassSetSize').value);
      document.getElementById('fsGlassSetSizeVal').textContent = this.cfg.size + 'px';
      this._applyLyricStyle();
    });
    document.getElementById('fsGlassSetColor').addEventListener('input', () => {
      this.cfg.color = document.getElementById('fsGlassSetColor').value;
      this._applyLyricStyle();
    });
    document.getElementById('fsGlassSetFont').addEventListener('change', () => {
      this.cfg.font = document.getElementById('fsGlassSetFont').value;
      this._applyLyricStyle();
    });
    // 毛玻璃模糊
    document.getElementById('fsGlassSetBlur').addEventListener('input', () => {
      this.cfg.blur = parseInt(document.getElementById('fsGlassSetBlur').value);
      document.getElementById('fsGlassSetBlurVal').textContent = this.cfg.blur + 'px';
      this._applyLyricStyle();
    });

    // 背景切换
    const bgInput = document.getElementById('fsGlassBgInput');
    document.getElementById('fsGlassSetBg').addEventListener('click', () => bgInput.click());
    bgInput.addEventListener('change', (e) => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        this.cfg.bgImage = r.result;
        this._applyBg();
      };
      r.readAsDataURL(f);
      e.target.value = '';
    });
    document.getElementById('fsGlassBgReset').addEventListener('click', () => {
      this.cfg.bgImage = '';
      this._applyBg();
    });

    document.getElementById('fsGlassSetSave').addEventListener('click', () => { this._saveCfg(); panel.classList.add('hidden'); });
    document.getElementById('fsGlassSetReset').addEventListener('click', () => {
      this.cfg = { font: "'Orbitron','Noto Sans SC',sans-serif", color: '#ffffff', size: 42, blur: 8, bgImage: '' };
      this._applyCfg(); this._syncUI();
    });
  },

  _syncUI() {
    const s = this.cfg;
    document.getElementById('fsGlassSetFont').value = s.font;
    document.getElementById('fsGlassSetColor').value = s.color;
    document.getElementById('fsGlassSetSize').value = s.size; document.getElementById('fsGlassSetSizeVal').textContent = s.size + 'px';
    document.getElementById('fsGlassSetBlur').value = s.blur; document.getElementById('fsGlassSetBlurVal').textContent = s.blur + 'px';
  },

  // 渲染全部歌词行
  renderAllLyrics() {
    if (!lyrics.lines.length) return;
    this._renderAllLines();
    this._scrollToLine(0);
  },

  _renderAllLines() {
    const s = this.cfg;
    let html = '';
    lyrics.lines.forEach((line, i) => {
      const isActive = i === lyrics.currentLine;
      const style = `font-family:${s.font};font-size:${s.size}px;color:${isActive ? s.color : 'rgba(255,255,255,0.3)'}`;
      html += `<div class="fs-glass-lyric-line${isActive ? ' active' : ''}" data-line="${i}" style="${style}">${line.text}</div>`;
      if (line.subText) {
        html += `<div class="fs-glass-lyric-line${isActive ? ' active' : ''}" data-line="${i}" style="${style}">${line.subText}</div>`;
      }
    });
    this.inner.innerHTML = html;
    const stageH = this.stage.clientHeight;
    this.inner.style.paddingTop = (stageH / 2) + 'px';
    this.inner.style.paddingBottom = (stageH / 2) + 'px';
  },

  _bindLyricEvents() {
    // 点击歌词行跳转（事件委托，避免 innerHTML 重建丢失）
    this.stage.onclick = (e) => {
      const lineEl = e.target.closest('.fs-glass-lyric-line');
      if (!lineEl) return;
      const idx = parseInt(lineEl.dataset.line);
      if (idx >= 0 && idx < lyrics.lines.length) {
        const time = lyrics.lines[idx].time;
        player.seek(time);
        if (!player.isPlaying) player.play();
        // 立即更新高亮和滚动到点击行
        this._userScrolling = false;
        if (this._scrollTimer) { clearTimeout(this._scrollTimer); this._scrollTimer = null; }
        this._updateActiveStyles(idx);
        this._scrollToLine(idx);
      }
    };
    // 滚轮：只在停止滚动后才开始计时回弹
    this.stage.onwheel = (e) => {
      e.preventDefault();
      this._userScrolling = true;
      const style = this.inner.style.transform;
      let currentY = 0;
      const match = style.match(/translateY\(([-\d.]+)px\)/);
      if (match) currentY = parseFloat(match[1]);
      this.inner.style.transform = `translateY(${currentY - e.deltaY}px)`;
      // debounce：停止滚动 1.5 秒后回弹
      if (this._scrollTimer) clearTimeout(this._scrollTimer);
      this._scrollTimer = setTimeout(() => {
        this._userScrolling = false;
        this._scrollToLine(lyrics.currentLine);
        this._scrollTimer = null;
      }, 1500);
    };
  },

  _updateActiveStyles(idx) {
    const s = this.cfg;
    this.inner.querySelectorAll('.fs-glass-lyric-line').forEach(el => {
      const isActive = parseInt(el.dataset.line) === idx;
      el.classList.toggle('active', isActive);
      el.style.color = isActive ? s.color : 'rgba(255,255,255,0.3)';
      el.style.fontFamily = s.font;
      el.style.fontSize = s.size + 'px';
    });
  },

  update() {
    if (this._userScrolling) return;
    const idx = lyrics.currentLine;
    if (idx < 0) return;
    this._updateActiveStyles(idx);
    this._scrollToLine(idx);
  },

  _scrollToLine(idx) {
    const active = this.inner.querySelector('.fs-glass-lyric-line.active');
    if (!active) return;
    const stageH = this.stage.clientHeight;
    const elTop = active.offsetTop;
    const elH = active.offsetHeight;
    const offset = elTop - stageH / 2 + elH / 2;
    this.inner.style.transform = `translateY(${-offset}px)`;
  },

  // 雨水
  _initRain() {
    this.rainCanvas.width = window.innerWidth; this.rainCanvas.height = window.innerHeight;
    this.rainDrops = [];
    for (let i = 0; i < 200; i++) {
      this.rainDrops.push({ x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight, speed: Math.random() * 4 + 2, len: Math.random() * 15 + 8, alpha: Math.random() * 0.3 + 0.1 });
    }
    window.addEventListener('resize', () => { this.rainCanvas.width = window.innerWidth; this.rainCanvas.height = window.innerHeight; });
  },

  startRain() {
    if (this._rainId) return;
    const ctx = this.rainCanvas.getContext('2d');
    const loop = () => {
      this._rainId = requestAnimationFrame(loop);
      ctx.clearRect(0, 0, this.rainCanvas.width, this.rainCanvas.height);
      for (const d of this.rainDrops) {
        d.y += d.speed;
        if (d.y > this.rainCanvas.height) { d.y = -10; d.x = Math.random() * this.rainCanvas.width; }
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - 0.5, d.y - d.len);
        ctx.strokeStyle = `rgba(255,255,255,${d.alpha})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    };
    loop();
  },

  stopRain() {
    if (this._rainId) { cancelAnimationFrame(this._rainId); this._rainId = null; }
    const ctx = this.rainCanvas.getContext('2d');
    ctx.clearRect(0, 0, this.rainCanvas.width, this.rainCanvas.height);
  }
};
