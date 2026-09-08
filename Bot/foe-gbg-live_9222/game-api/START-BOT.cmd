@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "local-scan-cache" mkdir "local-scan-cache"
if exist "local-scan-cache\worker.log" copy /y "local-scan-cache\worker.log" "local-scan-cache\worker.prev.log" >nul
powershell -NoProfile -Command "$OutputEncoding=[Console]::OutputEncoding=[Text.Encoding]::UTF8; cmd /c 'npm run worker 2>&1' | Tee-Object -FilePath 'local-scan-cache\worker.log'"
echo.
echo Bot stopped. Log: local-scan-cache\worker.log  (previous run: worker.prev.log)
pause
