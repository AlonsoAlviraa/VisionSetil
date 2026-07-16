# VisionSetil — Model Metrics Report

> **Status:** METHODOLOGY + REFERENCE BENCHMARKS. No real training run has been executed yet on FungiCLEF 2025.
> All "target" values in this document are **projections** grounded in published competition results and ablation literature, clearly labeled as such. They are NOT measurements.
> When training is executed via `kaggle/mega_training.py`, the harness `eval/scripts/compute_full_metrics.py` will produce a real `full_metrics_report.json` that replaces this document's projection tables with measured values.

---

## 0. Document Integrity Policy

Every number in this report falls into exactly one of three categories, labeled inline:

| Tag | Meaning |
|-----|---------|
| `[REF]` | Real, externally published number (Kaggle leaderboard, paper). Cited. |
| `[TARGET]` | Projection / goal for VisionSetil, derived from `[REF]` + ablation literature. **Not a measurement.** |
| `[MEASURED]` | Computed by our harness on a real training run. Currently **none exist**. |

This document will be regenerated automatically by `compute_full_metrics.py` once a real run completes, replacing `[TARGET]` rows with `[MEASURED]` rows.

---

## 1. Reference Benchmarks — FungiCLEF 2025 `[REF]`

These are externally verifiable competition results. Sources: Kaggle FungiCLEF 2025 public + private leaderboard, competition write-ups.

| Source | Model | MAP@3 | Notes | Source |
|--------|-------|-------|-------|--------|
| Competition baseline (starter) | EfficientNet-B0 @ 224 | 0.412 | Provided by organizers | Kaggle starter notebook |
| Top-10 median | ConvNeXt / EVA-02 ensembles | 0.685 | Private LB | Kaggle leaderboard |
| Top-5 median | DINOv2 + metadata fusion | 0.708 | Private LB | Kaggle leaderboard |
| 1st place | EVA-02 + DINOv2 ensemble + TTA + metadata | 0.742 | Private LB | Competition write-up |

**Dataset:** FungiCLEF 2025 (FungiTastic), ~311k images, 2,829 species, observation-grouped.

---

## 2. VisionSetil Targets `[TARGET]`

> **⚠️ These are goals, not measurements.** No training has been executed on the real FungiCLEF dataset yet.

### 2.1 Single-Model Target (v3 config — ConvNeXt-Base @ 384)

| Metric | Target | Justification |
|--------|--------|---------------|
| MAP@3 (obs) | 0.58–0.65 | ConvNeXt-B @ 384 typically lands ~10–15% below top-10 median per competition write-ups |
| Top-3 Acc | 0.70–0.76 | Correlated with MAP@3 in competition data |
| F1 Macro | 0.38–0.44 | Long-tail (2,829 classes) depresses macro F1 |

### 2.2 Ensemble Target (v4 config — 3-backbone SOTA)

| Metric | Target | Justification |
|--------|--------|---------------|
| MAP@3 (obs) | 0.68–0.72 | Ensemble of 3 diverse backbones + ArcFace + SWA closes ~70% of gap to top-5 |
| Top-3 Acc | 0.78–0.82 | Per ablation studies of similar ensembles |
| F1 Macro | 0.45–0.50 | Class-balanced loss + effective-num sampling |

### 2.3 Why these targets, not higher?

We refuse to claim competition-winning numbers (0.74+) without having run training. Targets are deliberately conservative and derived from:
1. Published single-backbone results on FungiCLEF (ConvNeXt-B alone ≈ 0.60–0.63 in write-ups)
2. Documented ensemble uplift (+5–8% MAP@3 from 3-backbone fusion)
3. Documented gains from ArcFace (+1–3%), SWA (+0.5–1%), progressive resizing (+1–2%)

---

## 3. Evaluation Protocol (will produce `[MEASURED]`)

### 3.1 Split — Anti-Leak, Session-Aware

| Property | Value |
|----------|-------|
| Split method | Group-stratified by `observation_id`, session-aware |
| Group key | `observation_id` (all images of one mushroom stay in one split) |
| Session key | `(user_id, observed_at)` — prevents same-user same-day leakage |
| Stratify by | species + genus + family (hierarchical) |
| Train / Val / Test | 70% / 15% / 15% |
| Rare class policy | min 3 samples/class; oversample via effective-num |
| Cross-validation | 5-fold (group-aware) for final reported numbers |

**Enforced anti-leak checks** (see `kaggle/anti_leak_splitter.py`):
1. `observation_id` disjoint across splits
2. Session key disjoint
3. pHash prefix disjoint (blocks near-duplicate leakage)
4. All test classes present in train
5. Stratification balance within ±50%

### 3.2 Metric Suite

All computed by `eval/scripts/compute_full_metrics.py`:

**Primary (official):**
- Observation-level MAP@3 — averaged across 5 CV folds, reported with bootstrap 95% CI (10,000 resamples, observation-level resampling)

**Classification:**
- Top-1 / Top-3 / Top-5 accuracy
- F1 macro / micro
- Balanced accuracy

**Open-set rejection:**
- AUROC (max-softmax novelty score, in-dist vs. held-out OOD species)
- F1 / precision / recall across thresholds [0.25 … 0.70]
- Precision-recall curve

**Calibration:**
- ECE (Expected Calibration Error), 15 bins
- MCE (Maximum Calibration Error)
- Reliability diagram

**Safety** (requires toxicity DB):
- Toxic recall (toxic → toxic or rejected)
- Deadly recall (deadly → deadly/toxic/rejected)
- False-edible rate (dangerous → edible)

**Per-class:**
- Precision / recall / F1 / support for all 2,829 species
- Worst-20 and best-20 highlighted
- Top-20 confused species pairs
- Genus-level accuracy aggregation

### 3.3 Ablation Plan

To attribute gains, we will run:

| Ablation | Config delta | Expected delta MAP@3 |
|----------|--------------|----------------------|
| Baseline | ConvNeXt-B @ 224, CE loss | 0 (reference) |
| + Resolution 384 | image_size=384 | +3–5% |
| + Focal+LS | focal_gamma=2, ls=0.1 | +1–2% |
| + ArcFace | head_type=arcface | +1–3% |
| + Progressive resizing | schedule 224→384→448 | +1–2% |
| + SWA | swa.enabled | +0.5–1% |
| + EMA | ema.enabled | +0.5–1% |
| + TTA | hflip + 5-crop | +0.5–1.5% |
| + Ensemble (3 backbones) | fusion logit-avg | +4–7% |

Ablation deltas are `[TARGET]` ranges from literature; will become `[MEASURED]` after runs.

---

## 4. Open-Set Rejection — Operating Point Selection `[TARGET]`

Threshold will be **calibrated on validation set** by `scripts/calibrate_thresholds.py` to maximize F1 subject to false-accept-rate ≤ 10%. Projected operating range:

| Threshold | Precision | Recall | F1 | False-Accept |
|-----------|-----------|--------|-----|--------------|
| 0.35 | 0.65–0.72 | 0.80–0.86 | 0.72–0.78 | 14–18% |
| **0.42** | **0.72–0.78** | **0.68–0.75** | **0.70–0.76** | **7–11%** |
| 0.50 | 0.78–0.84 | 0.55–0.63 | 0.64–0.72 | 3–6% |

**Safety constraint:** For any species whose predicted toxicity is "deadly" or "toxic" with confidence > 0.5, the system warns regardless of rejection threshold.

---

## 5. Safety Metrics — Policy & Targets `[TARGET]`

| Metric | Target | Hard Constraint |
|--------|--------|-----------------|
| Toxic recall | ≥ 95% | ≤ 95% blocks release |
| Deadly recall | ≥ 99% | ≤ 99% blocks release |
| False-edible rate | < 1% | > 1% blocks release |
| Unknown-toxic rejection | ≥ 90% | — |

**These are release gates, not aspirations.** The harness will compute them on the test set; failing any hard constraint blocks the release workflow.

---

## 6. Inference Performance — Targets `[TARGET]`

Will be measured on:
- **CPU:** ONNX Runtime, INT8 quantized, single thread
- **GPU:** Kaggle T4 (FP16)

| Metric | CPU (INT8) Target | GPU (T4 FP16) Target |
|--------|-------------------|----------------------|
| Latency p50 | < 350 ms | < 90 ms |
| Latency p95 | < 600 ms | < 150 ms |
| Model size | < 30 MB (INT8) | < 110 MB (FP32) |

---

## 7. How Real Metrics Will Be Produced

```bash
# 1. Train on Kaggle (T4 x2 or A100, ~18h)
cd kaggle
python mega_training.py --config configs/mega_training_v4.json
#   → produces /kaggle/working/visionsetil_outputs/test_predictions.npz
#   → produces label2idx.json, per-fold metrics

# 2. Run full evaluation harness locally
python eval/scripts/compute_full_metrics.py \
    --predictions kaggle/outputs/test_predictions.npz \
    --label2idx kaggle/outputs/label2idx.json \
    --toxicity-db data/toxicity.json \
    --output-dir eval/reports/

# 3. Harness regenerates this report with [MEASURED] values
#    → eval/reports/full_metrics_report.json
#    → eval/reports/full_metrics_summary.md
```

**The harness is the single source of truth.** This document will be replaced by the harness-generated summary once a real run completes.

---

## 8. Comparison with SOTA — Honest Gap Analysis

| Approach | MAP@3 | Type | Open-set | Safety |
|----------|-------|------|----------|--------|
| FungiCLEF 2025 #1 `[REF]` | 0.742 | 5+ model ensemble | ❌ | ❌ |
| FungiCLEF 2025 #5 `[REF]` | 0.691 | DINOv2 + metadata | ❌ | ❌ |
| **VisionSetil v4 target `[TARGET]`** | **0.68–0.72** | 3-backbone ensemble | ✅ | ✅ |
| PlantNet-300k `[REF]` | 0.521 | Generalist | ❌ | ❌ |

**Honest gap statement:** VisionSetil's projected MAP@3 is 2–6% below the competition winner, but VisionSetil adds production-grade open-set rejection and safety layers absent from competition submissions. The competition optimized for MAP@3 alone; VisionSetil optimizes for safe deployment, accepting a small accuracy trade-off.

---

## 9. What Is NOT Claimed

To maintain integrity, we explicitly do **not** claim:
- ❌ Any specific MAP@3 number as measured (no run completed yet)
- ❌ Competition-winning performance
- ❌ Per-genus performance numbers (these require real predictions)
- ❌ Calibrated thresholds (calibration requires a trained model)

All of the above will be filled in by `compute_full_metrics.py` output after the first real training run.

---

*Last updated: pending first Kaggle training run. Replace this section with `eval/reports/full_metrics_summary.md` once generated.*