# VisionSetil ML experiment battery

Generated: `2026-07-17T15:23:31.756200+00:00`

## Executive summary

v9 offline: MAP@3=0.0927, top1=0.0632, genus=0.1063, ECE=0.0667. Lift over chance x7.5.

- Best T by ECE: **2.0** (ECE=0.0160, MAP@3=0.0927)
- Best open-set: conf≥0.15, margin≥0.0 → accept=20.11%, acc|accept=16.43%
- Deadly in test: {'n_deadly_in_test': 25, 'species_top1_accuracy_on_deadly': 0.0, 'any_deadly_in_top1': 0.04, 'any_deadly_in_topk': 0.08, 'k': 3, 'note': 'Safety: prefer high any_deadly_in_topk even if species wrong'}
- Zero-acc classes: 98

## Chance baselines

```json
{
  "uniform_top1": 0.008620689655172414,
  "uniform_map3": 0.015804597701149427,
  "frequency_prior_top1": 0.008620689655172414,
  "frequency_prior_map3": 0.015804597701149427,
  "random_top1": 0.004310344827586207,
  "chance_1_over_C": 0.008403361344537815,
  "model_lift_over_chance_top1": 7.5229885057471275
}
```

## Recommended GPU matrix

### E-data-scale: More data per class
- Change: max_species=1000, max_obs_per_species=20, epochs=15
- Hypothesis: MAP@3 lifts mainly from data not architecture at few-shot regime
- Metric: `test_map_at_3`

### E-deadly-oversample: Oversample critical taxa
- Change: weighted sampler 5x for deadly label indices + focal loss
- Hypothesis: Raises safety_recall_deadly without collapsing MAP@3
- Metric: `safety_recall_deadly`

### E-views: Multi-view vs single-view
- Change: train with 1 vs 2–4 views per obs
- Hypothesis: MAP@3 gap quantifies multi-view value
- Metric: `test_map_at_3`

### E-backbone: tiny vs base
- Change: convnextv2_tiny (current) vs base if GPU allows
- Hypothesis: base helps head classes; tiny better for few-shot speed
- Metric: `test_map_at_3`

### E-open-set: Open-set threshold from val
- Change: sweep conf/margin on val; freeze on test
- Hypothesis: Accept@20% can double conditional accuracy
- Metric: `accuracy_when_accept`

### E-region-cyl: Hold-out Spain/Soria GBIF
- Change: eval-only set from GBIF ES media
- Hypothesis: Domain shift estimate for production Spain
- Metric: `map_at_3_region`

## Policy

Safety-first: orientation only. Never authorize consumption.
