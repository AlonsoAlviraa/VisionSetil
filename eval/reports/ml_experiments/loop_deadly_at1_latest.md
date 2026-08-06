# Loop iter 51 — deadly@1 analysis

**Generated:** `2026-08-05T20:51:27.115280+00:00`  
**Status:** `measured_ok`  
**Artifact:** `loop_iter_51_deadly_at1_2026-08-05`  
**Policy:** `orientation_only_never_consume`  
**product_unlock:** `False` (forced false)  
**Lab only:** `True` · **kaggle_push:** `False`

> Cite JSON SSOT / this loop_iter JSON for PR bodies. Full-precision [MEASURED] only.

## Provenance

- checkpoint: `C:\Users\Mariano\Documents\ALONSOO\VISIONSETIL\kaggle\kernel_output_v20\models`
- version: `v20-E20-source-holdout`
- eval_protocol: `source_holdout_e20`
- train: `fungitastic_plus_soft_non_gbif` · test: `gbif_es_only`
- deadly_set: `data/industrial_v1/deadly_set.json`

## Dual deadly [MEASURED from npz]

| Metric | Value |
|--------|-------|
| deadly@1 | 0.7895348837209303 |
| deadly@3 | 0.9217054263565891 |
| n_deadly | 2580 |
| MAP@3 (recomputed) | 0.8575265177160912 |
| top1 (recomputed) | 0.8032498307379824 |

Definition: true deadly class is top-1 among deadly-labeled samples (diagnostic)

Note: deadly@1 is diagnostic only — product gate uses dual keys + open-set; never 100% claim

## Kernel metrics.json (cited)

- deadly@1: `0.7895348837209303`
- deadly@3: `0.9217054263565891`
- n_deadly: `2580`

## E20 SSOT baseline (cited)

- deadly@1: `0.7895348837209303`
- deadly@3: `0.9217054263565891`
- MAP@3: `0.8575265177160878`

## Dual ECE honesty

- primary: `train_published` = `0.18741017924867615` (source=`test_ece_train_published`, claim=`True`)
- posthoc (separate): `0.04544782004819755`

## Per-taxon deadly breakdown (worst top1 first)

| Taxon | n | top1 | top3 | Top confusion |
|-------|--:|-----:|-----:|---------------|
| Lepiota subincarnata | 57 | 0.0 | 0.47368421052631576 | Lepiota cristata (37, 0.649) |
| Cortinarius rubellus | 1 | 0.0 | 0.0 | Laccaria laccata (1, 1.000) |
| Galerina marginata | 338 | 0.44970414201183434 | 0.8609467455621301 | Laccaria laccata (96, 0.284) |
| Lepiota castanea | 82 | 0.5487804878048781 | 0.926829268292683 | Lepiota cristata (16, 0.195) |
| Paxillus involutus | 368 | 0.6847826086956522 | 0.875 | Hygrophoropsis aurantiaca (32, 0.087) |
| Amanita virosa | 7 | 0.8571428571428571 | 1.0 | Amanita citrina (1, 0.143) |
| Amanita phalloides | 400 | 0.8575 | 0.9475 | Amanita virosa (20, 0.050) |
| Amanita pantherina | 400 | 0.8975 | 0.94 | Amanita citrina (12, 0.030) |
| Hypholoma fasciculare | 400 | 0.9175 | 0.9475 | Kuehneromyces mutabilis (9, 0.022) |
| Amanita muscaria | 400 | 0.965 | 0.985 | Amanita rubescens (3, 0.007) |
| Gyromitra esculenta | 127 | 1.0 | 1.0 |  |

## FT focus candidates (top1 < 0.5 or misses ≥ 10)

- **Lepiota subincarnata** n=57 top1=0.0 top3=0.47368421052631576 → confuses as Lepiota cristata (37)
- **Cortinarius rubellus** n=1 top1=0.0 top3=0.0 → confuses as Laccaria laccata (1)
- **Galerina marginata** n=338 top1=0.44970414201183434 top3=0.8609467455621301 → confuses as Laccaria laccata (96)
- **Lepiota castanea** n=82 top1=0.5487804878048781 top3=0.926829268292683 → confuses as Lepiota cristata (16)
- **Paxillus involutus** n=368 top1=0.6847826086956522 top3=0.875 → confuses as Hygrophoropsis aurantiaca (32)
- **Amanita phalloides** n=400 top1=0.8575 top3=0.9475 → confuses as Amanita virosa (20)
- **Amanita pantherina** n=400 top1=0.8975 top3=0.94 → confuses as Amanita citrina (12)
- **Hypholoma fasciculare** n=400 top1=0.9175 top3=0.9475 → confuses as Kuehneromyces mutabilis (9)
- **Amanita muscaria** n=400 top1=0.965 top3=0.985 → confuses as Amanita rubescens (3)

## Gaps

`none`

## Never

- product_unlock=true
- claim deadly@1 = 100%
- forage / consumption permission
- invent metrics

---

_Orientation only · never consumption · product_unlock=false_
