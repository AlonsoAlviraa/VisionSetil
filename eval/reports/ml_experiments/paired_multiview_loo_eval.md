# Paired multi-view LOO / n-views (local GBIF)

**Generated:** 2026-07-27T21:29:57.046389+00:00
**product_unlock:** `false`
**Packs ≥2 / ≥4:** 8060 / 1546 · species 40

Packs grouped by GBIF occurrence id prefix in filenames. Multiple media of the same occurrence — not FungiTastic view slots. View order is arbitrary (filename sort), not labeled gills/front. Sample is stratified round-robin by species; T from E20 metrics.

## Torch results (stratified)

n_packs=48 · species=38 · T=1.5879640579223633

| n_views | n | MAP@3 | top1 | reject |
|--------:|--:|------:|-----:|-------:|
| 1 | 48 | 0.8472 | 0.7917 | 0.2083 |
| 2 | 48 | 0.9167 | 0.8542 | 0.1042 |
| 4 | 48 | 0.9236 | 0.875 | 0.0625 |

Deltas: `{"map3_4_minus_1": 0.0764, "map3_2_minus_1": 0.0695, "top1_4_minus_1": 0.0833, "reject_1_minus_4": 0.1458}`

## Leave-one-photo-out (same occurrence)

- full4 MAP@3=0.9236 top1=0.875
- loo_mean MAP@3=0.9201 top1=0.875
- Δ full−loo MAP@3=0.0035
