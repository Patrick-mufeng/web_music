/**
 * MusicPlayer — 应用入口
 * 初始化所有模块、恢复状态、绑定全局事件
 */

// ============ 全局状态 ============
const AppState = {
  favorites: new Set(),
  history: [],
  initialized: false
};

// ============ 初始化 ============
async function initApp() {
  console.log('[App] 正在初始化 MusicPlayer...');

  // 初始化背景特效
  initStarfield();

  // 初始化主题
  initThemeSwitcher();

  // 初始化进度条
  initProgressBar();

  // 初始化播放列表抽屉
  initPlaylistDrawer();

  // 初始化歌词设置面板
  initLyricSettings();

  // 初始化全屏歌词
  FS.init();

  // 初始化播放控制
  initPlaybackControls();

  // 初始化搜索
  initSearch();

  // 初始化文件导入
  initFileImport();

  // 初始化辅助功能
  initAuxFeatures();

  // 初始化键盘快捷键
  initKeyboardShortcuts();

  // 恢复歌词效果（3D空间歌词不需要效果切换，移除此逻辑）

  // 播放列表选择事件：点击列表中的歌曲时加载并播放
  playlist.onSelect((song, index) => {
    loadAndPlay(song);
  });

  // 播放器事件：歌曲结束后自动播放下一首
  player.onSongEnd(() => {
    const next = playlist.playNext();
    if (next) {
      loadAndPlay(next);
    }
  });

  // 从后端加载数据
  await loadFromServer();
  await restorePlayerState();

  AppState.initialized = true;
  console.log('[App] 初始化完成');
}

// ============ 从后端加载歌曲列表 ============
async function loadFromServer() {
  try {
    // 加载歌曲列表
    const songsResult = await API.getSongs();
    if (songsResult.success && songsResult.songs) {
      playlist.setSongs(songsResult.songs);
    }

    // 加载收藏
    const favResult = await API.getFavorites();
    if (favResult.success && favResult.songs) {
      AppState.favorites = new Set(favResult.songs.map(s => s.id));
    }
  } catch (e) {
    console.warn('[App] 后端连接失败，使用本地缓存:', e);
    // 尝试从localStorage恢复
    const cached = localStorage.getItem('cached_songs');
    if (cached) {
      try {
        playlist.setSongs(JSON.parse(cached));
      } catch (_) {}
    }
  }
}

// ============ 恢复播放状态 ============
async function restorePlayerState() {
  const saved = localStorage.getItem('player_state');
  if (!saved) return;

  try {
    const state = JSON.parse(saved);
    if (state.songId && playlist.filteredSongs.length > 0) {
      const idx = playlist.filteredSongs.findIndex(s => s.id === state.songId);
      if (idx >= 0) {
        const song = playlist.playIndex(idx);
        if (song) {
          song.progress = state.progress || 0;
          // 加载但不自动播放
          await loadAndPlaySilent(song);
          if (state.progress > 0) {
            player.seek(state.progress);
          }
        }
      }
    }

    if (state.volume !== undefined) {
      player.setVolume(state.volume);
      document.getElementById('volumeSlider').value = state.volume * 100;
    }
  } catch (e) {
    console.warn('[App] 状态恢复失败:', e);
  }
}

// ============ 缓存歌曲到localStorage（离线兜底） ============
function cacheSongsLocally() {
  try {
    localStorage.setItem('cached_songs', JSON.stringify(playlist.songs));
  } catch (e) {
    // localStorage 满了
  }
}

// 定期缓存
setInterval(cacheSongsLocally, 10000);

// ============ 窗口关闭前保存状态 ============
window.addEventListener('beforeunload', () => {
  saveCurrentState();
  cacheSongsLocally();
});

// ============ 启动应用 ============
document.addEventListener('DOMContentLoaded', initApp);
