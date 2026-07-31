# VisionSetil — Open mycology knowledge + performance uplift

**Date:** 2026-07-31  
**Workflow:** `/write-workflow` → `visionsetil-mycology-perf-uplift` (script generated + saved; mock agents empty → **this report is human+repo grounded**)  
**product_unlock:** **false**  
**Deploy:** none  

## Executive summary

User feedback: performance details and functionality “not as they should be”; request to use open mycology repos/guides/books for the app.

**Hard legal/safety frame used:**

- Only **open licenses / open APIs** (see `docs/knowledge/OPEN_MYCOLOGY_SOURCES.md`).
- **No** full download of closed-copyright books or paid field guides.
- Knowledge never becomes **permission to consume**; orientation-only copy remains SSOT.

**Current asset baseline (repo measured):**

| Asset | Count |
|-------|------:|
| Catalog taxa (`species_catalog_v2`) | ~523 |
| Photo keys (`speciesPhotos.json`) | ~594 |
| Classic lookalike pairs | 14 → **22** (expanded this cycle) |
| Multiview classic pairs | 20 |
| Daily verified game taxa | ~78+ |

---

## Phase A — Codebase surfaces & perf hotspots

### Surfaces

| Surface | Path | Notes |
|---------|------|-------|
| Identify multi-view | `frontend/src/pages/IdentifyPage.tsx` | Wizard + libre; open-set; sticky orientation |
| Encyclopedia | `frontend/src/pages/EncyclopediaPage.tsx` | Genus chips, family guide, content-visibility sections |
| Species detail | `frontend/src/pages/SpeciesDetailPage.tsx` | Hero HD + contain; collapsible recipes/food |
| Games hub | `frontend/src/pages/GamesHubPage.tsx` | LoLdle-style daily modes + foto del día |
| Media cascade | `speciesImageService` / `speciesMediaStack` / `SpeciesPhotoCard` | thumb→display→hd |
| Offline pack | `OfflinePackPage` | Study-only honesty |

### Performance hotspots (P0–P2)

| ID | Pri | Issue | File(s) | Acceptance |
|----|-----|-------|---------|------------|
| PERF-1 | P0 | Grid used 250px thumbs on retina | `SpeciesPhotoCard` | `data-photo-quality=display`, naturalWidth ≥ 500 on featured cards |
| PERF-2 | P0 | Detail hero mega-crop + soft 500px | `SpeciesGallery`, CSS hero | `object-fit: contain`, HD 1280 where available |
| PERF-3 | P1 | Encyclopedia long lists | `campo-nocturno.css` family sections | `content-visibility: auto` retained; scroll jank < target |
| PERF-4 | P1 | Dual Vite shells cold start | `vite*.config` | Document restart; keep strictPort |
| PERF-5 | P2 | Chatty API banner poll 12s | `ApiStatusBanner` | Retry CTA shipped; optional backoff |
| PERF-6 | P2 | Games hub many `SpeciesImage` | `GamesHubPage` | quality=display only for visible cards; lazy rest |

### Product gaps (functionality)

| ID | Gap | Status |
|----|-----|--------|
| FUNC-1 | Daily games multi-mode board | **Shipped** `dailyGames.ts` + hub |
| FUNC-2 | Wordle color feedback broken under glass CSS | **Shipped** BEM + !important tones |
| FUNC-3 | Lookalike pair coverage thin | **Expanded** pairs → 22 |
| FUNC-4 | Open knowledge SSOT missing | **Shipped** `OPEN_MYCOLOGY_SOURCES.md` |
| FUNC-5 | Closed-book “download all guides” expectation | **Rejected** legally; open-only path documented |
| FUNC-6 | Trait depth uneven across taxa | Open backlog (catalog descriptions + IF) |
| FUNC-7 | Media NC licenses mixed | Audit residual pre-commercial |

---

## Phase B — Open knowledge sources (license-gated)

| Lane | Source | License posture | Product use |
|------|--------|-----------------|-------------|
| Taxonomy | Index Fungorum | Public names | Canonical + synonyms |
| Occurrence | GBIF open datasets | Per-dataset open | Iberia layers already |
| Media | Wikimedia Commons | File free licenses | Covers / heroes |
| Media | iNaturalist Open Data | CC0/CC-BY/(NC) | Photos; filter NC for commercial |
| Traits | FUNGuild (UMNFuN) | Research open | Future guild tags educational |
| Confusions | In-repo classic pairs + multiview map | Project + open education | Studio / quiz / result |
| Games | Verified pool checks | Project | Daily LoLdle board |

**Rejected:** full commercial mycological manuals, paywalled PDFs, “scrape entire closed guides”.

---

## Phase C — Gap matrix (knowledge → product)

| Surface | Need | Open source approach | Safety note |
|---------|------|----------------------|-------------|
| Ficha traits | Richer educational characters | Catalog text + IF + open descriptions | No edibility permission |
| Lookalikes | More deadly confusions | Expand classic pairs (done + continue) | Risk chip first |
| Dichotomous key | More nodes | Educational only from open traits | Orientation only |
| Quiz / Setadle | Larger verified pools | `dailyGames` + foodQuality documented only | Games ≠ ID for food |
| Phenology | Honest season | Existing phenology bar | Never harvest calendar |
| Offline | Honest offline limits | Offline pack copy | No offline ID certainty |

---

## Phase D — Safety checklist

| ID | Check | Result |
|----|-------|--------|
| S1 | No edible-as-permission in plan | **PASS** (open sources + orientation) |
| S2 | product_unlock remains false | **PASS** |
| S3 | Open-set / abstain preserved | **PASS** (no change to classifier policy) |
| S4 | Deadly lookalikes elevated | **PASS** (pair expansion prioritizes toxic/mortal mates) |
| S5 | Offline honesty | **PASS** (no offline certainty claim) |
| S6 | External sources license-gated | **PASS** (doc SSOT) |
| S7 | No closed-book mass download | **PASS** (explicit rejection) |
| S8 | Games educational framing | **PASS** (dailyGames + wordle/quiz marks) |

**Overall safety: PASS** for this plan cycle.

---

## Phase E — PR / ticket DAG (first implementables)

```
K0 OPEN_MYCOLOGY_SOURCES.md          [done]
K1 classic_lookalike expand 14→22    [done]
K2 dailyGames LoLdle hub             [done prior]
K3 Wordle tones + focus              [done prior]
K4 Detail hero HD+contain            [done prior]
  └→ K5 Enrich multiview map for new pairs (sync critical_views)
  └→ K6 Quiz pool prefer deadly-pair coverage e2e
  └→ K7 Media license NC audit script
  └→ K8 Phenology copy i18n parity
  └→ K9 Encyclopedia virtualize residual + metrics
  └→ K10 Optional FUNGuild educational tags (read-only)
```

### Top tickets (acceptance)

1. **K5** New lookalike pair ids appear in Studio + diagnostic views non-empty where mapped.  
2. **K6** Daily quiz includes ≥1 lookalike mode round from classic pairs.  
3. **K7** Script lists NC photo counts; CI warning if NC > threshold for commercial flag.  
4. **K8** CA/EU/EN phenology strings present.  
5. **K9** Ency scroll FPS / content-visibility smoke in Playwright.  
6. **K10** Feature-flagged guild tag on detail (educational tooltip only).

### Verification commands

```bash
cd frontend
npx tsc --noEmit
npx vitest run src/lib/dailyGames.test.ts src/lib/lookalikeStudio.test.ts
npx playwright test e2e/loop-next.spec.ts e2e/loop-3h-smoke.spec.ts
```

---

## Workflow artifact

| Item | Path |
|------|------|
| Generated harness (valid) | `.grok/workflows/visionsetil-mycology-perf-uplift.mjs` |
| Saved alias | `~/.grok/workflows/visionsetil-mycology-open-knowledge.mjs` (fixed copy of good script) |
| Open sources SSOT | `docs/knowledge/OPEN_MYCOLOGY_SOURCES.md` |
| This report | `docs/audits/mycology-open-knowledge-perf-2026-07-31.md` |

**Run again (live agents, not mock):**

```powershell
cd C:\Users\Mariano\Documents\ALONSOO\VISIONSETIL
# ensure GROK_WORKFLOWS_MOCK is unset
node .grok/workflows/visionsetil-mycology-perf-uplift.mjs "repo=$PWD focus=media+catalog+lookalikes maxTickets=10"
```

---

*End of report · orientation only · never consume*
