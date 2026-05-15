/**
 * MusicPlayer — UI 交互模块
 * 主题切换、弹窗、Toast、进度条、面板折叠
 */

// ============ Toast 通知 ============
function showToast(msg, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="#eab308" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
  };

  toast.innerHTML = `${icons[type] || icons.success}<span>${msg}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentNode) {
      toast.remove();
    }
  }, 3000);
}

// ============ 时间格式化 ============
function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ============ 弹窗系统 ============
function showModal(title, contentHTML, onClose, afterRender) {
  const overlay = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');

  content.innerHTML = `
    <div style="position:relative">
      <h3 class="modal-title">${title}</h3>
      <button class="modal-close" id="modalCloseBtn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div>${contentHTML}</div>`;

  overlay.classList.remove('hidden');

  const close = () => {
    overlay.classList.add('hidden');
    if (onClose) onClose();
  };

  document.getElementById('modalCloseBtn').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  if (afterRender) afterRender();
}

function closeModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
}

// ============ 进度条交互 ============
function initProgressBar() {
  const progressBar = document.getElementById('progressBar');
  const progressFill = document.getElementById('progressFill');
  const progressThumb = document.getElementById('progressThumb');
  const currentTimeEl = document.getElementById('currentTime');
  const totalTimeEl = document.getElementById('totalTime');
  let isDragging = false;

  player.onTimeUpdate((current, duration) => {
    if (isDragging) return;

    const pct = duration > 0 ? (current / duration) * 100 : 0;
    progressFill.style.width = pct + '%';
    progressThumb.style.left = pct + '%';
    currentTimeEl.textContent = formatTime(current);
    totalTimeEl.textContent = formatTime(duration);

    // 同步歌词
    const lineIdx = lyrics.sync(current);

    // 更新右栏歌词
    updateLyricsDisplay(lineIdx);

    // 更新全屏歌词
    if (FS.visible) FS.update();

  });

  const seekTo = (e) => {
    const rect = progressBar.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    const time = pct * player.getDuration();
    player.seek(time);
    lyrics.seekToTime(time);
    return pct;
  };

  progressBar.addEventListener('mousedown', (e) => {
    isDragging = true;
    const pct = seekTo(e);
    progressFill.style.width = (pct * 100) + '%';
    progressThumb.style.left = (pct * 100) + '%';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const rect = progressBar.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    progressFill.style.width = (pct * 100) + '%';
    progressThumb.style.left = (pct * 100) + '%';
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      const rect = progressBar.getBoundingClientRect();
      const pct = parseFloat(progressFill.style.width) / 100;
      const time = pct * player.getDuration();
      player.seek(time);
      lyrics.seekToTime(time);
      isDragging = false;
    }
  });
}

let _lastLyricLine = -1;
let _scrollReturnTimer = null;
let _isUserScrolling = false;

function updateLyricsDisplay(lineIdx) {
  if (lyrics.isEmpty()) return;
  if (lineIdx === _lastLyricLine) return;
  _lastLyricLine = lineIdx;

  const container = document.getElementById('lyricsDisplay');
  if (!container) return;

  // 只初始渲染一次全部歌词，后续只更新active状态
  if (container.dataset.rendered !== '1') {
    _renderAllLyrics(container);
  }

  _updateActiveLine(container, lineIdx);

  // 非用户手动滚动时自动跟随
  if (!_isUserScrolling) {
    _scrollToActive(container);
  }
}

function _renderAllLyrics(container) {
  const lines = lyrics.lines;
  if (!lines.length) return;

  let html = '';
  lines.forEach((line, i) => {
    let cls = 'lyrics-line';
    if (line.isBilingual || line.isEnglish) cls += ' lyric-en';
    else if (line.isChinese) cls += ' lyric-zh';
    html += `<div class="${cls}" data-line="${i}">${line.text}</div>`;
    if (line.subText) {
      html += `<div class="lyrics-line sub-text" data-line="${i}">${line.subText}</div>`;
    }
  });
  container.innerHTML = html;
  container.dataset.rendered = '1';

  // 初始滚动到第一行可见位置
  const firstLine = container.querySelector('.lyrics-line');
  if (firstLine) {
    const containerRect = container.getBoundingClientRect();
    const elRect = firstLine.getBoundingClientRect();
    container.scrollTop = container.scrollTop + elRect.top - containerRect.top - containerRect.height * 0.35;
  }

  // 滚轮浏览
  container.addEventListener('wheel', () => {
    _isUserScrolling = true;
    if (_scrollReturnTimer) clearTimeout(_scrollReturnTimer);
    _scrollReturnTimer = setTimeout(() => {
      _isUserScrolling = false;
      _scrollToActive(container);
    }, 3000);
  }, { passive: true });

  // 点击歌词行跳转
  container.addEventListener('click', (e) => {
    const lineEl = e.target.closest('.lyrics-line');
    if (!lineEl) return;
    const idx = parseInt(lineEl.dataset.line);
    if (idx >= 0 && idx < lines.length) {
      player.seek(lines[idx].time);
    }
  });
}

function _updateActiveLine(container, currentIdx) {
  container.querySelectorAll('.lyrics-line.active').forEach(el => el.classList.remove('active'));
  const activeEls = container.querySelectorAll(`.lyrics-line[data-line="${currentIdx}"]`);
  activeEls.forEach(el => el.classList.add('active'));
}

function _scrollToActive(container) {
  const activeEl = container.querySelector('.lyrics-line.active');
  if (!activeEl) return;

  // 用 offsetTop 计算，避免 getBoundingClientRect 在滚动时产生抖动
  const containerH = container.clientHeight;
  const targetY = activeEl.offsetTop + activeEl.offsetHeight / 2 - containerH * 0.35;

  // 如果距离小于5px则不滚动，减少无意义的重排
  const diff = Math.abs(container.scrollTop - targetY);
  if (diff < 5) return;

  container.scrollTo({ top: targetY, behavior: 'smooth' });
}

// ============ 主题切换 ============
function initThemeSwitcher() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.body.dataset.theme = saved;
  updateThemeDots(saved);

  document.querySelectorAll('.theme-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      const theme = dot.dataset.theme;
      document.body.dataset.theme = theme;
      localStorage.setItem('theme', theme);
      updateThemeDots(theme);
      showToast(`已切换到${dot.title}`, 'success');

      // 极简模式关闭星空
      if (theme === 'minimal') {
        if (starfield) starfield.stop();
      } else {
        if (starfield) starfield.start();
      }
    });
  });
}

function updateThemeDots(active) {
  document.querySelectorAll('.theme-dot').forEach(d => {
    d.classList.toggle('active', d.dataset.theme === active);
  });
}

// ============ 播放列表抽屉 ============
function initPlaylistDrawer() {
  const drawer = document.getElementById('playlistDrawer');
  const overlay = document.getElementById('playlistOverlay');
  const openBtn = document.getElementById('playlistBtn');
  const closeBtn = document.getElementById('closePlaylistBtn');

  function open() {
    drawer.classList.remove('hidden');
    overlay.classList.remove('hidden');
  }
  function close() {
    drawer.classList.add('hidden');
    overlay.classList.add('hidden');
  }

  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', close);
}

// ============ 播放控制栏事件 ============
function initPlaybackControls() {
  document.getElementById('playBtn').addEventListener('click', () => {
    player.unlockAudio();
    player.toggle();
  });
  document.getElementById('prevBtn').addEventListener('click', () => {
    player.unlockAudio();
    const song = playlist.playPrev();
    if (song) loadAndPlay(song);
  });
  document.getElementById('nextBtn').addEventListener('click', () => {
    player.unlockAudio();
    const song = playlist.playNext();
    if (song) loadAndPlay(song);
  });


  // 播放模式
  const modeBtn = document.getElementById('modeBtn');
  const modeLabel = document.getElementById('modeLabel');
  const modeIcon = document.getElementById('modeIcon');

  const modes = ['list', 'loop', 'single', 'shuffle'];
  const modeNames = { list: '顺序播放', loop: '列表循环', single: '单曲循环', shuffle: '随机播放' };
  const modeSvgs = {
    list: '<polyline points="1 4 3 4 3 2"/><polyline points="1 10 3 10 3 8"/><polyline points="1 16 3 16 3 14"/><polyline points="21 4 23 4 23 2"/><polyline points="21 10 23 10 23 8"/><polyline points="21 16 23 16 23 14"/><line x1="5" y1="3" x2="19" y2="15"/>',
    loop: '<polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.5 1.5A11 11 0 011 14.5"/><path d="M3.5 22.5A11 11 0 0123 9.5"/>',
    single: '<path d="M12 1a11 11 0 100 22 11 11 0 000-22z"/><polyline points="9 11 12 14 16 10"/>',
    shuffle: '<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>'
  };

  let modeIdx = 0;
  const savedMode = localStorage.getItem('play_mode');
  if (savedMode) {
    modeIdx = modes.indexOf(savedMode);
    if (modeIdx < 0) modeIdx = 0;
  }
  player.setPlayMode(modes[modeIdx]);
  updateModeUI();

  modeBtn.addEventListener('click', () => {
    modeIdx = (modeIdx + 1) % modes.length;
    const newMode = modes[modeIdx];
    player.setPlayMode(newMode);
    player.resetShuffle();
    updateModeUI();
    showToast(`播放模式: ${modeNames[newMode]}`, 'success');
  });

  function updateModeUI() {
    const mode = modes[modeIdx];
    modeLabel.textContent = modeNames[mode];
    modeIcon.innerHTML = modeSvgs[mode];
    modeBtn.dataset.mode = mode;
  }

  // 音量
  const volumeSlider = document.getElementById('volumeSlider');
  const muteBtn = document.getElementById('muteBtn');
  const volumeIcon = document.getElementById('volumeIcon');

  volumeSlider.value = player.volume * 100;
  volumeSlider.addEventListener('input', () => {
    player.setVolume(volumeSlider.value / 100);
    updateVolumeIcon();
  });

  const volumeHighSvg = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/>';
  const volumeMutedSvg = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>';

  function updateVolumeIcon() {
    if (player.isMuted() || player.volume === 0) {
      volumeIcon.innerHTML = volumeMutedSvg;
    } else {
      volumeIcon.innerHTML = volumeHighSvg;
    }
  }

  muteBtn.addEventListener('click', () => {
    player.toggleMute();
    updateVolumeIcon();
    showToast(player.isMuted() ? '已静音' : '已取消静音', 'warning');
  });

  // 播放状态更新
  player.onPlayStateChange((playing) => {
    const playIcon = document.getElementById('playIcon');
    const albumArt = document.getElementById('albumArtContainer');

    if (playing) {
      playIcon.innerHTML = '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>';
      albumArt.classList.add('playing');
      albumArt.classList.remove('paused');
    } else {
      playIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
      albumArt.classList.add('paused');
      albumArt.classList.remove('playing');
    }
  });
}

// ============ 歌曲加载与播放 ============
let currentSong = null;

function updateSongUI(song) {
  currentSong = song;

  document.getElementById('songTitle').textContent = song.title || '未知歌曲';
  document.getElementById('songArtist').textContent = song.artist || '未知艺术家';
  document.getElementById('totalTime').textContent = song.duration_str || '00:00';

  const coverContainer = document.getElementById('albumArtContainer');
  if (song.cover) {
    coverContainer.innerHTML = `<img src="${API.getCoverURL(song.id)}" class="album-art-img" alt="">`;
  } else {
    coverContainer.innerHTML = `<div class="album-art-placeholder">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="9"/></svg>
    </div>`;
  }

  document.querySelector('.album-art-ring').classList.toggle('visible', !!song.cover);

  const tag = document.getElementById('lyricSourceTag');
  tag.classList.remove('hidden', 'embedded', 'external');
  if (song.lyric_source === 'embedded') {
    tag.textContent = '内嵌歌词';
    tag.classList.add('embedded');
  } else if (song.lyric_source === 'external') {
    tag.textContent = '外置LRC';
    tag.classList.add('external');
  } else {
    tag.classList.add('hidden');
  }

  const favBtn = document.getElementById('favoriteBtn');
  favBtn.classList.toggle('favorited', AppState.favorites.has(song.id));
}

async function loadAndPlay(song) {
  updateSongUI(song);

  // 先触发音频播放（在用户交互上下文中）
  spectrum.disconnect();
  await player.load(song, true);
  spectrum.connect(player.audio);

  // 歌词异步加载，不阻塞播放
  loadLyricsForSong(song);
  // 重置迷你歌词的行缓存
  _lastLyricLine = -1;

  saveCurrentState();
}

// 静默加载（恢复状态，不播放）
async function loadAndPlaySilent(song) {
  updateSongUI(song);

  spectrum.disconnect();
  await player.load(song, false);
  spectrum.connect(player.audio);

  loadLyricsForSong(song);
  _lastLyricLine = -1;

  saveCurrentState();
}

async function loadLyricsForSong(song) {
  lyrics.clear();
  _lastLyricLine = -1;

  // 重置全屏歌词状态
  FS.displayedIdx = -1;

  const container = document.getElementById('lyricsDisplay');
  if (container) {
    container.innerHTML = '<p class="lyrics-placeholder">加载歌词中...</p>';
    container.dataset.rendered = '';
  }

  try {
    const source = song.lyric_source || 'embedded';
    const result = await API.getLyrics(song.id, source);

    if (result.success && result.lyrics) {
      lyrics.parse(result.lyrics);
      console.log(`[UI] 歌词加载完成: ${lyrics.lines.length} 行, source=${result.source}`);

      const tag = document.getElementById('lyricSourceTag');
      tag.classList.remove('hidden', 'embedded', 'external');
      if (result.source === 'embedded') {
        tag.textContent = '内嵌歌词';
        tag.classList.add('embedded');
      } else if (result.source === 'external') {
        tag.textContent = '外置LRC';
        tag.classList.add('external');
      }

      if (lyrics.isEmpty()) {
        if (container) container.innerHTML = '<p class="lyrics-placeholder">暂无歌词内容</p>';
      } else {
        // 预渲染全部歌词行
        _renderAllLyrics(container);
        // 通知全屏歌词刷新
        if (FS.visible) FS.refresh();
      }
    } else {
      if (container) container.innerHTML = '<p class="lyrics-placeholder">暂无歌词</p>';
      document.getElementById('lyricSourceTag').classList.add('hidden');
    }
  } catch (e) {
    console.error('[UI] 歌词加载失败:', e);
    if (container) container.innerHTML = '<p class="lyrics-placeholder">歌词加载失败</p>';
  }

  _lastLyricLine = -1;
}

// ============ 搜索 ============
function initSearch() {
  const input = document.getElementById('searchInput');
  let debounceTimer;

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      playlist.search(input.value);
    }, 200);
  });
}

// ============ 文件导入 ============
function initFileImport() {
  const audioInput = document.getElementById('audioFileInput');
  const folderInput = document.getElementById('folderInput');
  const lrcInput = document.getElementById('lrcFileInput');
  const importBtn = document.getElementById('importBtn');
  const importMenu = document.getElementById('importMenu');
  const importFileBtn = document.getElementById('importFileBtn');
  const importFolderBtn = document.getElementById('importFolderBtn');

  // 下拉菜单切换
  importBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    importMenu.classList.toggle('show');
  });

  // 点击其他地方关闭菜单
  document.addEventListener('click', () => {
    importMenu.classList.remove('show');
  });

  importFileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    importMenu.classList.remove('show');
    player.unlockAudio();
    audioInput.click();
  });

  importFolderBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    importMenu.classList.remove('show');
    player.unlockAudio();
    folderInput.click();
  });

  // 单个/多个文件导入
  audioInput.addEventListener('change', async () => {
    const files = audioInput.files;
    if (files.length === 0) return;
    player.unlockAudio();
    await handleAudioUpload(files);
    audioInput.value = '';
  });

  // 文件夹导入
  folderInput.addEventListener('change', async () => {
    const files = folderInput.files;
    if (files.length === 0) return;

    // 过滤出音频文件
    const audioFiles = Array.from(files).filter(f =>
      /\.(mp3|flac|wav|m4a|ogg|aac|wma)$/i.test(f.name)
    );

    if (audioFiles.length === 0) {
      showToast('文件夹中没有找到音频文件', 'warning');
      folderInput.value = '';
      return;
    }

    showToast(`检测到 ${audioFiles.length} 首歌曲，正在导入...`, 'warning');
    player.unlockAudio();
    await handleAudioUpload(audioFiles);
    folderInput.value = '';
  });

  // LRC文件导入
  lrcInput.addEventListener('change', async () => {
    const file = lrcInput.files[0];
    const songId = lrcInput.dataset.songId;
    if (!file || !songId) return;

    try {
      const result = await API.uploadLRC(songId, file);
      if (result.success) {
        showToast(`LRC歌词已绑定: ${result.title || ''}`, 'success');

        const song = playlist.songs.find(s => s.id === songId);
        if (song) {
          song.lyric_source = 'external';
          playlist.render();

          if (currentSong && currentSong.id === songId) {
            await loadLyricsForSong(song);
          }
        }
      }
    } catch (e) {
      console.error('[UI] LRC上传失败:', e);
      showToast('LRC上传失败', 'error');
    }
    lrcInput.value = '';
  });

  // 全局拖拽导入
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.body.classList.add('drag-over');
  });

  document.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.target === document.documentElement || e.target === document.body) {
      document.body.classList.remove('drag-over');
    }
  });

  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.body.classList.remove('drag-over');

    const files = Array.from(e.dataTransfer.files);
    const audioFiles = files.filter(f =>
      /\.(mp3|flac|wav|m4a|ogg|aac|wma)$/i.test(f.name)
    );
    const lrcFiles = files.filter(f => /\.lrc$/i.test(f.name));

    if (audioFiles.length > 0) {
      await handleAudioUpload(audioFiles);
    }

    if (lrcFiles.length > 0 && currentSong) {
      try {
        const result = await API.uploadLRC(currentSong.id, lrcFiles[0]);
        if (result.success) {
          showToast('LRC歌词已绑定', 'success');
          if (currentSong) {
            currentSong.lyric_source = 'external';
            playlist.render();
            await loadLyricsForSong(currentSong);
          }
        }
      } catch (e) {
        showToast('LRC上传失败', 'error');
      }
    }
  });
}

async function handleAudioUpload(files) {
  showToast(`正在导入 ${files.length} 首歌曲...`, 'warning');

  try {
    const result = await API.uploadAudio(files);
    if (result.success && result.songs) {
      const addedCount = playlist.addSongs(result.songs);

      if (addedCount > 0) {
        showToast(`成功导入 ${addedCount} 首歌曲`, 'success');

        // 如果之前没有歌曲在播放，选中第一首并自动播放
        if (!currentSong && playlist.filteredSongs.length > 0) {
          playlist.currentIndex = 0;
          playlist.render();
          // 在异步回调里直接 play（用户刚从文件选择器回来）
          await loadAndPlay(playlist.filteredSongs[0]);
        }
      } else if (result.songs.length > 0) {
        showToast('歌曲已存在，已自动跳过重复项', 'warning');
      }

      const skipped = result.songs.length - addedCount;
      if (skipped > 0) {
        // 重复的不再提示，已经在结果中体现
      }
    } else {
      showToast(result.error || '导入失败', 'error');
    }
  } catch (e) {
    console.error('[UI] 上传失败:', e);
    showToast('上传失败，请检查后端服务是否运行', 'error');
  }
}

// ============ 辅助功能 ============
function initAuxFeatures() {
  // 收藏
  document.getElementById('favoriteBtn').addEventListener('click', async () => {
    if (!currentSong) {
      showToast('请先选择歌曲', 'warning');
      return;
    }
    try {
      const result = await API.toggleFavorite(currentSong.id);
      if (result.favorited) {
        AppState.favorites.add(currentSong.id);
        document.getElementById('favoriteBtn').classList.add('favorited');
        showToast('已添加到收藏', 'success');
      } else {
        AppState.favorites.delete(currentSong.id);
        document.getElementById('favoriteBtn').classList.remove('favorited');
        showToast('已取消收藏', 'warning');
      }
      playlist.render();
    } catch (e) {
      showToast('操作失败', 'error');
    }
  });

  // 收藏列表
  document.getElementById('favoritesBtn').addEventListener('click', async () => {
    try {
      const result = await API.getFavorites();
      if (result.success && result.songs) {
        const songList = result.songs.length > 0
          ? result.songs.map(s =>
            `<div class="playlist-item" style="padding:8px 12px;cursor:pointer" data-song-id="${s.id}">
              <div class="playlist-item-info">
                <div class="playlist-item-title">${s.title}</div>
                <div class="playlist-item-artist">${s.artist}</div>
              </div>
            </div>`
          ).join('')
          : '<p style="color:var(--text-muted);text-align:center;padding:20px">暂无收藏歌曲</p>';

        showModal('收藏列表', songList, () => {}, () => {
          // 绑定点击播放
          setTimeout(() => {
            document.querySelectorAll('#modalContent .playlist-item').forEach(item => {
              item.addEventListener('click', () => {
                const songId = item.dataset.songId;
                const song = playlist.songs.find(s => s.id === songId);
                if (song) {
                  const idx = playlist.filteredSongs.findIndex(s => s.id === songId);
                  if (idx >= 0) playlist.playIndex(idx);
                  else { playlist.addSongs([song]); playlist.playIndex(0); }
                  closeModal();
                }
              });
            });
          }, 50);
        });
      }
    } catch (e) {
      showToast('获取收藏失败', 'error');
    }
  });

  // 播放历史
  document.getElementById('historyBtn').addEventListener('click', async () => {
    try {
      const result = await API.getHistory();
      if (result.success && result.songs) {
        const songList = result.songs.length > 0
          ? result.songs.map(s =>
            `<div class="playlist-item" style="padding:8px 12px;cursor:pointer" data-song-id="${s.id}">
              <div class="playlist-item-info">
                <div class="playlist-item-title">${s.title}</div>
                <div class="playlist-item-artist">${s.artist} · ${s.played_at || ''}</div>
              </div>
            </div>`
          ).join('')
          : '<p style="color:var(--text-muted);text-align:center;padding:20px">暂无播放记录</p>';

        showModal('播放历史 (最近50首)', songList, () => {}, () => {
          setTimeout(() => {
            document.querySelectorAll('#modalContent .playlist-item').forEach(item => {
              item.addEventListener('click', () => {
                const songId = item.dataset.songId;
                const song = playlist.songs.find(s => s.id === songId);
                if (song) {
                  const idx = playlist.filteredSongs.findIndex(s => s.id === songId);
                  if (idx >= 0) playlist.playIndex(idx);
                  else { playlist.addSongs([song]); playlist.playIndex(0); }
                  closeModal();
                }
              });
            });
          }, 50);
        });
      }
    } catch (e) {
      showToast('获取历史失败', 'error');
    }
  });

  // 睡眠定时
  let timerInterval = null;
  let timerSeconds = 0;

  document.getElementById('timerBtn').addEventListener('click', () => {
    const options = [10, 20, 30, 60];
    const optionsHTML = options.map(t =>
      `<button class="timer-option" data-min="${t}">${t} 分钟</button>`
    ).join('');

    const contentHTML = `
      <p style="color:var(--text-secondary);margin-bottom:8px;font-size:13px">
        ${timerInterval ? `当前定时: ${Math.ceil(timerSeconds / 60)} 分钟后自动暂停` : '选择定时关闭时间'}
      </p>
      <div class="timer-options">${optionsHTML}</div>
      ${timerInterval ? '<button class="btn-danger" id="cancelTimerBtn" style="margin-top:12px;width:100%;padding:8px;border-radius:6px;">取消定时</button>' : ''}`;

    showModal('睡眠定时器', contentHTML);

    // 绑定选项
    setTimeout(() => {
      document.querySelectorAll('.timer-option').forEach(btn => {
        btn.addEventListener('click', () => {
          const min = parseInt(btn.dataset.min);
          startSleepTimer(min * 60);
          closeModal();
        });
      });

      const cancelBtn = document.getElementById('cancelTimerBtn');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
          clearInterval(timerInterval);
          timerInterval = null;
          timerSeconds = 0;
          closeModal();
          showToast('定时已取消', 'warning');
        });
      }
    }, 100);
  });

  function startSleepTimer(seconds) {
    if (timerInterval) clearInterval(timerInterval);
    timerSeconds = seconds;
    showToast(`将在 ${Math.ceil(seconds / 60)} 分钟后自动暂停`, 'warning');

    timerInterval = setInterval(() => {
      timerSeconds--;
      if (timerSeconds <= 0) {
        clearInterval(timerInterval);
        timerInterval = null;
        timerSeconds = 0;
        player.pause();
        showToast('睡眠定时已到，播放已暂停', 'warning');
      }
    }, 1000);
  }
}

// ============ 歌词显示设置 ============

const LyricSettings = {
  font: "'Orbitron','Noto Sans SC',sans-serif",
  size: 22, sizeActive: 28,
  color: '#ffffff', glow: '#00d4ff', glowStrength: 16,
  inactiveOpacity: 55, align: 'center'
};

function loadLyricSettings() {
  const saved = localStorage.getItem('lyric_settings');
  if (saved) {
    try { Object.assign(LyricSettings, JSON.parse(saved)); } catch (_) {}
  }
  applyLyricSettings();
}

function saveLyricSettings() {
  localStorage.setItem('lyric_settings', JSON.stringify(LyricSettings));
  applyLyricSettings();
}

function applyLyricSettings() {
  const s = LyricSettings;
  const root = document.documentElement.style;
  root.setProperty('--lyric-font', s.font);
  root.setProperty('--lyric-size', s.size + 'px');
  root.setProperty('--lyric-size-active', s.sizeActive + 'px');
  root.setProperty('--lyric-color', s.color);
  root.setProperty('--lyric-glow', s.glow);
  root.setProperty('--lyric-glow-px', s.glowStrength + 'px');
  root.setProperty('--lyric-inactive-opacity', (s.inactiveOpacity / 100));
  root.setProperty('--lyric-align', s.align);
}

function initLyricSettings() {
  loadLyricSettings();

  const overlay = document.getElementById('lyricSettingsOverlay');
  const btn = document.getElementById('lyricSettingsBtn');
  const closeBtn = document.getElementById('lyricSettingsClose');

  const saveBtn = document.getElementById('settingSave');

  btn.addEventListener('click', () => {
    overlay.classList.remove('hidden');
    syncSettingsToUI();
  });

  closeBtn.addEventListener('click', () => overlay.classList.add('hidden'));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.add('hidden'); });

  // 滑块实时预览（不保存）
  ['settingFont', 'settingAlign'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      updateSettingFromUI();
      applyLyricSettings(); // 实时预览
    });
  });

  ['settingSize', 'settingSizeActive', 'settingGlowStrength', 'settingInactiveOpacity'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      document.getElementById(id + 'Val').textContent =
        id.includes('Opacity') ? document.getElementById(id).value + '%' :
        document.getElementById(id).value + 'px';
      updateSettingFromUI();
      applyLyricSettings(); // 实时预览
    });
  });

  ['settingColor', 'settingGlow'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      updateSettingFromUI();
      applyLyricSettings(); // 实时预览
    });
  });

  // 保存按钮
  saveBtn.addEventListener('click', () => {
    updateSettingFromUI();
    saveLyricSettings();
    overlay.classList.add('hidden');
    showToast('歌词设置已保存', 'success');
  });

  // 恢复默认
  document.getElementById('settingReset').addEventListener('click', () => {
    Object.assign(LyricSettings, {
      font: "'Orbitron','Noto Sans SC',sans-serif",
      size: 22, sizeActive: 28,
      color: '#ffffff', glow: '#00d4ff', glowStrength: 16,
      inactiveOpacity: 55, align: 'center'
    });
    saveLyricSettings();
    syncSettingsToUI();
    applyLyricSettings();
    showToast('歌词设置已恢复默认', 'success');
  });
}

function syncSettingsToUI() {
  const s = LyricSettings;
  document.getElementById('settingFont').value = s.font;
  document.getElementById('settingSize').value = s.size;
  document.getElementById('settingSizeVal').textContent = s.size + 'px';
  document.getElementById('settingSizeActive').value = s.sizeActive;
  document.getElementById('settingSizeActiveVal').textContent = s.sizeActive + 'px';
  document.getElementById('settingColor').value = s.color;
  document.getElementById('settingGlow').value = s.glow;
  document.getElementById('settingGlowStrength').value = s.glowStrength;
  document.getElementById('settingGlowStrengthVal').textContent = s.glowStrength + 'px';
  document.getElementById('settingInactiveOpacity').value = s.inactiveOpacity;
  document.getElementById('settingInactiveOpacityVal').textContent = s.inactiveOpacity + '%';
  document.getElementById('settingAlign').value = s.align;
}

function updateSettingFromUI() {
  LyricSettings.font = document.getElementById('settingFont').value;
  LyricSettings.size = parseInt(document.getElementById('settingSize').value);
  LyricSettings.sizeActive = parseInt(document.getElementById('settingSizeActive').value);
  LyricSettings.color = document.getElementById('settingColor').value;
  LyricSettings.glow = document.getElementById('settingGlow').value;
  LyricSettings.glowStrength = parseInt(document.getElementById('settingGlowStrength').value);
  LyricSettings.inactiveOpacity = parseInt(document.getElementById('settingInactiveOpacity').value);
  LyricSettings.align = document.getElementById('settingAlign').value;
}

// ============ 键盘快捷键 ============
function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // 忽略输入框内的按键
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        player.toggle();
        break;
      case 'ArrowUp':
        e.preventDefault();
        player.setVolume(Math.min(1, player.volume + 0.05));
        document.getElementById('volumeSlider').value = player.volume * 100;
        break;
      case 'ArrowDown':
        e.preventDefault();
        player.setVolume(Math.max(0, player.volume - 0.05));
        document.getElementById('volumeSlider').value = player.volume * 100;
        break;
      case 'ArrowLeft':
        if (e.ctrlKey) {
          e.preventDefault();
          const prev = playlist.playPrev();
          if (prev) loadAndPlay(prev);
        } else {
          e.preventDefault();
          player.seek(player.getCurrentTime() - 5);
        }
        break;
      case 'ArrowRight':
        if (e.ctrlKey) {
          e.preventDefault();
          const next = playlist.playNext();
          if (next) loadAndPlay(next);
        } else {
          e.preventDefault();
          player.seek(player.getCurrentTime() + 5);
        }
        break;
      case 'KeyM':
        e.preventDefault();
        player.toggleMute();
        showToast(player.isMuted() ? '已静音' : '已取消静音', 'warning');
        break;
      case 'F11':
        break;
    }
  });
}

// ============ 持久化状态 ============
function saveCurrentState() {
  if (!currentSong) return;
  const state = {
    songId: currentSong.id,
    progress: player.getCurrentTime(),
    playMode: player.playMode,
    volume: player.volume
  };
  localStorage.setItem('player_state', JSON.stringify(state));

  // 异步保存到后端
  API.saveProgress({
    song_id: currentSong.id,
    progress: player.getCurrentTime(),
    duration: player.getDuration()
  }).catch(() => {});
}

// 自动保存进度（每5秒）
setInterval(saveCurrentState, 5000);
