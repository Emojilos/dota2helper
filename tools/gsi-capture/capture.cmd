@echo off
rem MidMind GSI capture — запуск двойным кликом (обходит ExecutionPolicy для этого файла).
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0capture.ps1"
pause
