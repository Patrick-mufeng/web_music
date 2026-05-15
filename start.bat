@echo off
chcp 65001 >nul
title MusicPlayer - 启动中...

echo ╔═════════════════════════════════════╗
echo ║     🎵 MusicPlayer 启动脚本 🎵       ║
echo ╚═════════════════════════════════════╝
echo.

:: 检查 Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Python，请先安装 Python 并配置环境变量！
    echo 下载地址: https://www.python.org/downloads/
    pause
    exit /b 1
)

echo [OK] 已检测到 Python 环境
echo.

:: 安装依赖
echo [信息] 正在检查并安装依赖...
pip install -r requirements.txt -q
if %errorlevel% neq 0 (
    echo [错误] 依赖安装失败，请检查网络连接！
    pause
    exit /b 1
)
echo [OK] 依赖就绪
echo.

:: 启动服务
echo [信息] 正在启动后端服务...
echo 服务启动后将自动打开浏览器，请稍候...
echo.
echo 提示：关闭本窗口即可停止服务
echo.

python main.py

pause
