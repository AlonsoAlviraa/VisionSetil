# E21 — optional scale plan (orientation only)

**Status:** planning / readiness only — **not launched**  
**Guardrail:** `product_unlock` remains **false** until honest holdout dual deadly@3 + MAP soft gates are verified on the **new** run (same policy as E20).

## Why E21 (optional)

E20 source-holdout (GBIF ES pure test) already passes soft gates:

| Metric | E20 honest | Soft gate |
|--------|------------|-----------|
| MAP@3 | ~0.860 | ≥ 0.25 |
| deadly@3 | ~0.927 | ≥ 0.90 |
| deadly@1 | ~0.788 | reported |
| n_deadly | 2580 | > 0 |

E21 is for **scale**, not for unlocking forage:

1. Expand beyond 40 allowlist classes when data quality allows  
2. Keep **source-holdout honesty** (train non-GBIF / FT packs; test pure GBIF ES)  
3. Preserve dual deadly keys (`safety_recall_deadly_at_1` / `_at_3`) with industrial deadly set  
4. Keep `_unwrap(model)` DataParallel freeze (never bare `.backbone` on DP)  
5. Re-run open-set calibration + S8/S9 after metrics land  

## Non-goals

- Auto `product_unlock=true` from any metric  
- Consumption / forage permission  
- Inflating MAP via mixed random splits (E19 lesson)  
- App Store launch as part of E21  

## Proposed protocol (when operator schedules GPU)

| Item | Proposal |
|------|----------|
| Kernel slug | `alonsoalviraaaa/visionsetil-exp-v21-scale-holdout` |
| Protocol | `source_holdout_e21` (inherit E20 split rules) |
| Allowlist | start 40; expand only with audited media + deadly labels |
| Freeze | `_unwrap(model).backbone` only |
| Dual deadly | industrial `deadly_set.json` ∩ label2idx |
| Serve | still prefer MAP peak unless deadly checkpoint ablate says otherwise |
| product_unlock | **forced false** until operator cycle on E21 holdout |

## Readiness command (no Kaggle push)

```bash
python scripts/e21_readiness.py
# optional write:
python scripts/e21_readiness.py --write
```

Report: `eval/reports/ml_experiments/e21_readiness.json`

## Launch checklist (operator)

1. [ ] E20 artifacts local + soft gates PASS (`e21_readiness.py`)  
2. [ ] Dataset packs sized for new class count  
3. [ ] Notebook rebuilt from `build_exp_v20` lineage with safe DP freeze  
4. [ ] Push GPU kernel only when ready (no autonomous push from this doc alone)  
5. [ ] On COMPLETE: download → dual deadly honesty → open-set recalibrate → pro tester  
6. [ ] product_unlock stays false until operator runbook  

## Residual product (parallel, no GPU)

- Grow S9 under real Identify traffic  
- Keep multiview diagnostic honesty on all surfaces  
- Beta deploy + cohort (GTM / hosting docs)  
