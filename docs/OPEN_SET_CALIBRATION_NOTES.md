# Open-set calibration notes (PR-18)

## Status

Full threshold calibration requires a labeled eval set + optional GPU for embedding
recompute. This document wires the **process** without claiming new MAP@3 numbers.

## Inputs

1. Baseline table must exist in `eval/reports/` before gating product on MAP@3
   (mega plan §4.4).
2. Scripts already present:
   - `eval/scripts/calibrate_open_set.py`
   - `scripts/calibrate_thresholds.py`
3. Runtime thresholds loader: `app.services.species_catalog.load_open_set_thresholds`
   with fallback to settings defaults.

## Procedure (when GPU/eval data available)

1. Build/join species index with catalog synonyms (`scripts/build_species_index_join.py`).
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
