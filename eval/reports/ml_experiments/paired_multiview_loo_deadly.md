# Paired multi-view LOO / n-views (local GBIF)

**Generated:** 2026-07-27T21:44:05.874093+00:00
**product_unlock:** `false`
**Packs ≥2 / ≥4:** 2162 / 429 · species 11

Packs grouped by GBIF occurrence id prefix in filenames. Multiple media of the same occurrence — not FungiTastic view slots. View order is arbitrary (filename sort), not labeled gills/front. Sample is stratified round-robin by species; T from E20 metrics. Deadly-only filter applied.

## Torch results (stratified)

n_packs=33 · species=10 · T=1.5879640579223633

| n_views | n | MAP@3 | top1 | reject |
|--------:|--:|------:|-----:|-------:|
| 1 | 33 | 0.8434 | 0.7576 | 0.1212 |
| 2 | 33 | 0.8434 | 0.7576 | 0.1515 |
| 4 | 33 | 0.8384 | 0.7273 | 0.1515 |

Deltas: `{"map3_4_minus_1": -0.005, "map3_2_minus_1": 0.0, "top1_4_minus_1": -0.0303, "reject_1_minus_4": -0.0303}`

## Leave-one-photo-out (same occurrence)

- full4 MAP@3=0.8384 top1=0.7273
- loo_mean MAP@3=0.8283 top1=0.7273
- Δ full−loo MAP@3=0.0101
