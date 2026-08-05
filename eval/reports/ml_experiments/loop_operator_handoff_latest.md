# Loop operator handoff (latest)

**Generated:** `2026-08-05T20:01:27.070044+00:00`  
**Status:** `ready_for_lab_loop`  
**Policy:** `orientation_only_never_consume`  
**product_unlock:** `False` (forced false)  
**can_stage_train_notebook:** `True`  
**Lab only:** `True` · **kaggle_push:** `False`

> **Cite JSON SSOT only** for PR bodies (`E20_BASELINE_METRICS_TO_IMPROVE.json`).  
> MD table uses full-precision measured floats for display; do not invent or re-round.

> Handoff is **non-gating** by default (exit 0). Rails fail-closed: `scripts/verify_anti_leak_rails_for_train.py` (or handoff `--gate-on-rails`).

## Operator action

Rails green + SSOT metrics present. Continue lab loop (E20b diagnose / E20c pull / friction iters). Stage notebook only via stage script; never auto push; never product_unlock. (soft_gates_advisory dual_deadly=True both_soft=True (never unlock))

## Measured metrics (SSOT)

Source file: `eval/reports/ml_experiments/E20_BASELINE_METRICS_TO_IMPROVE.json`  
Label: `[MEASURED]` — full precision below; copy from JSON SSOT for PRs.

| Metric | [MEASURED] |
|--------|------------|
| MAP@3 | 0.8575265177160878 |
| deadly@1 | 0.7895348837209303 |
| deadly@3 | 0.9217054263565891 |
| n_deadly | 2580 |
| ECE primary (train_published) | 0.18741017924867615 |
| ECE posthoc (lab-only) | 0.04544782004819755 |
| claim_train_published | `True` |
| primary_source | `test_ece_train_published` |
| version | `v20-E20-source-holdout` |
| eval_protocol | `source_holdout_e20` |
| test_domain | `gbif_es_only` |

### Soft gates (advisory only)

- soft MAP@3 ≥ 0.25: `True`
- soft deadly@3 ≥ 0.9: `True`
- dual deadly keys: `True`

> Soft gates never authorize product_unlock, forage, or consumption.

## Dual ECE honesty

- **Primary label:** `train_published` = `0.18741017924867615` (source=`test_ece_train_published`, claim_train_published=`True`)
- **Posthoc (separate, no serve):** `0.04544782004819755`
- temperature_train: `1.5812190771102905` · temperature_posthoc: `2.899999999999997`

## Anti-leak rails

- rails status: `rails_green_can_stage`
- can_stage: `True`
- report: `eval/reports/ml_experiments/anti_leak_rails_train_latest.json`
- fail_reasons: `none`
- gaps: `none`

## Pipeline next

- 1) verify_anti_leak_rails_for_train.py (gating exit; this handoff is non-gating unless --gate-on-rails)
- 2) E20b diagnose JSON always before any relaunch (≤1 auto if rails OK)
- 3) E20c pull + post_train_suite + compare vs SSOT file
- 4) Fresh loop_iter frictions (open-set / deadly@1 / hotspots / ECE dual)
- 5) stage_train_notebook_if_rails_ok.py only if can_stage — no auto push

## Never

- auto product_unlock=true
- pick max(MAP) across kernels for serve gate
- contaminate GBIF ES holdout
- sell posthoc ECE as primary
- forage or consumption permission
- invent version/protocol/ECE provenance

---

_Orientation only · never consumption · product_unlock=false_
