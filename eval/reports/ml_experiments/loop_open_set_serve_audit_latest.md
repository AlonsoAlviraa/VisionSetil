# Loop iter 51 — open-set serve audit

**generated_at:** `2026-08-05T20:50:13.633943+00:00`  
**status:** `audit_ok_with_gaps`  
**checkpoint:** `e20c`  
**eval_protocol:** `source_holdout_e20c_mo_inat`  
**metrics_label:** [MEASURED]  
**product_unlock:** `False` (forced false)  
**policy:** `orientation_only_never_consume`

## Serve thresholds (active file)

| Field | Value |
|-------|------:|
| path | `eval/reports/open_set_thresholds.json` |
| status | `calibrated_e20_holdout` |
| conf thr | 0.92 |
| margin thr | 0.05 |
| entropy thr | 0.15 |
| calibrated | True |

## Holdout under serve thr [MEASURED]

| Metric | Value |
|--------|------:|
| n | 7385 |
| reject_rate | 0.2166553825321598 |
| acc_keep | 0.8836646499567848 |
| deadly_reject_rate | 0.052538930264048746 |
| deadly_at3_among_kept | 0.9603102189781022 |
| wrong_kept | 673 |
| correct_rejected | 796 |

## Serve vs recommended grid (orientation recompute)

| | serve | recommended |
|--|------:|------------:|
| conf | 0.92 | 0.88 |
| margin | 0.05 | 0.05 |
| entropy | 0.15 | 0.15 |
| reject_rate | 0.2166553825321598 | 0.2166553825321598 |
| acc_keep | 0.8836646499567848 | 0.8836646499567848 |
| deadly_reject | 0.052538930264048746 | 0.052538930264048746 |

## Checkpoint metrics [MEASURED]

| Metric | Value |
|--------|------:|
| MAP@3 | 0.8572782667569362 |
| deadly@1 | 0.789922480620155 |
| deadly@3 | 0.9186046511627907 |
| accuracy | 0.8 |
| ECE primary (train_published) | 0.18942074356203395 |
| ECE posthoc (separate) | None |

## Frictions / gaps

- frictions: `['legacy_multiview_thr_rejects_near_zero', 'serve_conf_differs_from_recommended_grid']`
- gaps: `[]`

## Operator action

Open-set serve audit complete. product_unlock remains false. Do not hide reject UX. Continue loop frictions (deadly@1 / lookalike hotspots / ECE dual). Do not auto-rewrite thresholds from this audit alone — operator reviews frictions first. Checkpoint: E20c (preferred).

## Honesty

- product_unlock / can_auto_unlock / forage / consumption = **false**
- fresh `generated_at` — does not rely on historical loop_iter alone
- does **not** auto-write serve thresholds
- open-set reject UX must remain visible (no product chrome hide)

