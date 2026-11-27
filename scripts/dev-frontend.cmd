@echo off
setlocal
cd /d "%~dp0..\frontend"
call npm.cmd run dev -- --port 5174 --strictPort
