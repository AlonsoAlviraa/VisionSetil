# VisionSetil — local structural smoke for beta hosting / PWA / invite env.
# No cloud credentials. Does not deploy. Exit 0 = files + contracts OK.
# Usage (repo root):  pwsh -File scripts/smoke_beta_preview.ps1

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $Root 'docs'))) {
  $Root = $PSScriptRoot + '\..'
  $Root = (Resolve-Path $Root).Path
}

$fail = 0
function Assert-Exists([string]$Rel, [string]$Why) {
  $p = Join-Path $Root $Rel
  if (-not (Test-Path -LiteralPath $p)) {
    Write-Host "FAIL missing: $Rel ($Why)" -ForegroundColor Red
    $script:fail++
  } else {
    Write-Host "OK   $Rel" -ForegroundColor Green
  }
}

function Assert-FileMatch([string]$Rel, [string]$Pattern, [string]$Why) {
  $p = Join-Path $Root $Rel
  if (-not (Test-Path -LiteralPath $p)) {
    Write-Host "FAIL missing: $Rel ($Why)" -ForegroundColor Red
    $script:fail++
    return
  }
  $text = Get-Content -LiteralPath $p -Raw -ErrorAction Stop
  if ($text -notmatch $Pattern) {
    Write-Host "FAIL pattern /$Pattern/ in $Rel ($Why)" -ForegroundColor Red
    $script:fail++
  } else {
    Write-Host "OK   $Rel ~ $Why" -ForegroundColor Green
  }
}

Write-Host "=== VisionSetil beta preview smoke (structural) ===" -ForegroundColor Cyan
Write-Host "Root: $Root"

# Decision + GTM + operator checklist
Assert-Exists 'docs/HOSTING_DEPLOY_BETA.md' 'hosting decision'
Assert-Exists 'docs/GTM_BETA_COHORT.md' 'cohort kit'
Assert-Exists 'docs/GTM_30_DAY_TRY_PLAN.md' '30-day plan'
Assert-Exists 'docs/OPERATOR_BETA_CHECKLIST.md' 'operator beta checklist O1-O4'
Assert-FileMatch 'docs/OPERATOR_BETA_CHECKLIST.md' 'VITE_BETA_FEEDBACK_URL' 'form env'
Assert-FileMatch 'docs/OPERATOR_BETA_CHECKLIST.md' 'Identify' 'Identify smoke'
Assert-FileMatch 'docs/HOSTING_DEPLOY_BETA.md' 'Path A' 'default path decided'
Assert-FileMatch 'docs/HOSTING_DEPLOY_BETA.md' 'PWA|Añadir a pantalla' 'PWA install'
Assert-FileMatch 'docs/HOSTING_DEPLOY_BETA.md' 'HTTPS' 'HTTPS required'
Assert-FileMatch 'docs/HOSTING_DEPLOY_BETA.md' 'orientation' 'orientation_only'
Assert-FileMatch 'docs/HOSTING_DEPLOY_BETA.md' 'VITE_PUBLIC_APP_URL' 'public app URL'
Assert-FileMatch 'docs/GTM_BETA_COHORT.md' 'HOSTING_DEPLOY_BETA' 'GTM links hosting step 0'

# Env templates
Assert-Exists 'frontend/.env.example' 'FE env template'
Assert-Exists '.env.example' 'root env template'
Assert-FileMatch 'frontend/.env.example' 'VITE_API_URL' 'API URL'
Assert-FileMatch 'frontend/.env.example' 'VITE_PUBLIC_APP_URL' 'public URL'
Assert-FileMatch 'frontend/.env.example' 'VITE_BETA_FEEDBACK_URL' 'feedback form'
Assert-FileMatch '.env.example' 'VITE_PUBLIC_APP_URL' 'root documents public URL'

# Product surfaces + Path A deploy artifacts
Assert-Exists 'frontend/src/lib/hostingPublicUrl.ts' 'public URL helper'
Assert-Exists 'frontend/src/lib/betaFeedback.ts' 'invite helpers'
Assert-Exists 'frontend/src/components/PwaInstallHint.tsx' 'PWA install chrome'
Assert-FileMatch 'frontend/src/pages/HomePage.tsx' 'home-install-guide' 'Home install strip'
Assert-FileMatch 'frontend/src/pages/HomePage.tsx' 'home-public-url-missing|isPublicAppUrlConfigured' 'public URL ops warning'
Assert-FileMatch 'frontend/src/lib/betaFeedback.ts' 'publicAppUrlForInvite' 'invite uses public URL'
Assert-FileMatch 'frontend/vite.config.ts' 'VitePWA' 'PWA plugin'
Assert-FileMatch 'frontend/vite.config.ts' 'navigateFallback' 'SW SPA fallback'
Assert-Exists 'frontend/public/pwa-192x192.svg' 'PWA icon 192'
Assert-Exists 'frontend/public/pwa-512x512.svg' 'PWA icon 512'
Assert-Exists 'deploy/Caddyfile' 'Path A Caddy recipe'
Assert-FileMatch 'deploy/Caddyfile' 'try_files|handle_path /api' 'Caddy SPA + API'
Assert-Exists 'frontend/public/_redirects' 'static SPA redirects'
Assert-Exists 'frontend/vercel.json' 'Vercel SPA rewrites'
Assert-FileMatch 'docs/GTM_BETA_COHORT.md' 'Añadir a pantalla de inicio|Instalar app' 'GTM invite install line'

# Safety: hosting kit keeps product_unlock false / operator-gated
$hosting = Get-Content -LiteralPath (Join-Path $Root 'docs/HOSTING_DEPLOY_BETA.md') -Raw
if ($hosting -notmatch 'product_unlock') {
  Write-Host 'FAIL HOSTING doc must mention product_unlock policy' -ForegroundColor Red
  $fail++
} elseif ($hosting -notmatch 'product_unlock.*(false|operator)') {
  Write-Host 'FAIL HOSTING doc must keep product_unlock false / operator-gated' -ForegroundColor Red
  $fail++
} else {
  Write-Host 'OK   product_unlock stays false / operator-gated in HOSTING doc' -ForegroundColor Green
}

# Optional: FE unit tests for hosting helper (skip if npm unavailable)
$pkg = Join-Path $Root 'frontend/package.json'
if (Test-Path $pkg) {
  Push-Location (Join-Path $Root 'frontend')
  try {
    Write-Host '--- vitest hostingPublicUrl + betaFeedback (targeted) ---' -ForegroundColor Cyan
    npx --yes vitest run src/lib/hostingPublicUrl.test.ts src/lib/betaFeedback.test.ts 2>&1
    if ($LASTEXITCODE -ne 0) {
      Write-Host 'FAIL vitest targeted suite' -ForegroundColor Red
      $fail++
    } else {
      Write-Host 'OK   vitest hosting + betaFeedback' -ForegroundColor Green
    }
  } catch {
    Write-Host "WARN vitest skipped: $_" -ForegroundColor Yellow
  } finally {
    Pop-Location
  }
}

Write-Host ''
if ($fail -gt 0) {
  Write-Host "SMOKE FAILED ($fail)" -ForegroundColor Red
  exit 1
}
Write-Host 'SMOKE PASSED - next: deploy Path A (Caddy), set real URLs, smoke Identify on phone, invite.' -ForegroundColor Green
exit 0
