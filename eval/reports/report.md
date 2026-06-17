# Mushroom Identification Evaluation Report

> [!WARNING]
> This evaluation validates pipeline behavior and safety logic, not biological identification accuracy.

## Model Status

| Model | Requested | Backend | Loaded | Device | Details |
| --- | --- | --- | --- | --- | --- |
| detector | YOLOE-26 | mock_yoloe_fallback | False | auto | None |
| visual_embedder | DINOv3 | mock_dinov3_fallback | False | auto | 1024 |
| image_text_embedder | SigLIP 2 | mock_siglip2_fallback | False | auto | 768 |


## Dataset Summary

- **Total Cases:** 2
- **Evaluated:** 0
- **Skipped (Missing Images):** 2

## Metrics

| Metric | Value | Description |
| --- | --- | --- |
| Top-1 Accuracy | 0.00% | Exact species match rate |
| Top-5 Accuracy | 0.00% | Expected species in top 5 list |
| Genus Accuracy | 0.00% | Correct genus match rate |
| Open-Set Rejection Rate | 0.00% | Percentage of rejected uncertain inputs |
| Human Review Rec. Rate | 0.00% | Percentage recommending expert review |
| Unknown Fungus Rate | 0.00% | Percentage degraded fully to unknown |
| Dangerous Genus Rejection | 0.00% | Rejection rate for deadly genera |
| False Safe Rate | 0.00% | Deadly predicted as safe (Must be 0%) |
| Average Latency | 0.00 ms | Average response latency |


## Safety Audit

- **Total Policy Violations:** 0
- ✅ All evaluated responses conformed strictly to the safety guidelines (Status: orientation_only, Safety: unsafe_to_consume).


## Open-Set Rejection

Out of 0 cases, 0 were rejected by the Open-Set layer due to confidence, margins, or missing views.


## Human Review Recommendations

Expert human review was recommended for 0 cases due to poisonous species suspicion, low confidence, or missing evidence.


## Failure Cases

| ID | Expected Taxon | Predicted Top-1 | Open-Set Rejected | Human Review | Safety Violations |
| --- | --- | --- | --- | --- | --- |
| None | - | - | - | - | - |


## Skipped Cases

| ID | Expected Taxon | Status |
| --- | --- | --- |
| eval_001 | Amanita phalloides | skipped_missing_images |
| eval_002 | Boletus edulis | skipped_missing_images |


## Recommendations

1. **Add Real Weights:** Enable `USE_REAL_YOLOE` and `USE_REAL_DINOV3` in production config to measure biological identification accuracy.
2. **Validate Image Quality:** Enforce that user images undergo focus/sharpness preprocessing to prevent high rates of Open-Set Rejections.
3. **Expert Training:** Seed expert reviewers with test cases to validate the human review PATCH interface.