# VisionSetil Frontend

React 18 + Vite + TypeScript PWA.

## Dev proxy & media URLs (PR-04)

Browser-facing media URLs default to **static** (no backend required for photos):

```
/media/species/{slug}/{variant}.webp
/media/placeholder/{kind}.webp
```

Vite serves the monorepo `media/` folder at `/media/*`. FastAPI also serves the same paths for production.

API (classify, species list, gallery JSON) still uses:

```
/api/*  →  Vite proxy → http://127.0.0.1:8000
```

Override media prefix if needed:

```
VITE_MEDIA_PUBLIC_PREFIX=/api/media
```

## Feature flags

| Env | Default | Meaning |
| --- | --- | --- |
| `VITE_FEATURE_SPECIES_MEDIA` | true | SpeciesImage own media |
| `VITE_FEATURE_I18N` | true | Language switcher |
| `VITE_FEATURE_UNIFIED_CATALOG` | true | Catalog v2 / snapshot |
| `VITE_FEATURE_GUIDED_IDENTIFY` | true | 4-view wizard |
| `VITE_FEATURE_FAVORITES` | true | localStorage favorites |
| `VITE_FEATURE_OFFLINE_PACK` | true | PWA offline pack intent |

## Scripts

```bash
npm install
npm run dev
npm test
npm run test:e2e          # Playwright smoke (starts Vite)
npx playwright install chromium
npx tsc --noEmit
npm run build
```

### Playwright smoke

Specs in `e2e/`:
- catalog count ≥ 319 on home + encyclopedia
- identify coach visible on `/identificar`
- media smoke for species/placeholder assets
- **honesty (Phase B):**
  - `identify-blocked.spec.ts` — mocked `mode=blocked` (no live backend)
  - `identify-real.spec.ts` — **live real path**; conditional skip unless gate pass

#### Real identify path (B-50) — conditional skip

`identify-real.spec.ts` hits the live API via Vite `/api` → FastAPI `:8000`.
It probes `GET /api/readyz` (and falls back to `/api/models/quality-gate`) and
**skips** (does not fail) unless **both**:

1. `weights_present === true`
2. `quality_gate.metrics_acceptable === true`

Default CI and local runs without packaged field weights / acceptable metrics
will report the test as **skipped**. To exercise the real path:

1. Start backend with a multi-view checkpoint + sibling metrics that pass the gate  
   (see `docs/ML_WEIGHTS_RUNBOOK.md`, `docs/QUALITY_GATE.md`)
2. `npm run dev` (or let Playwright start Vite)
3. `npx playwright test identify-real.spec.ts`

```bash
npx playwright install chromium
npm run test:e2e
```

## Media pipeline (repo root)

```bash
# Catalog ≥500 (GBIF Iberia layer + seed)
python scripts/expand_gbif_iberia.py --target 520
python scripts/build_species_catalog.py

# Procedural fill for missing assets
python scripts/precompute_species_images.py

# Real photos for top 150 (Wikipedia/Commons/GBIF)
python scripts/precompute_species_images.py --fetch --limit 150 --max-mb 250
```

Gallery API: `GET /media/species/{slug}/gallery` (+ `/gallery/{nn}.webp`).

## Locales

UI: `es`, `ca`, `eu`, `en` via `react-i18next`. Preference in `localStorage` key `visionsetil_locale`.

