@echo off
setlocal
cd /d "%~dp0"
set "CHROME_EXE=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME_EXE%" set "CHROME_EXE=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME_EXE%" (
  echo Google Chrome was not found.
  pause
  exit /b 1
)

if not exist ".proxy-9222.json" (
  echo Proxy 9222 is not configured yet.
  call SETUP-PROXY-9222.cmd
  if errorlevel 1 exit /b 1
)

powershell.exe -NoProfile -NonInteractive -Command "$c=New-Object Net.Sockets.TcpClient; try{$c.Connect('127.0.0.1',9222); exit 0}catch{exit 1}finally{$c.Dispose()}"
if not errorlevel 1 (
  echo Chrome 9222 is already running. Close it completely and run this file again.
  pause
  exit /b 1
)

powershell.exe -NoProfile -NonInteractive -Command "$c=New-Object Net.Sockets.TcpClient; try{$c.Connect('127.0.0.1',19222); exit 0}catch{exit 1}finally{$c.Dispose()}"
if errorlevel 1 (
  powershell.exe -NoProfile -NonInteractive -Command "Start-Process -FilePath 'node.exe' -ArgumentList @('%~dp0proxy-bridge.js','--config','%~dp0.proxy-9222.json','--listen-port','19222') -WorkingDirectory '%~dp0' -WindowStyle Hidden"
)

for /l %%I in (1,1,20) do (
  powershell.exe -NoProfile -NonInteractive -Command "$c=New-Object Net.Sockets.TcpClient; try{$c.Connect('127.0.0.1',19222); exit 0}catch{exit 1}finally{$c.Dispose()}"
  if not errorlevel 1 goto proxy_ready
  timeout /t 1 /nobreak >nul
)

echo Local proxy bridge 9222 did not start. Run SETUP-PROXY-9222.cmd again.
pause
exit /b 1

:proxy_ready
start "FoE Chrome 9222" "%CHROME_EXE%" --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\ChromeFoEApi-9222" --proxy-server="http://127.0.0.1:19222"
