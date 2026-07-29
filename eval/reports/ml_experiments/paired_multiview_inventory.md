# Paired multi-view inventory

**Generated:** 2026-07-27T21:34:12.597681+00:00
**product_unlock:** `False`

## Readiness

- true_leave_one_photo_out: **True**
- train multi≥2: 3773 · val multi≥2: 656 · test multi≥2: 0
- images_local train/val: False / False
- blocker: `None`
- next: Local GBIF same-occurrence multi-image packs evaluated via eval/scripts/paired_multiview_loo_eval.py. Optional: mount FungiTastic for labeled view slots.

## Splits

- **train**: n=5767 multi≥2=3773 multi≥4=776 species_multi=40
- **val**: n=1018 multi≥2=656 multi≥4=152 species_multi=37
- **test**: n=7385 multi≥2=0 multi≥4=0 species_multi=0

E20 GBIF ES pure test JSON is mostly single-image (domain holdout). Local industrial GBIF media often has multiple files per occurrence id — used for true multi-photo torch n-views eval. FT train/val multi packs remain Kaggle-path until mounted.
