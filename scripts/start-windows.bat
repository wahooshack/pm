@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
set "rc=%ERRORLEVEL%"
if not "%rc%"=="0" echo Startup failed (exit %rc%).
pause
exit /b %rc%
