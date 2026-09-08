@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-proxy-9222.ps1"
if errorlevel 1 (
  echo Proxy setup failed.
  pause
  exit /b 1
)
pause
