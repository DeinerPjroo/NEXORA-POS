@echo off
setlocal
cd /d "%~dp0..\backend"
set "FRONTEND_URL=http://127.0.0.1:5174"
set "SANCTUM_STATEFUL_DOMAINS=127.0.0.1:5174,localhost:5174"
set "NEXORA_PHP=php"
if exist "%~dp0..\..\..\php\php.exe" set "NEXORA_PHP=%~dp0..\..\..\php\php.exe"
"%NEXORA_PHP%" artisan serve --host=127.0.0.1 --port=8001
