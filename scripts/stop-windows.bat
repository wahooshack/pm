@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop.ps1"
set "rc=%ERRORLEVEL%"
if not "%rc%"=="0" echo Shutdown failed (exit %rc%).
pause
exit /b %rc%
