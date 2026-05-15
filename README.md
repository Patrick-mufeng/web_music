# MusicPlayer 🎵

一个沉浸式本地音乐播放器，支持 **3D空间** 和 **毛玻璃** 两种全屏歌词模式。

## 功能

- 🎶 本地音频播放（MP3 / FLAC / WAV / M4A / OGG）
- 📝 LRC 歌词解析 + 中英文混合拆分（英文在上，中文在下）
- 🎨 双歌词渲染模式（主界面右栏 + 主界面迷你歌词）
- 🖥️ 全屏歌词双模式切换（3D空间 / 毛玻璃+雨水）
- ⚙️ 每套全屏模式独立参数设置（字体/颜色/大小/动画等）
- 🖼️ 毛玻璃模式支持自定义背景图片
- 🌈 三种主题：暗黑 / 霓虹 / 极简
- 🌟 星空粒子动态背景
- 📊 实时频谱可视化
- 📋 播放列表管理（搜索 / 排序 / 收藏 / 播放历史）
- ⏱️ 睡眠定时器
- ⌨️ 键盘快捷键

## 快速开始

### 方法一：安装 Python 运行

```bash
pip install flask mutagen flask-cors
python main.py
```

浏览器打开 `http://127.0.0.1:5000`

### 方法二：便携版（U盘即插即用）

将整个 `MusicPlayer` 文件夹复制到 U 盘，双击 `启动.bat` 即可。

### 自定义端口

编辑 `data/server_config.json`：

```json
{
  "host": "127.0.0.1",
  "port": 8080
}
```

或命令行参数：`python main.py 8080`

## 全屏模式

点击播放控制栏的全屏按钮进入全屏歌词。右上角可切换模式：

- **3D空间** — 白色背景 + 黑色字体，8种出场动画（滑入/淡入/缩放/模糊/3D旋转/打字机/弹跳/飞入）
- **毛玻璃** — 背景图片 + 毛玻璃模糊 + 雨水特效，歌词从中间向上滚动

## 文件结构

```
├── main.py                   # Flask 后端
├── static/
│   ├── index.html            # 前端页面
│   ├── css/
│   │   ├── main.css          # 主样式
│   │   ├── themes.css        # 主题样式
│   │   ├── animations.css    # 动画
│   │   └── fullscreen.css    # 全屏独立样式
│   └── js/
│       ├── api.js            # API 请求
│       ├── player.js         # 音频播放
│       ├── playlist.js       # 播放列表
│       ├── lyrics.js         # 歌词解析
│       ├── spectrum.js       # 频谱
│       ├── effects.js        # 星空特效
│       ├── ui.js             # UI 逻辑
│       ├── fullscreen.js     # 全屏双模式
│       └── app.js            # 入口
└── data/                     # 歌曲数据（运行时生成）
```

## 技术栈

- **后端**: Python + Flask
- **前端**: 原生 HTML / CSS / JavaScript
- **音频**: Mutagen（元数据提取）+ Web Audio API（频谱）
