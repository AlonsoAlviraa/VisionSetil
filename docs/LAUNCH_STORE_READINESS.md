# VisionSetil — Google Play + Apple Store / PWA launch readiness

**Date:** 2026-08-06  
**Branch context:** dual shell app `:5173` (`main-app` / PWA) + web `:5174` (`main-web`)  
**Policy locks (hard):** **orientation only** · **never forage / harvest permission** · **`product_unlock` stays false** · never edible green-light on Identify  

This checklist is store + mobile WebView/PWA readiness. Items are **DONE** (with file evidence) or **GAP** with **owner=human**.

---

## 0. Product rails (must remain true)

| Rail | Status | Evidence |
|------|--------|----------|
| Orientation-only product language | **DONE** | `docs/SAFETY_POLICY.md`, `frontend/src/lib/safetyCopy.ts`, Identify sticky + PhotoCoach |
| Never “safe to eat” / forage grant | **DONE** | Vitest `safetyCopy`, e2e `learning-first-dual-shell`, `identify-photo-dual-shell` |
| `product_unlock` never auto-true | **DONE** | Backend fail-closed unlock; FE never invents unlock; operator runbook separate |
| Dual shell shares Identify photo path | **DONE** | `IdentifyPage` + `UploadZone` + `CameraCapture` + `MultiViewWizard`; contracts in `dualShellContracts.test.ts` |

---

## 1. Dual-shell photo capture / upload / classify

| Item | Status | Evidence |
|------|--------|----------|
| App shell entry `main-app.tsx` → port **5173**, PWA | **DONE** | `frontend/src/main-app.tsx`, `vite.config.ts` (`createViteConfig('app')`) |
| Web shell entry `main-web.tsx` → port **5174**, no SW | **DONE** | `frontend/src/main-web.tsx`, `vite.web.config.ts` |
| Shared Identify code path (no shell forks) | **DONE** | Both mount `App`; Identify imports shared components (`dualShellContracts.test.ts`) |
| Gallery picker does **not** force `capture=environment` | **DONE** | `MultiViewWizard.tsx` gallery `input` has no `capture` (mobile library pick works on app/PWA WebView) |
| Camera path = explicit `CameraCapture` + `getUserMedia` | **DONE** | `CameraCapture.tsx`, UploadZone / wizard “Cámara” CTAs |
| JPEG long-edge ≤ **1280**, quality **0.82** | **DONE** | `lib/prepareIdentifyImage.ts` SSOT; used by free upload + wizard; camera uses same constants |
| Preview loading **eager** (blob: above-fold) | **DONE** | Wizard + free-mode previews `loading="eager"` |
| Sticky analyze CTA above bottom nav | **DONE** | `campo-nocturno.css` `--cn-sticky-above-nav` + `.app--has-bottom-nav .page-identify .analyze-actions` |
| PhotoCoach multi-view + orientation rails | **DONE** | `PhotoCoachPanel`, guided wizard, soft progressive coach |
| Dual-shell e2e photo parity | **DONE** | `frontend/e2e/identify-photo-dual-shell.spec.ts` (projects `app` + `web`) |
| Learning-first dual-shell matrix | **DONE** | `frontend/e2e/learning-first-dual-shell.spec.ts` |

### Local verify commands (CI-relevant)

```powershell
cd frontend

# Unit + contracts (photo path, dual shell, JPEG budgets)
npx vitest run src/lib/dualShellContracts.test.ts src/lib/prepareIdentifyImage.test.ts src/lib/photoUploadParity.test.ts src/lib/competitiveFeatures.test.ts
# 2026-08-06: 65 passed, exit 0

# Dual-shell photo + mobile matrix e2e (starts :5173 + :5174)
npx playwright test e2e/identify-photo-dual-shell.spec.ts e2e/identify-mobile-matrix.spec.ts --project=app --project=web --project=mobile-small --project=mobile-mid --project=mobile-large
# 2026-08-06: 12 passed (exit 0); gallery without capture; free + guided previews on app+web+3 viewports
```

Record exit codes in `eval/reports/LAUNCH_MOBILE_MATRIX_YYYY-MM-DD.md` after each run.

---

## 2. Performance budgets (Identify photo path)

| Budget | Value | Status | Evidence |
|--------|-------|--------|----------|
| JPEG long edge | ≤ 1280 px | **DONE** | `IDENTIFY_JPEG_MAX_EDGE` in `prepareIdentifyImage.ts` |
| JPEG quality | 0.82 | **DONE** | `IDENTIFY_JPEG_QUALITY` |
| Soft upload size | ≤ ~1.2 MB advisory | **DONE** | `IDENTIFY_JPEG_SOFT_MAX_BYTES` |
| User preview loading | `eager` (no lazy blank) | **DONE** | MultiViewWizard + free previews |
| Preview box | fixed `aspect-ratio: 4/3` | **DONE** | `campo-nocturno.css` `.mv-preview-wrap` |
| Catalog hydrate | non-blocking FCP | **DONE** | Dynamic `import('./lib/speciesImageService')` after paint in both mains |
| Manual chunks | react / i18n / map / http | **DONE** | `vite.config.ts` `manualChunks` |
| Layout thrash | avoid continuous measure loops on upload | **DONE** | No resize observers on preview grid; sticky bar CSS only |

### Lab / Lighthouse notes

| Probe | Status | Notes |
|-------|--------|-------|
| Playwright mobile descriptors | **DONE** | `e2e/identify-mobile-matrix.spec.ts` — iPhone SE, Pixel 5, iPad Mini |
| Lighthouse CI (full) | **GAP** | owner=human — run against HTTPS preview host when domain live (`docs/HOSTING_DEPLOY_BETA.md`) |
| Physical device farm | **GAP** | owner=human — 1 Android + 1 iPhone smoke of camera + gallery + offline SW |

---

## 3. UX (Identify multi-view)

| Item | Status | Evidence |
|------|--------|----------|
| Multi-view PhotoCoach | **DONE** | `PhotoCoachPanel` + wizard wireframes (zero webp required) |
| Sticky CTAs above bottom nav | **DONE** | CSS `--cn-sticky-above-nav`; result sticky `identify-sticky-cta` |
| Orientation / safety rails (never edible green-light) | **DONE** | PageShell orientation sticky; ResultCard risk-only; D16 safety |
| Mobile-first tap targets (≥44px class) | **DONE** | Mode toggle / gallery / camera min-heights in `campo-nocturno.css` |
| Soft pre-submit coach (never hard-block default) | **DONE** | `preSubmitMultiViewCoach` / free soft confirm |

---

## 4. Google Play checklist

| # | Item | Status | Evidence / owner |
|---|------|--------|------------------|
| G1 | Privacy policy **URL** (public HTTPS) | **GAP** | owner=human — publish policy page (orientation only; camera/photos purpose) and paste store URL |
| G2 | Camera permission rationale (Spanish + EN) | **DONE** (in-app) | Camera error copy: permission + “sube fotos desde archivos”; **GAP** store listing text owner=human |
| G3 | Photos / media library usage string | **DONE** (code path) | Gallery without forced capture; **GAP** Play Data safety form owner=human |
| G4 | Age rating — educational mycology, **never forage** | **GAP** | owner=human — IARC / content rating questionnaire: education, no alcohol/gambling; copy “solo orientación” |
| G5 | App icons 192/512 + adaptive | **PARTIAL** | `public/pwa-192x192.svg`, `pwa-512x512.svg` (SVG). **GAP** owner=human — export PNG 512 adaptive + Play feature graphic |
| G6 | WebView / TWA or Capacitor package | **GAP** | owner=human — packaging choice (TWA vs Capacitor) + signing keystore |
| G7 | Signing cert / Play Console account | **GAP** | owner=human |
| G8 | No private API secrets in client | **DONE** | Only optional public rate-limit key pattern; secrets stay backend (`VITE_*` not private keys) |
| G9 | HTTPS production host | **GAP** | owner=human — Path A Caddy per `HOSTING_DEPLOY_BETA.md` |
| G10 | Offline / PWA behavior honest | **DONE** (app shell) | `vite-plugin-pwa` app-only; Identify HARD offline disables submit; Offline pack educational |
| G11 | Target API / 64-bit | **GAP** | owner=human when native wrapper chosen |

**Suggested Play short description (orientation only):**  
*Identificación orientativa de setas con multi-vista e IA. Solo educación — nunca permiso de consumo.*

---

## 5. Apple App Store / iOS WebView-or-PWA checklist

| # | Item | Status | Evidence / owner |
|---|------|--------|------------------|
| A1 | Privacy policy URL | **GAP** | owner=human (same as G1) |
| A2 | `NSCameraUsageDescription` | **GAP** | owner=human — required if native wrapper; ES+EN: “VisionSetil usa la cámara para fotos de identificación orientativa. Nunca autoriza consumo.” |
| A3 | `NSPhotoLibraryUsageDescription` | **GAP** | owner=human — “Acceso a la biblioteca para subir fotos de setas (orientación educativa).” |
| A4 | App Tracking Transparency | **DONE** (N/A) | No third-party trackers in FE by default |
| A5 | Age rating educational | **GAP** | owner=human — 4+ / 9+ education; no foraging advice |
| A6 | PWA “Add to Home Screen” path | **DONE** | `index-app.html` apple-mobile-web-app meta + `PwaInstallHint` |
| A7 | Icons / splash | **PARTIAL** | SVG PWA icons; **GAP** owner=human — 180 apple-touch PNG + store 1024 |
| A8 | Apple Developer account + certificates | **GAP** | owner=human |
| A9 | Review screenshots (iPhone + iPad) | **GAP** | owner=human — Identify multi-view, orientation sticky, encyclopedia (no edible green-light) |
| A10 | HTTPS + ATS | **GAP** | owner=human on production domain |
| A11 | No private secrets in client bundle | **DONE** | Same as G8 |

---

## 6. Manifest / PWA (app shell)

| Item | Status | Evidence |
|------|--------|----------|
| Manifest name / short_name / lang=es | **DONE** | `vite.config.ts` VitePWA manifest |
| `display: standalone`, portrait | **DONE** | same |
| Categories education + lifestyle | **DONE** | same |
| Icons any + maskable | **PARTIAL** | SVG; raster export **GAP** human |
| `navigateFallback: index.html` + API/media denylist | **DONE** | workbox config |
| Species media NetworkFirst | **DONE** | runtimeCaching |
| Web shell no SW | **DONE** | PWA plugin only when `!isWeb` |

---

## 7. Matrix report + CI

| Artifact | Path |
|----------|------|
| Mobile viewport matrix | `eval/reports/LAUNCH_MOBILE_MATRIX_2026-08-06.md` |
| Dual-shell contracts | `frontend/src/lib/dualShellContracts.test.ts` |
| Photo prepare budgets | `frontend/src/lib/prepareIdentifyImage.ts` |
| Photo dual-shell e2e | `frontend/e2e/identify-photo-dual-shell.spec.ts` |
| Mobile matrix e2e | `frontend/e2e/identify-mobile-matrix.spec.ts` |

---

## 8. Explicit human GAP backlog (store)

1. Publish privacy policy URL (camera + photos purpose, orientation-only).  
2. Play Console + Apple Developer accounts, signing certs, keystore / distribution cert.  
3. Raster icons (512 adaptive, 1024 App Store, 180 apple-touch).  
4. Native wrapper decision (TWA / Capacitor / pure PWA) + permission plist/manifest strings.  
5. Production HTTPS domain + Lighthouse mobile run.  
6. Store screenshots and age-rating questionnaires with **never forage** copy.  

**Do not** ship `product_unlock=true` or consumption permission to satisfy store review.

---

*End of store readiness checklist · orientation only · never product_unlock*
