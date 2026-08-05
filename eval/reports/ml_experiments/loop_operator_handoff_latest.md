# Loop operator handoff (latest)

**Generated:** `2026-08-05T19:51:48.677348+00:00`  
**Status:** `ready_for_lab_loop`  
**Policy:** `orientation_only_never_consume`  
**product_unlock:** `False` (forced false)  
**can_stage_train_notebook:** `True`  
**Lab only:** `True` · **kaggle_push:** `False`

## Operator action

Rails green + SSOT metrics present. Continue lab loop (E20b diagnose / E20c pull / friction iters). Stage notebook only via stage script; never auto push; never product_unlock.

## Measured metrics (SSOT)

Source file: `C:\Users\Mariano\.grok\worktrees\alonsoo-visionsetil\subagent-019fd375-fbc5-7073-a1f6-8d12395a30d0\eval\reports\ml_experiments\E20_BASELINE_METRICS_TO_IMPROVE.json`  
Label: `[MEASURED]` — copy values; do not invent / hardcode in PR titles.

| Metric | [MEASURED] |
|--------|------------|
| MAP@3 | 0.8575 |
| deadly@1 | 0.7895 |
| deadly@3 | 0.9217 |
| n_deadly | 2580 |
| ECE primary (train-published) | 0.1874 |
| ECE posthoc (lab-only) | 0.0454 |
| version | `v20-E20-source-holdout` |
| eval_protocol | `source_holdout_e20` |
| test_domain | `gbif_es_only` |

### Soft gates (advisory only)

- soft MAP@3 ≥ 0.25: `True`
- soft deadly@3 ≥ 0.9: `True`
- dual deadly keys: `True`

> Soft gates never authorize product_unlock, forage, or consumption.

## Dual ECE honesty

- **Primary:** train-published = `0.1874`
- **Posthoc (separate, no serve):** `0.0454`
- temperature_train: `1.5812190771102905` · temperature_posthoc: `2.899999999999997`

## Anti-leak rails

- rails status: `rails_green_can_stage`
- can_stage: `True`
- report: `C:\Users\Mariano\.grok\worktrees\alonsoo-visionsetil\subagent-019fd375-fbc5-7073-a1f6-8d12395a30d0\eval\reports\ml_experiments\anti_leak_rails_train_latest.json`
- fail_reasons: `none`
- gaps: `none`

## Pipeline next

- 1) verify_anti_leak_rails_for_train.py (this handoff embeds rails)
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

---

_Orientation only · never consumption · product_unlock=false_
