@echo off
setlocal enabledelayedexpansion

REM two.desk - Dev Server Launcher
title two.desk - Dev Server

echo.
echo ============================================================
echo  two.desk - Development Server
echo ============================================================
echo.

set FRONTEND_PORT=3000
set FRONTEND_URL=http://localhost:%FRONTEND_PORT%

cd /d "%~dp0"

REM Kill any existing process on port 3000
echo [*] Killing existing process on port %FRONTEND_PORT%...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":%FRONTEND_PORT%" ^| find "LISTENING"') do (
    taskkill /pid %%a /f >nul 2>&1
)

ping -n 2 127.0.0.1 >nul

REM Start Next.js dev server in new window
echo [*] Starting Next.js dev server...
start "two.desk" cmd /k "npm run dev"

REM Wait for server to initialize (30 seconds should be enough)
echo [*] Waiting for server to start (30 seconds)...
echo.

for /l %%i in (1,1,15) do (
    ping -n 2 127.0.0.1 >nul
    set /a remaining=30-%%i*2
    if !remaining! gtr 0 echo    !remaining! seconds remaining...
)

REM Open browser
echo [*] Opening browser...
timeout /t 2 /nobreak >nul
start "" "%FRONTEND_URL%"

echo.
echo ============================================================
echo [OK] Server running at %FRONTEND_URL%
echo ============================================================
echo.

pause
