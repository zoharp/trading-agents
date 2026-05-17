# two.desk - Dev Server Launcher
# Kill existing process on port 3000, start Next.js dev server, open browser

$FRONTEND_PORT = 3000
$FRONTEND_URL = "http://localhost:$FRONTEND_PORT"
$PROJECT_ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  two.desk - Development Server" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Kill existing process on port 3000
Write-Host "[*] Cleaning up existing processes on port $FRONTEND_PORT..." -ForegroundColor Yellow
$existingProcess = Get-NetTCPConnection -LocalPort $FRONTEND_PORT -ErrorAction SilentlyContinue |
    Where-Object State -eq "Listen" |
    Select-Object -ExpandProperty OwningProcess -ErrorAction SilentlyContinue

if ($existingProcess) {
    Stop-Process -Id $existingProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Write-Host "[OK] Old process killed" -ForegroundColor Green
}

# Start Next.js dev server
Write-Host "[1/1] Starting Next.js dev server on port $FRONTEND_PORT..." -ForegroundColor Yellow
Set-Location $PROJECT_ROOT
$devProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/k npm run dev" -PassThru -WindowStyle Normal

# Wait for server to start (simple file-based check or time-based)
Write-Host ""
Write-Host "[*] Waiting for dev server to start (this takes 20-30 seconds)..." -ForegroundColor Yellow

$maxWait = 60  # seconds
$elapsed = 0
$checkInterval = 2

while ($elapsed -lt $maxWait) {
    try {
        $response = Invoke-WebRequest -Uri $FRONTEND_URL -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            Write-Host "[OK] Dev server ready at $FRONTEND_URL" -ForegroundColor Green
            break
        }
    }
    catch {
        # Server not ready yet
    }

    $elapsed += $checkInterval
    Start-Sleep -Seconds $checkInterval
    Write-Host "    Waiting... ($elapsed/$maxWait seconds)" -ForegroundColor Gray
}

# Open browser
Write-Host ""
Write-Host "[*] Opening browser to $FRONTEND_URL..." -ForegroundColor Yellow
Start-Process $FRONTEND_URL

# Final message
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "[OK] two.desk Started" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Frontend:  $FRONTEND_URL" -ForegroundColor Cyan
Write-Host ""
Write-Host "The dev server is running in the window above." -ForegroundColor Yellow
Write-Host "Press Ctrl+C in the server window to stop." -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""

# Keep this window open
Read-Host "Press Enter to exit"
