@echo off
setlocal

set "SCRIPT=%~dp0iniciar-avatar-obs.ps1"
where pwsh.exe >nul 2>nul
if errorlevel 1 (
  set "POWERSHELL=powershell.exe"
) else (
  set "POWERSHELL=pwsh.exe"
)

"%POWERSHELL%" -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"
endlocal
