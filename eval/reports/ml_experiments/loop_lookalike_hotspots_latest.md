# Loop iter 52 — lookalike hotspots

**Generated:** `2026-08-05T20:51:27.338589+00:00`  
**Status:** `measured_ok`  
**Artifact:** `loop_iter_52_lookalike_hotspots_2026-08-05`  
**Policy:** `orientation_only_never_consume`  
**product_unlock:** `False` (forced false)  
**Lab only:** `True` · **kaggle_push:** `False`

> mate@k is a **confusion signal**, not accuracy. Curated pairs only. UX data only.

## Provenance

- checkpoint: `C:\Users\Mariano\Documents\ALONSOO\VISIONSETIL\kaggle\kernel_output_v20\models`
- version: `v20-E20-source-holdout`
- eval_protocol: `source_holdout_e20`
- train: `fungitastic_plus_soft_non_gbif` · test: `gbif_es_only`
- catalog: `data/species_catalog/species_catalog_v2.json` · classic: `data/species_catalog/classic_lookalike_pairs.json`

## Aggregate [MEASURED]

| Metric | Value |
|--------|-------|
| k | 3 |
| curated directed pairs | 144 |
| pairs with eval samples | 75 |
| n_eval samples | 15824 |
| true_in_topk_rate | 0.9131066734074823 |
| lookalike_mate_in_topk_rate | 0.07697168857431749 |
| n_hotspots | 21 |
| n_deadly_hotspots | 12 |

Note: mate_in_topk is a confusion signal (not accuracy). Curated pairs only — never invented. Useful for hard-neg mining + education UX.

## Dual ECE honesty (kernel cite)

- primary: `train_published` = `0.18741017924867615` (source=`test_ece_train_published`)
- posthoc (separate): `0.04544782004819755`

## Top lookalike hotspots

| A (true) | B (mate) | n | mate@k rate | true@k rate | deadly? |
|----------|----------|--:|------------:|------------:|:-------:|
| Amanita muscaria | Amanita pantherina | 400 | 0.3775 | 0.985 | Y |
| Amanita phalloides | Amanita citrina | 400 | 0.3425 | 0.9475 | Y |
| Boletus edulis | Leccinum scabrum | 200 | 0.595 | 0.785 |  |
| Amanita citrina | Amanita phalloides | 200 | 0.56 | 0.965 | Y |
| Amanita rubescens | Amanita pantherina | 200 | 0.41 | 0.805 | Y |
| Galerina marginata | Kuehneromyces mutabilis | 338 | 0.22485207100591717 | 0.8609467455621301 | Y |
| Boletus edulis | Imleria badia | 200 | 0.35 | 0.785 |  |
| Boletus edulis | Suillus luteus | 200 | 0.29 | 0.785 |  |
| Suillus grevillei | Suillus luteus | 120 | 0.4666666666666667 | 0.975 |  |
| Suillus luteus | Suillus grevillei | 200 | 0.215 | 0.915 |  |
| Kuehneromyces mutabilis | Galerina marginata | 74 | 0.527027027027027 | 0.7567567567567568 | Y |
| Laccaria laccata | Laccaria amethystina | 200 | 0.19 | 0.865 |  |
| Fomitopsis pinicola | Trametes versicolor | 200 | 0.165 | 0.835 |  |
| Hypholoma fasciculare | Kuehneromyces mutabilis | 400 | 0.0775 | 0.9475 | Y |
| Amanita pantherina | Amanita rubescens | 400 | 0.065 | 0.94 | Y |

## Deadly-involving hotspots (safety-critical education)

| A | B | n | mate@k rate |
|---|---|--:|------------:|
| Amanita muscaria | Amanita pantherina | 400 | 0.3775 |
| Amanita phalloides | Amanita citrina | 400 | 0.3425 |
| Amanita citrina | Amanita phalloides | 200 | 0.56 |
| Amanita rubescens | Amanita pantherina | 200 | 0.41 |
| Galerina marginata | Kuehneromyces mutabilis | 338 | 0.22485207100591717 |
| Kuehneromyces mutabilis | Galerina marginata | 74 | 0.527027027027027 |
| Hypholoma fasciculare | Kuehneromyces mutabilis | 400 | 0.0775 |
| Amanita pantherina | Amanita rubescens | 400 | 0.065 |
| Galerina marginata | Armillaria lutea | 338 | 0.05917159763313609 |
| Paxillus involutus | Imleria badia | 368 | 0.05434782608695652 |
| Kuehneromyces mutabilis | Hypholoma fasciculare | 74 | 0.10810810810810811 |
| Armillaria lutea | Galerina marginata | 35 | 0.11428571428571428 |

## Hard-negative lineage (existing)

- path: `data/industrial_v1/hard_negative_pairs_e20.json`
- n_pairs: `5` · ids: `subincarnata-cristata, castanea-cristata, castanea-subincarnata, muscaria-pantherina, citrina-phalloides`
- source_loop_iters (historical): `[16, 22, 26]`

## Lab suggestions (NOT auto-applied)

- **muscaria-pantherina**: ['Amanita muscaria', 'Amanita pantherina'] · rate=0.3775 n=400 · already_in_lineage=True · priority=1
- **phalloides-citrina**: ['Amanita phalloides', 'Amanita citrina'] · rate=0.3425 n=400 · already_in_lineage=True · priority=1
- **edulis-scabrum**: ['Boletus edulis', 'Leccinum scabrum'] · rate=0.595 n=200 · already_in_lineage=False · priority=2
- **rubescens-pantherina**: ['Amanita rubescens', 'Amanita pantherina'] · rate=0.41 n=200 · already_in_lineage=False · priority=1
- **marginata-mutabilis**: ['Galerina marginata', 'Kuehneromyces mutabilis'] · rate=0.22485207100591717 n=338 · already_in_lineage=False · priority=1
- **edulis-badia**: ['Boletus edulis', 'Imleria badia'] · rate=0.35 n=200 · already_in_lineage=False · priority=2
- **edulis-luteus**: ['Boletus edulis', 'Suillus luteus'] · rate=0.29 n=200 · already_in_lineage=False · priority=2
- **grevillei-luteus**: ['Suillus grevillei', 'Suillus luteus'] · rate=0.4666666666666667 n=120 · already_in_lineage=False · priority=2

## Gaps

`none`

## Never

- invent lookalike pairs
- product_unlock=true
- forage / consumption permission
- auto-apply hard-neg without operator

---

_Orientation only · never consumption · product_unlock=false · UX data only_
