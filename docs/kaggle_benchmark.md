# Kaggle Batch Benchmark Guide

This document describes how to execute the VisionSetil evaluation suite in a Kaggle cloud environment to run deep learning benchmarks on large image datasets.

---

## 🎯 Objectives

The primary goal of the Kaggle benchmark is to **offload heavy ML batch inference from your local workstation** to Kaggle's free GPU/CPU instances. This enables:
1. Evaluating performance on thousands of observations.
2. Generating crops and saving feature embeddings in bulk.
3. Conducting ECE calibration assessments on large populations.
4. Exporting structured matrices and Markdown reports.

---

## 🚦 When to Use vs. When Not to Use Kaggle

### When to Use Kaggle
*   **Large Scale Batch Validation:** When running benchmarks against hundreds or thousands of high-resolution field observations.
*   **Heavy DL Inference:** Leveraging Kaggle's free GPUs (T4 or P100) to load YOLOE, DINOv3, or SigLIP 2 weights.
*   **Reproducibility:** Testing the exact same configurations in a standardized, clean container environment.

### When NOT to Use Kaggle
*   **Production Deployment:** Kaggle is not designed to serve live production web APIs. Do not attempt to run FastAPI as a persistent service here.
*   **Low Latency Real-time Inference:** Loading models inside Kaggle notebooks has overhead and is optimized for batch operations, not single-image low-latency classification.

---

## 📦 How to Prepare the Dataset

Before uploading to Kaggle, you must convert the dataset labels to use relative paths compatible with Kaggle containers. Run the dataset exporter tool:

```bash
python kaggle/prepare_kaggle_dataset.py \
  --labels eval/real_data/labels/real_observations_template.json \
  --images-root eval/real_data/images \
  --output-dir kaggle_dataset_export
```

This generates:
*   `kaggle_dataset_export/real_observations.json` (contains image paths rewritten as `images/filename.jpg`).
*   `kaggle_dataset_export/images/` (contains copies of all referenced images).

---

## ☁️ How to Upload to Kaggle

1.  **Create a Kaggle Dataset:**
    *   Sign in to [Kaggle](https://www.kaggle.com/).
    *   Go to **Datasets** -> **New Dataset**.
    *   Title the dataset `visionsetil-real-data` (or similar).
    *   Upload the contents of `kaggle_dataset_export/` (both the JSON file and the `images/` directory).
    *   Set the dataset to Private or Public, and click **Create**.
2.  **Create a Kaggle Notebook:**
    *   Go to **Code** -> **New Notebook**.
    *   In the right-hand panel, under **Input**, click **Add Data** and select your uploaded dataset.
    *   Upload the `kaggle/vision_setil_kaggle_benchmark.ipynb` file or copy its cell contents into the Kaggle environment.
    *   Enable GPU acceleration in the notebook settings if you plan to load real weights.

---

## 🚀 How to Execute the Benchmark

Execute the runner script inside the notebook environment:

```bash
!python kaggle/run_kaggle_benchmark.py \
  --config kaggle/kaggle_run_config.example.json \
  --max-cases 500 \
  --shuffle \
  --seed 42
```

### Argument Explanations:
*   `--config`: Path to the benchmark run configuration.
*   `--max-cases`: Restricts the run to a specified number of cases (e.g. 50 cases for a quick smoke test, 500 for standard, 2000+ for exhaustive validation).
*   `--shuffle`: Shuffles the observations before execution.
*   `--seed`: The random seed to guarantee reproducible shuffles.
*   `--mode`: Sets staged execution modes if memory optimization is required:
    - `full_pipeline`: Runs detection, embeddings, and ranking in a single pass.
    - `detection_only` / `dino_embeddings_only` / `siglip_embeddings_only` / `fusion_eval_only`: Staged execution to persist intermediate outputs.
*   `--cpu-only`: Disables GPU loading and runs exclusively on CPU.

---

## 📊 How to Interpret Results

Once the run is complete, the outputs are stored in `/kaggle/working/visionsetil_outputs/`.

1.  **Mock Mode Warning:**
    If `model_status.json` reports all models as mocks/fallbacks, the report will contain:
    `"If all models are mocks, this run validates pipeline behavior and safety logic, not biological identification accuracy."`
    Ensure real weights are linked under `/kaggle/input/` to compute actual biological accuracy.
2.  **Taxonomic Accuracy vs. Safety Gates:**
    *   Analyze species accuracy (Top-1, Top-5), genus accuracy, and family accuracy.
    *   Verify `false_safe_rate` is exactly `0.0%` and `safety_policy_violations` is `0`.
3.  **Inspecting Failure Cases:**
    *   Inspect `failure_cases.json` for incorrect predictions.
    *   Review `dangerous_failures.json` to see if high-risk genera (e.g. *Amanita*, *Galerina*) were missed or bypassed human review.
    *   Review `overconfident_wrong_cases.json` to identify where model confidence did not align with correct taxons (confidence $\ge 0.7$ on wrong predictions).

---

## ⚡ When to Migrate to RunPod or Modal

Kaggle is highly convenient but has limitations. Consider migrating to **RunPod** or **Modal** when:
1.  **VRAM Limits:** Kaggle provides up to 16 GB of VRAM. If loading YOLOE-26, DINOv3, and SigLIP 2 simultaneously causes Out Of Memory (OOM) issues (even when utilizing staged execution).
2.  **Execution Time Limits:** Kaggle has a maximum notebook run time limit of 9 hours (or 12 hours). Very large benchmarks with extensive CPU-GPU data transfers might exceed this limit.
3.  **Temporary APIs:** If you need to spin up a temporary, publicly reachable API endpoint of the model stack for testing frontend integrations (Kaggle does not support inbound HTTP requests to notebooks).
