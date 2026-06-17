# VisionSetil Real Model Benchmark Report

## Executive Summary

- **Readiness Level:** `NOT_READY_FOR_PRODUCTION`
- **Readiness Analysis:** Model in fallback/mock mode, insufficient dataset size (< 100 cases), lack of dangerous validation cases, or safety violations.
- **Total Safety Violations:** 0
- **False Safe Rate:** 0.00% (Must be 0.0%)
- **Average Latency:** 0.00 ms

> [!WARNING]
> This evaluation validates pipeline behavior and safety logic, not biological identification accuracy.

## Model Status

| Model | Requested | Backend | Loaded | Device | Details |
| --- | --- | --- | --- | --- | --- |
| detector | YOLOE-26 | mock_yoloe_fallback | False | auto | None |
| visual_embedder | DINOv3 | mock_dinov3_fallback | False | auto | 1024 |
| image_text_embedder | SigLIP 2 | mock_siglip2_fallback | False | auto | 768 |


## Dataset

- **Dataset Path:** `eval/real_data/labels/real_observations_template.json`
- **Total Cases:** 1
- **Evaluated:** 0
- **Skipped (Missing Images):** 1

## Biological Identification Metrics

| Metric | Value | Description |
| --- | --- | --- |
| Species Top-1 Accuracy | 0.00% | Exact species match rate |
| Species Top-5 Accuracy | 0.00% | Expected species in top 5 list |
| Genus Accuracy | 0.00% | Correct genus match rate |
| Family Accuracy | 0.00% | Correct taxonomic family match rate |
| Risk Level Accuracy | 0.00% | Risk classification alignment rate |


## Safety Metrics

| Metric | Value | Description |
| --- | --- | --- |
| False Safe Rate | 0.00% | Deadly predicted as safe (Must be 0.0%) |
| Toxic Not Flagged Rate | 0.00% | Dangerous genus/risk without toxic label |
| Overconfident Wrong Rate | 0.00% | Wrong predictions with conf >= 0.7 |
| Safety Violations count | 0 | Total policy checklist failures |


## Open-Set Rejection Metrics

| Metric | Value | Description |
| --- | --- | --- |
| Open-Set Rejection Rate | 0.00% | Overall rejection percentage |
| Open-Set True Positive Rate | 0.00% | Correct rejection rate of target cases |
| Open-Set False Positive Rate | 0.00% | Rejection rate of clear edible cases |


## Human Review Metrics

| Metric | Value | Description |
| --- | --- | --- |
| Human Review Rate | 0.00% | Overall recommendation percentage |
| HR Recall on Dangerous Cases | 0.00% | HR coverage of deadly/high risk cases |
| Dangerous bypass rate | 0.00% | Dangerous cases missed by HR |


## Detector Evaluation

- **Detector Backend:** `mock_yoloe_fallback`
- **Total Images:** 0
- **Detection Cobertura Rate:** 0.00%
- **Mean Detection Confidence:** 0.00%
- **Full Image Fallback Rate:** 0.00%
- **Crops Created:** 0
- **Masks Created:** 0

## Embedding Evaluation

- **Visual Backbone Backend:** `mock_dinov3_fallback`
- **Embedding Dimension:** 1024
- **Normalización L2:** True
- **Embedding Cache Hit Rate:** 0.00%
- **Pairwise similarity (Same Genus):** 0.0000
- **Pairwise similarity (Different Genus):** 0.0000
- **Separabilidad status:** `not_enough_data`

## Calibration

- **Expected Calibration Error (ECE):** 0.0000
- **Mean Confidence of Correct:** 0.0000
- **Mean Confidence of Wrong:** 0.0000

| Bin | Count | Accuracy | Mean Confidence |
| --- | --- | --- | --- |


## Confusion Matrices

- Ver matrices completas en:
  * `eval/reports/confusion_species.csv`
  * `eval/reports/confusion_genus.csv`
  * `eval/reports/confusion_risk_level.csv`


## Dangerous Failure Cases

| ID | Expected Taxon | Predicted Top-1 | Confidence | Open-Set Rejected | Human Review |
| --- | --- | --- | --- | --- | --- |
| None | - | - | - | - | - |


## Overconfident Wrong Cases

| ID | Expected Taxon | Predicted Top-1 | Confidence | Safety Audit |
| --- | --- | --- | --- | --- |
| None | - | - | - | - |


## Skipped Cases

| ID | Expected Taxon | Status |
| --- | --- | --- |
| real_001 | Amanita phalloides | skipped_missing_images |


## Production Readiness Assessment

**Readiness Level:** `NOT_READY_FOR_PRODUCTION`

**Justificación:** Model in fallback/mock mode, insufficient dataset size (< 100 cases), lack of dangerous validation cases, or safety violations.
