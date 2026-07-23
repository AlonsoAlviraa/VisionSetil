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

# Media audit (non-blocking)
Write-Host "[3/4] Auditing species media..." -ForegroundColor Yellow
Push-Location $ROOT
python scripts/audit_media.py 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  WARN: media audit found issues — run: python scripts/precompute_species_images.py" -ForegroundColor DarkYellow
} else {
    Write-Host "  Media audit OK" -ForegroundColor Green
}
Pop-Location

# Start backend from backend/ so imports resolve
Write-Host "[4/4] Launching services..." -ForegroundColor Yellow
Write-Host "  Backend:  http://localhost:8000  (Swagger: /docs)" -ForegroundColor Green
Write-Host "  Frontend: http://localhost:5173  (photos via /media)" -ForegroundColor Green
Write-Host "  Enciclopedia works with FE only; Identify needs backend." -ForegroundColor DarkGray
Write-Host ""

$backendJob = Start-Job -ScriptBlock {
    param($r)
    Set-Location "$r\backend"
    python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
} -ArgumentList $ROOT

$frontendJob = Start-Job -ScriptBlock {
    param($r)
    Set-Location "$r\frontend"
    npm run dev -- --host 127.0.0.1 --port 5173
} -ArgumentList $ROOT

Write-Host "Services started (Job IDs: Backend=$($backendJob.Id), Frontend=$($frontendJob.Id))" -ForegroundColor Cyan
Write-Host "Waiting for health..." -ForegroundColor Yellow
$healthy = $false
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:8000/health" -UseBasicParsing -TimeoutSec 1
        if ($r.StatusCode -eq 200) { $healthy = $true; break }
    } catch { }
}
if ($healthy) {
    Write-Host "  Backend health: OK" -ForegroundColor Green
} else {
    Write-Host "  Backend health: not ready yet (identify may fail until it is)" -ForegroundColor DarkYellow
}

Write-Host "`n--- Backend logs ---" -ForegroundColor Cyan
Receive-Job $backendJob -ErrorAction SilentlyContinue | Select-Object -First 8
Write-Host "`n--- Frontend logs ---" -ForegroundColor Cyan
Receive-Job $frontendJob -ErrorAction SilentlyContinue | Select-Object -First 8

Write-Host "`n=== Open http://localhost:5173  |  Ctrl+C to stop ===" -ForegroundColor Green
Write-Host "=== Logs: Get-Job | Receive-Job -Keep ===" -ForegroundColor Green

try {
    while ($true) {
        Start-Sleep -Seconds 2
    }
} finally {
    Write-Host "`nStopping services..." -ForegroundColor Yellow
    Stop-Job $backendJob, $frontendJob -ErrorAction SilentlyContinue
    Remove-Job $backendJob, $frontendJob -Force -ErrorAction SilentlyContinue
}