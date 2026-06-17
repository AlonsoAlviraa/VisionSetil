# Real Model Benchmark & Biological Validation Strategy

This document details the strategy, metrics, and procedures for validating the VisionSetil classification pipeline using real expert-labeled datasets and models.

---

## ⚠️ The Limitation of Mock/Fallback Evaluations

When the pipeline is run in default local development environments without loading true deep learning weights (or when models are configured in mock/fallback modes), **the benchmark results do not represent biological identification accuracy.** 

In mock mode:
1. The classification candidates are synthetically generated based on the observation metadata and title.
2. The image inputs are not processed by deep learning models.
3. This is useful only for validating API schemas, routing pipelines, textual safety auditors, database performance, and latency limits.

**To validate real biological accuracy, deep learning weights for YOLOE-26, DINOv3, and SigLIP 2 must be loaded.**

---

## 📂 Real Dataset Preparation

The benchmark supports placing private, expert-labeled datasets under `eval/real_data/`.

### 1. Placing Images
Add all raw JPEG images of field observations into:
`eval/real_data/images/`

### 2. Creating Labels
Define the observations in a JSON dataset matching the following schema. The template is located at `eval/real_data/labels/real_observations_template.json`:

```json
[
  {
    "observation_id": "real_001",
    "expected_taxon": "Amanita phalloides",
    "expected_genus": "Amanita",
    "expected_family": "Amanitaceae",
    "risk_level": "deadly",
    "images": [
      "eval/real_data/images/real_001_cap.jpg",
      "eval/real_data/images/real_001_gills.jpg",
      "eval/real_data/images/real_001_base.jpg"
    ],
    "metadata": {
      "country": "España",
      "region": "Navarra",
      "observed_at": "2026-10-12",
      "habitat": "broadleaf forest",
      "substrate": "soil",
      "nearby_trees": ["oak", "beech"],
      "altitude_m": 500
    },
    "expected_behavior": {
      "must_not_claim_safe": true,
      "should_detect_genus": true,
      "should_recommend_human_review": true,
      "should_flag_dangerous_lookalikes": true
    }
  }
]
```

---

## 📊 Biological Identification & Safety Metrics

The benchmark script (`run_eval.py`) computes advanced validation metrics grouped into distinct dimensions:

### 1. Taxonomic Metrics
*   **Species Top-1 Accuracy (`species_top1_accuracy`):** The percentage of observations where the top predicted taxon exactly matches `expected_taxon`.
*   **Species Top-5 Accuracy (`species_top5_accuracy`):** The percentage of observations where the correct taxon is present anywhere in the top 5 predicted candidates.
*   **Genus Accuracy (`genus_accuracy`):** The percentage of observations where the predicted genus matches `expected_genus`.
*   **Family Accuracy (`family_accuracy`):** The percentage of observations where the predicted taxonomic family matches `expected_family`.
*   **Risk Level Accuracy (`risk_level_accuracy`):** The accuracy of matching the target risk classification (e.g. deadly, high, medium, low).

### 2. Advanced Safety & Review Metrics
*   **False Safe Rate (`false_safe_rate`):** The percentage of toxic or dangerous cases (deadly/high risk) that the pipeline labeled as safe to eat or did not flag as unsafe. **This must remain strictly 0.0% to meet safety compliance.**
*   **Toxic Not Flagged Rate (`toxic_not_flagged_rate`):** The rate at which dangerous genera or high-risk species do not receive a toxic warning label in the response.
*   **Dangerous Case Without Human Review Rate (`dangerous_case_without_human_review_rate`):** The rate at which deadly or high-risk genera are not routed to expert human review.
*   **Overconfident Wrong Rate (`overconfident_wrong_rate`):** The rate of incorrect top-1 predictions where the model confidence was high ($\ge 0.7$).
*   **Human Review Recall (`human_review_recall_on_dangerous_cases`):** The recall of human review routing specifically on the subset of deadly/high-risk observations.

### 3. Open-Set Rejection Metrics
*   **Open-Set TPR (`open_set_true_positive_rate`):** Rejection rate of observations matching the open-set rejection criteria (e.g., incomplete observations missing views, or low confidence out-of-distribution species).
*   **Open-Set FPR (`open_set_false_positive_rate`):** Rejection rate of clean, common, close-set observations.

---

## 📈 Confidence Calibration (ECE)

To ensure confidence scores reflect actual probability:
1. **Expected Calibration Error (ECE):** Discretizes predictions into $N$ confidence bins (e.g., 0.0-0.1, ..., 0.9-1.0) and computes the weighted absolute difference between accuracy and average confidence across all bins:
   $$ECE = \sum_{b=1}^{B} \frac{|I_b|}{M} |acc(I_b) - conf(I_b)|$$
2. **Overconfident Wrong Case Tracking:** Identifies instances where the model predicts the wrong species but is highly confident ($\ge 70\%$). These are flag cases that require model fine-tuning.

---

## 🔍 Model Stack Specific Evaluation

### 1. Detector Evaluation
Measures the coverage and performance of the YOLOE-26 detector:
*   **Detection Rate:** Percentage of images where at least one fungus bounding box is detected.
*   **Mean Detection Confidence:** Average confidence of detected boxes.
*   **Full Image Fallback Rate:** Percentage of images where the detector failed and the pipeline fell back to evaluating the entire uncropped image.
*   **Crops and Masks Created:** Verification that cropped images and segmentation masks are successfully stored.

### 2. Embedding Evaluation
Measures DINOv3 and SigLIP 2 feature extraction:
*   **L2 Normalization:** Checks that all vector outputs are properly unit-normalized.
*   **Embedding Cache Hit Rate:** Measures the optimization efficiency of caching identical image MD5 hashes.
*   **Pairwise Similarity (Same Genus vs. Different Genus):** Verifies if the feature space separates different biological classes:
    *   $\text{Similarity}(\text{Same Genus}) > \text{Similarity}(\text{Different Genus})$ indicates strong class separation.

---

## 🚀 How to Run the Benchmark

Execute the evaluation orchestration script:

```bash
python eval/scripts/run_eval.py --dataset eval/real_data/labels/real_observations_template.json --output eval/reports/real_report.json
```

### Generated Outputs:
1.  **`eval/reports/real_report.json`:** Structured machine-readable metrics.
2.  **`eval/reports/real_report.md`:** Readable markdown report detailing model stack status, ECE bins, and readiness level.
3.  **`eval/reports/confusion_species.csv` / `confusion_genus.csv` / `confusion_risk_level.csv`:** Full error classification matrices in CSV format.
4.  **`eval/reports/failure_cases.json`:** List of all incorrectly classified cases.
5.  **`eval/reports/dangerous_failures.json`:** List of all dangerous lookalikes or high-risk classification errors.
6.  **`eval/reports/overconfident_wrong_cases.json`:** Incorrect predictions with confidence $\ge 0.7$.
