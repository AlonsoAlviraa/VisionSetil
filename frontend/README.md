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

