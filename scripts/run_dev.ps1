# VisionSetil - Development launcher
# Starts backend (FastAPI/uvicorn) and frontend (Vite) in parallel
#
# Usage:
#   pwsh -File scripts/run_dev.ps1
#
# Then open:
#   Frontend: http://localhost:5173
#   Backend:  http://localhost:8000
#   Docs:     http://localhost:8000/docs
#
# Press Ctrl+C to stop both services.

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent $PSScriptRoot

Write-Host "`n=== VisionSetil Dev Launcher ===`n" -ForegroundColor Cyan

# Verify backend deps
Write-Host "[1/3] Checking backend dependencies..." -ForegroundColor Yellow
Push-Location $ROOT
python -c "import fastapi, uvicorn" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Installing backend deps..." -ForegroundColor Yellow
    pip install -e ".[dev,ml]"
}
Pop-Location

# Verify frontend deps
Write-Host "[2/3] Checking frontend dependencies..." -ForegroundColor Yellow
if (-not (Test-Path "$ROOT\frontend\node_modules")) {
    Write-Host "  Installing frontend deps..." -ForegroundColor Yellow
    Push-Location "$ROOT\frontend"
    npm install
    Pop-Location
}

# Start backend
Write-Host "[3/3] Launching services..." -ForegroundColor Yellow
Write-Host "  Backend:  http://localhost:8000  (Swagger: /docs)" -ForegroundColor Green
Write-Host "  Frontend: http://localhost:5173" -ForegroundColor Green
Write-Host ""

$backendJob = Start-Job -ScriptBlock {
    param($r)
    Set-Location $r
    python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
} -ArgumentList $ROOT

$frontendJob = Start-Job -ScriptBlock {
    param($r)
    Set-Location "$r\frontend"
    npm run dev -- --host
} -ArgumentList $ROOT

Write-Host "Services started (Job IDs: Backend=$($backendJob.Id), Frontend=$($frontendJob.Id))" -ForegroundColor Cyan
Write-Host "Waiting 5s for services to initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Show status
Write-Host "`n--- Backend logs (first lines) ---" -ForegroundColor Cyan
Receive-Job $backendJob -ErrorAction SilentlyContinue | Select-Object -First 10
Write-Host "`n--- Frontend logs (first lines) ---" -ForegroundColor Cyan
Receive-Job $frontendJob -ErrorAction SilentlyContinue | Select-Object -First 10

Write-Host "`n=== Services running. Press Ctrl+C to stop. ===" -ForegroundColor Green
Write-Host "=== Para ver logs en vivo: Get-Job | Receive-Job -Keep ===" -ForegroundColor Green

try {
    while ($true) {
        Start-Sleep -Seconds 2
    }
} finally {
    Write-Host "`nStopping services..." -ForegroundColor Yellow
    Stop-Job $backendJob, $frontendJob -ErrorAction SilentlyContinue
    Remove-Job $backendJob, $frontendJob -Force -ErrorAction SilentlyContinue
}