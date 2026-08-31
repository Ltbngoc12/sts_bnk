@echo off
cd /d "%~dp0"
echo Cleaning up previous server on port 3000 if any...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
echo Starting Next.js dev server...
call npm.cmd run dev
pause
