/**
 * MusicPlayer — API 通信模块
 * 封装所有与 Python Flask 后端的交互
 */

const API = {
  baseURL: window.location.origin,

  async request(method, path, data = null) {
    const url = `${this.baseURL}${path}`;
    const options = { method };
    if (data) {
      if (data instanceof FormData) {
        options.body = data;
      } else {
        options.headers = { 'Content-Type': 'application/json' };
        options.body = JSON.stringify(data);
      }
    }
    try {
      const res = await fetch(url, options);
      return await res.json();
    } catch (err) {
      console.error(`[API] ${method} ${path} 失败:`, err);
      throw err;
    }
  },

  // 上传音频文件
  uploadAudio(files) {
    const formData = new FormData();
    Array.from(files).forEach(f => formData.append('files', f));
    return this.request('POST', '/api/upload', formData);
  },

  // 获取歌曲列表
  getSongs() {
    return this.request('GET', '/api/songs');
  },

  // 获取单首歌曲信息
  getSong(songId) {
    return this.request('GET', `/api/song/${encodeURIComponent(songId)}`);
  },

  // 删除歌曲
  deleteSong(songId) {
    return this.request('DELETE', `/api/song/${encodeURIComponent(songId)}`);
  },

  // 上传LRC文件绑定到歌曲
  uploadLRC(songId, file) {
    const formData = new FormData();
    formData.append('lrc', file);
    return this.request('POST', `/api/song/${encodeURIComponent(songId)}/lrc`, formData);
  },

  // 解绑LRC
  unbindLRC(songId) {
    return this.request('DELETE', `/api/song/${encodeURIComponent(songId)}/lrc`);
  },

  // 切换歌词来源 (embedded/external)
  switchLyric(songId, source) {
    return this.request('POST', `/api/song/${encodeURIComponent(songId)}/lyric-switch`, { source });
  },

  // 获取歌词内容
  getLyrics(songId, source) {
    const params = source ? `?source=${source}` : '';
    return this.request('GET', `/api/song/${encodeURIComponent(songId)}/lyrics${params}`);
  },

  // 获取音频文件URL
  getAudioURL(songId) {
    return `${this.baseURL}/api/audio/${encodeURIComponent(songId)}`;
  },

  // 获取封面
  getCoverURL(songId) {
    return `${this.baseURL}/api/cover/${encodeURIComponent(songId)}`;
  },

  // 收藏相关
  getFavorites() {
    return this.request('GET', '/api/favorites');
  },

  toggleFavorite(songId) {
    return this.request('POST', '/api/favorite', { song_id: songId });
  },

  // 播放历史
  getHistory() {
    return this.request('GET', '/api/history');
  },

  // 保存播放进度
  saveProgress(data) {
    return this.request('POST', '/api/progress', data);
  },

  // 获取播放进度
  getProgress() {
    return this.request('GET', '/api/progress');
  },

  // 保存配置
  saveConfig(data) {
    return this.request('POST', '/api/config', data);
  },

  // 获取配置
  getConfig() {
    return this.request('GET', '/api/config');
  }
};
