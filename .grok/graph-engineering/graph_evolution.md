# Graph evolution log

## v1.0 — bootstrap (2026-07-27)

- Installed/patched grok-workflows (Windows ESM + `--always-approve`)
- Ran deep-research on ML + lookalikes + games
- Authored Rhai workflows: `e20-datapparallel-fix`, `lookalike-ssot-wire`, `lookalike-metrics-games`
- All three completed with actionable diagnoses

## v1.1 — ssot-e20 implementation cycle (2026-07-27)

**Implemented without human gate:**

1. **E20 DP freeze**
   - `kaggle/build_exp_v20_source_holdout.py`: post-inject replace bare freeze → `_unwrap(model).backbone`
   - `kaggle/push_e20/*.ipynb`: 2 freeze sites patched
   - `kaggle/ml_qa/notebook_guards.py`: `safe_dp_freeze` check

2. **Lookalike SSOT wire**
   - `scripts/sync_catalog_ssot.py`: emit `lookalikes: list[str]`
   - `backend/app/services/species_catalog.py`: `_rows_from_v2` keeps lookalikes
   - `frontend/src/data/speciesCatalog.ts`: type + `normalizeLookalikeNames` + fromV2
   - `poisonous_lookalikes.normalize_lookalike_names` shared helper
   - multi_view + classifier + open_set + routes_classification consumers updated
   - SSOT expanded with classic bidirectional pairs (31 taxa with lookalikes; typo Coprinopsis fixed)
   - FE Studio peers now prefer SSOT lookalikes

3. **Metrics honesty**
   - `compute_full_metrics.compute_safety_metrics`: add `safety_recall_deadly_at_1` / `_at_3`

4. **Photos**
   - Audit: 520/520 local media + catalog URLs — no gap to fill for SSOT taxa

**Artifacts:** FE/BE catalogs re-synced via `sync_catalog_ssot.py`

## v1.2 — product-ml-loop (2026-07-27)

- Quiz mode `lookalike` shipped (client-only; classic + SSOT pairs)
- `eval/scripts/lookalike_pair_metrics.py` (41 directed pairs)
- E20 notebook rebuilt; `safe_dp_freeze` PASS; **Kaggle kernel v4 pushed** (GPU, was QUEUED)
- Weight discovery prefers v20→v19→… (not missing v9); config default → v19
- Frontend lib: 303 tests pass; e20 tests pass; lookalike normalize tests pass
- Monitor: `scripts/autonomous_monitor_e20.py` + `cycle-v12-verify` workflow

## Planned v1.3

- Ingest E20 metrics when complete; dual deadly gates
- product_unlock only after honest holdout
- Identify E2E with non-empty dangerous_lookalikes under real weights

## Runtime checkpoint 2026-07-27T14:28Z

- E20 Kaggle: **RUNNING** (kernel v4)
- Real classifier: **is_real=True**, 40 labels, 6 deadly, lookalikes populated
- Tests: FE quiz 12/12, lib 303, e20 pytest PASS, professional tester overall PASS (unlock false)
- Scheduler: 15m autonomous continuation loop armed
- Photos: complete for all 520 SSOT taxa

## v1.3.0 — E20 COMPLETE (source-holdout)

- Kernel `visionsetil-exp-v20-source-holdout` COMPLETE; download + e20_postprocess rc=0
- metrics: MAP@3≈0.860, deadly@1≈0.788, deadly@3≈0.927, n_deadly=2580, ECE≈0.188
- protocol: source_holdout_e20 (train FT+soft non-GBIF, test GBIF ES only)
- soft gates advisory PASS; product_unlock remains false (operator cycle / policy)
- artifacts: best.pt, best_deadly.pt, test_predictions.npz, train/val/test_obs.json

## v1.2.9 — monitor false-positive SSL fix

- `autonomous_monitor_e20.py` treated SSLError text containing "error" as kernel ERROR (exit 1)
- Added `classify_status()`: complete|error|cancel|running|queued|api_error
- Transient API/SSL → backoff+retry; only KernelWorkerStatus.ERROR triggers recovery
- Restarted long monitor (6h); E20 still RUNNING at check (~1.5h+ wall)

## v1.2.5 — dual deadly honesty across v16–v19

- Applied same npz recompute dual keys to kernel_output_v16, v16_live, v17, v18 (v19 already done)
- v16/v17 remain below soft gates (MAP~0.18–0.19, deadly@3 low)
- v18 deadly@3≈0.939 MAP≈0.87; v19 MAP≈0.96 deadly@3≈0.983
- S3 SUSPECT flags expected reduced; product_unlock still requires E20 holdout only
- Lookalike graph: 39 taxa / 54 directed edges (from v1.2.4)

## v1.2.3 — v19 dual deadly recompute (serve-honest)

- Recomputed from `test_predictions.npz` via `artifact_audit`: deadly@1≈0.939, deadly@3≈0.983 (n_deadly=423)
- Patched `kernel_output_v19/models/metrics.json` with dual keys + definition=at_3; legacy preserved
- quality_gate on v19: **ACCEPTABLE** / `species_id_allowed=True` (orientation serve path)
- `product_unlock` remains **false** until E20 holdout complete
- Backup: `metrics.pre_honest_dual.json`

## v1.2.1 — quality gate honesty (post cycle-v12 residual)

- `quality_gate.py`: R7 requires `safety_recall_deadly_at_3` (or explicit definition @3)
- Ambiguous legacy-only `safety_recall_deadly` → `reason_code=deadly_definition_ambiguous` (fail-closed)
- test_quality_gate: 27 PASS
- cycle-v12-verify residual action #6 closed in code
- cycle-v13-e20-ingest: waiting (E20 still RUNNING; no metrics.json yet)

## v1.2.2 — pair metrics + Identify lookalike smoke (2026-07-27 residual while E20 RUNNING)

**E20 status:** still `KernelWorkerStatus.RUNNING` — no download, no cycle-v13, `product_unlock=false`.

**Implemented without human gate:**

1. **S5 professional tester — lookalike pair metrics**
   - New `kaggle/ml_qa/pair_metrics.py` (SSOT pairs + optional holdout confusion)
   - Wired into `scripts/run_professional_tester.py` as suite S5
   - Payload includes `pair_metrics` block; unlock remains forced false

2. **Bugfix: top-k shadowing in `lookalike_pair_metrics.pair_error_rate`**
   - Loop `for k, v in idx2label.items()` overwrote top-k → reported `k=39` (last class idx)
   - Fixed with `top_k` local + non-shadowing loop names
   - Honest v19 offline recompute: **k=3**, true@3=**0.9895**, mate@3=**0.0408**, 18 pairs in label space / 41 SSOT directed, n_eval=759

3. **Identify lookalike smoke tests**
   - `backend/app/tests/test_identify_lookalike_smoke.py` (4 tests):
     - classic SSOT pairs on MultiView lookalike index
     - Amanita deadly mate surface
     - `_build_candidates` is_real path wires lookalikes
     - classify E2E dangerous_lookalikes non-empty for Amanita cue
   - All PASS

4. **Pro tester report:** overall PASS; product_unlock=false (correct until E20 honest holdout)

## v1.2.4 — lookalike bidirectional + spelling SSOT (2026-07-27 residual)

**E20 status:** still `KernelWorkerStatus.RUNNING` — no download, no cycle-v13, `product_unlock=false`.

**Implemented without human gate:**

1. **SSOT lookalike graph expansion**
   - Fixed target spellings to catalog taxa: `Coprinopsis atramentaria` → `Coprinus atramentarius`; `Tricholoma sulfureum` → `Tricholoma sulphureum`
   - Added **13** missing reverse edges among in-catalog pairs
   - Directed pairs: **41 → 54**; taxa with lookalikes: **31 → 39**
   - `scripts/sync_catalog_ssot.py` re-ran → FE snapshot + FE catalog + BE expanded (520)

2. **FE classic pairs alignment**
   - `lookalikeStudio.ts` + `classic_lookalike_pairs.json` use `Coprinus atramentarius`
   - `autonomous_p0_lookalikes_e20.py` typo fix path → atramentarius

3. **S5 recompute (v19 offline after expansion)**
   - n_pairs_in_label_space **21**, n_eval **879**, true@3≈**0.9898**, mate@3≈**0.0353**

4. **product_unlock criteria evaluation (documented, unlock false)**
   - Advisory soft gates on **v19**: MAP@3=0.96 PASS, deadly@3≈0.983 PASS, expand PASS
   - **Blocked:** E20 source-holdout not complete; policy requires E20 honest dual deadly@3
   - Criteria checklist written in STATE.md

## v1.2.6 — product_unlock criteria S6 + FE spelling (2026-07-27 residual)

**E20 status:** `RUNNING`. Local notebooks `safe_dp_freeze` PASS.  
**Note:** `kernel_output_v20` log from earlier download shows prior crash  
`AttributeError: DataParallel has no attribute 'backbone'` on bare  
`model.backbone.backbone` freeze — that run left split manifests only.  
Current push notebooks use `_unwrap(model)` at both freeze sites.

**Implemented:**

1. **`evaluate_product_unlock_criteria` / `evaluate_e20_local_artifacts`** in `kaggle/ml_qa/gate_eval.py`
   - Fail-closed: `product_unlock` always False from helper
   - Requires E20 identity + dual deadly keys + soft MAP/deadly + n_deadly>0
   - `unlock_eligible_advisory` only when all checks pass
2. **Professional tester S6** reports criteria readiness (PASS suite; flags reasons)
3. **FE polish:** `photoTiers.ts` + `namesEs.test.ts` → `Coprinus atramentarius`
4. Tests: unlock fail-closed without E20; advisory true for synthetic E20 soft-pass

## v1.2.7 — E20 postprocess + monitor recovery (2026-07-27 residual)

**E20 status:** RUNNING (no metrics). Partial download still split-only.

**Implemented:**

1. **`scripts/e20_postprocess.py`**
   - Optional download; load metrics; recompute dual deadly from npz when present
   - `evaluate_product_unlock_criteria` (always `product_unlock=false`)
   - Writes `eval/reports/ml_experiments/e20_unlock_eval.json` + e20_run_status

2. **`scripts/autonomous_monitor_e20.py` rewrite**
   - COMPLETE → download + postprocess
   - ERROR with bare DP freeze in log → rebuild/push fixed notebook (`push_kaggle_e20.py`)
   - Poll budget exhausted reports RUNNING honestly (not fake kernel timeout)

3. Verified: postprocess with no metrics → reasons=`no_metrics`, unlock false

## v1.2.8 — E20 split S7 + notebook escape polish (2026-07-27 residual)

**E20 status:** RUNNING (no metrics).

**Implemented:**

1. **S7 E20 split integrity** (`kaggle/ml_qa/e20_split_audit.py`)
   - Audits `split_manifest.json` + train/val/test obs disjoint
   - Local artifacts: PASS, leaks=0, n_train=5767, n_val=1018, n_test=7385
   - Wired into professional tester (FAIL only if leaks/pass=false)

2. **Notebook DeprecationWarning fix**
   - E20 ipynb (root + push_e20): `re.sub`/`re.match` → raw strings
   - Compile-time invalid escape warnings eliminated; guards still green

3. product_unlock remains **false**

## v1.2.9 — report polish + tsconfig + build regex guard (2026-07-27 residual)

**E20 status:** RUNNING (no metrics; lastRunTime ~14:25Z).

**Implemented:**

1. **Professional tester MD report** includes `product_unlock`, pair_metrics snippet, and unlock criteria evaluation section  
2. **FE `tsconfig.json`**: remove duplicate `resolveJsonModule` key (esbuild warning)  
3. **`build_exp_v20_source_holdout.py`**: apply raw-regex replacements so rebuilds do not reintroduce DeprecationWarnings  
4. Test: `e20_postprocess` always writes unlock eval with `product_unlock=false`  
5. product_unlock remains **false**

## v1.2.10 — taxon synonym map for Identify lookalikes (2026-07-27 residual)

**E20 status:** RUNNING (no metrics).

**Implemented:**

1. **BE** `poisonous_lookalikes.canonical_taxon_name` + synonym map applied in `normalize_lookalike_names`
   - `Coprinopsis atramentaria` → `Coprinus atramentarius`
   - `Tricholoma sulfureum` → `Tricholoma sulphureum`
2. **FE** `lookalikeRisk.canonicalTaxonName` + same map for catalog join / dedupe
3. Tests BE + FE PASS; product_unlock remains **false**

## v1.2.11 — synonym SSOT + photo path join (2026-07-27 residual)

**E20 status:** RUNNING (no metrics).

**Implemented:**

1. **SSOT** `data/species_catalog/taxon_synonyms.json` (+ FE copy under `frontend/src/data/`)
2. **BE** loads synonyms via `load_taxon_synonyms()`; multi_view `_lookalikes_for` uses `canonical_taxon_name`
3. **FE** `taxonSynonyms.ts`; `speciesImageUrl.normalizeSlug` resolves synonym scientific names / slugs to SSOT media paths
4. `sync_catalog_ssot.py` copies synonym file to FE on sync
5. product_unlock remains **false**

## v1.2.12 — catalog search synonym resolution (2026-07-27 residual)

**E20 status:** RUNNING (no metrics; lastRunTime ~14:25Z).

**Implemented:**

1. **`catalogSearch.scoreSpecies`** uses `canonicalTaxonName` so synonym scientific queries
   (e.g. `Coprinopsis atramentaria`) rank the SSOT taxon (`Coprinus atramentarius`)
2. FE test in `namesEs.test.ts` for synonym scientific query
3. Pro tester still PASS S3–S7; product_unlock remains **false**

## v1.2.13 — getSpeciesBySlug/Taxon synonym resolve (2026-07-27 residual)

**E20 status:** RUNNING (no metrics; lastRunTime ~14:25Z).

**Implemented:**

1. **`getSpeciesBySlug` / `getSpeciesByTaxon`** resolve curated synonyms to SSOT rows
   - e.g. `coprinopsis-atramentaria` / `Coprinopsis atramentaria` → `Coprinus atramentarius`
2. Catalog split tests cover synonym deep-link path
3. product_unlock remains **false**

## v1.2.14 — BE synonym slug/search/media (2026-07-27 residual)

**E20 status:** still `KernelWorkerStatus.RUNNING` (lastRun ~14:25Z) — no download, no cycle-v13, `product_unlock=false`.
Local `kernel_output_v20` remains split-only from prior bare-DP-freeze crash; live notebook has `_unwrap` at both freeze sites.

**Implemented without human gate:**

1. **`unified_catalog.get_by_slug` / `get_by_scientific_name`**
   - Curated synonym slugs/names resolve to SSOT rows (parity with FE deep-links)
   - New `resolve_ssot_slug` for media path join
2. **`search_species`** matches synonym scientific queries to SSOT taxa
3. **`species_media`**
   - Variant/meta/gallery paths try SSOT slug when request slug is a synonym
   - Gallery JSON returns SSOT `slug` + `request_slug`
4. Tests: `test_catalog_slug_and_name_resolve_synonyms` + media/catalog suite green (30 PASS)
5. product_unlock remains **false**

## v1.2.15 — lookalike SSOT expand + BE synonym HTTP (2026-07-27 residual)

**E20 status:** still `KernelWorkerStatus.RUNNING` (lastRun ~14:25Z) — no download, no cycle-v13, `product_unlock=false`.

**Implemented without human gate:**

1. **SSOT lookalike graph expansion** (`scripts/expand_lookalike_ssot_v1215.py`)
   - +34 directed educational edges (amanitas, lepiotas/chlorophyllum, gyromitra/morchella,
     hypholoma/armillaria, inocybe/calocybe, entoloma/clitopilus, cortinarius orellanus, russula)
   - Fills deadly taxa that had empty lookalikes: `Amanita proxima`, `Conocybe filaris`,
     `Cortinarius orellanus`, `Inocybe erubescens`
   - Graph: **39→54** taxa with lookalikes; **54→88** directed edges
   - `sync_catalog_ssot.py` re-ran → FE snapshot + FE catalog + BE expanded (520)
2. **BE HTTP product tests**
   - `/species/coprinopsis-atramentaria` → SSOT atramentarius
   - `/species?q=Coprinopsis atramentaria` surfaces SSOT
   - `/media/species/coprinopsis-atramentaria/gallery` → SSOT slug + request_slug
3. **S5 offline recompute (v19)**
   - n_pairs_in_label_space **34**, n_eval **1467**, true@3≈**0.9884**, mate@3≈**0.047**
4. Tests: lookalike + identify smoke + media/catalog **PASS**
5. product_unlock remains **false**

## v1.2.16 — encyclopedia ficha SSOT lookalikes + studio classics (2026-07-27 residual)

**E20 status:** still `KernelWorkerStatus.RUNNING` (lastRun ~14:25Z) — no download, no cycle-v13, `product_unlock=false`.

**Product gap fixed without human gate:**

1. **`SpeciesDetailPage` lookalike tab**
   - Was: `rich?.lookAlikes` or regex-on-description (ignored SSOT `catalog.lookalikes`)
   - Now: prefer curated `catalog.lookalikes`, merge with rich, dedupe via `rankLookalikes`
   - Encyclopedia fichas surface expanded deadly confusions (e.g. phalloides↔citrina)

2. **Lookalike Studio / quiz classic pairs** (+6 one-tap educational confusions)
   - phalloides-citrina, pantherina-rubescens, esculenta-gyromitra,
     gambosa-inocybe, mutabilis-hypholoma, prunulus-entoloma
   - `classic_lookalike_pairs.json` SSOT aligned

3. **Identify smoke** expanded for v1.2.15 mates; FE tests for SSOT peers + catalog lookalikes
4. product_unlock remains **false**

## v1.2.17 — Identify hydrate merges SSOT lookalikes (2026-07-27 residual)

**E20 status:** still `KernelWorkerStatus.RUNNING` (lastRun ~14:25Z) — no download, no cycle-v13, `product_unlock=false`.

**Product gap fixed without human gate:**

1. **`classify_simple._hydrate_simple_result` (B-43)**
   - When `species_id_allowed` and predictions non-empty, union top-2 catalog
     SSOT lookalikes into `dangerous_lookalikes` (synonym-normalized)
   - Fills empty/partial model lookalike fields so Identify ResultCard surfaces
     curated confusions (e.g. caesarea→phalloides)
   - Gate-blocked path remains undressed (no hydrate / no SSOT merge)

2. **Smoke tests:** hydrate merge + blocked skip; Identify suite 6 PASS
3. **Professional tester re-run:** overall PASS, product_unlock=false, S5 88 directed
4. product_unlock remains **false**

## v1.2.18 — FE Identify/History SSOT lookalike merge (2026-07-27 residual)

**E20 status:** still `KernelWorkerStatus.RUNNING` (lastRun ~14:25Z, ~3.8h+ wall) — no download, no cycle-v13, `product_unlock=false`.

**Product gap fixed without human gate:**

1. **`lookalikeRisk.rankLookalikesForIdentify` / `collectSsotLookalikeNames`**
   - Union API `dangerous_lookalikes` with curated `catalog.lookalikes` of top predictions
   - Synonym-deduped; never invents pairs; never lists prediction as its own mate
2. **`ResultCard`** uses FE B-43 merge + ensures catalog load before re-rank
3. **`HistoryPage`** same merge for reopened notebook observations
4. Tests: lookalikeRisk + BE identify smoke green
5. product_unlock remains **false**

## v1.2.19 — industrial dual deadly honesty (2026-07-27 residual)

**E20 status:** still `KernelWorkerStatus.RUNNING` (lastRun ~14:25Z, ~4h+ wall) — no download, no cycle-v13, `product_unlock=false`.

**Honesty gap fixed without human gate:**

1. **Root cause:** dual deadly keys were recomputed with `range(11)` class indices, not
   industrial `deadly_set.json` ∩ `label2idx` — S3 reported `safety_recall_deadly_at_3 mismatch vs npz`
2. **`scripts/recompute_dual_deadly_honest.py`**
   - Patched v9 / v16 / v16_live / v17 / v18 / v19 metrics with industrial dual keys
   - Backups: `metrics.pre_honest_industrial_dual.json`
   - v19 honest: deadly@1≈**0.963**, deadly@3≈**0.993** (n_deadly=455)
   - v18 honest: deadly@3≈**0.959**; v17≈0.704; v16≈0.581 (still below soft gate)
3. **`artifact_audit._resolve_deadly_idxs`** auto-uses industrial set when label2idx present
4. Pro tester S3: deadly mismatch fails cleared; only missing train/test_obs flags remain
5. product_unlock remains **false** (E20 holdout not complete)

## v1.3.0 — E20 COMPLETE ingest + cycle-v13 (2026-07-27)

**E20 status:** `KernelWorkerStatus.COMPLETE` → downloaded full artifacts.

### Actions (autonomous)

1. `python scripts/push_kaggle_e20.py --download` → metrics, npz, best.pt, best_deadly.pt, splits, log
2. `python scripts/e20_postprocess.py` → dual deadly honesty + unlock eval
3. `python scripts/recompute_dual_deadly_honest.py` → industrial deadly idxs on v20
4. Professional tester **PASS** (S1–S7); S3 v20 **pass/ok flags=[]**; S7 leaks=0; S4 safe_dp_freeze
5. S5 on E20: n_eval=8688, true@3≈**0.935**, mate@3≈**0.105** (34 pairs in label space)

### Honest E20 metrics (GBIF ES pure test, n=7385)

| Key | Value |
|-----|------:|
| test_map_at_3 | **0.860** |
| safety_recall_deadly_at_1 | **0.788** |
| safety_recall_deadly_at_3 | **0.927** |
| n_deadly | 2580 |
| version | v20-E20-source-holdout |
| protocol | source_holdout_e20 |

### Soft gates

- MAP@3 ≥ 0.25 → **PASS**
- deadly@3 ≥ 0.90 → **PASS**
- expand gates also PASS

### product_unlock criteria evaluation

| Criterion | Result |
|-----------|--------|
| E20 COMPLETE + metrics + predictions | PASS |
| Dual deadly at_1/at_3 | PASS (honest, industrial idxs, map match) |
| Soft MAP + deadly@3 | PASS |
| Pro tester + safe_dp_freeze | PASS |
| Orientation-only | ENFORCED |

**product_unlock remains false** (`unlock_eligible_advisory=true` only).  
Reasons: `all_checks_pass_but_product_unlock_forced_false_until_operator_cycle`.  
Policy: orientation_only_never_consume — never forage/consumption permission.

### Reports

- `eval/reports/ml_experiments/e20_unlock_eval.json`
- `eval/reports/ml_experiments/cycle_v13_e20_ingest.json`
- `eval/reports/ml_experiments/professional_tester_latest.{json,md}`

## v1.3.1 — E20 serve path ready (2026-07-27 residual)

**E20:** COMPLETE; artifacts local; soft gates already PASS; product_unlock remains **false**.

**Verified / hardened without human gate:**

1. **Weight discovery + config** already prefer `kernel_output_v20/models/best.pt`
2. **Quality gate** on E20 sibling metrics: `verdict=ACCEPTABLE`, `reason_code=gates_passed`,
   `species_id_allowed=True` (metrics signal) — product_unlock flag still false
3. **MultiView load smoke:** `is_real=True`, 40 classes, arch multiview_v8, load_error=None
4. **Serve hardening**
   - Sibling `label2idx.json` fallback if checkpoint omits labels
   - Prefer fitted `temperature` from sibling metrics.json (**T≈1.588** on E20)
5. Identify lookalike smoke + multiview honesty tests **PASS**
6. product_unlock remains **false** (orientation-only until operator cycle)

## v1.3.2 — E20 real Identify smoke (2026-07-27 residual)

**E20:** COMPLETE; local artifacts intact; no re-download required.

**Implemented / verified without human gate:**

1. **Real-mode path smoke** (weights present):
   - MultiView `is_real=True`, 40 labels, T≈1.588 from metrics
   - `_build_candidates` + SSOT lookalikes for Amanita phalloides/caesarea
   - `map_to_simple` → **mode=real**, decision=accepted, predictions hydrated
     (`in_catalog=True`, risk elevated deadly), `dangerous_lookalikes` non-empty
   - Quality gate ACCEPTABLE / species_id_allowed=True (metrics); product_unlock still false
2. **Tests:** `backend/app/tests/test_e20_real_identify_smoke.py` (4 PASS; skip if no best.pt)
3. **Checkpoint compare:** `best.pt` = MAP@3 peak (ep6); `best_deadly.pt` = deadly@3 peak (ep2)
   — serve default remains best.pt (primary protocol)
4. product_unlock remains **false**

## v1.4.6 — ResultCard lookalike → pair-specific critical_views (2026-07-28 residual)

**E20:** Kaggle re-check `KernelWorkerStatus.COMPLETE`; local artifacts intact under
`kaggle/kernel_output_v20` (no re-download required). product_unlock **false**.

**Product gap fixed without human gate:**

1. **`diagnosticViews.ts` pair lookup**
   - `findDiagnosticPair` / `diagnosticForLookalikeMate` / `missingPairCriticalViews`
   - Union classic_pairs + deadly_diagnostic (prefer deadly source); synonym-normalized
   - Never invents pairs — map miss → null (no fake coach)
2. **`ResultCard` lookalike list**
   - Each ranked mate shows pair `why` + critical_views badges
   - Badges deep-link wizard slots via `onFocusWizardSlot` when provided
   - Educational policy line: multi-foto without those views ≠ safety
3. **i18n** es/en: `result.pairCriticalViews` / `pairDiagPolicy`
4. **CSS** `.lookalike-item__diag*` atelier styles
5. **Tests:** diagnosticViews pair resolve + competitiveFeatures ResultCard wire — PASS
6. product_unlock remains **false** (advisory soft gates already PASS)

### product_unlock criteria evaluation (re-verified)

| Criterion | Result |
|-----------|--------|
| E20 COMPLETE + metrics | PASS (MAP@3=0.860, deadly@3=0.927) |
| Dual deadly honesty | PASS |
| Soft gates | PASS |
| Orientation-only | ENFORCED → product_unlock=**false** |

## v1.4.5 — deadly diagnostic view slots in wizard (2026-07-27 residual)

**E20:** COMPLETE; product_unlock **false**.

**Product gap fixed without human gate:**

1. **Diagnostic map v1.1** — +6 deadly pairs (virosa, lepiota castanea, paxillus, galerina…)
   - `deadly_diagnostic.priority_views` = gills → front → detail → habitat
   - 14 deadly-involved pairs with critical_views + coach_es/en
2. **FE `diagnosticViews.ts`** + FE copy of map JSON
3. **MultiViewWizard** — deadly coach banner, missing diagnostic views, `diag` slot badges
4. **expand_catalog_ml40_multiview** emits deadly_diagnostic + FE mirror on rebuild
5. product_unlock remains **false** (extra photos without diagnostic slots ≠ deadly safety)

## v1.4.4 — deadly multi-view honesty + Identify nudges (2026-07-27 residual)

**E20:** COMPLETE; product_unlock **false**.

**Product gap fixed without human gate:**

1. **Deadly-only paired LOO** (`--deadly-only` → `paired_multiview_loo_deadly.json`)
   - 2162 packs≥2 · 429≥4 · eval n=33 · 10 deadly taxa
   - MAP@3 1/2/4 = **0.843 / 0.843 / 0.838** (Δ 4−1 ≈ **−0.005**, flat)
   - Honest: extra unlabeled photos do **not** fix deadly discrimination
2. **S12** pro tester — PASS + flag `deadly_multiview_map3_flat`
3. **`multiview_product.paired_loo_deadly`** + `deadly_multiview_caveat` on status/dashboard
4. **Identify** submit-area multi-view nudges (1 photo vs 2+) es/en
5. product_unlock remains **false** — multi-view never = forage OK

## v1.4.3 — scaled stratified paired LOO + S11 (2026-07-27 residual)

**E20:** COMPLETE; product_unlock **false**.

**Product gap fixed without human gate:**

1. **`paired_multiview_loo_eval.py` scaled**
   - Stratified round-robin by species (not top-heavy taxa)
   - Softmax **T≈1.588** from E20 metrics
   - n=**48** packs · **38** species · leave-one-photo-out block
   - MAP@3 1/2/4 = **0.847 / 0.917 / 0.924** · Δ(4−1)=**+0.076**
   - reject 0.208 → 0.063 · top1 0.792 → 0.875
   - LOO: full4 MAP@3=0.924 vs loo_mean=0.920 (Δ +0.0035)
2. **S11** professional tester (reads LOO report; PASS when torch_ok)
3. Dashboard / `multiview_product` surfaces LOO Δ + species count
4. product_unlock remains **false**

## v1.4.2 — true same-occurrence multi-view torch eval (2026-07-27 residual)

**E20:** COMPLETE; product_unlock **false**.

**Product gap fixed without human gate:**

1. **`eval/scripts/paired_multiview_loo_eval.py`**
   - Groups local industrial GBIF images by occurrence-id prefix (same specimen multi-media)
   - Inventory: **8060** packs ≥2 · **1546** ≥4 · 40 species
   - Torch MultiView v8 on 24 packs: MAP@3 1/2/4 = **0.854 / 0.896 / 0.903**
   - Δ MAP@3 (4−1)=**+0.049**; honest note: view order is filename-sort not slot labels
2. **S10 readiness** now true via `gbif_loo_eval_ok` (FT still Kaggle-only)
3. **`multiview_product`** exposes `paired_loo_eval` on `/models/status` + FE dashboard
4. **MultiViewWizard** quality-hint banner + i18n `identify.qualityHint.{single,pair,full}`
5. product_unlock remains **false**

## v1.4.1 — paired multi-view inventory + product surface (2026-07-27 residual)

**E20:** COMPLETE; product_unlock **false**.

**Product gap fixed without human gate:**

1. **`eval/scripts/paired_multiview_inventory.py`**
   - train multi≥2 = **3773** · val = **656** · test = **0** (GBIF single-image honest)
   - Path probe: images **not local** (Kaggle `/kaggle/input/.../fungitastic/...`)
   - `true_leave_one_photo_out=false` · blocker documented
2. **S10** in professional tester (PASS + flag when LOO blocked)
3. **`backend/app/ml/multiview_product.py`** + `/models/status.multiview_product`
   - Four-photo bench headline + paired inventory readiness
4. **FE** dashboard multiview bench line; wizard `multiViewQualityHint` (1/2/4 photos)
5. product_unlock remains **false**

## v1.3.8 — classify feedback wire + open-set reason UX (2026-07-27 residual)

**E20:** COMPLETE; product_unlock **false**.

**Product gap fixed without human gate:**

1. **Feedback JSONL wired into `map_to_simple`**
   - Every classify (sync/async) appends to `data/feedback/classification_log.jsonl`
   - Includes decision, open_set reason, mode, gate flags; product_unlock=false in metadata
   - S9 live reject monitor can now leave SKIP → PASS under traffic
2. **Prometheus `open_set_reject_total{reason=…}`**
   - Counts Identify abstentions by reason (high_entropy, low_margin, …)
3. **FE open-set reason humanization**
   - `lib/openSetReason.ts` + i18n es/en under `honesty.open_set_reason.*`
   - ResultCard decision banner + ModelInsights use human labels (not raw codes)
4. product_unlock remains **false**

## v1.3.7 — ArcFace centroids + live reject monitor (2026-07-27 residual)

**E20:** COMPLETE; artifacts local; product_unlock **false**.

**Product gap fixed without human gate:**

1. **ArcFace → class centroids**
   - MultiView extracts `arcface.weight` (40×576) when `class_centroids.npy` missing
   - Persists sibling `class_centroids.npy` (L2-normalized rows)
   - Cosine open-set path no longer dead for E20
   - `scripts/export_e20_class_centroids.py` offline export + meta JSON
2. **S9 live Identify reject monitor**
   - `kaggle/ml_qa/live_reject_monitor.py` reads feedback JSONL
   - Wired into professional tester; empty log → SKIP (not fail)
   - `/models/status` exposes `live_reject_monitor` + summary rates
3. **FE dashboard** surfaces centroids source + live reject status
4. Identify smoke: centroids_loaded + shape matches 40 classes
5. product_unlock remains **false**

## v1.3.6 — entropy secondary open-set (2026-07-27 residual)

**E20:** COMPLETE; artifacts local; product_unlock **false**.

**Product gap fixed without human gate:**

1. **S8 entropy calibration** on E20 holdout softmax (nats)
   - Recommended **H_max=0.15** on top of conf=0.92 / margin≥0.05
   - Holdout reject≈**0.182** · acc_keep≈**0.881** (vs 0.117 / 0.858 conf-only)
2. **`calibrated_entropy`** written to `open_set_thresholds.json`
3. **MultiView `_open_set_check`** rejects when Shannon H > thr (after conf/margin)
4. **OpenSetRejectionService** reason=`high_entropy`; entropy now in **nats** (was log2)
5. **`open_set_max_entropy`** setting (default 0=off; file overrides when calibrated)
6. FE dashboard shows **H≤** thr; Identify entropy smoke added
7. product_unlock remains **false**

## v1.3.5 — live Identify open-set surface + margin floor (2026-07-27 residual)

**E20:** COMPLETE (Kaggle re-check); artifacts local; product_unlock **false**.

**Product gap fixed without human gate:**

1. **`describe_active_open_set_thresholds`** in `species_catalog`
   - Ops summary: active conf/margin, holdout reject, mate@3, product_unlock=false
2. **`GET /models/status`**
   - `summary.open_set_*` + top-level `open_set` block for dashboard
   - MultiView `get_status().open_set` + `serve_temperature`
3. **FE ML Dashboard**
   - product_unlock + unlock_eligible_advisory
   - live open-set conf/margin + holdout reject + mate@3
   - howto prefers `kernel_output_v20` (not v9)
4. **Identify open-set smokes**
   - calibrated thr rejects flat/low conf; accepts high conf
   - phase2 open-set tests use conf above E20 thr so reason codes stay honest
5. **Margin floor 0.05** on calibrated write (conf may be binding; product still rejects near-ties)
6. product_unlock remains **false**

## v1.3.4 — E20 open-set + mate monitor (S8) (2026-07-27 residual)

**E20:** COMPLETE (Kaggle re-check `KernelWorkerStatus.COMPLETE`); artifacts local; no re-download required.

**Product gap fixed without human gate:**

1. **S8 `kaggle/ml_qa/open_set_holdout.py`**
   - Holdout conf/margin stats on E20 `test_predictions.npz` (n=7385)
   - Flags legacy multiview thr 0.10/0.0 → **reject_rate=0** (overconfident softmax)
   - Recommends conf=**0.92** / margin=**0.0** → reject≈**0.117**, acc_keep≈**0.858**,
     deadly_reject≈**0.037**, deadly@3 among kept≈**0.960**
   - Surfaces lookalike mate@3≈**0.105** · true@3≈**0.935** (34 pairs in label space)
2. **Calibrated thresholds written**
   - `eval/reports/open_set_thresholds.json` (+ backend mirror)
   - `eval/reports/ml_experiments/e20_open_set_holdout.json`
   - status=`calibrated_e20_holdout`; **product_unlock=false**
3. **MultiView `_open_set_check`** prefers calibrated file when status starts with `calibrated`
4. **`load_open_set_thresholds`** also searches repo-root `eval/reports/`
5. Professional tester S8 wired; report MD includes open-set + mate section
6. product_unlock remains **false** (orientation-only until operator cycle)

## v1.3.3 — dashboard primary metrics v20 + checkpoint ablate (2026-07-27 residual)

**E20:** COMPLETE; artifacts local.

**Product gap fixed without human gate:**

1. **`training_metrics.discover_metrics_artifacts` sort bug**
   - Was reverse **lexical** on run name → `kernel_output_v9` ranked above `v20`
   - Dashboard/training primary showed v9 MAP~0.07 instead of E20 0.860
   - Now sorts by parsed **version_num** (highest first); primary = **v20**
   - Also surfaces `best_deadly.pt` existence on each run

2. **`GET /models/status`**
   - `summary.product_unlock=false` always
   - `summary.unlock_eligible_advisory` + full `product_unlock_eval` from E20 criteria
   - `training_primary_run` field for ops honesty

3. **`scripts/e20_checkpoint_ablate_report.py`**
   - Documents best.pt (MAP ep6) vs best_deadly.pt (deadly ep2)
   - Recommendation: keep serve on best.pt
   - Report: `eval/reports/ml_experiments/e20_checkpoint_ablate.json`

4. product_unlock remains **false**

## v1.4.0 — multi-view four-photo benchmark + ML-40 catalog (2026-07-27)

**Goal:** Prove the 4-photo wizard is not cosmetic; expand catalog for full E20 label coverage.

### Implemented

1. **Benchmark** `eval/scripts/multiview_four_photo_benchmark.py`
   - Proxy ablation: temperature T=1/alpha + rank-noise for n_views 1/2/3/4
   - Open-set thr from calibrated E20 (conf 0.92 / margin 0.05 / H 0.15)
   - Gates: reject drops 1->4; MAP@3 full >= single; pair >= single
   - Torch smoke: MultiView v8 accepts 1/2/4 views with slot indices (gills/front/habitat/detail)

2. **Catalog expand** `scripts/expand_catalog_ml40_multiview.py`
   - Stubs: Armillaria lutea, Chlorophyllum olivieri, Laccaria amethystina (520 -> 523)
   - Lookalike edges for all ML-40 classes (coverage 1.0)
   - `multiview_diagnostic_map.json` critical views per classic pair + per ML class
   - SSOT sync FE/BE

3. **Cycle + workflow**
   - `scripts/run_multiview_catalog_cycle.py`
   - Rhai `multiview-benchmark-catalog` (expand -> bench -> graph)

4. **Tests** `kaggle/tests/test_multiview_four_photo_benchmark.py`

**product_unlock remains false.**

## v1.4.0-multiview-four-photo — cycle results locked (2026-07-27)

**Status:** pass · **product_unlock:** false (orientation-only) · **torch_ok:** true

### Multi-view MAP@3 (proxy ablation, E20 holdout probs)

| n_views | MAP@3 | Δ vs prior | reject |
|--------:|------:|-----------:|-------:|
| 1 | **0.5836** | — | **1.000** |
| 2 | **0.7357** | **+0.1521** | ~0.655 |
| 4 | **0.8603** | **+0.1246** | **0.182** |

- Full vs single: MAP@3 **+0.2767** (0.8603 − 0.5836)
- Gates: monotone 1→2→4, pair≥single, full≥single — **all true**
- Reject drops **1.0 → 0.182** as views increase
- Torch MultiView v8: accepts 1/2/4 photo slots on E20 `best.pt` (40 classes)

### Catalog ML-40

| Metric | Value |
|--------|------:|
| catalog_total | **523** |
| ml40_in_catalog | **40/40** |
| lookalike_coverage | **1.0** |
| missing | empty |
| policy | orientation_only |

### Artifacts

- `eval/reports/ml_experiments/multiview_four_photo_benchmark.{json,md}`
- `eval/reports/ml_experiments/catalog_ml40_multiview.json`
- `eval/reports/ml_experiments/multiview_catalog_cycle.json`
- `data/species_catalog/multiview_diagnostic_map.json`

### Residual next steps

1. Operator unlock cycle (if desired) — never forage permission; unlock stays false until operator
2. Paired same-specimen multi-view field holdout (true leave-one-photo-out; current bench is T+rank-noise proxy)
3. Watch S9 reject histogram under real Identify traffic
4. Optional E21 data scale / >40 classes

**product_unlock remains false.**

## v1.5.2 — Quiz lookalike critical_views coach (2026-07-28 residual)

**E20:** Kaggle `COMPLETE`; local artifacts OK; product_unlock **false**.

**Product gap fixed without human gate:**

1. **`LookalikeRound`** carries `critical_views` + `pair_id` from `findDiagnosticPair`
2. **`buildLookalikeRound`** prefers diagnostic-map `why` when pair known
3. **`QuizGamePage`** feedback shows discriminating view badges + orientation policy
4. **Tests:** quiz attach critical_views · competitive wire — PASS
5. product_unlock remains **false**

### product_unlock criteria (re-verified)

| Criterion | Result |
|-----------|--------|
| E20 MAP@3 / deadly@3 | 0.860 / 0.927 PASS soft |
| Dual deadly honesty | PASS |
| Orientation-only | ENFORCED → product_unlock=**false** |

## v1.5.1 — Encyclopedia + Studio pair critical_views (2026-07-28 residual)

**E20:** Kaggle `COMPLETE`; local artifacts OK; product_unlock **false**.

**Product gap fixed without human gate:**

1. **`LookalikeCompare` (encyclopedia ficha tab)**
   - Selected mate → `findDiagnosticPair` critical_views + why + policy line
   - `data-testid=lookalike-compare-diag-*` for smoke
2. **`LookalikeStudioPage`**
   - Classic cards show top-3 critical_views badges from diagnostic map
   - Active selection (≥2) shows pair-specific diag block under compare table
3. **CSS** classic-card diag chips + compare diag margin
4. **Tests** competitiveFeatures encyclopedia/studio wire — PASS
5. S9 snapshot: n=1 high_entropy · PASS · unlock false

### product_unlock criteria (re-verified)

| Criterion | Result |
|-----------|--------|
| E20 MAP@3 / deadly@3 | 0.860 / 0.927 PASS soft |
| Dual deadly honesty | PASS |
| Orientation-only | ENFORCED → product_unlock=**false** |

## v1.5 — beta-ready try-first (2026-07-28)

**Goal:** Product surfaces ready for closed beta cohort (GTM 30-day try plan). No product_unlock.

### Shipped

1. **Home / footer try-first**
   - Primary CTA “Probar Identificar”
   - `home-beta-feedback` strip + WaitlistTemporada
   - Footer: try identify + `betaFeedbackHref()` (form env or mailto)
   - `frontend/src/lib/betaFeedback.ts`

2. **Progressive multi-view coach (soft)**
   - `progressiveMultiViewCoach()` stages 0–4 (empty → critical pair → 4-pack)
   - MultiViewWizard banner `mv-progressive-coach` — never hard-blocks default soft path
   - Copy: orientation only, never consumption permission

3. **History notebook critical_views**
   - Detail panel lists ranked lookalikes with pair-specific `diagnosticForLookalikeMate` chips
   - Static diag badges (no wizard deep-link in notebook)
   - Educational policy line (nunca consumo)

4. **Tests**
   - progressive coach stages · betaFeedback href · competitive contracts (Home/footer/History/Wizard)

### Artifacts

- `.grok/graph-engineering/STATE.md` → `v1.5-beta-ready-try-first`
- `docs/GTM_30_DAY_TRY_PLAN.md` Día 1–2 checklist partially checked (operator form URL still open)

**product_unlock remains false.**

## v1.5.6 — Education multi-view diagnostics (2026-07-28 residual)

**E20:** COMPLETE; product_unlock **false**.

**Product gap fixed without human gate:**

1. **`EducationPage`**
   - Section `edu-multiview-diagnostic`: deadly coach + priority views (gills/front/detail)
   - Up to 8 deadly-involved pairs with pair-specific `critical_views` badges
   - CTAs → Identify multi-view + Lookalike Studio
   - Policy: orientation only / never consumption
2. **CSS** `.edu-diag-pairs` / `.edu-priority-views`
3. **Tests** competitiveFeatures education wire — PASS

### product_unlock criteria (re-verified)

| Criterion | Result |
|-----------|--------|
| E20 MAP@3 / deadly@3 | 0.860 / 0.927 PASS soft |
| Orientation-only | ENFORCED → product_unlock=**false** |

## v1.5.5 — GTM cohort kit + S9 windows polish (2026-07-28)

**Goal:** Ship try-first GTM operator kit and polish S9 live reject for real traffic readiness.

### GTM
- `docs/GTM_BETA_COHORT.md` — form setup, segments, invite copy, checklist
- `betaFeedback.ts` — `betaFeedbackConfig`, invite messages, cohort segments/checklist
- Home shows form-configured vs mailto fallback (`home-beta-feedback-source`)
- `.env.example` / `frontend/.env.example` document `VITE_BETA_FEEDBACK_URL`

### S9 polish
- Time windows 24h / 7d / 30d / all + health_flags (sparse, high_reject_advisory)
- `write_s9_report` → `s9_live_reject_latest.json` via `--write`
- ML dashboard S9 ops panel (windows, reasons, flags)
- Fixture timestamped for window tests

**product_unlock remains false.**

## v1.5.1 — operator unlock cycle + S9 live reject (2026-07-28)

**Goal:** Improve residual puntos 2–3 without flipping product_unlock.

### Shipped

1. **Operator unlock package (punto 2)**
   - `evaluate_product_unlock_criteria`: checklist rows, `can_auto_unlock=false`,
     `eligible_but_locked`, `residual_lock_reasons`, operator_cycle reason
   - `build_operator_unlock_package` / `write_operator_unlock_package` →
     `eval/reports/ml_experiments/operator_unlock_checklist.{json,md}`
   - Pro tester + safe_dp_freeze signals when report present
   - Never forage/consumption permission; never auto-true from metrics

2. **S9 live reject monitor (punto 3)**
   - Missing → `no_log`/SKIP; empty file → `empty`/SKIP; populated → PASS + histogram
   - `reason_histogram` + open_set_reason fallback
   - Fixture: `data/feedback/fixtures/s9_mixed_reject.jsonl`
   - `/models/status.live_reject_monitor` forces product_unlock false

3. **Tests**
   - Professional QA: unlock never true, operator package write, S9 empty/fixture
   - Backend `test_models_status_endpoint` asserts both surfaces fail-closed

**product_unlock remains false.**

## v1.5.4 — expert handoff lookalike critical_views (2026-07-28 residual)

**E20:** Kaggle `COMPLETE`; product_unlock **false**.

**Product gap fixed without human gate:**

1. **`expertHandoff.ts`**
   - `buildLookalikeDiagnostics` via `diagnosticForLookalikeMate` + `missingPairCriticalViews`
   - Draft field `lookalike_diagnostics` (mate, pair_id, why, critical_views, missing)
   - `formatHandoffSummary` includes educational multi-view coach block for mycologist share
2. **`ExpertReviewPage`**
   - Renders pair critical_views badges + missing package views
   - Policy line: orientation only / never consumption
3. **Tests:** handoff format + competitive wire — PASS
4. product_unlock remains **false**

### product_unlock criteria (re-verified)

| Criterion | Result |
|-----------|--------|
| E20 MAP@3 / deadly@3 | 0.860 / 0.927 PASS soft |
| Orientation-only | ENFORCED → product_unlock=**false** |

## v1.5.3 — operator unlock runbook (2026-07-28 residual)

**Goal:** Operator-facing runbook + product surface for residual unlock cycle (punto 2). Never flip product_unlock.

### Shipped

1. **Docs — `docs/OPERATOR_UNLOCK_RUNBOOK.md`**
   - Eligible-but-locked vs not eligible
   - Regenerate: `python -m kaggle.ml_qa.gate_eval`
   - Checklist criteria (E20, dual deadly, soft MAP/deadly, pro tester, safe_dp, orientation_only)
   - S9 SKIP empty vs PASS histogram interpretation
   - Explicit human operator decision gate (never auto-flip)
   - What unlock does NOT mean (no forage/consumption)
   - Optional post-decision steps still orientation-only
   - GTM `VITE_BETA_FEEDBACK_URL` residual separate from unlock

2. **Product surface**
   - `GET /models/status`: `operator_unlock_ops` (runbook path, checklist paths, regenerate cmd)
   - `summary`: `eligible_but_locked`, `operator_action`, `residual_lock_reasons`
   - ML dashboard `/ml`: Operator unlock panel (fail-closed eval + S9 + runbook)

3. **gate_eval package**
   - `operator_runbook_path` + `regenerate_command` on package + markdown render

4. **Tests**
   - Structural runbook file (product_unlock false, orientation_only, regenerate cmd)
   - Backend status contracts for operator_unlock_ops + residual fields
   - Frontend competitiveFeatures ML dashboard + runbook wire

### Artifacts

- `.grok/graph-engineering/STATE.md` → `v1.5.3-operator-unlock-runbook`
- product_unlock remains **false** · unlock_eligible_advisory advisory only

**product_unlock remains false.**


## v1.5.15 — auth + PWA multiview honesty (2026-07-28 residual)

**E20:** Kaggle `COMPLETE` re-download + postprocess; MAP@3=0.860 · deadly@3=0.927; product_unlock **false**.

**Product gap fixed without human gate:**

1. **LoginPage** — `login-multiview-tip` + priority badges (gills/front/detail) + orientation policy
2. **RegisterPage** — `register-multiview-tip` + same priority views + never-consume policy
3. **PwaInstallHint** — offline ≠ field multi-view note; Identify CTAs (BIP + iOS)
4. **surfaceRoutes** — `/beta-feedback` route coverage
5. **Tests** competitiveFeatures + surfaceRoutes PASS; pro tester S1–S13 **PASS**

### product_unlock criteria evaluation (re-verified)

| # | Criterion | Status |
|---|-----------|--------|
| 1 | E20 COMPLETE + metrics + predictions | **PASS** |
| 2 | Dual deadly at_1/at_3 (honest industrial) | **PASS** |
| 3 | Soft MAP@3≥0.25 + deadly@3≥0.90 | **PASS** (0.860 / 0.927) |
| 4 | Pro tester + safe_dp_freeze | **PASS** |
| 5 | Orientation-only policy | **ENFORCED** → unlock **false** |

**product_unlock remains false.** Residual: operator deploy, cohort invites, live S9 traffic, optional E21.

## v1.5.14 — encyclopedia + 404 + S9 multiview labels (2026-07-28 residual)

**E20:** Kaggle `COMPLETE` re-download + postprocess; MAP@3=0.860 · deadly@3=0.927; product_unlock **false**.

**Product / ops gap fixed without human gate:**

1. **EncyclopediaPage** — `encyclopedia-multiview-tip` + priority badges + Identify/Educación CTAs
2. **NotFoundPage** — `not-found-multiview-tip` + multi-vista CTAs (orientation only)
3. **S9 multiview honesty**
   - `classify_simple` logs `view_coverage` / `n_views` / policy in feedback JSONL
   - `live_reject_monitor`: multiview stats (diag any/full gills·front·detail), health flags
   - Fixture `s9_mixed_reject.jsonl` includes view labels
   - ML dashboard `ml-s9-multiview` ops line
4. **Tests** FE competitive + S9 QA + pro tester S1–S13 **PASS**

### product_unlock criteria evaluation (re-verified)

| # | Criterion | Status |
|---|-----------|--------|
| 1 | E20 COMPLETE + metrics + predictions | **PASS** |
| 2 | Dual deadly at_1/at_3 (honest industrial) | **PASS** |
| 3 | Soft MAP@3≥0.25 + deadly@3≥0.90 | **PASS** (0.860 / 0.927) |
| 4 | Pro tester + safe_dp_freeze | **PASS** |
| 5 | Orientation-only policy | **ENFORCED** → unlock **false** |

**product_unlock remains false.** Residual: operator deploy, cohort invites, live S9 traffic growth, optional E21.

## v1.5.13 — species detail + beta multiview honesty (2026-07-28 residual)

**E20:** Kaggle `COMPLETE` re-download + postprocess + pro tester PASS; product_unlock **false**.

**Cycle-v13 re-run (direct postprocess):**
- MAP@3=0.860 · deadly@1=0.788 · deadly@3=0.927 · n_deadly=2580
- Soft gates PASS · dual keys honest · `unlock_eligible_advisory=true`
- `product_unlock` remains **false** (orientation-only / operator cycle)

**Product gap fixed without human gate:**

1. **SpeciesDetailPage** — `species-detail-multiview` coach strip
   - Priority views gills/front/detail · deadlyCoach · high-risk emphasis
   - CTAs Identify / Educación / lookalikes tab (pair critical_views already in LookalikeCompare)
   - `diagnosticPolicy()` · never consumption
2. **BetaFeedbackPage** — multiview field tip + multiphoto options with diagnostic granularity
   - `parcial_diag` vs bare multi-photo without gills/front/detail
   - Hint: multi-foto sin vistas diag. ≠ más seguro
3. **Tests** competitiveFeatures wire — PASS; tsc clean

### product_unlock criteria evaluation (re-verified)

| # | Criterion | Status |
|---|-----------|--------|
| 1 | E20 COMPLETE + metrics + predictions | **PASS** |
| 2 | Dual deadly at_1/at_3 (honest industrial) | **PASS** |
| 3 | Soft MAP@3≥0.25 + deadly@3≥0.90 | **PASS** (0.860 / 0.927) |
| 4 | Pro tester + safe_dp_freeze | **PASS** |
| 5 | Orientation-only policy | **ENFORCED** → unlock **false** |

**product_unlock remains false.** Residual: operator deploy, cohort invites, S9 real traffic, optional E21 schedule.

## v1.5.12 — games + footer multiview honesty (2026-07-28 residual)

**E20:** COMPLETE; product_unlock **false**.

**Product gap fixed without human gate:**

1. **Wordle** — `wordle-multiview-tip` (gills/profile/base; Education + Identify links)
2. **Setadle** — `setadle-multiview-tip` + links Educación / Identificar
3. **Footer** — Educación + Lookalikes + multiview note (orientation only)
4. **Identify lookalike smoke** — diagnostic priority views assertion (gills/front/detail)
5. **Tests** FE competitive + BE lookalike smoke — PASS

### product_unlock criteria (re-verified)

| Criterion | Result |
|-----------|--------|
| E20 MAP@3 / deadly@3 | 0.860 / 0.927 PASS soft |
| Orientation-only | ENFORCED → product_unlock=**false** |

## v1.5.11 — E21 ops surface (status + dashboard + S13) (2026-07-28 residual)

**E20:** COMPLETE; product_unlock **false**. **E21 not launched.**

**Ops product gap fixed without human gate:**

1. **`GET /models/status.e21_readiness`**
   - From `evaluate_e21_readiness()`; forced `product_unlock=false`, `e21_launched=false`
   - summary: `e21_ready`, `e21_launched=false`, `e21_status`
2. **ML dashboard** operator panel: E21 readiness line (baseline MAP/deadly, launched=false)
3. **Professional tester S13** “E21 scale readiness (no launch)”
   - Writes report; FAIL only if unlock/launch flags true
4. **Tests:** backend status fail-closed e21 · FE dashboard wire

### product_unlock criteria (re-verified)

| Criterion | Result |
|-----------|--------|
| E20 MAP@3 / deadly@3 | 0.860 / 0.927 PASS soft |
| E21 | ready · not launched · unlock false |
| Orientation-only | ENFORCED → product_unlock=**false** |

## v1.5.10 — E21 readiness + preflight multiview tip (2026-07-28 residual)

**E20:** COMPLETE; product_unlock **false**. **E21 not launched.**

**Product / ops gap fixed without human gate:**

1. **`docs/E21_SCALE_PLAN.md`**
   - Optional scale protocol; source-holdout honesty; dual deadly; never auto-unlock
2. **`scripts/e21_readiness.py`**
   - Baseline gates from E20 artifacts; `ready_for_e21_schedule` advisory only
   - `e21_launched=false` · `kaggle_push=false` · `product_unlock=false` always
   - Report: `eval/reports/ml_experiments/e21_readiness.json` (all checks PASS)
3. **`PreflightBanner`**
   - Multiview tip + priority view badges (gills/front/detail) when online
   - Orientation only / never consumption
4. **Tests** competitiveFeatures preflight wire — PASS

### product_unlock criteria (re-verified)

| Criterion | Result |
|-----------|--------|
| E20 MAP@3 / deadly@3 | 0.860 / 0.927 PASS soft |
| E21 readiness | ready_for_operator_schedule (no push) |
| Orientation-only | ENFORCED → product_unlock=**false** |

## v1.5.9 — Home + Map multiview coach (2026-07-28 residual)

**E20:** COMPLETE; product_unlock **false**.

**Product gap fixed without human gate:**

1. **`HomePage`**
   - Trust pillar “Multi-vista que discrimina”
   - Coach strip `home-multiview-coach`: priority views badges + Identify/Education CTAs
   - Copy: multi-photo without gills/profile/base ≠ safer
2. **`SpainMapPage`**
   - Chip `map-multiview-chip` (campo · multi-vista; map does not ID / no harvest)
3. **CSS** `.mkt-multiview-strip*` + `.map-safety-chip--mv`
4. **Tests** competitiveFeatures Home/Map wire — PASS

### product_unlock criteria (re-verified)

| Criterion | Result |
|-----------|--------|
| E20 MAP@3 / deadly@3 | 0.860 / 0.927 PASS soft |
| Orientation-only | ENFORCED → product_unlock=**false** |

## v1.5.8 — offline + community multiview honesty (2026-07-28 residual)

**E20:** COMPLETE; product_unlock **false**.

**Product gap fixed without human gate:**

1. **`offlinePackMultiviewHonesty`**
   - Priority views (gills/front/detail), high-risk/deadly counts, gallery prefetch note
   - Explicit: offline pack study ≠ field multi-view ID · product_unlock=false
2. **`OfflinePackPage`**
   - Panel `offline-multiview-honesty` + CTAs Education / Identify
3. **`CommunityPage`**
   - Field tip: prefer gills/profile/base when posting; links Identify/Studio/Education
4. **Tests** offline honesty + competitive wire — PASS

### product_unlock criteria (re-verified)

| Criterion | Result |
|-----------|--------|
| E20 MAP@3 / deadly@3 | 0.860 / 0.927 PASS soft |
| Orientation-only | ENFORCED → product_unlock=**false** |

## v1.5.7 — hosting deploy beta (2026-07-28 residual)

**Goal:** Decide and ship hosting + web + PWA install experience before beta invites. Never flip product_unlock.

### Decision

- **Path A (default closed beta):** single HTTPS preview URL, PWA install from browser, API colocated or reverse-proxied (/api).
- **Path B:** `docker-compose.prod.yml` on VPS when operator already self-hosts.
- **Non-goals 30d:** App Store / Play Store, APK download marketing, edible / safe-to-eat claims.

### Shipped

1. **Docs � `docs/HOSTING_DEPLOY_BETA.md`**
   - Architecture text diagram, env tables, CORS/API, media, HTTPS, domain placeholder
   - Tester install steps iOS/Android (A�adir a pantalla de inicio)
   - One-page checklist: deploy ? env ? smoke Identify ? invite
2. **Product**
   - `frontend/src/lib/hostingPublicUrl.ts` + `VITE_PUBLIC_APP_URL`
   - `betaInviteMessageEs/En` use public URL + install line
   - Home strip `home-install-guide` (Abrir en el m�vil / Instalar app)
   - Env examples root + frontend; GTM docs step 0 cross-link
3. **Smoke**
   - `scripts/smoke_beta_preview.ps1` structural (no cloud credentials)
4. **Tests**
   - hostingPublicUrl + HOSTING doc contracts + Home install surface
   - product_unlock remains false

### Residual

- Operator sets real URLs and deploys; then cohort invites
- S9 real traffic; unlock only via operator runbook

**product_unlock remains false.**


## v1.6.0 � product UX + educational trait filters (2026-07-28)

**Goal:** Advance graph engineering product surfaces with visual polish and competitive residual #3 (trait study filters). Never flip product_unlock.

### Shipped without human gate

1. **Educational morphology trait filters** (`frontend/src/lib/studyTraits.ts`)
   - Study shortlists: gills � pores � folds � teeth � ascomycete � other
   - Family/genus heuristics; orientation only � never forage/consumption
   - Encyclopedia toolbar chips + counts + policy line
   - Clear-filters resets trait; results count shows active trait

2. **Home product discover hub**
   - 6-card grid: Identify � Enciclopedia � Lookalikes � Setadle � Mapa � Educaci�n
   - Visual hierarchy (primary Identify card, amber games card)
   - Policy line on hub lead: never consumption permission

3. **Mobile Identify FAB** (`fab-identify` in App shell)
   - Fixed conversion CTA on =768px; safe-area aware
   - Footer padding so FAB does not obscure disclaimer

4. **Visual polish**
   - marketing.css: discover cards, trait chips, FAB, footer--v16
   - Footer links include Setadle; version stamp v1.6

5. **Contracts**
   - `studyTraits.test.ts` pure helpers
   - `competitiveFeatures.test.ts`: trait filters + discover hub + FAB wires
   - `docs/COMPETITIVE_APPS.md` residual #3 marked shipped

### product_unlock criteria (re-verified)

| Criterion | Result |
|-----------|--------|
| E20 MAP@3 / deadly@3 | 0.860 / 0.927 PASS soft |
| Dual deadly honesty | PASS |
| Orientation-only | ENFORCED ? product_unlock=**false** |

**product_unlock remains false.** No ML weight / gate changes this cycle.

### Artifacts

- `.grok/graph-engineering/STATE.md` ? `v1.6.0-product-ux-traits`
- FE: `studyTraits.ts`, Encyclopedia, Home, App, marketing.css


## v1.7.0 � soft pre-submit coach + framing + private geo pins (2026-07-28)

**Autonomous decision (graph engineering):** ship backlog P1 + P3 + P2-lite in one product cycle.
Never flip product_unlock. Soft path remains default.

### Decisions

| Priority | Choice | Rationale |
|----------|--------|-----------|
| P1 | Soft pre-submit coach | Highest conversion+honesty leverage on Identify |
| P3 | Notebook private pins | Field UX differentiator; privacy-first (no EXIF) |
| P2-lite | Static framing guides | Capture polish without continuous species green-light |
| Skip | E21 launch / unlock | Operator-only; metrics already advisory PASS |

### Shipped without human gate

1. **`preSubmitMultiViewCoach`** (`multiViewSlots.ts`)
   - needsSoftConfirm when missing critical or weak single-photo path
   - Confirm CTAs: add diagnostic view vs proceed soft (orientation only)
   - IdentifyPage: alertdialog `identify-soft-confirm` before POST

2. **Framing guides** (`MultiViewWizard`)
   - SVG silhouette per empty slot (gills/front/habitat/detail)
   - `framingGuideForView` copy � framing only, never species ID light

3. **Notebook geo** (`notebookGeo.ts` + HistoryPage + observationHistory)
   - Pin: lat/lng + accuracy + source + `privacy: coords_only_no_exif`
   - GPS opt-in � manual coords � clear pin � OSM external link
   - Export/share include coords only; never EXIF blobs

4. **Tests + CSS**
   - notebookGeo � stepUp pre-submit � competitiveFeatures wires � fieldNotebook pin
   - marketing.css: soft-confirm � frame-guide � notebook-pin-block

### product_unlock criteria (re-verified)

| Criterion | Result |
|-----------|--------|
| E20 MAP@3 / deadly@3 | 0.860 / 0.927 PASS soft |
| Dual deadly honesty | PASS |
| Orientation-only | ENFORCED ? product_unlock=**false** |

**product_unlock remains false.**

### Artifacts

- `.grok/graph-engineering/STATE.md` ? `v1.7.0-soft-coach-geo-pins`
- FE: multiViewSlots, IdentifyPage, MultiViewWizard, notebookGeo, HistoryPage, observationHistory


## v1.8.0 � autonomous 3h window � free coach + GPS + camera + community (2026-07-28)

**Mode:** NO human-in-the-loop for 3 hours. Scheduler armed 15m (id 019fa96344bf).

### Autonomous decisions

| Item | Decision |
|------|----------|
| P7 free-mode soft coach | **SHIP** � parity with wizard soft path |
| P8 Identify GPS pin | **SHIP** � opt-in at classify ? history pin |
| P2 live framing | **SHIP** � getUserMedia silhouette assist (not species ID light) |
| P4 community consensus | **SHIP** � human second-opinion chips + expert CTA |
| P5 offline ency depth | **SHIP** � study-only strip + encyclopedia CTA |
| product_unlock | **NEVER** flip |

### Shipped

1. `preSubmitFreeModeCoach` + Identify free/wizard both use soft confirm
2. `identify-gps-pin-toggle` ? `requestBrowserNotebookPin` on successful classify ? `buildHistoryEntry({ pin })`
3. `CameraCapture` live frame assist SVG + policy line
4. `communityConsensusChip` + Community strip/chips + expert CTA
5. Offline `offline-ency-depth` study strip
6. CSS + competitive/stepUp/communitySafety tests

**product_unlock remains false.**

## v1.8.1 � wizard camera ? nextCameraSlot (autonomous residual)

- Identify camera from wizard targets `nextCameraSlot(assignments)` via `cameraTargetSlot`
- Capture assigns File into correct multi-view slot (not free dump)
- Free mode still uses addFiles
- competitiveFeatures asserts nextCameraSlot wire
- product_unlock remains false

## v1.8.2 — free view_types heuristic + ResultCard sticky (autonomous)

- `freeModeViewTypesHeuristic(n)` → gills→front→habitat→detail (cap 4)
- Free-mode classify now sends educational view_types (was undefined)
- ResultCard: `result-orientation-sticky` always-visible orientation strip
- Tests: freeMode heuristic + competitive ResultCard sticky
- product_unlock remains false

## v1.8.3 — notebook pin list + i18n softConfirm/consensus/pin (autonomous)

**Autonomous decision:** ship P13 (local pin table) + P11 (es/en bulk keys). Skip operator deploy/E21/unlock.

### Shipped

1. **`listNotebookPinsFromEntries` / `summarizeNotebookPins` / `notebookPinsShareText`** (`notebookGeo.ts`)
   - Privacy-safe table: coords only, `privacy: coords_only_no_exif`, no marketplace
   - EN/ES policy helpers (`NOTEBOOK_GEO_POLICY_EN`, `notebookGeoPolicy`)

2. **HistoryPage pin list surface**
   - `notebook-pin-list` section when any entry has a pin
   - Stats (total/GPS/manual), open observation, external OSM link, copy list
   - CSS in marketing.css (reduced-motion safe)

3. **i18n es/en**
   - `notebook.pin*` + pin list keys
   - `identify.softConfirm.*` + `identify.gpsPinLabel`
   - `community.consensus*` + `ctaExpert`

4. **Tests**
   - notebookGeo list/summary/share
   - competitiveFeatures v1.8.3 wire
   - i18nParity softConfirm/pin/consensus
   - 63 targeted tests PASS

**product_unlock remains false.** Orientation only — never forage/consumption permission.

## v1.8.4 — P9 ResultCard + Identify visual polish (autonomous mid-window)

**Between scheduler fires** (HITL still OFF).

### Shipped
1. ResultCard `result-card--v184` density + packet chip (`result-packet-chip`) for n vistas
2. Identify `page-identify--v184` + `data-capture-mode` + stronger analyze CTA / flow chrome CSS
3. reduced-motion safe transitions
4. competitiveFeatures contracts for packet chip + identify polish

**product_unlock remains false.**

## v1.8.5 — P14 capture density + free polish + result views (autonomous)

**Decision:** ship capture packet density residual after P9. Skip operator deploy/E21/unlock.

### Shipped

1. **`capturePacketDensity` / `formatViewTypesShort` / `freeModeCaptureCoachLine`** (`multiViewSlots.ts`)
   - Density levels empty|weak|ok|full · critical gills+front coverage
   - Free-mode educational coach lines (orientation only)

2. **Identify capture chrome**
   - Wizard + free: `identify-capture-density` strip (chip + critical + policy)
   - Free: view badges from heuristic, multiview nudge parity, i18n strings, analyze (n vistas)

3. **Result density residual**
   - `result-view-density` strip with view labels + critical coverage
   - `result-card--v185` · data-critical attribute

4. **i18n + CSS + tests**
   - es/en identify.captureDensity + result packet/view density keys
   - marketing.css v1.8.5 reduced-motion safe
   - stepUp + competitiveFeatures contracts · 63 PASS

**product_unlock remains false.** Orientation only — never forage/consumption permission.


## v1.9.0 � Index Fungorum API probe + nomenclature product wire (2026-07-28)

**Trigger:** Kew curator email (Mounes Bakhshi) offering IF API / CSV + attribution rules.  
**Graph eng decision:** Probe live API ? integrate names-only backbone ? never auto-unlock / never flip SSOT.

### API findings (live)

- Base: `https://www.indexfungorum.org/ixfwebservice/fungus.asmx`
- **IsAlive = true**
- Working HTTP GET: `NameSearch`, `NamesByCurrentKey` (param `CurrentKey`), `NameFullByKey` (limited)
- Dead: `/IXFWebService/FungusName.asmx` (404)
- Fields: NAME OF FUNGUS, AUTHORS, NAME STATUS, RECORD NUMBER, CURRENT NAME, UUID, basionym�
- Probe script: `scripts/probe_index_fungorum.py` ? `eval/reports/ml_experiments/index_fungorum_probe.json`

### Product value

| Improves | Does NOT replace |
|----------|------------------|
| Scientific name honesty + IF Record links | Risk chips / classify model |
| Synonym discovery for catalog education | Photos / Spanish commons |
| Kew-compliant attribution | product_unlock / forage |

### Shipped

1. BE `index_fungorum.py` + routes `/nomenclature/*`
2. FE `lib/indexFungorum.ts` + SpeciesDetail IF panel + footer attribution
3. Tests BE mock + FE helpers + competitive contracts
4. Policy: SSOT not auto-overwritten when IF current differs

**product_unlock remains false.**

## v1.9.1 — P17 encyclopedia IF search boost (autonomous)

**Decision:** ship encyclopedia ranking boost via Index Fungorum current name + curated reverse synonyms. Skip operator CSV/deploy/unlock.

### Shipped

1. **`aliasesForTaxon`** reverse synonym index (`taxonSynonyms.ts`)
2. **IF pure helpers** (`indexFungorum.ts`): `nomenclatureQueryVariants`, `scoreTaxonAgainstNomenclatureVariants`, `ifSearchHintFromResolve`, `looksLikeScientificQuery`
3. **`searchCatalogRanked({ nomenclatureHints })`** — offline reverse-alias + live IF extras boost SSOT cards
4. **EncyclopediaPage** — debounced scientific-query IF resolve → ranking hints + `ency-if-search-hint` banner
5. CSS + es/en i18n + tests (indexFungorum, competitive, i18nParity, stepUp) · 69 PASS

**product_unlock remains false.** Names only — never forage / never SSOT auto-overwrite.

## v1.9.3 — M1 S9 fixture growth + P19 home polish (autonomous)

**Decision:** grow S9 mixed reject fixture for richer live-monitor windows; home residual polish. Skip operator deploy/CSV/unlock.

### Shipped

1. **`data/feedback/fixtures/s9_mixed_reject.jsonl`** ≥25 lines
   - Reasons: high_entropy, low_confidence, low_margin, OOD, below_threshold, gate_blocked, unknown_taxon
   - Decisions: accepted / rejected / needs_review / abstain · modes real|mock|blocked
   - Multiview coverage + 24h/7d/30d window rows · every line `product_unlock: false`

2. **S9 pytest** asserts n_entries≥20, richer multiview + reason diversity, never unlock

3. **Home P19**
   - `home-orientation-sticky` · `home-mkt--v193`
   - IF nomenclature trust chip · notebook discover card → `/historial`
   - CSS reduced-motion safe · footer stamp v1.9.3

4. FE competitive + i18n 47 PASS · S9 pytest 2 PASS

**product_unlock remains false.**

## v1.9.4 — M2 ECE residual honesty (autonomous)

**Decision:** classify E20 ECE residual as product-UI honesty signal. Soft MAP/deadly can PASS while ECE≈0.188 remains **high**. Skip operator unlock/deploy.

### Shipped

1. **`kaggle/ml_qa/ece_honesty.py`**
   - Bands good/moderate/high/unknown · guidance de-emphasize confidence
   - `build_ece_residual_report` + write → `eval/reports/ml_experiments/e20_ece_residual.json`
   - Always `product_unlock=false`

2. **`GET /models/status` → `ece_residual`** (+ summary ece/ece_band)

3. **FE** `lib/eceHonesty.ts` + ML dashboard `ml-ece-residual` panel

4. Tests: pytest ece_honesty 4 PASS · vitest eceHonesty + competitive 45 PASS

**E20 result:** test_ece≈0.1878 · band=**high** · confidence chrome must stay humble.

**product_unlock remains false.**

## v1.9.5 — M3 same-specimen multi-view field holdout (autonomous)

**Decision:** canonicalize GBIF same-occurrence multi-photo eval as field holdout; surface product honesty (general multi-view helps; deadly may be flat). Never unlock.

### Shipped / closed

1. **Canonical report** `field_multiview_holdout.json` (+ md)
   - Protocol `same_specimen_field_holdout_m3`
   - MAP@3 1/2/4 ≈ 0.85/0.92/0.92 · Δ(4−1)≈+0.076 · reject drops with more views
   - Deadly subset flat caveat
   - product_unlock=false

2. **Ops**
   - `kaggle/ml_qa/field_holdout.py` + pro tester **S14**
   - `multiview_product.field_holdout_m3` on `/models/status`
   - summary: field_holdout_gates_pass / map3 delta / deadly caveat

3. **Product FE**
   - ML dashboard M3 panel
   - `lib/fieldHoldoutHonesty.ts` + Home `home-field-holdout-note`
   - CSS + competitive contracts

4. Tests: pytest field_holdout 2 PASS · vitest fieldHoldoutHonesty + competitive 46 PASS

**product_unlock remains false.** Multi-view gains ≠ forage permission.

## v1.9.6 — ECE residual → Identify confidence chrome (autonomous)

**Decision:** Soft MAP/deadly can PASS while E20 ECE≈0.188 is **high**. Product must hide numeric confidence %, not only show lab residual on ML dash.

### Shipped

1. **`resolveIdentifyConfidenceChrome(gate, eceBand)`** + `E20_ECE_SNAPSHOT` in `eceHonesty.ts`
   - high/unknown → hide % · deemphasize · productUnlock false
   - gate already closed stays closed

2. **ResultCard** `result-ece-sticky` + `data-ece-band` + `result-card--v196`
   - Default band = E20 high residual

3. **Identify** capture density: ECE sticky + field-holdout deadly caveat notes

4. Tests: eceHonesty + competitive + classifyMode · **74 PASS**

**product_unlock remains false.**

## v1.9.7 — Live ece_residual → Identify ResultCard (autonomous)

**Decision:** close residual “optional live ece_residual prop” — fetch `/models/status` on Identify mount; fail-soft to E20 snapshot.

### Shipped

1. **`eceBandFromModelsStatus` + `fetchEceBandForIdentify`** (`eceHonesty.ts`)
   - Prefer `ece_residual` then `summary.ece_band`
   - 60s cache · abortable · productUnlock always false

2. **IdentifyPage**
   - `eceBand` / `eceSource` state
   - `ResultCard eceBand={eceBand}`
   - `data-ece-source` on ECE note

3. Tests: eceHonesty + competitive · **50 PASS**

**product_unlock remains false.**

## v1.9.8 — S9 traffic depth + mode honesty (autonomous)

**Decision:** grow S9 fixture + classify traffic depth (empty→rich); surface modes real/mock on ops dash. Never unlock.

### Shipped

1. **`live_reject_monitor`**
   - `modes` / `n_real_mode` / `n_mock_mode`
   - `traffic_depth` (empty|sparse|thin|moderate|rich)
   - flags: `traffic_depth_*`, `mock_only_traffic`

2. **Fixture** `s9_mixed_reject.jsonl` → **35** lines; report `s9_fixture_traffic_depth.json`

3. **FE** `s9LiveRejectHonesty.ts` + ML dash traffic note/modes panel

4. Tests: pytest S9 2 PASS · vitest 49 PASS

**product_unlock remains false.** Real traffic still needed for production ops rates.

## v1.9.9 — S9 classification log schema for real traffic (autonomous)

**Decision:** harden JSONL classify log so S9 windows/multiview/modes work under real Identify traffic. Never unlock.

### Shipped

1. **`feedback_logger.build_s9_log_entry`**
   - UTC ISO timestamps with offset
   - Top-level `mode`, `view_coverage`, `view_types`, `n_views`, `open_set_reason`
   - `product_unlock=false` forced (hostile metadata ignored)
   - `normalize_view_coverage` de-dupe

2. **`classify_simple`** passes `open_set_reason` + view_types into logger

3. Tests: `test_feedback_logger_s9` 4 PASS · fixture histogram still PASS · competitive wire

**product_unlock remains false.**


## v1.9.2 � P18 model card + Index Fungorum citation block (2026-07-28)

**Goal:** Formal Kew-compliant citation in model card, docs, registry, and ML ops UI.

### Shipped

1. **`docs/MODEL_CARD.md`** � intended use, stack, pixel sources, **�4 Index Fungorum citation** (full + short UI forms)
2. **`docs/INDEX_FUNGORUM.md`** � API table, product routes, policy, Kew collab notes
3. **Docs touch** � `MEDIA_SOURCES_AND_PARTNERS.md`, `SAFETY_POLICY.md` cross-links
4. **Registry** � `data/training_sources_registry.json` ? `nomenclature.index_fungorum_kew`
5. **BE** � `GET /models/data-sources` includes `nomenclature` + model_card paths
6. **FE** � ML dashboard panel `ml-model-card-nomenclature` + competitive contract P18

### product_unlock

**false** (enforced in docs + API payload).

### Tests

competitiveFeatures P18 + prior IF suite.


## v1.9.4 � P16 Index Fungorum bulk synonym expand (2026-07-28)

**Goal:** Scale nomenclatural aliases for full SSOT catalog without waiting on Kew CSV (pipeline accepts CSV when available).

### Shipped

1. **`scripts/expand_synonyms_if_bulk.py`**
   - Live API: resolve each SSOT taxon ? IF current + synonym cluster
   - Optional `--csv` Kew dump (flexible headers)
   - Merge: curated wins � preferred must be SSOT � never SSOT?SSOT � never flip preferred spelling
   - `--apply` writes SSOT + FE `taxon_synonyms.json`

2. **Full catalog run** (523 taxa, delay 0.2s)
   - proposals_raw **7418** � accepted_new **6951** � merged_total **6954**
   - report: `eval/reports/ml_experiments/if_synonym_bulk_report.json`

3. **Tests** `backend/app/tests/test_if_synonym_bulk.py` (merge + policy)
4. **Docs** `docs/INDEX_FUNGORUM.md` bulk section

### product_unlock

**false**. Nomenclature only.

### Note

Official Kew CSV (curator offer) can re-run `--csv file.csv --apply` later; curated + existing keys retained.


## v1.9.5 � M3 same-specimen multi-view field holdout (2026-07-28)

**Goal:** Canonical field-holdout protocol report for same-occurrence multi-photo eval (not proxy T+noise only).

### Protocol (honest)

- Local GBIF industrial images grouped by **occurrence-id** prefix (same specimen)
- View order = filename sort � **not** labeled gills/front slots
- Leave-one-photo-out + n_views 1/2/4 torch metrics (existing LOO + deadly subset)
- Never product_unlock / never forage

### Shipped

1. `eval/scripts/field_multiview_holdout.py` � assemble report (+ optional `--refresh-torch`)
2. Artifacts `field_multiview_holdout.{json,md}` � gates_pass=true � ?MAP@3(4-1)=+0.076
3. `kaggle/ml_qa/field_holdout.py` + **S14** in professional tester
4. `multiview_product.field_holdout_m3` on `/models/status`
5. ML dashboard panel `ml-field-holdout-m3`
6. Tests: `kaggle/tests/test_field_holdout.py` + competitiveFeatures

### Headline

| n_views | MAP@3 | reject |
|--------:|------:|-------:|
| 1 | 0.847 | 0.208 |
| 2 | 0.917 | 0.104 |
| 4 | 0.924 | 0.063 |

Deadly subset remains flat (caveat) � lookalikes + open-set still required.

**product_unlock remains false.**

## v1.9.10 — canon process sync + operator beta checklist (2026-07-29)

**Goal:** Prepare graph-engineering process: kill agent time-travel, thematic release posture, real operator checklist. Never flip product_unlock.

### Shipped

1. **PROCESS.md** — cycle ritual, roles, metrics SSOT, thematic commit rule, stop conditions
2. **VISION.md** — estado E20 + graph v1.9.9 lineage; soft gates; fail-closed unlock
3. **docs/ROADMAP.md** — norte actual; residual O1–O4; Phase D/E archived; legacy N+1 supersedido
4. **MEMORY.md** — Contexto Activo alineado a E20; decisiones anti time-travel; deuda/residual operador
5. **docs/OPERATOR_BETA_CHECKLIST.md** — deploy Path A + VITE_* form + smoke Identify + cohorte 5–10→20–40
6. **STATE / BACKLOG** → `v1.9.10-canon-process-sync`

### E20 snapshot (reaffirmed, do not regress)

| Key | Value |
|-----|------:|
| MAP@3 | ~0.860 |
| deadly@3 | ~0.927 |
| product_unlock | false |

### Residual

Operator executes checklist (not autonomous). S9 traffic after deploy. E21 optional.

**product_unlock remains false.**


## v1.9.11 — operator dry-run + stale MAP warning fix (2026-07-29)

- Pushed thematic release snapshot to origin/main
- Local operator dry-run: smoke_beta_preview PASS · E20 Identify pytest PASS · POST /classify mode=real open-set reject · product_unlock false
- Fixed hardcoded MultiView warning MAP@3~7.6% (v9) when E20 soft gates PASS
- training_sources_registry current_checkpoint → E20
- OPERATOR_BETA_CHECKLIST status board updated (HTTPS/form/cohort still human)

**product_unlock remains false.**


## v1.10.0 — Campo nocturno B into product FE (2026-07-29)

**Decision:** User chose Option B; games hub Stitch liked; home calm like original B (not dense home-full); **map stays as current live UX**.

### Shipped
- campo-nocturno.css night OLED tokens + bottom nav + glass cards
- Home home-mkt--cn-calm hero multi-vista + trust + 3 quick links (Juegos/Enciclopedia/Mapa)
- GamesHub + MoreHub orientation strips
- Identify/Encyclopedia night classes
- Stitch pack + ref-app already in repo

### Explicit non-change
- Spain map page visual system **not** restyled to Stitch map mock

**product_unlock remains false.**
