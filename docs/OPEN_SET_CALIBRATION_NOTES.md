# Open-set calibration notes (PR-18)

## Status

**E20 holdout (2026-07-27):** softmax conf/margin calibrated offline from
`kaggle/kernel_output_v20/models/test_predictions.npz` via
`kaggle/ml_qa/open_set_holdout.py` (professional tester **S8**).

| Item | Value |
|------|------:|
| conf thr | **0.92** |
| margin thr | **0.05** (product floor) |
| entropy thr (nats) | **0.15** secondary |
| holdout reject rate | ≈0.182 (conf+margin+H) |
| acc among kept | ≈0.881 |
| mate@3 (SSOT pairs) | ≈0.105 |
| product_unlock | **false** |

Artifacts: `eval/reports/open_set_thresholds.json` (status=`calibrated_e20_holdout`).
MultiView prefers this file when present. Orientation only — never consumption.

Legacy multiview defaults 0.10/0.0 reject **~0%** on E20 (overconfident top-1).

### Centroids (v1.3.7)

- Source: `arcface.weight` from E20 `best.pt` → `kaggle/kernel_output_v20/models/class_centroids.npy` (40×576)
- Export: `python scripts/export_e20_class_centroids.py`
- MultiView auto-extracts + persists on first load if npy missing
- Cosine thr: `settings.model_open_set_threshold` (default 0.55)

### Live reject monitor (S9)

- Reads `data/feedback/classification_log.jsonl` (or `FEEDBACK_LOG_PATH`)
- Pro tester S9 + `/models/status.live_reject_monitor` + ML dashboard S9 ops panel
- Missing log → status `no_log` / suite **SKIP**; empty file → `empty` / **SKIP** (not FAIL)
- Populated log → `ok` with `n_entries`, `reject_rate`, non-empty `reasons` / `reason_histogram` when rejects exist
- **Windows:** `24h` / `7d` / `30d` / `all` + `reject_rate_7d` · advisory `health_flags` (sparse_sample, high_reject_rate_advisory, …)
- Fixture: `data/feedback/fixtures/s9_mixed_reject.jsonl` (timestamped for windows)
- Report: `python -m kaggle.ml_qa.live_reject_monitor --write` → `eval/reports/ml_experiments/s9_live_reject_latest.json`
- Always `product_unlock: false` on the live block

### Operator unlock package (punto 2)

- Regenerable: `python -m kaggle.ml_qa.gate_eval` →
  `eval/reports/ml_experiments/operator_unlock_checklist.{json,md}`
- Fail-closed: `product_unlock` / `can_auto_unlock` always false; metrics →
  `unlock_eligible_advisory` only; residual lock includes operator_cycle
- Never forage/consumption permission
- Operator runbook: `docs/OPERATOR_UNLOCK_RUNBOOK.md` (human decision gate; never auto-flip)
- Dashboard: `/ml` + `GET /models/status` → `product_unlock_eval`, `live_reject_monitor`, `operator_unlock_ops`

## Inputs

1. Baseline table must exist in `eval/reports/` before gating product on MAP@3
   (mega plan §4.4).
2. Scripts already present:
   - `kaggle/ml_qa/open_set_holdout.py` (E20 npz path; S8)
   - `eval/scripts/calibrate_open_set.py`
   - `scripts/calibrate_thresholds.py`
3. Runtime thresholds loader: `app.services.species_catalog.load_open_set_thresholds`
   with fallback to settings defaults.

## Procedure (when GPU/eval data available)

1. Build/join model labels with catalog_v2 (`scripts/build_species_index_join.py`;
   B-39 / D-B25: nightly + on-demand, not per-PR CI). Nightly workflow artifact is
   operational truth; committed `species_index_join_report.json` is a baseline snapshot.
2. Run open-set calibration script on held-out observations.
3. Write `open_set_thresholds.json` with:
   - `calibrated_threshold`
   - `calibrated_margin`
   - `status: calibrated`
4. Point env `OPEN_SET_THRESHOLDS_PATH` at the file.
5. Re-run safety eval: **false_safe_rate = 0**, **toxic_not_flagged_rate = 0**.

## Product gate (no GPU this session)

- Do **not** claim improved MAP@3 without baseline table.
- Mock classifier remains honest via `/readyz` `classifier_mode`.
- Safety blacklist + D16 surface rules remain the hard product gates for P0.

## Latency stretch

p95 GPU latency targets from the mega plan are stretch goals; they do not block
P0 product delivery.
