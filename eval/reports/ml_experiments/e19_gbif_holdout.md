# E19 GBIF-only hold-out evaluation

**Generated:** 2026-07-27T08:29:31.034496+00:00
**Checkpoint:** `C:\Users\Mariano\Documents\ALONSOO\VISIONSETIL\kaggle\kernel_output_v19\models\best.pt`
**Product gates trustworthy:** **partial**

> Orientation only — never consumption permission. Allowlist 40 spp.

## Protocol

1. Load industrial allowlist 40 + deadly set (11 taxa).
2. Load local `data/industrial_v1/obs_gbif_es.jsonl` with existing images under `data/industrial_v1/gbif/images/`.
3. `fair_cap_observations` max_obs=200 / max_obs_deadly=400, prefer `cc_ok`.
4. Anti-leak stratified split by `observation_id` (seed=42, val=15%, test=15%, min_per_class=4).
5. Evaluate E19 `best.pt` (ConvNeXtV2-tiny multi-view v8) on **test** obs only.
6. FungiTastic **not** available locally — pure GBIF hold-out with contamination caveat.
7. Drop observations with zero successful image loads (no blank-tensor inference).

### Metric definitions (important)

- **Deadly@3**: true class in top-3 among deadly-labeled samples (val loop + this hold-out).
- **Deadly top-1**: argmax equals true deadly class. E19 `metrics.json` field `safety_recall_deadly` is **top-1**, despite gate logs saying deadly@3.
- **ECE naive**: `mean(|max_prob − correct|)` — E19 `test_ece`.
- **ECE 15-bin**: standard reliability-diagram ECE (hold-out only).
- **Macro-F1**: sklearn `average='macro', zero_division=0` (aligned with E19).

### Contamination honesty

E19 randomly assigned ~70% of its post-cap observation pool to train. Local pure-GBIF fair_cap selects a DIFFERENT observation set than E19's per-source reserved cap. Therefore train-overlap for this hold-out is UNKNOWN but non-zero expected. Treat scores as UPPER BOUND on true unseen-GBIF performance (data contamination possible).

- Contamination risk: **medium-high**
- Strict unseen GBIF: **False**

## Pool / split

| Stage | Imgs | Obs | Species |
|-------|-----:|----:|--------:|
| Raw existing | 38003 | — | 40 allowlist |
| Post fair_cap | 18311 | 7385 | 40 |
| After min_per_class=4 | — | — | **39** |
| Train | — | 5168 | |
| Val | — | 1108 | |
| **Test (eval)** | — | **1108** | |

Species dropped by min_per_class: **['Cortinarius rubellus']** (allowlist 40 → split 39 spp).

Obs-id leak check on this split: **PASS**
Image load: failed_imgs=0 dropped_obs_no_image=0

## Metrics vs E19 headline

| Metric | E19 mixed test | GBIF-only hold-out | Δ |
|--------|---------------:|-------------------:|--:|
| MAP@3 | 0.9600000000000002 | **0.9240** [0.910, 0.940] | -0.0360 |
| Top-1 | 0.9361538461538461 | **0.8962** | -0.0399 |
| Top-3 | — | **0.9558** | — |
| Macro-F1 (sklearn) | 0.9045567839830136 | **0.8866** | — |
| Deadly **top-1** | **0.9626** (`safety_recall_deadly`) | **0.9241** | -0.0386 |
| Deadly **@3** | **0.9934** (npz recompute) | **0.9696** (n=395) | -0.0238 |
| ECE naive | 0.0630488328062571 | **0.1039** | +0.0409 |
| ECE 15-bin | — (not in E19) | **0.0971** | n/a — different definition |

Inference wall time: 3.5 min on `cpu` (batch=8, max_views=1).

## Research gates (not product unlock)

Gates use **true deadly@3** (not the mislabeled top-1 field).

| Gate | Threshold | Result |
|------|----------:|--------|
| MAP@3 soft A | ≥ 0.25 | ✅ (0.9240) |
| Deadly expand | ≥ 0.5 | ✅ (0.9696) |
| Deadly soft | ≥ 0.9 | ✅ (0.9696) |

## Worst species (by MAP@3)

| Species | n | top1 | map3 | deadly |
|---------|--:|-----:|-----:|:------:|
| Imleria badia | 38 | 0.711 | 0.759 |  |
| Laccaria laccata | 22 | 0.682 | 0.795 |  |
| Amanita rubescens | 27 | 0.778 | 0.796 |  |
| Lepiota subincarnata | 11 | 0.636 | 0.818 | Y |
| Trametes versicolor | 31 | 0.839 | 0.855 |  |
| Hygrophoropsis aurantiaca | 23 | 0.783 | 0.855 |  |
| Leccinum scabrum | 15 | 0.800 | 0.856 |  |
| Lepiota cristata | 31 | 0.839 | 0.866 |  |
| Agaricus campestris | 39 | 0.821 | 0.868 |  |
| Amanita citrina | 26 | 0.769 | 0.878 |  |
| Pluteus cervinus | 23 | 0.870 | 0.884 |  |
| Kuehneromyces mutabilis | 15 | 0.867 | 0.900 |  |
| Amanita phalloides | 69 | 0.899 | 0.903 | Y |
| Lepiota castanea | 13 | 0.846 | 0.923 | Y |
| Suillus grevillei | 20 | 0.900 | 0.925 |  |

## Product recommendation

GBIF-only hold-out MAP@3=0.924 deadly@3=0.970 still high — possible train contamination and/or easy GBIF StillImage domain. Do NOT unlock product Identify; require true unseen field photos + source-holdout retrain (E20).

## Artifacts

- JSON: `C:\Users\Mariano\Documents\ALONSOO\VISIONSETIL\eval\reports\ml_experiments\e19_gbif_holdout.json`
- Leak audit: `eval/reports/ml_experiments/e19_leak_audit.md`
