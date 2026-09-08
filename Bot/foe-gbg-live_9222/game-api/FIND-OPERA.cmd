@echo off
setlocal EnableExtensions EnableDelayedExpansion

echo Searching for Opera...

call :check "%LOCALAPPDATA%\Programs\Opera\opera.exe"
call :check "%LOCALAPPDATA%\Programs\Opera\launcher.exe"
call :check "%LOCALAPPDATA%\Programs\Opera GX\opera.exe"
call :check "%LOCALAPPDATA%\Programs\Opera GX\launcher.exe"
call :check "%ProgramFiles%\Opera\opera.exe"
call :check "%ProgramFiles%\Opera\launcher.exe"
call :check "%ProgramFiles%\Opera GX\opera.exe"
call :check "%ProgramFiles%\Opera GX\launcher.exe"
call :check "%ProgramFiles(x86)%\Opera\opera.exe"
call :check "%ProgramFiles(x86)%\Opera\launcher.exe"
call :check "%ProgramFiles(x86)%\Opera GX\opera.exe"
call :check "%ProgramFiles(x86)%\Opera GX\launcher.exe"
if defined OPERA_FOUND goto found

call :registry "HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\opera.exe"
call :registry "HKLM\Software\Microsoft\Windows\CurrentVersion\App Paths\opera.exe"
call :registry "HKLM\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\opera.exe"
if defined OPERA_FOUND goto found

for /f "delims=" %%I in ('where opera.exe 2^>nul') do call :check "%%I"
if defined OPERA_FOUND goto found

call :scan "%LOCALAPPDATA%\Programs"
if defined OPERA_FOUND goto found
call :scan "%ProgramFiles%"
if defined OPERA_FOUND goto found
call :scan "%ProgramFiles(x86)%"
if defined OPERA_FOUND goto found

echo.
echo Opera was not found.
pause
endlocal
exit /b 1

:found
echo.
echo Opera found:
echo %OPERA_FOUND%
echo.
pause
endlocal
exit /b 0

:check
if exist "%~1" set "OPERA_FOUND=%~1"
exit /b 0

:registry
for /f "tokens=2,*" %%A in ('reg query "%~1" /ve 2^>nul ^| findstr /i "REG_SZ"') do call :check "%%~B"
exit /b 0

:scan
if not exist "%~1" exit /b 0
for /f "delims=" %%I in ('dir /b /s /a-d "%~1\opera.exe" 2^>nul') do if not defined OPERA_FOUND call :check "%%I"
for /f "delims=" %%I in ('dir /b /s /a-d "%~1\launcher.exe" 2^>nul ^| findstr /i "\\Opera"') do if not defined OPERA_FOUND call :check "%%I"
exit /b 0
