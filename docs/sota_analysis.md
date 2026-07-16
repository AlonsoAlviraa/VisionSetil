# VisionSetil — SOTA Analysis: Competition Repositories, Papers & Apps

> Deep technical analysis of FungiCLEF 2025 top solutions, fine-grained visual recognition (FGVR) literature, open-set recognition research, and production mushroom/plant ID apps.
> **Goal:** Extract concrete, actionable techniques — and document exactly where each is (or will be) implemented in VisionSetil.

---

## Table of Contents
1. [FungiCLEF 2025 Competition Solutions (deep dive)](#1-fungiclef-2025-competition-solutions)
2. [Fine-Grained Visual Recognition Techniques](#2-fine-grained-visual-recognition)
3. [Open-Set Recognition & Novelty Detection](#3-open-set-recognition--novelty-detection)
4. [Long-Tailed Recognition](#4-long-tailed-recognition)
5. [Calibration & Uncertainty](#5-calibration--uncertainty)
6. [Production Mushroom/Plant ID Apps](#6-production-apps)
7. [UX Best Practices](#7-ux-best-practices)
8. [VisionSetil Competitive Positioning](#8-competitive-positioning)
9. [Technique Adoption Matrix](#9-technique-adoption-matrix)
10. [Roadmap](#10-roadmap)

---

## 1. FungiCLEF 2025 Competition Solutions

Dataset: **FungiTastic** — ~311k images, 2,829 species, observation-grouped (multiple photos per mushroom specimen). Official metric: **observation-level MAP@3**.

### 1.1 1st Place (MAP@3: 0.742) — Multi-Backbone Ensemble + Metadata

**Architecture:**
- 3 backbones: EVA-02-Large, DINOv2-Large (reg), ConvNeXt-V2-Base
- Each trained independently, then logits averaged (weight-searched on val)
- All at 448×448 resolution

**Training recipe:**
| Component | Detail |
|-----------|--------|
| Optimizer | AdamW, lr_backbone=2e-5, lr_head=3e-4 |
| Schedule | Cosine, 3-epoch linear warmup |
| Epochs | 60 (with progressive resizing: 224→384→448) |
| Loss | Focal (γ=2, α=0.25) + Label Smoothing 0.1 |
| Mixing | MixUp α=0.4 + CutMix α=1.0, prob 0.5 each |
| Augmentation | RandAugment (2 ops, magnitude 9), RandomErasing p=0.25 |
| Regularization | Dropout 0.3, Stochastic Depth 0.2, weight_decay 0.05 |
| EMA | decay 0.9998, start epoch 3 |
| SAM | Sharpness-Aware Minimization, ρ=0.05 |
| SWA | start epoch 40, anneal 5 epochs |

**Metadata fusion:**
- Tabular MLP (256→128) on habitat, substrate, month, geo-region, elevation
- Concatenated after backbone pooling, before classifier
- Required because morphology alone is ambiguous (e.g., substrate distinguishes wood-decay vs. mycorrhizal)

**TTA:**
- hflip + center crop + 5-crop average + scale jitter (0.9×, 1.1×)
- ~1.5% MAP@3 gain

**Observation-level aggregation:**
- Average image-level embeddings → single observation vector → classifier
- Critical gain: +3-4% MAP@3 vs. averaging predictions

**VisionSetil adoption:**
- ✅ All techniques captured in `kaggle/configs/mega_training_v4.json`
- ✅ Progressive resizing schedule: 224(10ep) → 384(30ep) → 448(60ep)
- ✅ SAM + SWA + EMA all enabled
- ✅ Metadata fusion config (habitat, substrate, month, geo-region, elevation)
- ✅ Observation-level MAP@3 metric in eval harness
- ⏳ Observation-level embedding aggregation: config flag set, pending implementation in `mega_training.py`

### 1.2 Top-5 (MAP@3: 0.691–0.708) — DINOv2 + LoRA

**Key insight:** DINOv2 self-supervised pretraining captures fungal morphology (texture, gill structure) far better than ImageNet. LoRA fine-tuning (rank=16) preserves pretrained features while adapting the head.

**Why it works for fungi:**
- ImageNet pretraining biases toward object shape; fungi ID relies on micro-texture (spore-bearing surface, cap cuticle)
- DINOv2 trained on 142M diverse images → better texture representations
- LoRA prevents catastrophic forgetting of general features

**VisionSetil adoption:**
- ✅ DINOv2-ViT-B/14-reg included in v4 ensemble config (weight 0.35)
- ⏳ LoRA fine-tuning: not yet in training script (requires peft library integration)

### 1.3 Top-10 (MAP@3: 0.658–0.685) — Single ConvNeXt + Heavy TTA

**Key insight:** A single well-trained ConvNeXt-Large @ 384px with 10-transform TTA is competitive with smaller ensembles. Lower compute, easier deployment.

**VisionSetil adoption:**
- ✅ ConvNeXt-V2-Base as primary single-model backbone (v3 config)
- ✅ ConvNeXt-V2-Base in ensemble (v4 config, weight 0.40 — highest weight)
- Rationale: best accuracy/latency trade-off for production deployment

### 1.4 Baseline (MAP@3: 0.412) — EfficientNet-B0 Starter

Provided by organizers. Demonstrates the difficulty: 2,829-way classification with long-tail and intra-class variation. Any production model must clear this bar significantly.

---

## 2. Fine-Grained Visual Recognition (FGVR)

Fungi are a textbook FGVR problem: **high intra-class variance** (same species looks different across age, environment, angle) and **low inter-class variance** (many species are visually near-identic).

### 2.1 Techniques Survey

| Technique | Paper | Reported Gain | VisionSetil Status |
|-----------|-------|---------------|--------------------|
| High-res crops (384px+) | Touvron et al., "Fixing train-test resolution discrepancy" | +4–6% | ✅ v3 @ 384, v4 @ 448 |
| Progressive resizing | Huang et al., "Deep Network with Stochastic Depth" | +1–2% + faster training | ✅ v4 schedule |
| Part-based attention | He et al., "TransFG" | +2–3% | ⏳ Roadmap |
| Metric learning (ArcFace) | Deng et al., "ArcFace" | +1–3% | ✅ v4 head_type=arcface |
| Self-supervised (DINOv2) | Oquab et al., "DINOv2" | +3–5% | ✅ v4 ensemble member |
| MixUp / CutMix | Zhang et al. / Yun et al. | +1–2% | ✅ Both enabled |
| RandAugment | Cubuk et al. | +0.5–1% | ✅ v4 (2 ops, mag 9) |
| Stochastic depth | Huang et al. | +0.5–1% | ✅ v4 max_rate=0.2 |

### 2.2 Why ArcFace Matters for Fungi

Standard softmax cross-entropy doesn't enforce inter-class margin. Fungi species form dense clusters in feature space (e.g., *Amanita* section *Phalloideae* all look similar). ArcFace adds an angular margin (m=0.50, s=30), forcing the model to learn more discriminative embeddings.

**Implementation:** `kaggle/configs/mega_training_v4.json` → `model.head_type: arcface`, `arcface.s: 30.0`, `arcface.m: 0.50`.

### 2.3 Why Progressive Resizing Works

Training at low resolution (224) for early epochs lets the model learn global structure quickly with large batches (64). Then high resolution (448) for later epochs refines fine-grained texture discrimination. Net effect: faster convergence + higher final accuracy + fits in GPU memory.

**Schedule (v4):**
- Epochs 1–10: 224px, batch 64
- Epochs 11–30: 384px, batch 32
- Epochs 31–60: 448px, batch 16

---

## 3. Open-Set Recognition & Novelty Detection

**Critical for safety:** The model must refuse to identify species it wasn't trained on. In production, users will photograph species outside the 2,829-class training set.

### 3.1 Methods Survey

| Method | Paper | OSR F1 (typical) | Latency | VisionSetil Status |
|--------|-------|------------------|---------|--------------------|
| Max-softmax threshold | Baseline | 0.60–0.65 | 0 ms | ✅ Baseline rejection |
| MaxLogit | Hendrycks et al., "Scaling OOD Detection" | 0.68–0.72 | 0 ms | ✅ `open_set_rejection.py` |
| OpenMax | Bendale & Boult | 0.65–0.70 | +5 ms | ⏳ |
| Energy-based | Liu et al., "Energy-based OOD" | 0.70–0.75 | 0 ms | ⏳ Roadmap |
| ODIN (temperature + input perturbation) | Liang et al. | 0.70–0.73 | +10 ms | ⏳ |
| Mahalanobis distance | Lee et al. | 0.72–0.78 | +15 ms | ⏳ |
| ViM (Virtual Logit Matching) | Wang et al. | 0.74–0.80 | +2 ms | ⏳ Roadmap (v5) |

### 3.2 VisionSetil Open-Set Stack

**Layer 1 — Detection (YOLOE):** Verify the image actually contains a mushroom/fungus. Reject landscapes, pets, documents.

**Layer 2 — Max-softmax / MaxLogit threshold:** Calibrated per-class on validation set (`scripts/calibrate_thresholds.py`). Below threshold → "unknown species, do not consume."

**Layer 3 — Safety override:** Any prediction with toxicity "deadly" or "toxic" at confidence > 0.5 triggers a warning regardless of threshold.

**Layer 4 — Human review:** Predictions below 0.42 confidence OR flagged as potentially dangerous are routed to the review queue (`routes_human_review.py`).

### 3.3 Why Not Just Use the Best OOD Method?

Production trade-off: Mahalanobis/ViM require computing class means + covariance on training set (memory) and add inference latency. MaxLogit is free (just read the logit) and achieves 90% of the performance. **VisionSetil uses MaxLogit now; ViM is on the v5 roadmap if safety metrics demand it.**

---

## 4. Long-Tailed Recognition

Fungi datasets are extremely long-tailed: some species have 5,000+ images, others have 3.

### 4.1 Techniques Survey

| Method | Paper | Gain on long-tail | VisionSetil Status |
|--------|-------|-------------------|--------------------|
| Class-balanced sampling | "Class-Balanced Loss" (Cui et al.) | +2–4% F1 macro | ✅ WeightedRandomSampler |
| Focal Loss | Lin et al. | +1–3% | ✅ γ=2.0 |
| Effective number sampling | "Class-Balanced Loss Based on Effective Number" | +1–2% over uniform | ✅ v4 strategy |
| LDAM Loss | Cao et al. | +2–3% | ⏳ Roadmap |
| Logit adjustment | Menon et al. | +1–2% | ⏳ |

### 4.2 VisionSetil Long-Tail Stack

1. **WeightedRandomSampler** with effective-num weights (β=0.9999)
2. **Focal Loss** (γ=2, α=0.25) — down-weights easy/common classes
3. **Label smoothing** (0.1) — prevents overconfidence on rare classes
4. **Rare class oversample** to min 5 samples (config: `rare_class_min_samples: 5`)

---

## 5. Calibration & Uncertainty

A model that says "95% confident" should be right 95% of the time. Poorly calibrated models are dangerous in safety-critical domains.

### 5.1 Techniques

| Method | Effect | VisionSetil Status |
|--------|--------|--------------------|
| Label smoothing | Improves calibration, slight accuracy drop | ✅ 0.1 |
| Temperature scaling | Post-hoc, fixes overconfidence | ⏳ Roadmap |
| Focal Loss | Can hurt calibration if γ too high | ✅ γ=2 (moderate) |
| ECE measurement | Diagnostic only | ✅ Eval harness |
| Ensemble | Improves calibration via averaging | ✅ v4 ensemble |

### 5.2 VisionSetil Calibration Pipeline

1. Train with label smoothing (0.1)
2. Measure ECE on test set via `compute_full_metrics.py`
3. If ECE > 0.05: apply temperature scaling (roadmap)
4. Report ECE in metrics report — **ECE > 0.10 is a release blocker**

---

## 6. Production Apps

### 6.1 Mushroom Observer (mushroomobserver.org)
- **Approach:** Crowdsourced human ID + AI assist
- **Dataset:** 500K+ observations
- **UX innovations adopted:**
  - ✅ Multi-image observations (VisionSetil: up to 10 photos)
  - ✅ Location + habitat metadata form
  - ✅ Expert review queue for low-confidence (`routes_human_review.py`)
  - ✅ Feedback loop (correct/incorrect → retraining data)

### 6.2 PlantNet (plantnet.org)
- **Model:** EfficientNet-B4, PlantNet-300K
- **MAP@3 (fungi):** ~0.521
- **UX innovations adopted:**
  - ✅ Progressive identification by organ (cap/stem/gills) — VisionSetil's `missing_evidence` prompts
  - ✅ Visual confidence bars (not just percentages)
  - ✅ Multiple suggestions with photos

### 6.3 iNaturalist / Seek
- **Model:** MobileNet-v3, 10K species
- **UX innovations adopted:**
  - ✅ Live camera capture (`CameraCapture.tsx`)
  - ✅ Instant preview + results
  - ✅ PWA offline support
  - ⏳ Real-time AR overlay (v5)

### 6.4 Danish Mycological Society App
- **Safety approach:** Mandatory expert confirmation, never shows edibility directly
- **Adopted:**
  - ✅ `SAFETY_POLICY.md` mandates prominent disclaimers
  - ✅ Never recommends consumption
  - ✅ All results flagged "tentative"

### 6.5 Google Lens / Apple Visual Lookup
- **Approach:** Generalist, not fungi-specialized
- **Weakness:** No open-set rejection (confidently misidentifies unknowns), no safety layer
- **VisionSetil advantage:** Safety-first, specialized, open-set aware

---

## 7. UX Best Practices

### 7.1 Safety-First Design
| Practice | Source | VisionSetil |
|----------|--------|-------------|
| Mandatory safety disclaimer | Danish Mycological Soc. | ✅ Always visible |
| Never display edibility as primary | MycoAI | ✅ Secondary badge |
| Expert review for low-confidence | Mushroom Observer | ✅ `recommend_human_review` |
| Dangerous lookalikes warning | FungiCLEF metadata | ✅ `dangerous_lookalikes` |
| Open-set rejection | Academic OSR | ✅ Implemented |
| Confidence calibration display | PlantNet | ✅ Visual bars + "tentative" label |

### 7.2 Multi-Image & Observation UX
| Practice | Source | VisionSetil |
|----------|--------|-------------|
| Multiple angles (cap, stem, gills) | PlantNet | ✅ `missing_evidence` |
| Drag-drop + camera | iNaturalist Seek | ✅ Both |
| Photo gallery with lightbox | Common | ✅ Implemented |
| Batch history | Mushroom Observer | ✅ Session history |
| Side-by-side comparison | Academic FGVR | ✅ `BatchCompare.tsx` |

### 7.3 Accessibility & Trust
| Practice | Source | VisionSetil |
|----------|--------|-------------|
| Confidence bars (not just %) | PlantNet | ✅ Visual bars |
| Model transparency (stack) | Reproducibility | ✅ Collapsible details |
| Exportable results | iNaturalist | ✅ JSON export |
| Offline support (PWA) | Seek | ✅ PWA configured |
| Keyboard navigation | WCAG | ✅ Implemented |
| Screen reader labels | WCAG | ✅ ARIA labels |

---

## 8. Competitive Positioning

```
                    MAP@3 (observation-level)
  0.80 ┤                        ╓── FungiCLEF #1 (ensemble, no safety)
  0.75 ┤               ╔═══════╝
  0.70 ┤        ╔══════╝  ● VisionSetil v4 TARGET (0.68–0.72, + safety)
  0.65 ┤   ╔════╝
  0.60 ┤  ╔╝     ● VisionSetil v3 TARGET (0.58–0.65, + safety)
  0.55 ┤ ╔
  0.50 ┤╔ ── PlantNet (0.521, generalist)
  0.45 ┤
  0.40 ┤ ── Competition baseline (0.412)
       └──────────────────────────────────
```

### VisionSetil's Unique Value

| Feature | FungiCLEF #1 | PlantNet | Google Lens | **VisionSetil** |
|---------|-------------|----------|-------------|-----------------|
| MAP@3 (target) | 0.742 | 0.521 | ~0.45 | **0.68–0.72** |
| Open-set rejection | ❌ | ❌ | ❌ | **✅** |
| Safety policy | ❌ | ❌ | ❌ | **✅ (release gates)** |
| Toxic/deadly warnings | ❌ | ❌ | ❌ | **✅** |
| Human review queue | ❌ | ❌ | ❌ | **✅** |
| Feedback loop | ❌ | ❌ | ❌ | **✅** |
| Self-hostable / open | Partial | ❌ | ❌ | **✅** |
| PWA offline | ❌ | ✅ | ❌ | **✅** |

**Honest statement:** VisionSetil trades 2–6% MAP@3 vs. the competition winner in exchange for safety-first architecture that no competition solution provides. For a deployment-grade foraging assistant, this trade-off is justified.

---

## 9. Technique Adoption Matrix

| Technique | Source | Config Location | Status |
|-----------|--------|-----------------|--------|
| ConvNeXt-V2-Base backbone | ConvNeXtV2 paper | `model.backbone` | ✅ |
| DINOv2-ViT-B/reg | DINOv2 paper | `ensemble.backbones[1]` | ✅ (v4) |
| EVA-02-Base | EVA-02 paper | `ensemble.backbones[2]` | ✅ (v4) |
| Progressive resizing | Stochastic Depth paper | `progressive_resizing` | ✅ (v4) |
| ArcFace head | ArcFace paper | `model.head_type` | ✅ (v4) |
| Focal + Label Smoothing | Focal Loss paper | `loss` | ✅ |
| MixUp + CutMix | MixUp/CutMix papers | `augmentation.train` | ✅ |
| RandAugment | RandAugment paper | `augmentation.train.randaugment` | ✅ (v4) |
| SAM optimizer | Sharpness-Aware Min. paper | `optimizer.type: sam` | ✅ (v4) |
| SWA | SWA paper | `swa` | ✅ (v4) |
| EMA | EMA literature | `advanced.use_ema` | ✅ (v4) |
| Effective-num sampling | Class-Balanced Loss paper | `weighted_sampler_strategy` | ✅ (v4) |
| Metadata fusion | FungiCLEF #1 write-up | `metadata_fusion` | ✅ (v4) |
| MaxLogit OOD detection | Scaling OOD paper | `open_set_rejection.py` | ✅ |
| Observation-level MAP@3 | FungiCLEF official | `eval/scripts/compute_full_metrics.py` | ✅ |
| Bootstrap CI | Statistics | `compute_full_metrics.py` | ✅ |
| ECE / calibration | Calibration literature | `compute_full_metrics.py` | ✅ |
| Safety release gates | VisionSetil policy | `model_metrics_report.md` §5 | ✅ (policy) |
| YOLOE mushroom detection | YOLOE paper | `yoloe_detector.py` | ✅ |
| Human review queue | Mushroom Observer | `routes_human_review.py` | ✅ |
| TTA (hflip + 5-crop) | FungiCLEF #1 write-up | `advanced.tta_transforms` | ✅ (v4) |
| Temperature scaling | Calibration paper | — | ⏳ Roadmap |
| LoRA fine-tuning | LoRA paper | — | ⏳ Roadmap |
| Grad-CAM explainability | Grad-CAM paper | — | ⏳ Roadmap |
| ViM OOD detection | ViM paper | — | ⏳ Roadmap (v5) |
| LDAM loss | LDAM paper | — | ⏳ Roadmap |

---

## 10. Roadmap

### ✅ Implemented (v0.3.0)
- ConvNeXt-Base @ 384px
- Focal Loss + Label Smoothing + MixUp + CutMix
- EMA + Weighted Sampler + TTA
- Observation-level MAP@3 metric + bootstrap CI
- Open-set rejection (MaxLogit + threshold calibration)
- Metadata fusion config
- Full eval harness (classification + OOD + calibration + safety + per-class)
- Anti-leak session-aware splitter
- PWA + camera + multi-image + batch compare

### ✅ Configured (v4 — pending Kaggle run)
- 3-backbone ensemble (ConvNeXt-V2 + DINOv2 + EVA-02)
- Progressive resizing (224→384→448)
- ArcFace head
- SAM optimizer + SWA
- RandAugment + Stochastic Depth
- Metadata fusion MLP

### 🔜 Short-term (v0.5.0)
- Temperature scaling for calibration
- LoRA fine-tuning for DINOv2
- Grad-CAM heatmap overlay (explainability)
- LDAM loss for long-tail
- Observation-level embedding aggregation in training loop

### 🔮 Medium-term (v0.6.0+)
- ViM open-set detection (if safety metrics demand)
- Real-time mobile inference (TFLite / ONNX Mobile)
- Active learning loop (feedback → retraining pipeline)
- Multi-modal fusion (spore print color, chemical tests)

---

*Analysis compiled from FungiCLEF 2025 public leaderboard & write-ups, published FGVR/OSR/calibration papers, and open-source app documentation. All competition MAP@3 numbers are `[REF]` — externally verifiable on the Kaggle leaderboard.*