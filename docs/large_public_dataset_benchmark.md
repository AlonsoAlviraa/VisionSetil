# Large Public Fungi Dataset Benchmarking

This document details the architecture, converters, and procedures to validate the VisionSetil pipeline against large public fungi datasets (FungiCLEF 2025, FungiTastic, and Danish Fungi 2020) on Kaggle.

---

## 🚫 Why Mock Images Are Not Used in Production Benchmarks

Mock or placeholder images (e.g. blank canvases generated programmatically) are useful only for **smoke testing, API verification, and CI/CD pipelines**. They validate that:
*   File formats are supported.
*   System directories exist and write operations succeed.
*   FastAPI routes are fully operational.
*   Latencies remain within thresholds.

However, mock images do not test deep learning classification, bounding box cropping accuracy, or embedding distance representation. **To benchmark biological identification accuracy, you must utilize real field photos.**

---

## 📂 Supported Datasets

VisionSetil includes converters to automatically translate metadata and schemas of three popular public datasets:

### 1. FungiCLEF 2025
*   **Dataset Focus:** Fine-grained mushroom species identification.
*   **Schema Features:** Contains observations with multiple field photos and metadata.
*   **How to attach in Kaggle:** Search for "FungiCLEF 2025" under Kaggle Datasets and link it to your notebook.
*   **Execution config:** `kaggle/configs/fungiclef2025_config.example.json`

> [!WARNING]
> **Do NOT use `FungiCLEF25-SAMPLE_SUBMISSION.csv` for evaluation.** This file only contains `observationId` and `predictions` placeholders and does not include the ground truth or the paths to the physical images. The benchmark runner will automatically reject this file and fail if it cannot locate real taxonomic labels or images. Use the proper train/validation metadata split files (e.g., `FungiTastic-FewShot-Train.csv`).

### 2. FungiTastic
*   **Dataset Focus:** Multimodal fungi dataset.
*   **Schema Features:** Broad species and environmental metadata.
*   **How to attach in Kaggle:** Search for "FungiTastic" and link it.
*   **Execution config:** `kaggle/configs/fungitastic_config.example.json`

### 3. Danish Fungi 2020 (DF20)
*   **Dataset Focus:** Large collection of danish fungi images with exact taxonomic metadata.
*   **Schema Features:** Includes Danish Fungi 2020 metadata file `DF20_metadata.csv`.
*   **How to attach in Kaggle:** Search for "DF20" or "Danish Fungi 2020" and link it.
*   **Execution config:** `kaggle/configs/df20_config.example.json`

---

## 🔑 Kaggle Datasets Access & Terms

Many public datasets (like FungiCLEF or DF20) require you to **accept their terms of service** on the Kaggle website before you can download or link them.
1.  Go to the dataset page on Kaggle (e.g., [FungiCLEF 2025 Page](https://www.kaggle.com/)).
2.  Click **Join Competition** or **Accept Terms** if prompted.
3.  Ensure your Kaggle account has accepted the license constraints before adding the dataset to your Notebook.

---

## 🔄 Schema Conversion Engine

The converter script (`run_large_dataset_benchmark.py`) maps the dataset to the VisionSetil evaluation schema:
1.  **Taxonomy:** Extracts Species, Genus, and Family fields. If Genus is missing, it parses the first word of the Species name.
2.  **Toxicity Gating:** If the dataset does not explicitly list toxic labels, the system infers them conservatively:
    *   **Deadly:** If the species is listed in our local catalog `backend/app/data/poisonous_species.json` and marked as `critical`.
    *   **High or Unknown:** If the genus belongs to high-risk genera (e.g. *Amanita*, *Galerina*, *Cortinarius*, *Lepiota*, *Gyromitra*, *Inocybe*, *Clitocybe*, *Conocybe*).
    *   **Unknown:** Default fallback.
    *   **Safe:** The pipeline **never** maps any species as safe.

---

## 🚀 Execution & Scaling Up

You can scale the evaluation population from quick smoke tests to serious validation runs:

```bash
# 1. Inspect dataset columns and previews
python kaggle/inspect_kaggle_dataset.py --dataset-root /kaggle/input/fungi-clef-2025

# 2. Run a smoke test (50 cases)
python kaggle/run_large_dataset_benchmark.py --config kaggle/configs/fungiclef2025_config.example.json --max-cases 50

# 3. Run a medium benchmark (500 cases, risk-balanced)
python kaggle/run_large_dataset_benchmark.py --config kaggle/configs/fungiclef2025_config.example.json --max-cases 500 --risk-balanced

# 4. Run an exhaustive validation (2000+ cases)
python kaggle/run_large_dataset_benchmark.py --config kaggle/configs/fungiclef2025_config.example.json --max-cases 2000 --shuffle
```

### Sampling Types:
*   `--risk-balanced`: Ensures deadly, high-risk, and unknown risk observations are balanced equally in the sample.
*   `--genus-balanced`: Balances case representation across taxonomic genera.
*   `--include-dangerous-genera`: Prioritizes observations belonging to poisonous genera (*Amanita*, *Galerina*, etc.).

---

## 📊 Output Interpretations

The run outputs the following files under `/kaggle/working/visionsetil_outputs/`:
*   `large_dataset_summary.md` and `large_dataset_summary.json`: Detailed characteristics of the benchmark population.
*   `real_report.json` and `real_report.md`: Pipeline taxonomic and safety metrics.

⚠️ **Mock Warning:** If the model stack status in `large_dataset_summary.md` indicates that backends are fallback mocks, **the metrics do not evaluate biological accuracy.** Real model weights must be linked to measure correct biological classification rates.
