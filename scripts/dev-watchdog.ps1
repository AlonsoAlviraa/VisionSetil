# VisionSetil dev watchdog - keeps API + App + Web alive.
# Usage: double-click start-visionsetil.bat OR
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dev-watchdog.ps1

$ErrorActionPreference = "Continue"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Fe = Join-Path $Root "frontend"
$Be = Join-Path $Root "backend"
$LogDir = Join-Path $Root "logs"
$Log = Join-Path $LogDir "dev-watchdog.log"
$Py = Join-Path $Root ".venv-ci\Scripts\python.exe"
if (-not (Test-Path $Py)) { $Py = "python" }
$Node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $Node) { throw "node not found in PATH" }
if (-not (Test-Path (Join-Path $Fe "package.json"))) {
  throw "frontend/package.json not found under $Root"
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Log([string]$msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  Add-Content -Path $Log -Value $line -Encoding UTF8
  Write-Host $line
}

function HttpOk([string]$url) {
  try {
    $req = [System.Net.HttpWebRequest]::Create($url)
    $req.Method = "GET"
    $req.Timeout = 3000
    $req.ReadWriteTimeout = 3000
    $resp = $req.GetResponse()
    $code = [int]$resp.StatusCode
    $resp.Close()
    return ($code -ge 200 -and $code -lt 500)
  } catch {
    return $false
  }
}

function KillPort([int]$port) {
  $lines = netstat -ano 2>$null | Select-String (":{0}\s+" -f $port) | Select-String "LISTENING"
  foreach ($line in $lines) {
    $parts = ($line.ToString().Trim() -split "\s+") | Where-Object { $_ }
    $procId = $parts[-1]
    if ($procId -match "^\d+$" -and [int]$procId -gt 0) {
      Log ("kill PID {0} on port {1}" -f $procId, $port)
      taskkill /F /PID $procId 2>$null | Out-Null
    }
  }
}

function Start-ApiProc {
  Log "start API :8000"
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $Py
  $psi.Arguments = "-m uvicorn app.main:app --host 127.0.0.1 --port 8000 --log-level warning"
  $psi.WorkingDirectory = $Be
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  try { $psi.EnvironmentVariables["PYTHONUNBUFFERED"] = "1" } catch {}
  $p = [System.Diagnostics.Process]::Start($psi)
  Log ("API pid={0}" -f $p.Id)
  return $p
}

function Start-AppProc {
  Log "start App :5173"
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $Node
  $psi.Arguments = "node_modules\vite\bin\vite.js --host 127.0.0.1 --port 5173 --strictPort"
  $psi.WorkingDirectory = $Fe
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $p = [System.Diagnostics.Process]::Start($psi)
  Log ("App pid={0}" -f $p.Id)
  return $p
}

function Start-WebProc {
  Log "start Web :5174"
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $Node
  $psi.Arguments = "node_modules\vite\bin\vite.js --config vite.web.config.ts --host 127.0.0.1 --port 5174 --strictPort"
  $psi.WorkingDirectory = $Fe
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $p = [System.Diagnostics.Process]::Start($psi)
  Log ("Web pid={0}" -f $p.Id)
  return $p
}

Log ("=== VisionSetil watchdog start root={0} ===" -f $Root)

KillPort 5173
KillPort 5174
if (-not (HttpOk "http://127.0.0.1:8000/health")) { KillPort 8000 }

if (-not (HttpOk "http://127.0.0.1:8000/health")) { $null = Start-ApiProc }
$null = Start-AppProc
$null = Start-WebProc

for ($i = 1; $i -le 40; $i++) {
  $a = HttpOk "http://127.0.0.1:8000/health"
  $b = HttpOk "http://127.0.0.1:5173/"
  $c = HttpOk "http://127.0.0.1:5174/"
  Log ("boot {0} api={1} app={2} web={3}" -f $i, $a, $b, $c)
  if ($a -and $b -and $c) { break }
  Start-Sleep -Seconds 1
}

try { Start-Process "http://127.0.0.1:5173/" } catch {}

Log "Watching every 4s - leave this process running"
while ($true) {
  if (-not (HttpOk "http://127.0.0.1:8000/health")) {
    Log "API DOWN - restart"
    KillPort 8000
    Start-Sleep -Milliseconds 600
    $null = Start-ApiProc
  }
  if (-not (HttpOk "http://127.0.0.1:5173/")) {
    Log "App DOWN - restart"
    KillPort 5173
    Start-Sleep -Milliseconds 600
    $null = Start-AppProc
  }
  if (-not (HttpOk "http://127.0.0.1:5174/")) {
    Log "Web DOWN - restart"
    KillPort 5174
    Start-Sleep -Milliseconds 600
    $null = Start-WebProc
  }
  Start-Sleep -Seconds 4
}
