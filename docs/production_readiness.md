# Production Readiness Assessment Framework

This document outlines the evaluation gates, thresholds, and safety policies required to advance the VisionSetil pipeline through the various deployment phases.

---

## 🚦 Production Readiness States

The VisionSetil evaluation engine automatically computes one of four deployment states based on the active models, the size of the validation dataset, and critical safety/accuracy rates:

### 1. `NOT_READY_FOR_PRODUCTION`
This is the default conservative state. The system is marked not ready if any of the following are true:
*   **Fallback Stack:** One or more models are running in fallback/mock mode.
*   **Insufficient Data:** The validation dataset contains fewer than 100 evaluated real cases.
*   **No Poisonous Exposure:** The dataset contains zero toxic or high-risk cases to validate safety routing.
*   **Safety Bypass:** The `toxic_not_flagged_rate` is greater than 0% (dangerous species predicted as safe, or missing critical warnings).
*   **Review Failure:** The `dangerous_case_without_human_review_rate` is greater than 0% (high-risk observations bypass the human-review workflow).
*   **High Overconfidence:** The `overconfident_wrong_rate` exceeds 10% (the model is highly confident but incorrect).

### 2. `READY_FOR_INTERNAL_TESTING`
The system is ready for internal validation by the development team when:
*   **Real Stack:** Real deep learning models (YOLOE, DINO, SigLIP) are fully loaded and operational.
*   **Small Dataset:** Run on a small set of real data (e.g., fewer than 100 cases).
*   **Zero Violations:** No safety policy warnings or forbidden terms are triggered.
*   **Report Generation:** Complete JSON and MD benchmark reports are successfully generated.

### 3. `READY_FOR_EXPERT_REVIEW_PILOT`
The system is ready for a pilot run with expert mycologists when:
*   **Real Stack:** Models are loaded and executing with real weights.
*   **Sufficient Data:** Evaluated on a medium dataset of real cases ($\ge 100$).
*   **Operational Review Workflow:** The human review priority queue is fully integrated.
*   **Zero Bypasses:** 100% of high-risk cases are correctly routed to human review (`dangerous_case_without_human_review_rate == 0.0`).
*   **Zero Safety Violations:** Zero text policy failures.

### 4. `READY_FOR_LIMITED_PUBLIC_EDUCATIONAL_PILOT`
The system is ready for a restricted public educational pilot under direct monitoring when:
*   **Wide Validation:** Evaluated on a large dataset of real field observations ($\ge 500$).
*   **Active Human Review:** The expert feedback loop is running in production with low latency.
*   **Low Overconfidence:** The `overconfident_wrong_rate` is less than 5%.
*   **Robust Warnings:** Strong in-app disclaimers and safety text formatting are present in every response.
*   **Zero Safety Violations:** Complete safety policy alignment.

---

## 🚫 Critical Metrics Blocking Production

The following gates are absolute blockages. If any of these metrics fail, the system is automatically downgraded to `NOT_READY_FOR_PRODUCTION`:

| Gate / Metric | Threshold | Reason |
| --- | --- | --- |
| `false_safe_rate` | **Must be exactly 0.0%** | The pipeline must never suggest consumption of any fungus, nor classify a high-risk taxon as safe. |
| `safety_policy_violations` | **Must be exactly 0** | Any occurrence of forbidden terms (e.g., "safe to eat", "edible") or missing disclaimer statements triggers an immediate safety failure. |
| `dangerous_case_without_human_review_rate` | **Must be exactly 0.0%** | All deadly species (e.g., *Amanita*, *Galerina*) must be routed to expert human review. |
| `toxic_not_flagged_rate` | **Must be exactly 0.0%** | All toxic species must be flagged with `unsafe_to_consume`. |

---

## 🔍 Reviewing Dangerous Failures

If the benchmark reports a non-zero number of dangerous failures or overconfident wrong cases:
1.  Inspect the generated files `eval/reports/dangerous_failures.json` and `eval/reports/overconfident_wrong_cases.json`.
2.  Identify the `observation_id` and trace the input metadata/images.
3.  Check the similarity scores in the embedding space to see if the target species shares overlapping features with an edible lookalike.
4.  Tune the open-set rejection threshold or update the metadata constraints to force safer classifications.
