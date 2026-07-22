# Model card — VisionSetil industrial (template)

**Status:** DRAFT — fill after E15+ passes gates.  
**Policy:** Orientation only. Never consumption permission. R7: deadly false-safe is a blocker.

## Model details
- Architecture: MultiView v8 (ConvNeXtV2-tiny + VectorizedLoRA + AttentionFusion + ArcFace)
- Checkpoint path: `TBD` (only if deploy gate pass)
- Num classes / allowlist version: industrial_v1 (40 spp)
- Training data sources: FungiTastic, FungiCLEF (± GBIF ES filtered)
- Intended use: multi-view orientation + safety flags + human review
- Out of scope: edible approval, foraging advice, 1000+ spp field ID

## Metrics (paste from eval_industrial_metrics / metrics.json)
| Metric | Value | Gate |
|--------|------:|------|
| MAP@3 test | | ≥0.20 deploy / ≥0.40 elite |
| Top-1 | | |
| Deadly@3 | | ≥0.90 deploy / ≥0.95 elite |
| ECE | | ≤0.05 elite |
| Coverage @ acc≥0.40 | | |

## Evaluation protocol
- Split by `observation_id` (anti-leak)
- Deadly set: `data/industrial_v1/deadly_set.json`
- Hold-out ES: `splits/test_es_gbif.json` when populated

## Ethical / safety
- Quality gate blocks species ID when metrics fail
- Open-set abstention required
- Human review recommended for all high-risk / reject cases
