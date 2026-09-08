@echo off
setlocal

set "OPERA_EXE=%~1"
if exist "%OPERA_EXE%" goto launch

set "OPERA_EXE=%LOCALAPPDATA%\Programs\Opera\launcher.exe"
if not exist "%OPERA_EXE%" set "OPERA_EXE=%LOCALAPPDATA%\Programs\Opera\opera.exe"
if not exist "%OPERA_EXE%" set "OPERA_EXE=%LOCALAPPDATA%\Programs\Opera GX\launcher.exe"
if not exist "%OPERA_EXE%" set "OPERA_EXE=%LOCALAPPDATA%\Programs\Opera GX\opera.exe"
if not exist "%OPERA_EXE%" set "OPERA_EXE=%ProgramFiles%\Opera\launcher.exe"
if not exist "%OPERA_EXE%" set "OPERA_EXE=%ProgramFiles%\Opera\opera.exe"
if not exist "%OPERA_EXE%" set "OPERA_EXE=%ProgramFiles%\Opera GX\launcher.exe"
if not exist "%OPERA_EXE%" set "OPERA_EXE=%ProgramFiles%\Opera GX\opera.exe"
if not exist "%OPERA_EXE%" set "OPERA_EXE=%ProgramFiles(x86)%\Opera\launcher.exe"
if not exist "%OPERA_EXE%" set "OPERA_EXE=%ProgramFiles(x86)%\Opera\opera.exe"
if not exist "%OPERA_EXE%" set "OPERA_EXE=%ProgramFiles(x86)%\Opera GX\launcher.exe"
if not exist "%OPERA_EXE%" set "OPERA_EXE=%ProgramFiles(x86)%\Opera GX\opera.exe"

if not exist "%OPERA_EXE%" for /f "tokens=2,*" %%A in ('reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\opera.exe" /ve 2^>nul ^| findstr /i "REG_SZ"') do set "OPERA_EXE=%%~B"
if not exist "%OPERA_EXE%" for /f "tokens=2,*" %%A in ('reg query "HKLM\Software\Microsoft\Windows\CurrentVersion\App Paths\opera.exe" /ve 2^>nul ^| findstr /i "REG_SZ"') do set "OPERA_EXE=%%~B"
if not exist "%OPERA_EXE%" for /f "tokens=2,*" %%A in ('reg query "HKLM\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\opera.exe" /ve 2^>nul ^| findstr /i "REG_SZ"') do set "OPERA_EXE=%%~B"

if not exist "%OPERA_EXE%" (
  echo Opera was not found.
  echo Paste the full path to opera.exe or launcher.exe and press Enter.
  set /p "OPERA_EXE=Path: "
)

set "OPERA_EXE=%OPERA_EXE:"=%"
if not exist "%OPERA_EXE%" goto not_found

:launch
start "FoE Opera" "%OPERA_EXE%" --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\OperaFoEApi"
endlocal
exit /b 0

:not_found
echo The specified Opera file does not exist.
pause
endlocal
exit /b 1
