@echo off
setlocal
cd /d "%~dp0..\frontend"
powershell.exe -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 5174 -State Listen -ErrorAction SilentlyContinue) { exit 1 }; exit 0"
if errorlevel 1 (
  echo El puerto 5174 ya esta ocupado. No se iniciara otro Vite.
  echo Si Nexora ya esta abierto, usa http://127.0.0.1:5174
  exit /b 1
)
call npm.cmd run dev -- --port 5174 --strictPort
