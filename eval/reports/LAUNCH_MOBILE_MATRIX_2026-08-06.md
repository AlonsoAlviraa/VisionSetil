# Launch mobile matrix — Identify photo UX

**Date:** 2026-08-06  
**Repo:** VisionSetil frontend dual shell  
**Method:** Playwright Chromium + viewport profiles (no WebKit install required)  
**Policy:** orientation only · never forage · never `product_unlock`  

## Profiles

| Profile | Viewport | Shell baseURL | Focus |
|---------|----------|---------------|--------|
| **small** | 375×667 (iPhone SE-like) | app `http://127.0.0.1:5173` | narrow width, small tap targets |
| **mid** | 393×851 (Pixel 5-like) | app `:5173` | common Android mid-tier |
| **large** | 428×926 (iPhone 13 Pro Max-like) | app `:5173` | large phone |
| **app desktop** | Desktop Chrome | `:5173` | baseline app shell |
| **web desktop** | Desktop Chrome | `:5174` | web skin parity |

> Note: mobile projects use **Chromium + viewport/userAgent**, not Playwright `devices['iPhone *']` (those require WebKit binaries not always installed on Windows CI/dev).

## Scenarios

1. Open `/identificar`  
2. Switch to guided multi-view if needed  
3. Assert `multi-view-wizard` + `photo-coach-panel` visible  
4. Assert gallery input `mv-gallery-input-gills` has **no** `capture` attribute  
5. `setInputFiles` sample PNG  
6. Assert `mv-preview-gills` paints (`blob:`/`data:`) + sticky `identify-submit`  
7. Free mode: dropzone → `identify-free-preview-0`  

Specs:

- `frontend/e2e/identify-photo-dual-shell.spec.ts` (app / web / mobile-*)  
- `frontend/e2e/identify-mobile-matrix.spec.ts` (app, 3 viewports)  

Projects: `app`, `web`, `mobile-small`, `mobile-mid`, `mobile-large` in `playwright.config.ts`

## Photo path fixes (launch)

| Fix | Why |
|-----|-----|
| Gallery `input` **without** `capture=environment` | iOS/Android PWA/WebView forced camera and blocked library pick (app broke; desktop web OK) |
| Shared `prepareIdentifyImage` JPEG long-edge ≤1280 | Same encode contract on free + wizard + camera |
| Preview `loading="eager"` | Blob previews above-fold must not blank on mobile WebView |
| Guided multi-view default (`useWizard=true`) | Better first-run photo coach path |
| Camera errors guide to Galería | Permission / insecure origin fail-open UX |

## Performance notes (lab)

| Area | Observation |
|------|-------------|
| Capture encode | JPEG quality 0.82, long edge ≤1280 — reduces memory on mid phones |
| Tiny fixtures | Files &lt;512B skip re-encode (e2e 1×1 PNG fail-open) |
| Catalog hydrate | Deferred after first paint (`main-app` / `main-web`) |
| Layout | Sticky analyze CTA uses `--cn-sticky-above-nav` so chrome is not under bottom nav |
| Slow CPU | Optional future: Playwright CPU throttling; not default CI |

## Result recording

### Unit contracts (exit 0)

```powershell
cd frontend
npx vitest run src/lib/photoUploadParity.test.ts src/lib/prepareIdentifyImage.test.ts src/lib/dualShellContracts.test.ts
# 2026-08-06: 16 passed (3 files), exit 0
```

### E2E dual-shell + mobile matrix (exit 0)

```powershell
cd frontend
npx playwright test e2e/identify-photo-dual-shell.spec.ts e2e/identify-mobile-matrix.spec.ts --project=app --project=web --project=mobile-small --project=mobile-mid --project=mobile-large
# 2026-08-06 last green run: 12 passed (+1 flaky absorbed by retry), exit 0
# Wall ~1.7–6 min depending on Vite cold start
```

| Profile | Status | Notes |
|---------|--------|-------|
| app desktop guided | **PASS** | gallery → `mv-preview-gills` |
| app desktop free | **PASS** | dropzone → `identify-free-preview-0` |
| web desktop guided | **PASS** | parity with app |
| web desktop free | **PASS** | parity with app |
| mobile-small dual-shell | **PASS** | 375×667 Chromium |
| mobile-mid dual-shell | **PASS** | 393×851 Chromium |
| mobile-large dual-shell | **PASS** | 428×926 Chromium |
| matrix small / mid / large | **PASS** | coach + upload + sticky CTA |

## Gaps (human)

- Physical devices / real camera permission dialogs: **human lab**  
- Lighthouse CI budgets against public HTTPS host: optional follow-up  
- Capacitor native WebView photo path: only if shipping native store binaries  
- Store developer accounts, signing, privacy policy public URL: see `docs/LAUNCH_STORE_READINESS.md`
