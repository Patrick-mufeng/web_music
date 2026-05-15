"""
MusicPlayer — Python Flask 后端服务
本地音乐播放器后端：音频解析、歌词提取、LRC处理、数据持久化
"""
import os
import sys
import json
import uuid
import hashlib
import base64
import shutil
import time
from pathlib import Path
from datetime import datetime

from flask import Flask, request, jsonify, send_from_directory, send_file
from flask_cors import CORS

# mutagen 音频解析库
from mutagen import File as MutagenFile
from mutagen.mp3 import MP3
from mutagen.flac import FLAC
from mutagen.mp4 import MP4
from mutagen.oggvorbis import OggVorbis

# ============ 配置 ============
BASE_DIR = Path(__file__).parent
STATIC_DIR = BASE_DIR / 'static'
DATA_DIR = BASE_DIR / 'data'
UPLOAD_DIR = BASE_DIR / 'data' / 'uploads'

# 确保目录存在
DATA_DIR.mkdir(exist_ok=True)
UPLOAD_DIR.mkdir(exist_ok=True)

# 数据文件
SONGS_FILE = DATA_DIR / 'songs.json'
FAVORITES_FILE = DATA_DIR / 'favorites.json'
HISTORY_FILE = DATA_DIR / 'history.json'
CONFIG_FILE = DATA_DIR / 'config.json'
LRC_STORE_DIR = DATA_DIR / 'lrc_cache'

LRC_STORE_DIR.mkdir(exist_ok=True)

app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app)


# ============ 工具函数 ============

def load_json(filepath, default=None):
    """加载JSON文件"""
    if default is None:
        default = {}
    try:
        if filepath.exists():
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        print(f"[WARN] 加载 {filepath} 失败: {e}")
    return default


def save_json(filepath, data):
    """保存JSON文件"""
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except IOError as e:
        print(f"[ERROR] 保存 {filepath} 失败: {e}")


def generate_song_id(filepath):
    """根据文件路径生成唯一ID"""
    hash_input = str(filepath) + str(os.path.getmtime(filepath) if os.path.exists(filepath) else '')
    return hashlib.md5(hash_input.encode()).hexdigest()[:12]


def parse_duration(seconds):
    """格式化时长为 mm:ss"""
    if not seconds or seconds <= 0:
        return '00:00'
    m, s = divmod(int(seconds), 60)
    return f'{m:02d}:{s:02d}'


def sanitize_filename(name):
    """安全文件名"""
    return "".join(c for c in name if c.isalnum() or c in '._- ').strip()[:100]


# ============ 音频解析 ============

class AudioParser:
    """音频文件元数据、内嵌歌词、封面解析"""

    SUPPORTED_EXTENSIONS = {'.mp3', '.flac', '.m4a', '.wav', '.ogg', '.aac', '.wma'}

    @staticmethod
    def parse(filepath):
        """解析音频文件，返回标准化数据"""
        filepath = Path(filepath)
        if not filepath.exists():
            return None

        ext = filepath.suffix.lower()
        if ext not in AudioParser.SUPPORTED_EXTENSIONS:
            return None

        try:
            audio = MutagenFile(str(filepath))
            if audio is None:
                return AudioParser._basic_info(filepath)

            info = {
                'title': '',
                'artist': '',
                'album': '',
                'duration': 0,
                'duration_str': '00:00',
                'cover': None,       # base64
                'lyrics': '',        # 内嵌歌词原始文本
                'has_embedded_lyrics': False,
                'format': ext.lstrip('.'),
                'filepath': str(filepath),
                'filesize': filepath.stat().st_size
            }

            # 时长
            if hasattr(audio, 'info') and hasattr(audio.info, 'length'):
                info['duration'] = audio.info.length
                info['duration_str'] = parse_duration(audio.info.length)

            # 解析不同格式
            if isinstance(audio, MP3):
                AudioParser._parse_mp3(audio, info)
            elif isinstance(audio, FLAC):
                AudioParser._parse_flac(audio, info)
            elif isinstance(audio, MP4):
                AudioParser._parse_mp4(audio, info)
            elif isinstance(audio, OggVorbis):
                AudioParser._parse_ogg(audio, info)
            else:
                AudioParser._parse_generic(audio, info)

            # 文件名兜底
            if not info['title']:
                info['title'] = filepath.stem

            return info

        except Exception as e:
            print(f"[WARN] 解析失败 {filepath}: {e}")
            return AudioParser._basic_info(filepath)

    @staticmethod
    def _basic_info(filepath):
        return {
            'title': filepath.stem,
            'artist': '未知艺术家',
            'album': '',
            'duration': 0,
            'duration_str': '00:00',
            'cover': None,
            'lyrics': '',
            'has_embedded_lyrics': False,
            'format': filepath.suffix.lower().lstrip('.'),
            'filepath': str(filepath),
            'filesize': filepath.stat().st_size
        }

    @staticmethod
    def _parse_mp3(audio, info):
        """MP3 ID3v2 标签解析"""
        # 基本标签
        tags = audio.tags or {}
        info['title'] = str(tags.get('TIT2', ''))
        info['artist'] = str(tags.get('TPE1', ''))
        info['album'] = str(tags.get('TALB', ''))

        # 内嵌歌词 USLT (同步歌词) 或 SYLT
        for key in tags.keys():
            if key.startswith('USLT') or key.startswith('SYLT'):
                try:
                    lyric_frame = tags[key]
                    info['lyrics'] = str(lyric_frame)
                    info['has_embedded_lyrics'] = True
                except Exception:
                    pass

        # 兼容 TXXX:LYRICS 自定义标签
        txxx_lyrics = str(tags.get('TXXX:LYRICS', ''))
        if txxx_lyrics and not info['lyrics']:
            info['lyrics'] = txxx_lyrics
            info['has_embedded_lyrics'] = True

        # 专辑封面 APIC
        for key in tags.keys():
            if key.startswith('APIC'):
                try:
                    cover_data = tags[key].data
                    info['cover'] = base64.b64encode(cover_data).decode()
                except Exception:
                    pass
                break

    @staticmethod
    def _parse_flac(audio, info):
        """FLAC 标签解析"""
        info['title'] = str(audio.get('title', [''])[0])
        info['artist'] = str(audio.get('artist', [''])[0])
        info['album'] = str(audio.get('album', [''])[0])

        # FLAC 内嵌歌词 (LYRICS 标签)
        lyrics_val = audio.get('lyrics', [''])
        if lyrics_val and lyrics_val[0]:
            info['lyrics'] = str(lyrics_val[0])
            info['has_embedded_lyrics'] = True

        # 兼容 UNSYNCEDLYRICS
        unsync = audio.get('unsyncedlyrics', [''])
        if unsync and unsync[0] and not info['lyrics']:
            info['lyrics'] = str(unsync[0])
            info['has_embedded_lyrics'] = True

        # 封面
        if hasattr(audio, 'pictures') and audio.pictures:
            try:
                info['cover'] = base64.b64encode(audio.pictures[0].data).decode()
            except Exception:
                pass

    @staticmethod
    def _parse_mp4(audio, info):
        """M4A/AAC 标签解析"""
        tags = audio.tags or {}
        info['title'] = str(tags.get('\xa9nam', [''])[0])
        info['artist'] = str(tags.get('\xa9ART', [''])[0])
        info['album'] = str(tags.get('\xa9alb', [''])[0])

        # M4A 歌词 (©lyr)
        lyrics_val = tags.get('\xa9lyr', [''])
        if lyrics_val and lyrics_val[0]:
            info['lyrics'] = str(lyrics_val[0])
            info['has_embedded_lyrics'] = True

        # 封面 (covr)
        cover_data = tags.get('covr', [])
        if cover_data:
            try:
                info['cover'] = base64.b64encode(bytes(cover_data[0])).decode()
            except Exception:
                pass

    @staticmethod
    def _parse_ogg(audio, info):
        """OGG Vorbis 标签解析"""
        info['title'] = str(audio.get('title', [''])[0])
        info['artist'] = str(audio.get('artist', [''])[0])
        info['album'] = str(audio.get('album', [''])[0])

        # OGG 歌词
        lyrics_val = audio.get('lyrics', [''])
        if lyrics_val and lyrics_val[0]:
            info['lyrics'] = str(lyrics_val[0])
            info['has_embedded_lyrics'] = True

        # 封面 (METADATA_BLOCK_PICTURE)
        if hasattr(audio, 'pictures') and audio.pictures:
            try:
                info['cover'] = base64.b64encode(audio.pictures[0].data).decode()
            except Exception:
                pass

    @staticmethod
    def _parse_generic(audio, info):
        """通用标签解析 (WAV等)"""
        try:
            tags = audio.tags or {}
            info['title'] = str(tags.get('title', [''])[0]) if 'title' in tags else ''
            info['artist'] = str(tags.get('artist', [''])[0]) if 'artist' in tags else ''
        except Exception:
            pass


# ============ LRC 歌词解析 ============

class LRCParser:
    """LRC 歌词文件解析，标准化输出"""

    @staticmethod
    def parse(lrc_text):
        """
        解析 LRC 文本
        返回: [{time: float, text: str}, ...]
        """
        if not lrc_text or not isinstance(lrc_text, str):
            return []

        lines = []
        raw_lines = lrc_text.strip().split('\n')

        # 元数据
        metadata = {}
        for raw in raw_lines:
            raw = raw.strip()
            if raw.startswith('[ti:') or raw.startswith('[ar:') or \
               raw.startswith('[al:') or raw.startswith('[by:') or \
               raw.startswith('[offset:'):
                try:
                    key = raw[1:raw.index(':')]
                    val = raw[raw.index(':')+1:-1]
                    metadata[key] = val
                except Exception:
                    pass

        # 解析时间轴歌词
        for raw in raw_lines:
            raw = raw.strip()
            if not raw or raw.startswith('[ti:') or raw.startswith('[ar:') or \
               raw.startswith('[al:') or raw.startswith('[by:') or \
               raw.startswith('[offset:'):
                continue

            # 匹配所有 [mm:ss.xx] 时间标签
            import re
            time_pattern = re.compile(r'\[(\d{1,3}):(\d{2})(?:[.:](\d{2,3}))?\]')
            times = []
            pos = 0
            while True:
                match = time_pattern.search(raw, pos)
                if not match:
                    break
                mins = int(match.group(1))
                secs = int(match.group(2))
                ms_str = match.group(3)
                ms = int(ms_str) if ms_str else 0
                if ms < 100:
                    ms *= 10  # .xx -> ms
                time_sec = mins * 60 + secs + ms / 1000.0
                times.append(time_sec)
                pos = match.end()

            # 提取文本
            text = time_pattern.sub('', raw).strip()
            if not text:
                continue

            for t in times:
                lines.append({'time': t, 'text': text})

        # 按时间排序
        lines.sort(key=lambda x: x['time'])
        return lines

    @staticmethod
    def to_lrc_text(parsed_lines):
        """将解析后的歌词转回LRC文本格式"""
        if not parsed_lines:
            return ''
        result = []
        for line in parsed_lines:
            t = line['time']
            m = int(t // 60)
            s = int(t % 60)
            ms = int((t - int(t)) * 100)
            result.append(f'[{m:02d}:{s:02d}.{ms:02d}]{line["text"]}')
        return '\n'.join(result)


# ============ 数据管理 ============

class DataManager:
    """歌曲、歌词、收藏、历史数据持久化管理"""

    def __init__(self):
        self.songs: dict[str, dict] = {}  # song_id -> song_data
        self.favorites: list[str] = []
        self.history: list[dict] = []
        self._load()

    def _load(self):
        """加载所有持久化数据"""
        self.songs = load_json(SONGS_FILE, {})
        self.favorites = load_json(FAVORITES_FILE, [])
        self.history = load_json(HISTORY_FILE, [])

    def _save_songs(self):
        save_json(SONGS_FILE, self.songs)

    def _save_favorites(self):
        save_json(FAVORITES_FILE, self.favorites)

    def _save_history(self):
        # 限制最多50条
        if len(self.history) > 50:
            self.history = self.history[-50:]
        save_json(HISTORY_FILE, self.history)

    def add_song(self, audio_info, filepath):
        """添加歌曲"""
        song_id = generate_song_id(filepath)

        # 去重检查
        if song_id in self.songs:
            return song_id, self.songs[song_id], False

        song_data = {
            'id': song_id,
            'title': audio_info['title'],
            'artist': audio_info['artist'],
            'album': audio_info['album'],
            'duration': audio_info['duration'],
            'duration_str': audio_info['duration_str'],
            'format': audio_info['format'],
            'cover': audio_info.get('cover'),
            'has_embedded_lyrics': audio_info.get('has_embedded_lyrics', False),
            'lyric_source': 'embedded' if audio_info.get('has_embedded_lyrics') else 'none',
            'embedded_lyrics': audio_info.get('lyrics', ''),
            'external_lrc': '',
            'filepath': str(filepath),
            'added_at': datetime.now().isoformat()
        }

        self.songs[song_id] = song_data
        self._save_songs()

        # 缓存内嵌歌词
        if audio_info.get('lyrics'):
            self._cache_lyrics(song_id, 'embedded', audio_info['lyrics'])

        return song_id, song_data, True

    def remove_song(self, song_id):
        """删除歌曲"""
        if song_id in self.songs:
            del self.songs[song_id]
            self._save_songs()

            # 清理LRC缓存
            lrc_file = LRC_STORE_DIR / f'{song_id}_embedded.lrc'
            if lrc_file.exists():
                lrc_file.unlink()
            lrc_file = LRC_STORE_DIR / f'{song_id}_external.lrc'
            if lrc_file.exists():
                lrc_file.unlink()

            # 清理上传的音频文件
            for f in UPLOAD_DIR.glob(f'{song_id}.*'):
                f.unlink()

            return True
        return False

    def get_song(self, song_id):
        return self.songs.get(song_id)

    def get_all_songs(self):
        return list(self.songs.values())

    def bind_lrc(self, song_id, lrc_text):
        """绑定外置LRC歌词"""
        if song_id not in self.songs:
            return False

        self.songs[song_id]['external_lrc'] = lrc_text
        self.songs[song_id]['lyric_source'] = 'external'
        self._save_songs()
        self._cache_lyrics(song_id, 'external', lrc_text)
        return True

    def unbind_lrc(self, song_id):
        """解绑外置LRC"""
        if song_id not in self.songs:
            return False

        self.songs[song_id]['external_lrc'] = ''
        # 恢复为内嵌或none
        if self.songs[song_id].get('has_embedded_lyrics'):
            self.songs[song_id]['lyric_source'] = 'embedded'
        else:
            self.songs[song_id]['lyric_source'] = 'none'
        self._save_songs()

        # 清理LRC缓存
        lrc_file = LRC_STORE_DIR / f'{song_id}_external.lrc'
        if lrc_file.exists():
            lrc_file.unlink()
        return True

    def get_lyrics(self, song_id, source=None):
        """获取歌词内容"""
        song = self.songs.get(song_id)
        if not song:
            return None, None

        effective_source = source or song.get('lyric_source', 'none')

        if effective_source == 'embedded':
            text = song.get('embedded_lyrics', '')
        elif effective_source == 'external':
            text = song.get('external_lrc', '')
        else:
            text = ''

        if not text:
            return None, effective_source

        # 解析为结构化数据
        parsed = LRCParser.parse(text)
        lrc_text = LRCParser.to_lrc_text(parsed)

        return lrc_text, effective_source

    def switch_lyric_source(self, song_id, source):
        """切换歌词来源"""
        if song_id not in self.songs:
            return False

        song = self.songs[song_id]
        if source == 'embedded' and song.get('has_embedded_lyrics'):
            song['lyric_source'] = 'embedded'
        elif source == 'external' and song.get('external_lrc'):
            song['lyric_source'] = 'external'
        else:
            return False

        self._save_songs()
        return True

    def toggle_favorite(self, song_id):
        """切换收藏状态"""
        if song_id in self.favorites:
            self.favorites.remove(song_id)
            favorited = False
        else:
            self.favorites.append(song_id)
            favorited = True

        self._save_favorites()
        return favorited

    def get_favorites(self):
        """获取收藏列表"""
        return [self.songs[sid] for sid in self.favorites if sid in self.songs]

    def is_favorite(self, song_id):
        return song_id in self.favorites

    def add_history(self, song_id):
        """添加播放历史"""
        if song_id not in self.songs:
            return

        # 移除旧记录
        self.history = [h for h in self.history if h.get('song_id') != song_id]
        self.history.append({
            'song_id': song_id,
            'played_at': datetime.now().strftime('%Y-%m-%d %H:%M')
        })
        self._save_history()

    def get_history(self):
        """获取播放历史 (倒序)"""
        result = []
        for h in reversed(self.history):
            song = self.songs.get(h['song_id'])
            if song:
                result.append({
                    **song,
                    'played_at': h['played_at']
                })
        return result

    def _cache_lyrics(self, song_id, source, text):
        """缓存歌词到文件"""
        suffix = f'_{source}.lrc'
        filepath = LRC_STORE_DIR / f'{song_id}{suffix}'
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(text)
        except IOError:
            pass


# 全局数据管理器
dm = DataManager()


# ============ API 路由 ============

@app.route('/')
def index():
    """主页"""
    return send_from_directory(str(STATIC_DIR), 'index.html')


@app.route('/api/upload', methods=['POST'])
def upload_audio():
    """
    上传音频文件
    接收 multipart/form-data, field: files
    """
    if 'files' not in request.files:
        return jsonify({'success': False, 'error': '未提供文件'}), 400

    files = request.files.getlist('files')
    if not files:
        return jsonify({'success': False, 'error': '文件列表为空'}), 400

    results = []
    added_count = 0
    skipped_count = 0

    for file in files:
        if not file.filename:
            continue

        ext = Path(file.filename).suffix.lower()
        if ext not in AudioParser.SUPPORTED_EXTENSIONS:
            continue

        # 保存上传文件
        safe_name = sanitize_filename(Path(file.filename).stem)
        stored_name = f'{safe_name}_{uuid.uuid4().hex[:8]}{ext}'
        stored_path = UPLOAD_DIR / stored_name

        try:
            file.save(str(stored_path))
        except IOError as e:
            print(f"[ERROR] 文件保存失败: {e}")
            continue

        # 解析音频元数据
        audio_info = AudioParser.parse(stored_path)
        if audio_info is None:
            stored_path.unlink(missing_ok=True)
            continue

        # 添加到数据库
        song_id, song_data, is_new = dm.add_song(audio_info, stored_path)

        if is_new:
            added_count += 1

        # 返回给前端的精简数据
        results.append({
            'id': song_id,
            'title': song_data['title'],
            'artist': song_data['artist'],
            'album': song_data['album'],
            'duration': song_data['duration'],
            'duration_str': song_data['duration_str'],
            'format': song_data['format'],
            'cover': song_data.get('cover') is not None,
            'has_embedded_lyrics': song_data.get('has_embedded_lyrics', False),
            'lyric_source': song_data.get('lyric_source', 'none')
        })

    return jsonify({
        'success': True,
        'songs': results,
        'added': added_count,
        'skipped': len(results) - added_count
    })


@app.route('/api/songs', methods=['GET'])
def get_songs():
    """获取所有歌曲列表"""
    songs = dm.get_all_songs()
    result = []
    for s in songs:
        result.append({
            'id': s['id'],
            'title': s['title'],
            'artist': s['artist'],
            'album': s['album'],
            'duration': s['duration'],
            'duration_str': s['duration_str'],
            'format': s['format'],
            'cover': s.get('cover') is not None,
            'lyric_source': s.get('lyric_source', 'none'),
            'has_embedded_lyrics': s.get('has_embedded_lyrics', False)
        })
    return jsonify({'success': True, 'songs': result})


@app.route('/api/song/<song_id>', methods=['GET'])
def get_song(song_id):
    """获取单首歌曲详情"""
    song = dm.get_song(song_id)
    if not song:
        return jsonify({'success': False, 'error': '歌曲不存在'}), 404

    return jsonify({
        'success': True,
        'song': {
            'id': song['id'],
            'title': song['title'],
            'artist': song['artist'],
            'album': song['album'],
            'duration': song['duration'],
            'duration_str': song['duration_str'],
            'format': song['format'],
            'cover': song.get('cover') is not None,
            'lyric_source': song.get('lyric_source', 'none'),
            'has_embedded_lyrics': song.get('has_embedded_lyrics', False)
        }
    })


@app.route('/api/song/<song_id>', methods=['DELETE'])
def delete_song(song_id):
    """删除歌曲"""
    if dm.remove_song(song_id):
        return jsonify({'success': True})
    return jsonify({'success': False, 'error': '歌曲不存在'}), 404


@app.route('/api/audio/<song_id>', methods=['GET'])
def serve_audio(song_id):
    """提供音频文件"""
    song = dm.get_song(song_id)
    if not song:
        return jsonify({'error': '歌曲不存在'}), 404

    filepath = Path(song.get('filepath', ''))
    if not filepath.exists():
        return jsonify({'error': '文件不存在'}), 404

    # 支持 Range 请求（播放器 seek 需要）
    return send_file(
        filepath,
        mimetype=f'audio/{song.get("format", "mpeg")}',
        conditional=True
    )


@app.route('/api/cover/<song_id>', methods=['GET'])
def serve_cover(song_id):
    """提供专辑封面"""
    song = dm.get_song(song_id)
    if not song or not song.get('cover'):
        return jsonify({'error': '无封面'}), 404

    try:
        cover_bytes = base64.b64decode(song['cover'])
        return cover_bytes, 200, {'Content-Type': 'image/jpeg'}
    except Exception:
        return jsonify({'error': '封面解析失败'}), 500


@app.route('/api/song/<song_id>/lrc', methods=['POST'])
def upload_lrc(song_id):
    """上传绑定外置LRC歌词"""
    song = dm.get_song(song_id)
    if not song:
        return jsonify({'success': False, 'error': '歌曲不存在'}), 404

    if 'lrc' not in request.files:
        return jsonify({'success': False, 'error': '未提供LRC文件'}), 400

    lrc_file = request.files['lrc']
    if not lrc_file.filename or not lrc_file.filename.endswith('.lrc'):
        return jsonify({'success': False, 'error': '仅支持.lrc文件'}), 400

    try:
        lrc_text = lrc_file.read().decode('utf-8')
    except UnicodeDecodeError:
        try:
            lrc_file.seek(0)
            lrc_text = lrc_file.read().decode('gbk')
        except Exception:
            return jsonify({'success': False, 'error': 'LRC文件编码不支持'}), 400

    # 验证LRC格式
    parsed = LRCParser.parse(lrc_text)
    if not parsed:
        return jsonify({'success': False, 'error': 'LRC文件内容为空或格式无效'}), 400

    normalized = LRCParser.to_lrc_text(parsed)
    dm.bind_lrc(song_id, normalized)

    return jsonify({
        'success': True,
        'title': song['title'],
        'lyric_source': 'external',
        'line_count': len(parsed)
    })


@app.route('/api/song/<song_id>/lrc', methods=['DELETE'])
def unbind_lrc(song_id):
    """解绑外置LRC歌词"""
    if dm.unbind_lrc(song_id):
        song = dm.get_song(song_id)
        return jsonify({
            'success': True,
            'lyric_source': song.get('lyric_source', 'none')
        })
    return jsonify({'success': False, 'error': '歌曲不存在'}), 404


@app.route('/api/song/<song_id>/lyric-switch', methods=['POST'])
def switch_lyric(song_id):
    """切换歌词来源"""
    data = request.get_json()
    if not data or 'source' not in data:
        return jsonify({'success': False, 'error': '请指定歌词来源'}), 400

    source = data['source']
    if source not in ('embedded', 'external'):
        return jsonify({'success': False, 'error': '无效的歌词来源'}), 400

    if dm.switch_lyric_source(song_id, source):
        return jsonify({'success': True, 'lyric_source': source})

    return jsonify({
        'success': False,
        'error': f'无法切换到 {source}，对应歌词不存在'
    }), 400


@app.route('/api/song/<song_id>/lyrics', methods=['GET'])
def get_lyrics(song_id):
    """获取歌词"""
    source = request.args.get('source')
    lrc_text, effective_source = dm.get_lyrics(song_id, source)

    if lrc_text is None:
        return jsonify({
            'success': True,
            'lyrics': '',
            'source': effective_source,
            'has_lyrics': False
        })

    return jsonify({
        'success': True,
        'lyrics': lrc_text,
        'source': effective_source,
        'has_lyrics': True
    })


@app.route('/api/favorites', methods=['GET'])
def get_favorites():
    """获取收藏列表"""
    songs = dm.get_favorites()
    result = []
    for s in songs:
        result.append({
            'id': s['id'],
            'title': s['title'],
            'artist': s['artist'],
            'duration_str': s['duration_str'],
            'lyric_source': s.get('lyric_source', 'none')
        })
    return jsonify({'success': True, 'songs': result})


@app.route('/api/favorite', methods=['POST'])
def toggle_favorite():
    """切换收藏"""
    data = request.get_json()
    if not data or 'song_id' not in data:
        return jsonify({'success': False, 'error': '请提供歌曲ID'}), 400

    favorited = dm.toggle_favorite(data['song_id'])
    return jsonify({'success': True, 'favorited': favorited})


@app.route('/api/history', methods=['GET'])
def get_history():
    """获取播放历史"""
    songs = dm.get_history()
    result = []
    for s in songs:
        result.append({
            'id': s['id'],
            'title': s['title'],
            'artist': s['artist'],
            'duration_str': s['duration_str'],
            'played_at': s.get('played_at', '')
        })
    return jsonify({'success': True, 'songs': result})


@app.route('/api/progress', methods=['POST'])
def save_progress():
    """保存播放进度"""
    data = request.get_json()
    if not data:
        return jsonify({'success': False}), 400

    song_id = data.get('song_id')
    if song_id and song_id in dm.songs:
        dm.add_history(song_id)

    # 保存到配置文件
    config = load_json(CONFIG_FILE, {})
    config['last_song_id'] = song_id
    config['last_progress'] = data.get('progress', 0)
    config['last_volume'] = data.get('volume', 0.7)
    config['last_play_mode'] = data.get('play_mode', 'list')
    save_json(CONFIG_FILE, config)

    return jsonify({'success': True})


@app.route('/api/progress', methods=['GET'])
def get_progress():
    """获取播放进度"""
    config = load_json(CONFIG_FILE, {})
    return jsonify({
        'success': True,
        'last_song_id': config.get('last_song_id'),
        'last_progress': config.get('last_progress', 0),
        'last_volume': config.get('last_volume', 0.7),
        'last_play_mode': config.get('last_play_mode', 'list')
    })


@app.route('/api/config', methods=['POST'])
def save_config():
    """保存前端配置"""
    data = request.get_json()
    if data:
        config = load_json(CONFIG_FILE, {})
        config.update(data)
        save_json(CONFIG_FILE, config)
    return jsonify({'success': True})


@app.route('/api/config', methods=['GET'])
def get_config():
    """获取配置"""
    config = load_json(CONFIG_FILE, {})
    return jsonify({'success': True, 'config': config})


@app.route('/api/ping', methods=['GET'])
def ping():
    """健康检查"""
    return jsonify({
        'success': True,
        'status': 'running',
        'songs_count': len(dm.songs),
        'favorites_count': len(dm.favorites),
        'history_count': len(dm.history)
    })


# ============ 启动 ============

def load_server_config():
    """从 data/server_config.json 读取配置，不存在则创建默认"""
    config_file = DATA_DIR / 'server_config.json'
    defaults = {'host': '127.0.0.1', 'port': 5000}

    if config_file.exists():
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                config = json.load(f)
            # 补全缺失字段
            for k, v in defaults.items():
                config.setdefault(k, v)
            return config
        except Exception:
            pass

    # 默认配置写入文件
    with open(config_file, 'w', encoding='utf-8') as f:
        json.dump(defaults, f, indent=2)
    return dict(defaults)


def main():
    import webbrowser
    import threading

    host = '127.0.0.1'
    port = 5000

    # 从配置文件读取（优先级1 — 可持久化修改）
    config = load_server_config()
    host = config.get('host', host)
    port = int(config.get('port', port))

    # 命令行参数覆盖（优先级2）
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass
    if len(sys.argv) > 2:
        host = sys.argv[2]

    print(f"""
{'=' * 50}
  MusicPlayer Server
  Address: http://{host}:{port}
  Mode: Local Offline
  Config: data/server_config.json (双击编辑可修改端口)
  Quit: Ctrl+C
{'=' * 50}
""")

    # 自动打开浏览器
    def open_browser():
        time.sleep(1.5)
        webbrowser.open(f'http://{host}:{port}')

    threading.Thread(target=open_browser, daemon=True).start()

    app.run(host=host, port=port, debug=False, threaded=True)


if __name__ == '__main__':
    main()
