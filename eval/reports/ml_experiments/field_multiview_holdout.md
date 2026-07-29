# Same-specimen multi-view field holdout (M3)

**Generated:** 2026-07-28T17:11:36.471116+00:00
**Protocol:** `same_specimen_field_holdout_m3`
**product_unlock:** `False`
**Gates pass:** `True`

## Protocol (honest)

- Multiple still images sharing a GBIF occurrence-id prefix in local industrial media folders — one observation/specimen.
- View order is filename sort, not gills/front/habitat/detail labels. Product wizard slots remain the capture UX contract.
- Eval uses local GBIF multi-media packs (field-like multi-photo of one specimen). E20 primary train is separate (FT+soft); this report is honest multi-view stress on held media packs, not a forage gate.
- full4 vs mean of leave-one-of-4 remaining views on the same occurrence.

## Headline (general packs)

| n_views | MAP@3 |
|--------:|------:|
| 1 | 0.8472 |
| 2 | 0.9167 |
| 4 | 0.9236 |
| Δ(4−1) | 0.0764 |

- reject 1→4: 0.2083 → 0.0625
- LOO Δ full−leave1 MAP@3: 0.0035

## Deadly subset

- MAP@3 1/4: 0.8434 / 0.8384 · Δ=-0.005
- flat_multiview: `True`
- Deadly-only same-occurrence packs: extra photos without diagnostic slot labels often do not fix discrimination — multi-view ≠ deadly-safe.

## Honesty

- Multi-view MAP@3 gains on general packs do not imply deadly safety.
- Deadly-only subset may be flat (see deadly block) — keep lookalikes + open-set.
- Never product_unlock from multi-view metrics alone.
- Never consumption permission.

