# Loop iter 53 — ECE dual honesty (posthoc lab)

**Generated:** `2026-08-05T21:03:04.059713+00:00`  
**Status:** `measured_ok`  
**Artifact:** `loop_iter_53_ece_posthoc_2026-08-05`  
**Policy:** `orientation_only_never_consume`  
**product_unlock:** `False` (forced false)  
**Lab only:** `True` · **kaggle_push:** `False`

> Cite JSON for PR bodies. Full-precision [MEASURED] only. Primary ECE ≠ posthoc.

## Provenance

- checkpoint: `C:\Users\Mariano\Documents\ALONSOO\VISIONSETIL\kaggle\kernel_output_v20\models`
- version: `v20-E20-source-holdout`
- eval_protocol: `source_holdout_e20`
- train: `fungitastic_plus_soft_non_gbif` · test: `gbif_es_only`

## Dual ECE honesty

| Channel | Value | Definition / notes |
|---------|------:|--------------------|
| **PRIMARY train-published** | 0.18741017924867615 | `test_ece_train_published` · claim=`True` · band=`high` |
| Primary definition | — | naive_mean_abs_maxprob_minus_correct (as published test_ece) |
| temperature_train | 1.5812190771102905 | metrics train-published T |
| POSTHOC T* (lab) | 2.899999999999997 | min 15-bin ECE on holdout |
| posthoc ece_binned_15 @T* | 0.04544782004819755 | objective only |
| posthoc ece_naive @T* | 0.2564976358194531 | often **worse** than primary naive |

Note: Primary ECE is train-published only. Posthoc T* search is lab-only and must not replace primary in serve or unlock gates. Binned ECE improvement does not imply naive ECE improvement.

## Recomputed at train T vs posthoc T*

| | T | ece_naive | ece_binned_15 | top1 | mean_conf |
|-|--:|----------:|--------------:|-----:|----------:|
| train | 1.5812190771102905 | 0.18741017820230482 | 0.14870422026184088 | 0.8032498307379824 | 0.9519540509998232 |
| posthoc T* | 2.899999999999997 | 0.2564976358194531 | 0.04544782004819755 | 0.8032498307379824 | 0.7925723746292545 |

top1_unchanged under scalar T: `True`

## Kernel metrics.json (cited)

- test_ece: `0.18741017924867615`
- test_ece_train_published: `0.18741017924867615`
- test_ece_posthoc (prior sidecar): `0.04544782004819755`
- temperature / train / posthoc: `1.5812190771102905` / `1.5812190771102905` / `2.899999999999997`
- MAP@3: `0.8575265177160878` · deadly@3: `0.9217054263565891`

## Open-set lab sidecar (NOT serve)

- conf=0.74 margin=0.05 entropy=2.0
- reject_rate=0.24170616113744076 acc_keep=0.8876785714285714

## Grid best 5 by binned ECE

| T | ece_binned_15 | ece_naive | top1 |
|--:|--------------:|----------:|-----:|
| 2.899999999999997 | 0.04544782004819755 | 0.2564976358194531 | 0.8032498307379824 |
| 2.799999999999997 | 0.04806262105458718 | 0.2462881825549679 | 0.8032498307379824 |
| 2.849999999999997 | 0.0481231684115152 | 0.25129484780180045 | 0.8032498307379824 |
| 2.9499999999999966 | 0.05006455628855512 | 0.2618885808558974 | 0.8032498307379824 |
| 2.7499999999999973 | 0.050328646379981606 | 0.24148468552191477 | 0.8032498307379824 |

## Gaps

`posthoc_T_star_worsens_naive_ece_vs_train_T`

## Never

- product_unlock=true
- sell posthoc ECE as primary
- auto-rewrite serve open_set_thresholds.json
- forage / consumption permission
- invent metrics

---

_Orientation only · never consumption · product_unlock=false_
