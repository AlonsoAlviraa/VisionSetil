# Kaggle Run Summary

- **Timestamp:** 2026-06-17 10:02:10
- **Run Mode:** `full_pipeline`
- **Execution Time:** 0.92 seconds
- **Evaluated Cases:** 2 (Max cases limit: 100)
- **GPU Device Name:** Tesla P100-PCIE-16GB
- **Computation Backend:** cuda

## Model Stack Backend Status
- **detector:** `mock_yoloe_fallback` (Loaded: False)
- **visual_embedder:** `mock_dinov3_fallback` (Loaded: False)
- **image_text_embedder:** `mock_siglip2_fallback` (Loaded: False)

### Output Artifacts
- `confusion_species.csv` (26 bytes)
- `overconfident_wrong_cases.json` (2 bytes)
- `dangerous_failures.json` (2 bytes)
- `confusion_risk_level.csv` (26 bytes)
- `model_status.json` (670 bytes)
- `confusion_genus.csv` (26 bytes)
- `real_report.json` (2891 bytes)
- `real_report.md` (4126 bytes)
- `failure_cases.json` (2 bytes)

> [!WARNING]
> If all models are mocks, this run validates pipeline behavior and safety logic, not biological identification accuracy.
