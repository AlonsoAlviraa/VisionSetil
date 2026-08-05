# Loop compare to baseline (latest)

**Generated:** `2026-08-05T20:31:51.109394+00:00`  
**Status:** `compared`  
**product_unlock:** `False` (forced false)  
**Policy:** `orientation_only_never_consume`

Baseline SSOT: `eval/reports/ml_experiments/E20_BASELINE_METRICS_TO_IMPROVE.json`  
Candidate: `eval/reports/ml_experiments/e20c_metrics_snapshot.json`

## Operator action

Compared candidate vs E20 SSOT file. product_unlock=false. Continue lab loop frictions; do not auto-unlock; do not serve posthoc ECE.

## [MEASURED] side-by-side

| Metric | Baseline E20 | Candidate | Δ (cand−base) |
|--------|-------------:|----------:|--------------:|
| MAP@3 | 0.8575265177160878 | 0.8572782667569362 | -0.0002482509591515969 |
| deadly@1 | 0.7895348837209303 | 0.789922480620155 | 0.0003875968992247403 |
| deadly@3 | 0.9217054263565891 | 0.9186046511627907 | -0.0031007751937984773 |
| accuracy | 0.8032498307379824 | 0.8 | -0.003249830737982351 |
| ECE_primary | 0.18741017924867615 | 0.18942074356203395 | 0.0020105643133578044 |
| ECE_posthoc_lab | 0.04544782004819755 | n/a | n/a |

### Summary deltas

- MAP@3: `-0.0002482509591515969`
- deadly@1: `0.0003875968992247403`
- deadly@3: `-0.0031007751937984773`
- ECE primary: `0.0020105643133578044` (higher = worse calibration)

## Dual ECE honesty

- Baseline primary: `train_published` = `0.18741017924867615` (claim_train_published=`True`)
- Candidate primary: `train_published` = `0.18942074356203395` (claim_train_published=`True`)
- Baseline posthoc (lab): `0.04544782004819755`
- Candidate posthoc (lab): `None`

Versions: baseline `v20-E20-source-holdout` · candidate `v20c-E20-mo-inat`  
Protocols: baseline `source_holdout_e20` · candidate `source_holdout_e20c_mo_inat`

## Advisory

`{"map_crash_threshold": -0.05, "deadly3_crash_threshold": -0.05, "map_crash": false, "deadly3_crash": false, "ece_primary_worse_by_gt_0_02": false, "note": "Advisory lab signals only. Never product_unlock. MAP improvement is not safety. ECE primary remains train-published."}`

---

_Orientation only · never consumption · product_unlock=false_
