# VisionSetil - Full inspection dashboard
# Shows status of all services, endpoints, and detector metrics
#
# Usage:  pwsh -File scripts/inspect.ps1

$BACKEND = "http://localhost:8000"
$FRONTEND = "http://localhost:5173"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "   VisionSetil - Inspection Dashboard" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# 1. Backend health
Write-Host "[1] Backend Health" -ForegroundColor Yellow
try {
    $h = (Invoke-RestMethod -Uri "$BACKEND/health" -TimeoutSec 5)
    Write-Host "    Status: $($h.status) | Service: $($h.service)" -ForegroundColor Green
} catch {
    Write-Host "    FAIL: Backend not responding on $BACKEND" -ForegroundColor Red
    Write-Host "    Start with: python -m uvicorn app.main:app --port 8000 --reload" -ForegroundColor DarkGray
}

# 2. Backend readiness
Write-Host "`n[2] Backend Readiness (/readyz)" -ForegroundColor Yellow
try {
    $r = (Invoke-RestMethod -Uri "$BACKEND/readyz" -TimeoutSec 5)
    foreach ($k in $r.checks.PSObject.Properties.Name) {
        $val = $r.checks.$k
        $color = if ($val -eq "ok") { "Green" } else { "Red" }
        Write-Host "    ${k}: ${val}" -ForegroundColor $color
    }
} catch {
    Write-Host "    Readiness check failed" -ForegroundColor Red
}

# 3. Endpoints
Write-Host "`n[3] API Endpoints" -ForegroundColor Yellow
try {
    $spec = (Invoke-RestMethod -Uri "$BACKEND/openapi.json" -TimeoutSec 5)
    foreach ($path in $spec.paths.PSObject.Properties.Name) {
        $methods = $spec.paths.$path.PSObject.Properties.Name | Where-Object { $_ -in 'get','post','put','delete' }
        foreach ($m in $methods) {
            Write-Host ("    {0,-6} {1}" -f $m.ToUpper(), $path)
        }
    }
} catch {
    Write-Host "    Cannot fetch OpenAPI spec" -ForegroundColor Red
}

# 4. Frontend
Write-Host "`n[4] Frontend" -ForegroundColor Yellow
try {
    $resp = Invoke-WebRequest -Uri $FRONTEND -TimeoutSec 5 -UseBasicParsing
    Write-Host "    Status: $($resp.StatusCode) at $FRONTEND" -ForegroundColor Green
} catch {
    Write-Host "    FAIL: Frontend not responding on $FRONTEND" -ForegroundColor Red
    Write-Host "    Start with: cd frontend; npm run dev" -ForegroundColor DarkGray
}

# 5. Metrics
Write-Host "`n[5] Backend Metrics (/metrics)" -ForegroundColor Yellow
try {
    $m = (Invoke-RestMethod -Uri "$BACKEND/metrics" -TimeoutSec 5)
    $m | ConvertTo-Json -Depth 3 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
} catch {
    Write-Host "    Metrics endpoint not available" -ForegroundColor DarkGray
}

# 6. Running processes
Write-Host "`n[6] Running Processes" -ForegroundColor Yellow
$procs = Get-Process -Name python,node,npm -ErrorAction SilentlyContinue
if ($procs) {
    $procs | Format-Table Name, Id, CPU, WorkingSet64 -AutoSize
} else {
    Write-Host "    No VisionSetil processes found" -ForegroundColor DarkGray
}

# 7. Model status
Write-Host "[7] Model Status (/models/status)" -ForegroundColor Yellow
try {
    $ms = (Invoke-RestMethod -Uri "$BACKEND/models/status" -TimeoutSec 5)
    $ms | ConvertTo-Json -Depth 3 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
} catch {
    Write-Host "    Model status endpoint not available" -ForegroundColor DarkGray
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "URLs:" -ForegroundColor White
Write-Host "  Frontend:  $FRONTEND"
Write-Host "  Backend:   $BACKEND"
Write-Host "  Swagger:   $BACKEND/docs"
Write-Host "  ReDoc:     $BACKEND/redoc"
Write-Host "========================================`n" -ForegroundColor Cyan