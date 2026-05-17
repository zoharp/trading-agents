@echo off
setlocal enabledelayedexpansion

REM ============================================================
REM [Project Name] - Full Stack Runner
REM Starts Backend (FastAPI) + Frontend (React)
REM Opens browser automatically
REM ============================================================

title [Project Name]

echo.
echo ============================================================
echo  [Project Name]
echo ============================================================
echo.

REM Define ports
set BACKEND_PORT=8000
set FRONTEND_PORT=5173
set FRONTEND_URL=http://localhost:%FRONTEND_PORT%
set BACKEND_URL=http://localhost:%BACKEND_PORT%

REM Change to project root
cd /d "%~dp0"

REM Kill any existing backend/frontend processes
echo [*] Cleaning up existing processes...
powershell -NoProfile -Command "Get-Process -Id (Get-NetTCPConnection -LocalPort %BACKEND_PORT% -State Listen -ErrorAction SilentlyContinue).OwningProcess -ErrorAction SilentlyContinue | Stop-Process -Force" >nul 2>&1
powershell -NoProfile -Command "Get-Process -Id (Get-NetTCPConnection -LocalPort %FRONTEND_PORT% -State Listen -ErrorAction SilentlyContinue).OwningProcess -ErrorAction SilentlyContinue | Stop-Process -Force" >nul 2>&1

REM Clear Python bytecode cache
echo [*] Clearing Python cache...
if exist backend\__pycache__ rmdir /s /q backend\__pycache__

ping -n 3 127.0.0.1 >nul

REM Start Backend
echo [1/2] Starting FastAPI Backend on port %BACKEND_PORT%...
start "[Project Name] Backend" cmd /k "call .venv\Scripts\activate && python -m uvicorn backend.api:app --reload"
ping -n 4 127.0.0.1 >nul

REM Start Frontend
echo [2/2] Starting React Frontend on port %FRONTEND_PORT%...
cd frontend
start "[Project Name] Frontend" cmd /k "npm run dev"
cd ..
ping -n 4 127.0.0.1 >nul

REM Wait for backend to be ready
echo.
echo [*] Waiting for backend to start...
set "max_retries=30"
set "retry_count=0"

:check_backend
if %retry_count% geq %max_retries% (
    echo [!] Backend not ready after %max_retries% retries
    goto open_browser
)
ping -n 2 127.0.0.1 >nul
curl -s %BACKEND_URL%/health >nul 2>&1
if errorlevel 1 (
    set /a retry_count+=1
    echo [*] Waiting... (!retry_count!/%max_retries%)
    goto check_backend
)
echo [OK] Backend ready at %BACKEND_URL%

ping -n 6 127.0.0.1 >nul

:open_browser
echo.
echo [*] Opening browser to %FRONTEND_URL%...
start %FRONTEND_URL%

echo.
echo ============================================================
echo [OK] Application Started
echo ============================================================
echo.
echo Backend:   %BACKEND_URL%
echo Frontend:  %FRONTEND_URL%
echo API Docs:  %BACKEND_URL%/docs
echo.
echo Press Ctrl+C in the server windows to stop.
echo ============================================================
echo.
pause
