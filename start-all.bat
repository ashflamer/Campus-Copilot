@echo off
REM Start all 3 servers (Windows). Close the windows to stop.
cd /d "%~dp0"
if "%GEMMA_PROVIDER%"=="" set GEMMA_PROVIDER=ollama
if "%GEMMA_MODEL%"=="" set GEMMA_MODEL=gemma4:e4b
start "navigator-api" cmd /k "cd backend\navigator-api && python run.py"
start "assignments-api" cmd /k "cd backend\assignments-api && python run.py"
start "workspace-ui" cmd /k "cd frontend\workspace-ui && python serve.py"
timeout /t 3 >nul
start http://localhost:5173
echo Workspace: http://localhost:5173   Navigator: http://localhost:8765
