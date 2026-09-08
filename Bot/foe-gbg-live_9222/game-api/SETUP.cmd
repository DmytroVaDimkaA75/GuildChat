@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 22 and run this file again.
  pause
  exit /b 1
)
call npm install
if errorlevel 1 goto failed
call npm run setup
if errorlevel 1 goto failed
pause
exit /b 0
:failed
echo Setup failed. Read the message above.
pause
exit /b 1
