# Loop iter 54 — Lepiota focus inventory

**Generated:** `2026-08-05T21:03:04.569116+00:00`  
**Status:** `measured_ok`  
**Artifact:** `loop_iter_54_lepiota_inventory_2026-08-05`  
**Policy:** `orientation_only_never_consume`  
**product_unlock:** `False` (forced false)  
**Lab only:** `True` · **baseline_fallback:** `True`

> Cite JSON for PR bodies. Full-precision [MEASURED] only.

## Provenance

- checkpoint: `C:\Users\Mariano\Documents\ALONSOO\VISIONSETIL\kaggle\kernel_output_v20\models`
- version: `v20-E20-source-holdout`
- eval_protocol: `source_holdout_e20`
- train: `fungitastic_plus_soft_non_gbif` · test: `gbif_es_only`

## Label space (Lepiota family)

- n_classes: `40`
- lepiota family taxa (3): `Lepiota castanea, Lepiota cristata, Lepiota subincarnata`
- deadly lepiota in label: `none`
- focus in label: `Lepiota subincarnata, Lepiota castanea`
- focus missing: `Lepiota brunneoincarnata, Lepiota josserandii, Lepiota helveola`

## Dual ECE honesty (cited)

- primary: `train_published` = `0.18741017924867615` (source=`test_ece_train_published`, claim=`True`)
- posthoc (separate): `0.04544782004819755`

## Global holdout [MEASURED]

- n_eval: `7385`
- top1_all: `0.8032498307379824`
- map_at_3_all: `0.8575265177160912`
- kernel MAP@3: `0.8575265177160878` · deadly@1: `0.7895348837209303` · deadly@3: `0.9217054263565891`

## Inventory (split counts + holdout)

| Taxon | deadly | n_train | n_val | n_test_obs | n_holdout | top1 | top3 | Top confusion |
|-------|:------:|--------:|------:|-----------:|----------:|-----:|-----:|---------------|
| Lepiota castanea |  | 20 | 4 | 82 | 82 | 0.5487804878048781 | 0.926829268292683 | Lepiota cristata (16, 0.195) |
| Lepiota cristata |  | 87 | 15 | 179 | 179 | 0.8770949720670391 | 0.9441340782122905 | Laccaria laccata (3, 0.017) |
| Lepiota subincarnata |  | 6 | 1 | 57 | 57 | 0.0 | 0.47368421052631576 | Lepiota cristata (37, 0.649) |

## FT focus candidates (E20b motivation)

- **Lepiota castanea** n_train=20 n_holdout=82 top1=0.5487804878048781 top3=0.926829268292683 → Lepiota cristata (16) · reasons: `holdout_top1_low=0.5487804878048781, train_test_imbalance`
- **Lepiota subincarnata** n_train=6 n_holdout=57 top1=0.0 top3=0.47368421052631576 → Lepiota cristata (37) · reasons: `holdout_top1_low=0.0, holdout_top1_zero, train_starved_n_train=6, train_test_imbalance`

## Curated lookalike pairs (Lepiota-related)

_None found in classic_lookalike_pairs.json._

## Gaps

`deadly_set_missing_or_empty`

## Never

- product_unlock=true
- forage / consumption permission
- invent metrics or lookalike pairs
- block loop on E20b absence (baseline fallback OK)

---

_Orientation only · never consumption · product_unlock=false_
