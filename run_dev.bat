@echo off
cd /d "D:\Huy Sentosa"
echo Pulling latest from origin/main...
git pull
echo.
echo Starting Next.js dev server...
npm run dev
pause
