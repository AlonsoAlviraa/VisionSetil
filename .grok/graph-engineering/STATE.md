# VisionSetil Graph Engineering — STATE

**Mode:** Graph Engineering  
**Updated:** 2026-07-31  
**Goal:** Product UX reliability · never product_unlock

## Active graph version

`v1.65.0-mycology-perf-impl`

## Tasks

| Item | Status |
|------|--------|
| Kill app/web/API background servers | **DONE** |
| Live `visionsetil-mycology-perf-uplift` with real subagents | **DONE** (~22 min) |
| Report | `docs/audits/mycology-perf-uplift-2026-07-31T1603Z.md` (~120 KB) |
| **T1** Encyclopedia grid thumb + cascade | **DONE** (`MEDIA_SURFACE_POLICY` + PhotoCard) |
| **T2** SpeciesGallery no probe storm | **DONE** (`buildStaticGallery` hero-only) |
| **T3** Games hub hydrate gate | **DONE** (`useSpeciesPhotosReady`) |
| **T4** speciesPhotos single SSOT path | **DONE** (attribution via `getCatalogPhotoEntry`) |
| **T5** Encyclopedia virtualization | **DEFERRED** (P1 later) |
| **T6** Media surface policy matrix | **DONE** (`MEDIA_SURFACE_POLICY`) |
| **T7** Lookalike diagnostic expand | **DONE** (22 classic pairs + map) |
| Gates: vitest media/games/diag + tsc | **PASS** |

### Implementation notes (this pass)

- `SpeciesPhotoCard` default surface `encyclopedia_grid` → quality thumb, preferLocal, maxCandidates≤3  
- `SpeciesGallery.buildStaticGallery` no `Image()` probes for gallery_1..8  
- `GamesHubPage` awaits `hydrateSpeciesPhotos` before `buildVerifiedGamesPool`  
- `speciesAttribution` no longer static-imports `speciesPhotos.json`  
- Classic pairs 14→22; multiview map gains 8 educational pairs with `critical_views`  
- product_unlock remains **false**  

### Workflow live run summary

- Phase A: 7 surfaces, 8 hotspots, 6 gaps  
- Phase B: **33** open sources accepted (19 rejected license gate)  
- Phase C: **47** knowledge→product mappings  
- Phase D: **12** perf items  
- Phase E: 12 claims adversarial-verified; checklist 7/8 (S1 residual on “comestible” catalog copy)  
- Phase F: **10** tickets with acceptance criteria  

### product_unlock

**false**
