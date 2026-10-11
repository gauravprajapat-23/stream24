@echo off
setlocal
cd /d "%~dp0"
echo Stream24 Windows Setup
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\windows\setup-stream24.ps1" -Mode Both -InstallStartupTasks
if errorlevel 1 (
  echo.
  echo Setup failed. Review the error above.
  pause
  exit /b 1
)
echo.
echo Setup complete. Open http://localhost:3000
pause
