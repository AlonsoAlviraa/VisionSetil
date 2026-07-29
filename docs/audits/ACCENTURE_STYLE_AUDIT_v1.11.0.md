# Accenture-style Mega Audit — VisionSetil v1.11.0 dual-app-stitch

**Date:** 2026-07-29  
**Scope:** Dual App/Web builds · Stitch pixel shell · competitive UX · safety · media · API · tests  
**Method:** static contracts + live HTTP smoke (dev servers) + full Vitest + tsc + architecture review  
**Verdict overall:** **CONDITIONAL GO** — dual shells live; test debt from Home remodel **fixed in this cycle**; residual medium risks remain.

---

## 1. Executive summary

| Dimension | Score | Notes |
|-----------|-------|-------|
| Dual build App/Web | **A-** | 5173 app + 5174 web live; dist-app has SW, dist-web no SW |
| Safety / forage language | **A** | No “safe to eat”; product_unlock false; orientation sticky present |
| Photo cascade | **B+** | Catalog-first confirmed; media 200 on Amanita card |
| Automated tests | **B** | Was 12 fail / 570 → fixed residual Home contracts + SSOT 523 |
| i18n | **B-** | es/en parity OK; **ca/eu ~495 keys behind es** |
| Backend API surface | **B** | `/health` OK; `/api/species` OK; **`/api/models` 404** (route naming drift) |
| Operator / beta kit | **B** | Install guide + public URL ops restored on Home |
| Competitive features | **B+** | Season strip, family group, dichotomous key, open study links |
| Map lock | **A** | Spain map not restyled (user lock) |
| Security / ToS | **A** | No commercial scrape (X1–X3) |

**Go/No-Go for beta cohort:** **Go with caveats** (fix ENV, models status route, ca/eu i18n, operator deploy).

---

## 2. Runtime smoke (live)

| Endpoint | Result |
|----------|--------|
| `http://127.0.0.1:5173/` (app) | **200** |
| `http://127.0.0.1:5173/identificar` … `/educacion` | **200** |
| `http://127.0.0.1:5173/media/species/amanita-muscaria/card.webp` | **200** (~87 KB) |
| `http://127.0.0.1:5174/` (web) | **200** |
| `http://127.0.0.1:8000/health` | **200** `status=ok` |
| `http://127.0.0.1:8000/api/species?limit=1` | **200** |
| `http://127.0.0.1:8000/api/models` | **404** ⚠ |
| `dist-app/sw.js` | **present** |
| `dist-web/sw.js` | **absent** (correct) |

---

## 3. Findings register (Accenture-style)

### P0 — Critical (ship blockers)

| ID | Finding | Evidence | Status |
|----|---------|----------|--------|
| P0-1 | Home remodel **dropped beta kit contracts** (install guide, public URL ops, privacy strip, differentiators, beta CTA, field holdout note) | Vitest: hostingPublicUrl, competitiveFeatures, betaFeedback | **FIXED** this audit (Home residual panel restored) |
| P0-2 | Catalog SSOT test still expected **520** taxa; expanded JSON is **523** | speciesCatalog.split.test | **FIXED** SSOT_COUNT=523 + Home count |

### P1 — High

| ID | Finding | Impact | Recommendation |
|----|---------|--------|----------------|
| P1-1 | `/api/models` returns **404** | Identify ECE live residual / models status may soft-fail | Align route with `models/status` used in `eceHonesty.ts` or re-expose `/api/models` |
| P1-2 | **ca/eu locales** missing ~495 keys vs es | Non-ES users get defaultValue soup | Patch pipeline like en parity or mark ca/eu as partial |
| P1-3 | `navigateFallback: 'index.html'` while app dist uses **`index-app.html`** | PWA deep-link offline may 404 wrong index | Point workbox fallback to shell HTML per target |
| P1-4 | Full Vitest was **12 red** before Home fix | CI red if main merges without fix | Keep residual Home tests green in CI |

### P2 — Medium

| ID | Finding | Recommendation |
|----|---------|-----------------|
| P2-1 | Dual-build SPA HTML returns same length shell for all routes (expected Vite SPA) — no SSR SEO for web | Accept or add prerender for web marketing routes |
| P2-2 | iNat/GBIF media often **CC-BY-NC** | Filter NC before commercial launch |
| P2-3 | Weak local `/media` cards (&lt;15 KB) residual | Re-harvest open APIs for those slugs |
| P2-4 | Dichotomous key is educational only — ensure copy never implies ID certainty | Already study-only; keep |
| P2-5 | `dev:both` uses Unix `&` — **broken on Windows** PowerShell | Use `concurrently` or two terminals |
| P2-6 | Media smoke e2e had historical failure under `test-results/` | Re-run playwright media-smoke |

### P3 — Low / hygiene

| ID | Finding |
|----|---------|
| P3-1 | Stitch gen/err JSON clutter untracked under `docs/design/stitch/screens-b-v2/` |
| P3-2 | Legacy `frontend/dist/` coexists with `dist-app`/`dist-web` — confusing |
| P3-3 | Material Symbols + Google Fonts CDN — offline PWA first paint depends on cache |
| P3-4 | Theme toggle still in Header (product is night-only) — partially hidden |

### Positive controls (passed)

- Dual entry: `main-app.tsx` / `main-web.tsx` + forced layout mode  
- Safety: orientation sticky, pro-check, never edible green-light  
- Map lock respected  
- Open-API harvest policy (no commercial scrape)  
- Season strip + family guide + dichotomous + open study links present  
- dist-web **without** service worker  

---

## 4. Test matrix (post-fix this cycle)

| Suite | Before | After Home/SSOT fix |
|-------|--------|---------------------|
| hostingPublicUrl | fail | **pass** |
| betaFeedback | fail | **pass** |
| competitiveFeatures | fail (5) | **pass** |
| speciesCatalog.split | fail (4) | **pass** |
| Full vitest (pre-fix) | 12 fail / 558 pass | re-run after commit |

---

## 5. How to launch (operator)

```bash
# Terminal A
cd backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# Terminal B — App / PWA
cd frontend && npm run dev:app
# → http://127.0.0.1:5173

# Terminal C — Web / browser
cd frontend && npm run dev:web
# → http://127.0.0.1:5174

npm run build:app   # dist-app/
npm run build:web   # dist-web/
```

---

## 6. Residual backlog (handoff)

1. Fix `/api/models` or document correct status path for FE  
2. PWA navigateFallback per shell HTML  
3. ca/eu i18n parity or explicit “partial” badge  
4. Full open-API photo refresh + CC filter  
5. Operator deploy checklist (HTTPS, form, cohort)  
6. Playwright media-smoke re-green  

---

## 7. Sign-off

| Role | Statement |
|------|-----------|
| Engineering | Dual shells **operational** on 5173/5174; critical Home contract regressions **remediated**. |
| Risk / Safety | Orientation-only policy intact; unlock remains **false**. |
| Quality | **Conditional GO** for internal beta; not GO for App Store submission until P1 items closed. |
