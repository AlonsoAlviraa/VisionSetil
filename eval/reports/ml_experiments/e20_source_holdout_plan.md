# E20 Source Hold-out — Honest Anti-Leak Protocol

**Status:** implement / push  
**Orientation only — never consumption permission**  
**Allowlist:** 40 spp until honest gates pass  

## Why E20

E19 mixed FungiTastic + GBIF into a **random** train/val/test split:

| Issue | E19 symptom |
|-------|-------------|
| Same-domain test | MAP@3 ~0.96 inflated (not field-realistic) |
| `safety_recall_deadly` | Stored **top-1** but gates labeled as **@3** |
| Split artifacts | Obs id lists **not** persisted → offline re-audit UNKNOWN |
| Near-dups | Only exact `image_path` dedup; stem/media cross-source not collapsed |

E20 is the **honest product gate** protocol for VisionSetil ES orientation.

## Protocol

```
Near-dup collapse (stem / media-id / optional filesize)
        │
        ▼
┌───────────────────┐     ┌────────────────────────────┐
│ TRAIN DOMAIN      │     │ TEST DOMAIN (primary)      │
│ FungiTastic       │     │ GBIF ES allowlist40 only   │
│ (+ soft non-GBIF) │     │                            │
│   → train (85%)   │     │   → pure test metrics      │
│   → val (15%)     │     │                            │
│ early-stop only   │     │ MAP@3, deadly@3 reported   │
└───────────────────┘     └────────────────────────────┘
```

### Rules

1. **No FT rows in test.** Primary metrics = pure GBIF ES.
2. **No random mix** of FT+GBIF into the same test (E19 inflate).
3. **observation_id** train ∩ val ∩ test = empty; **hard fail** if not.
4. **Near-dup collapse** before split: prefer `cc_ok`, then training-source priority.
5. **Persist every run:** `train_obs.json`, `val_obs.json`, `test_obs.json`, `split_manifest.json`.
6. **Labels:** FT metadata CSVs; GBIF `species` field in JSONL. Model inputs = **images only** (no species-name path features).
7. **Deadly safety:** `safety_recall_deadly` = **@3** (true class in top-3 among deadly-labeled samples). Also export `safety_recall_deadly_at_1`.
8. **Fail-closed deadly gate:** if `n_deadly == 0` in pure GBIF test → recall fields = `0.0`, status `unevaluable`, expand gate **FAIL** (no vacuous 1.0).
9. **Cross-domain `observation_id`:** hard-fail (not soft drop). Residual stem/media near-dups after split: drop contaminated test rows + re-assert disjoint.
10. **Checkpoints:** `best.pt` = MAP@3 peak (primary test load); `best_deadly.pt` = deadly@3 peak. Dual early-stop resets patience on either.

### Caps (documented, same spirit as E19)

| Cap | Value |
|-----|------:|
| max_obs / species (normal) | 200 |
| max_obs / species (deadly) | 400 |
| deadly class weight | ×12 |
| allowlist | 40 spp |

Caps applied **per domain** so GBIF cannot starve FT train pool.

## Gates (product expand)

| Gate | Metric | Threshold | Notes |
|------|--------|----------:|-------|
| Expand MAP | test MAP@3 (GBIF pure) | ≥ 0.22 | Expect **lower** than E19 mixed |
| Expand deadly | `safety_recall_deadly` = @3 | ≥ 0.50 | Gates use **@3 only** |
| Soft MAP | MAP@3 | ≥ 0.25 | Optional soft gate A |
| Soft deadly | deadly@3 | ≥ 0.90 | Optional soft gate B |

Do **not** expand allowlist to 80 spp until expand gates pass.  
Do **not** claim product unlock from a single kernel run.

## Hardware: T4 × 2

| Layer | Setting |
|-------|---------|
| Kernel metadata | `enable_gpu: true` (Kaggle assigns T4/T4×2) |
| Notebook | Detect `torch.cuda.device_count()` |
| Multi-GPU | `nn.DataParallel` when `N_GPU >= 2` |
| Fallback | Single GPU / CPU graceful |
| Batch | Base 10 multi-view; ×2 up to 20 when 2 GPUs |

## Artifacts (models/output)

- `best.pt`, `checkpoint_latest.pt`, `temperature_scaler.pt`
- `metrics.json` — includes `safety_recall_deadly` (=@3), `_at_1`, `_at_3`, `eval_protocol`
- `label2idx.json`, `training_history.json`, `test_predictions.npz`
- **`train_obs.json` / `val_obs.json` / `test_obs.json` / `split_manifest.json`**

## Expected metrics vs E19

| | E19 mixed (inflated) | E20 honest (expected) |
|--|---------------------:|----------------------:|
| MAP@3 | ~0.96 | much lower; gate ≥0.22 is meaningful |
| deadly field | top-1 misnamed @3 | true @3 |
| Domain gap | hidden | explicit FT→GBIF transfer |

## How to run

```bash
python kaggle/build_exp_v20_source_holdout.py
python scripts/push_kaggle_e20.py                 # build + push GPU
python scripts/push_kaggle_e20.py --status
python scripts/push_kaggle_e20.py --download
```

```bash
pytest kaggle/tests/test_e20_source_holdout.py -q
```

## Files

| Path | Role |
|------|------|
| `kaggle/build_exp_v20_source_holdout.py` | Notebook generator |
| `kaggle/kernel-metadata-exp-v20.json` | Kaggle GPU kernel meta |
| `scripts/push_kaggle_e20.py` | Build / push / status / download |
| `kaggle/near_dup.py` | Near-dup collapse |
| `kaggle/split_export.py` | Source hold-out + artifact export |
| `kaggle/visionsetil_exp_v20_source_holdout.ipynb` | Generated notebook |

## Monitor

- https://www.kaggle.com/code/alonsoalviraaaa/visionsetil-exp-v20-source-holdout  
- `kaggle kernels status alonsoalviraaaa/visionsetil-exp-v20-source-holdout`  
- `python scripts/push_kaggle_e20.py --status`  
- `python scripts/push_kaggle_e20.py --download`  

If GPU session full (max 2 batch GPU): cancel a running kernel in UI, then  
`python scripts/push_kaggle_e20.py --push-only`.
