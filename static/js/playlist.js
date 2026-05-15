/**
 * MusicPlayer — 播放列表管理模块
 * 列表渲染、搜索、排序、拖拽、导入导出
 */

class PlaylistManager {
  constructor() {
    this.songs = [];
    this.filteredSongs = [];
    this.currentIndex = -1;
    this.searchQuery = '';
    this._onSelect = null;
    this._onDelete = null;
    this._dragSource = null;
  }

  onSelect(cb) { this._onSelect = cb; }
  onDelete(cb) { this._onDelete = cb; }

  setSongs(songs) {
    this.songs = songs;
    this._applyFilter();
  }

  addSongs(newSongs) {
    const existingIds = new Set(this.songs.map(s => s.id));
    const toAdd = newSongs.filter(s => !existingIds.has(s.id));
    this.songs = [...this.songs, ...toAdd];
    this._applyFilter();
    return toAdd.length;
  }

  removeSong(index) {
    const realIdx = this._getRealIndex(index);
    if (realIdx < 0) return null;
    const [removed] = this.songs.splice(realIdx, 1);
    if (this._onDelete) this._onDelete(removed);
    this._applyFilter();
    return removed;
  }

  clearAll() {
    this.songs = [];
    this.filteredSongs = [];
    this.currentIndex = -1;
    this.render();
  }

  getCurrent() {
    if (this.currentIndex < 0 || this.currentIndex >= this.filteredSongs.length) return null;
    return this.filteredSongs[this.currentIndex];
  }

  getCurrentRealIndex() {
    const song = this.getCurrent();
    if (!song) return -1;
    return this.songs.findIndex(s => s.id === song.id);
  }

  playIndex(index) {
    if (index < 0 || index >= this.filteredSongs.length) return null;
    this.currentIndex = index;
    const song = this.filteredSongs[index];
    if (this._onSelect) this._onSelect(song, index);
    this.render();
    return song;
  }

  playNext() {
    const next = player.nextIndex(this.currentIndex, this.filteredSongs.length);
    if (next >= 0) return this.playIndex(next);
    return null;
  }

  playPrev() {
    const prev = player.prevIndex(this.currentIndex, this.filteredSongs.length);
    if (prev >= 0) return this.playIndex(prev);
    return null;
  }

  search(query) {
    this.searchQuery = query.toLowerCase().trim();
    this._applyFilter();
  }

  _applyFilter() {
    if (!this.searchQuery) {
      this.filteredSongs = [...this.songs];
    } else {
      this.filteredSongs = this.songs.filter(s =>
        s.title.toLowerCase().includes(this.searchQuery) ||
        s.artist.toLowerCase().includes(this.searchQuery)
      );
    }
    this.render();

    // 保持当前播放索引
    if (this.currentIndex >= 0) {
      const cur = this.songs[this._getRealIndex(this.currentIndex)];
      if (cur) {
        const newIdx = this.filteredSongs.findIndex(s => s.id === cur.id);
        this.currentIndex = newIdx >= 0 ? newIdx : -1;
      }
    }
  }

  _getRealIndex(filteredIndex) {
    if (filteredIndex < 0 || filteredIndex >= this.filteredSongs.length) return -1;
    const song = this.filteredSongs[filteredIndex];
    return this.songs.findIndex(s => s.id === song.id);
  }

  moveSong(fromIndex, toIndex) {
    const fromReal = this._getRealIndex(fromIndex);
    const toReal = this._getRealIndex(toIndex);
    if (fromReal < 0 || toReal < 0) return;

    const [moved] = this.songs.splice(fromReal, 1);
    this.songs.splice(toReal, 0, moved);
    this._applyFilter();

    // 更新当前索引
    const cur = this.getCurrent();
    if (cur) {
      this.currentIndex = this.filteredSongs.findIndex(s => s.id === cur.id);
    }
  }

  render() {
    const container = document.getElementById('playlistContainer');
    const empty = container.querySelector('.playlist-empty');

    if (this.filteredSongs.length === 0) {
      container.innerHTML = '';
      container.innerHTML = `
        <div class="playlist-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p>${this.searchQuery ? '未找到匹配歌曲' : '还没有音乐'}</p>
          <span>${this.searchQuery ? '尝试其他关键词' : '点击上方按钮导入或拖拽文件到窗口'}</span>
        </div>`;
      document.getElementById('songCount').textContent = '0首';
      return;
    }

    let html = '';
    this.filteredSongs.forEach((song, idx) => {
      const isActive = idx === this.currentIndex;
      const isFav = AppState.favorites.has(song.id);

      const coverHTML = song.cover
        ? `<img src="${API.getCoverURL(song.id)}" class="playlist-item-cover" alt="">`
        : `<div class="playlist-item-cover placeholder">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="9"/></svg>
          </div>`;

      let lyricTag = '';
      if (song.lyric_source === 'embedded') {
        lyricTag = '<span class="lyric-tag embedded">内嵌</span>';
      } else if (song.lyric_source === 'external') {
        lyricTag = '<span class="lyric-tag external">LRC</span>';
      } else {
        lyricTag = '<span class="lyric-tag none">无歌词</span>';
      }

      html += `
        <div class="playlist-item ${isActive ? 'active' : ''} new-item"
             data-index="${idx}"
             draggable="true">
          ${coverHTML}
          <div class="playlist-item-info">
            <div class="playlist-item-title">${this._highlight(song.title)}</div>
            <div class="playlist-item-artist">${this._highlight(song.artist)}</div>
          </div>
          ${lyricTag}
          <span class="playlist-item-duration">${song.duration_str || '--:--'}</span>
          <div class="playlist-item-actions">
            <button class="btn-ghost btn-icon item-lrc-btn" data-index="${idx}" title="LRC歌词">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
            </button>
            <button class="btn-ghost btn-icon item-delete-btn" data-index="${idx}" title="删除">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </button>
          </div>
        </div>`;
    });

    container.innerHTML = html;
    document.getElementById('songCount').textContent = `${this.songs.length}首`;

    this._bindItemEvents(container);
  }

  _highlight(text) {
    if (!this.searchQuery || !text) return text || '';
    const idx = text.toLowerCase().indexOf(this.searchQuery);
    if (idx < 0) return text;
    const before = text.substring(0, idx);
    const match = text.substring(idx, idx + this.searchQuery.length);
    const after = text.substring(idx + this.searchQuery.length);
    return `${before}<span class="search-highlight">${match}</span>${after}`;
  }

  _bindItemEvents(container) {
    let dragEndedRecently = false;

    // 点击播放
    container.querySelectorAll('.playlist-item').forEach(item => {
      item.addEventListener('click', (e) => {
        // 拖拽结束后忽略click事件
        if (dragEndedRecently) {
          dragEndedRecently = false;
          return;
        }
        if (e.target.closest('.playlist-item-actions') ||
            e.target.closest('.item-delete-btn') ||
            e.target.closest('.item-lrc-btn')) return;
        // 在用户交互中解锁音频
        player.unlockAudio();
        const idx = parseInt(item.dataset.index);
        this.playIndex(idx);
      });

      // 拖拽事件
      item.addEventListener('dragstart', (e) => {
        this._dragSource = parseInt(item.dataset.index);
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });

      item.addEventListener('dragend', () => {
        dragEndedRecently = true;
        setTimeout(() => { dragEndedRecently = false; }, 100);
        item.classList.remove('dragging');
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        item.classList.add('drag-over');
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('drag-over');
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
        item.classList.remove('drag-over');
        const toIndex = parseInt(item.dataset.index);
        if (this._dragSource !== null && this._dragSource !== toIndex) {
          this.moveSong(this._dragSource, toIndex);
        }
        this._dragSource = null;
      });
    });

    // 删除按钮
    container.querySelectorAll('.item-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index);
        const removed = this.removeSong(idx);
        if (removed) {
          showToast(`已删除: ${removed.title}`, 'warning');
        }
      });
    });

    // LRC绑定按钮
    container.querySelectorAll('.item-lrc-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index);
        const song = this.filteredSongs[idx];
        if (song) {
          document.getElementById('lrcFileInput').dataset.songId = song.id;
          document.getElementById('lrcFileInput').click();
        }
      });
    });
  }
}

const playlist = new PlaylistManager();
