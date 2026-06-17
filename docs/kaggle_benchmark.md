# Kaggle Cloud Benchmarking Guide

This document describes how to execute the VisionSetil evaluation suite in a Kaggle cloud environment, supporting both local custom uploads and large public datasets.

---

## 🎯 Objectives

By offloading pipeline evaluation to Kaggle's free GPU/CPU runtimes, you can test VisionSetil against large observation sets without relying on local hardware constraints.

Kaggle is used as a **batch evaluation benchmark environment**, not as a persistent production API host.

---

## 📂 Benchmarking Datasets

VisionSetil supports two types of datasets on Kaggle:

### 1. Large Public Fungi Datasets (Recommended)
You can directly link public datasets available on Kaggle:
*   **FungiCLEF 2025** (fine-grained identification)
*   **FungiTastic** (multimodal few-shot focus)
*   **Danish Fungi 2020 / DF20** (large collection with robust metadata)

*See [docs/large_public_dataset_benchmark.md](./large_public_dataset_benchmark.md) for detailed instructions on converting and executing benchmarks against public datasets.*

### 2. Custom Labeled Datasets
If you wish to test a custom folder of field observations:
1.  Package the images and labels locally using `kaggle/prepare_kaggle_dataset.py`.
2.  Upload the generated `kaggle_dataset_export/` folder as a new private dataset on Kaggle.
3.  Add it to your notebook under `/kaggle/input/`.

---

## 🚀 How to Execute Benchmarks in Kaggle

Open the Jupyter Notebook template `kaggle/vision_setil_kaggle_benchmark.ipynb` inside your Kaggle session and execute the cells.

### Custom Upload Benchmark:
```bash
!python kaggle/run_kaggle_benchmark.py \
  --config kaggle/kaggle_run_config.example.json \
  --max-cases 500 \
  --shuffle
```

### Public Dataset Benchmark (FungiCLEF 2025 Example):
```bash
# 1. Inspect metadata structure
!python kaggle/inspect_kaggle_dataset.py --dataset-root /kaggle/input/fungi-clef-2025

# 2. Run benchmark with risk-balanced sampling
!python kaggle/run_large_dataset_benchmark.py \
  --dataset-name fungiclef2025 \
  --dataset-root /kaggle/input/fungi-clef-2025 \
  --output-dir /kaggle/working/visionsetil_outputs \
  --max-cases 500 \
  --shuffle \
  --seed 42 \
  --risk-balanced
```

---

## 📊 Summary Outputs & Verification

Benchmark outputs are stored under `/kaggle/working/visionsetil_outputs/`:
1.  **`large_dataset_summary.md`:** Describes converted dataset properties (species count, risk level breakdown, etc.).
2.  **`real_report.md`:** Primary accuracy, ECE calibration error, and safety metrics.
3.  **`dangerous_failures.json`:** Detailed information on dangerous lookalike failures and human-review bypasses.
4.  **`confusion_species.csv`:** Full error breakdown mapping target species to predicted species.
