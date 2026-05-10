@echo off
cd /d "%~dp0"

REM Clear Python cache
if exist backend\__pycache__ rmdir /s /q backend\__pycache__

echo [*] Starting FastAPI backend on port 8000...
call .venv\Scripts\activate
python -m uvicorn backend.api:app --reload
