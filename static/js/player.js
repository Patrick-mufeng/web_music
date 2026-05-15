/**
 * MusicPlayer — 音频播放核心模块
 * 管理 HTML5 Audio 元素、播放控制、进度追踪、音量管理
 */
class AudioPlayer {
  constructor() {
    this.audio = new Audio();
    this.currentSong = null;
    this.isPlaying = false;
    this.volume = 0.7;
    this.muted = false;
    this.playMode = 'list';
    this.shuffleList = [];
    this.shuffleIndex = -1;

    this._onTimeUpdate = null;
    this._onSongEnd = null;
    this._onPlayStateChange = null;
    this._fadeTimer = null;
    this._isLoading = false;
    this._hasEnded = false;
    this._playRequested = false;  // 标记用户请求播放（解决自动播放策略）

    this._setupEvents();
  }

  _setupEvents() {
    this.audio.addEventListener('timeupdate', () => {
      if (this._onTimeUpdate) {
        this._onTimeUpdate(this.audio.currentTime, this.audio.duration);
      }
    });

    this.audio.addEventListener('ended', () => {
      console.log('[Player] 歌曲播放完毕');
      this.isPlaying = false;
      this._hasEnded = true;
      if (this._onPlayStateChange) this._onPlayStateChange(false);
      if (this._onSongEnd) this._onSongEnd();
    });

    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this._hasEnded = false;
      this._playRequested = true;
      if (this._onPlayStateChange) this._onPlayStateChange(true);
    });

    this.audio.addEventListener('pause', () => {
      // ended 事件已经单独处理
      if (this._hasEnded) return;
      this.isPlaying = false;
      if (this._onPlayStateChange) this._onPlayStateChange(false);
    });

    this.audio.addEventListener('error', (e) => {
      console.error('[Player] 音频错误:', this.audio.error);
      this.isPlaying = false;
      this._isLoading = false;
      this._playRequested = false;
      if (this._onPlayStateChange) this._onPlayStateChange(false);
    });

    this.audio.preload = 'auto';

    const savedVol = localStorage.getItem('player_volume');
    if (savedVol !== null) {
      this.setVolume(parseFloat(savedVol));
    } else {
      this.audio.volume = this.volume;
    }
  }

  onTimeUpdate(cb) { this._onTimeUpdate = cb; }
  onSongEnd(cb) { this._onSongEnd = cb; }
  onPlayStateChange(cb) { this._onPlayStateChange = cb; }

  /** 在用户交互中解锁 AudioContext（静默，不干扰播放） */
  unlockAudio() {
    // 如果 audio 已有 src 且正在播放，不做任何事
    if (this.audio.src && !this.audio.paused) return;

    // 用静默方式激活 AudioContext
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      // 短暂激活后关闭（只是解锁浏览器策略）
      setTimeout(() => {
        if (ctx.state !== 'closed') ctx.close().catch(() => {});
      }, 1000);
    }

    // 只在 audio 完全没有 src 时才做空播放解锁
    if (!this.audio.src || this.audio.src === window.location.href) {
      const prevSrc = this.audio.src;
      const prevTime = this.audio.currentTime;
      const wasPlaying = !this.audio.paused;

      this.audio.play().then(() => {
        if (!wasPlaying) {
          this.audio.pause();
          if (prevSrc && prevSrc !== window.location.href) {
            this.audio.currentTime = prevTime;
          }
        }
      }).catch(() => {});
    }
  }

  async load(song, autoPlay = true) {
    if (!song) return;

    this._isLoading = true;
    this._hasEnded = false;
    this._playRequested = autoPlay;
    const wasPlaying = this.isPlaying;
    this.currentSong = song;

    // 先暂停当前音频
    if (!this.audio.paused) {
      await this._fadeOut(150);
    }
    this.audio.pause();

    // 清空旧源
    this.audio.removeAttribute('src');
    this.audio.src = '';
    this.audio.load();

    // 等一小段时间让浏览器清理
    await this._delay(50);

    // 设置新音频源
    this.audio.src = API.getAudioURL(song.id);
    this.audio.load();

    // 恢复播放进度
    const saved = song.progress || 0;
    if (saved > 0 && saved < (song.duration || Infinity)) {
      this.audio.currentTime = saved;
    }

    this._isLoading = false;

    if (autoPlay) {
      try {
        await this.audio.play();
        await this._fadeIn(300);
      } catch (e) {
        console.warn('[Player] 播放被阻止:', e.message);
        this.isPlaying = false;
        if (this._onPlayStateChange) this._onPlayStateChange(false);
      }
    }
  }

  play() {
    if (this._isLoading) return;
    if (this._hasEnded) {
      this.audio.currentTime = 0;
      this._hasEnded = false;
    }
    this._playRequested = true;
    const p = this.audio.play();
    if (p && p.catch) {
      p.catch(e => {
        console.warn('[Player] play() 失败:', e.message);
        this.isPlaying = false;
        if (this._onPlayStateChange) this._onPlayStateChange(false);
      });
    }
  }

  pause() {
    this._playRequested = false;
    this.audio.pause();
  }

  toggle() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  seek(time) {
    if (this.audio.duration) {
      this._hasEnded = false;
      this.audio.currentTime = Math.max(0, Math.min(time, this.audio.duration));
    }
  }

  getCurrentTime() { return this.audio.currentTime || 0; }
  getDuration() { return this.audio.duration || 0; }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    if (!this.muted) {
      this.audio.volume = this.volume;
    }
    localStorage.setItem('player_volume', this.volume);
  }

  toggleMute() {
    this.muted = !this.muted;
    this.audio.volume = this.muted ? 0 : this.volume;
    return this.muted;
  }

  isMuted() { return this.muted; }

  setPlayMode(mode) {
    this.playMode = mode;
    localStorage.setItem('play_mode', mode);
  }

  nextIndex(currentIndex, totalLength) {
    if (totalLength === 0) return -1;
    switch (this.playMode) {
      case 'single': return currentIndex;
      case 'shuffle': return this._getShuffleIndex(currentIndex, totalLength);
      case 'loop':
      case 'list':
      default: return (currentIndex + 1) % totalLength;
    }
  }

  prevIndex(currentIndex, totalLength) {
    if (totalLength === 0) return -1;
    switch (this.playMode) {
      case 'single': return currentIndex;
      case 'shuffle': return this._getShuffleIndex(currentIndex, totalLength);
      case 'loop':
      case 'list':
      default: return (currentIndex - 1 + totalLength) % totalLength;
    }
  }

  _getShuffleIndex(_, totalLength) {
    if (this.shuffleList.length !== totalLength) {
      this.shuffleList = Array.from({length: totalLength}, (_, i) => i);
      for (let i = this.shuffleList.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.shuffleList[i], this.shuffleList[j]] = [this.shuffleList[j], this.shuffleList[i]];
      }
      this.shuffleIndex = 0;
    } else {
      this.shuffleIndex = (this.shuffleIndex + 1) % this.shuffleList.length;
    }
    return this.shuffleList[this.shuffleIndex];
  }

  resetShuffle() {
    this.shuffleList = [];
    this.shuffleIndex = -1;
  }

  async _fadeOut(duration) {
    const steps = 10;
    const stepTime = duration / steps;
    const startVol = this.muted ? 0 : this.volume;
    for (let i = 0; i < steps; i++) {
      if (!this.audio || this.audio.paused) break;
      this.audio.volume = startVol * (1 - (i + 1) / steps);
      await this._delay(stepTime);
    }
  }

  async _fadeIn(duration) {
    const steps = 10;
    const stepTime = duration / steps;
    const targetVol = this.muted ? 0 : this.volume;
    for (let i = 0; i < steps; i++) {
      if (!this.audio) break;
      this.audio.volume = targetVol * ((i + 1) / steps);
      await this._delay(stepTime);
    }
    if (this.audio) this.audio.volume = targetVol;
  }

  _delay(ms) {
    return new Promise(resolve => {
      this._fadeTimer = setTimeout(resolve, ms);
    });
  }

  destroy() {
    if (this._fadeTimer) clearTimeout(this._fadeTimer);
    this.audio.pause();
    this.audio.src = '';
    this.audio.load();
  }
}

const player = new AudioPlayer();
