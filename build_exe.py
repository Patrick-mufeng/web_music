"""
MusicPlayer — EXE 打包构建脚本
使用 PyInstaller 打包为单文件可执行程序

使用方法:
    python build_exe.py

输出:
    dist/MusicPlayer.exe
"""
import os
import sys
import shutil
from pathlib import Path

BASE_DIR = Path(__file__).parent

print("=" * 50)
print("MusicPlayer EXE 打包工具")
print("=" * 50)

# 检查 PyInstaller
try:
    import PyInstaller
    print("[OK] PyInstaller 已安装")
except ImportError:
    print("[信息] 正在安装 PyInstaller...")
    os.system(f"{sys.executable} -m pip install pyinstaller -q")
    print("[OK] PyInstaller 安装完成")

# 构建命令
cmd = (
    f'{sys.executable} -m PyInstaller '
    f'--onefile '
    f'--windowed '
    f'--name MusicPlayer '
    f'--add-data "{BASE_DIR / "static"};static" '
    f'--hidden-import flask '
    f'--hidden-import flask_cors '
    f'--hidden-import mutagen '
    f'--hidden-import mutagen.mp3 '
    f'--hidden-import mutagen.flac '
    f'--hidden-import mutagen.mp4 '
    f'--hidden-import mutagen.oggvorbis '
    f'--hidden-import json '
    f'--clean '
    f'"{BASE_DIR / "main.py"}"'
)

print(f"\n[信息] 开始打包...")
print(f"[信息] 命令: {cmd}\n")

exit_code = os.system(cmd)

if exit_code == 0:
    exe_path = BASE_DIR / 'dist' / 'MusicPlayer.exe'
    print(f"\n{'=' * 50}")
    print(f"[成功] 打包完成!")
    print(f"[输出] {exe_path}")
    print(f"[大小] {exe_path.stat().st_size / 1024 / 1024:.1f} MB")
    print(f"{'=' * 50}")
else:
    print(f"\n[失败] 打包出错，请检查上方错误信息")
    sys.exit(1)
