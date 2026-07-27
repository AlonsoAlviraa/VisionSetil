# E19 Leak Audit

**Generated:** 2026-07-27T08:29:40.321131+00:00
**Overall:** **SUSPECT**
**Product gates trustworthy:** **partial**

> Orientation only — never consumption permission. Allowlist remains 40 spp.

## Headline (E19 artifacts)

| Metric | Value | Notes |
|--------|------:|-------|
| MAP@3 | 0.9600000000000002 | matches npz recompute |
| Top-1 | 0.9361538461538461 | |
| Deadly **top-1** (`safety_recall_deadly`) | 0.9626373626373627 | **NOT @3** — gen_notebook test cell |
| Deadly **@3** (recomputed from npz) | 0.9934065934065934 | true top-3 recall among deadly |
| ECE naive (`test_ece`) | 0.0630488328062571 | mean(\|p−correct\|), not 15-bin |
| Train/val/test obs | 6065 / 1300 / 1300 | |
| Sources | ['fungitastic', 'gbif_es'] | |

## Verdicts

### [PASS] obs_id_leak_splitter_self_test

anti_leak_split on local GBIF-only: train/val/test observation_ids disjoint

```json
{
  "n_train_obs": 5168,
  "n_val_obs": 1108,
  "n_test_obs": 1108,
  "n_species": 39,
  "n_species_pre_min_filter": 40,
  "species_dropped_min_per_class": [
    "Cortinarius rubellus"
  ],
  "min_per_class": 4,
  "leaks": {
    "train_val": 0,
    "train_test": 0,
    "val_test": 0
  },
  "pass": true
}
```

### [PASS] stem_multi_species_gbif

No basename stem collides across species in local GBIF post-cap pool

```json
{
  "n_stems": 18311
}
```

### [UNKNOWN] obs_id_leak_e19_original

Code-level only: notebook anti_leak_split asserts train∩val∩test empty and log shows Split train=6065 / val=1300 / test=1300. Exact observation_id lists were NOT saved — runtime E19 split is NOT re-verified offline. Status UNKNOWN until train_obs/test_obs artifacts exist (do not dashboard-green this as proven).

```json
{
  "num_train_obs": 6065,
  "num_val_obs": 1300,
  "num_test_obs": 1300,
  "split_log": "Split: train=6065 obs (16256 imgs) | val=1300 obs (3472 imgs) | test=1300 obs (3535 imgs)",
  "code_asserts_disjoint": true,
  "runtime_ids_reverified": false
}
```

### [UNKNOWN] cross_source_path_stem_ft_gbif

FungiTastic not present locally; cannot measure FT↔GBIF basename/stem collisions. E19 only did exact image_path dedup (log: 36648 → 23263). Different roots mean same media under FT and GBIF would NOT be path-deduped.

```json
{
  "dedup_log": "Dedup image_path: 36648 \u2192 23263",
  "sources_post_cap": "Sources post-cap: {'gbif_es': 12326, 'fungitastic': 10937}",
  "risk": "medium"
}
```

### [PASS] cross_source_exact_path_dedup

E19 applied drop_duplicates on image_path after fair_cap (36648→23263). Exact path collisions handled; content-level near-dup across sources unhandled.

```json
{
  "dedup_log": "Dedup image_path: 36648 \u2192 23263"
}
```

### [UNKNOWN] per_source_test_breakdown

Cannot split original mixed test into gbif_es vs fungitastic: test_predictions.npz lacks observation_id/source_db. See e19_gbif_holdout.md for pure-GBIF re-inference.

```json
{
  "npz_keys": [
    "probs",
    "preds",
    "labels"
  ]
}
```

### [SUSPECT] headline_deadly_is_top1_not_at3

E19 metrics.json `safety_recall_deadly` matches deadly **top-1** (0.9626), NOT deadly@3 (0.9934). Notebook gate logs label this field as deadly@3 (DO3/DO3b) — definition mismatch. Val loop uses true @3; test cell uses top-1. Any comparison labeled 'Deadly@3' that cites 0.963 is wrong; use recomputed 0.993 for @3.

```json
{
  "metrics_json_safety_recall_deadly": 0.9626373626373627,
  "deadly_top1_recomputed": 0.9626373626373627,
  "deadly_at_3_recomputed": 0.9934065934065934,
  "n_deadly": 455,
  "deadly_top1_match_metrics_json": true,
  "deadly_at3_match_metrics_json": false
}
```

### [SUSPECT] ep0_deadly_suspicious

val deadly@3=0.9824 at epoch 0 (backbone frozen warmup). Not necessarily leakage: top-3 among 40 classes is generous for distinctive deadly morphs (A. muscaria, H. fasciculare) + ImageNet-pretrained ConvNeXt. ep0 val MAP@3=0.7294 is high but not perfect; best MAP@3 at epoch 8=0.953076923076923. Note: val uses true deadly@3; final metrics.json uses deadly top-1.

```json
{
  "ep0_val_deadly3": 0.9823788546255506,
  "ep0_val_map3": 0.7293589743589757,
  "best": {
    "epoch": 8,
    "train_loss": 3.034934921099544,
    "val_acc": 0.9276923076923077,
    "val_map3": 0.953076923076923,
    "val_f1": 0.8997413562170167,
    "val_deadly3": 0.9823788546255506
  }
}
```

### [SUSPECT] headline_too_high_for_fungi

Headline MAP@3=0.960; deadly top-1 (stored)=0.963; deadly@3 (recomputed)=0.9934065934065934. Unusually high for real-world fungi ID. Mixed random split of FT+GBIF can inflate metrics vs field photos. Not proof of train/test obs leak; metrics NOT trustworthy alone for product gates.

```json
{
  "map3": 0.9600000000000002,
  "deadly_top1_stored": 0.9626373626373627,
  "deadly_at_3_recomputed": 0.9934065934065934,
  "perfect_deadly_ge10": [
    {
      "species": "Gyromitra esculenta",
      "n": 21,
      "top1": 1.0,
      "deadly": true
    },
    {
      "species": "Amanita virosa",
      "n": 49,
      "top1": 1.0,
      "deadly": true
    },
    {
      "species": "Hypholoma fasciculare",
      "n": 60,
      "top1": 1.0,
      "deadly": true
    }
  ]
}
```

## Prediction re-check (test_predictions.npz)

```json
{
  "status": "ok",
  "n_test": 1300,
  "map_at_3": 0.96,
  "top1": 0.9361538461538461,
  "top3": 0.9876923076923076,
  "deadly_at_3": 0.9934065934065934,
  "deadly_top1": 0.9626373626373627,
  "n_deadly": 455,
  "metrics_json_map3": 0.9600000000000002,
  "metrics_json_safety_recall_deadly": 0.9626373626373627,
  "metrics_json_deadly_field_meaning": "top-1 among deadly samples (NOT @3) \u2014 gen_notebook_v8 test cell; E19 gate logs mislabel this field as deadly@3",
  "map_match_metrics_json": true,
  "deadly_top1_match_metrics_json": true,
  "deadly_at3_match_metrics_json": false,
  "deadly_definition_mismatch": true,
  "ece_naive_recomputed": 0.0630488328062571,
  "metrics_json_ece": 0.0630488328062571,
  "metrics_json_ece_meaning": "mean(|max_prob - correct|) unbinned \u2014 not 15-bin ECE",
  "label_sortedness": 0.09006928406466508,
  "has_obs_ids_in_npz": false,
  "note": "test_predictions.npz has probs/preds/labels only \u2014 no observation_id or source_db"
}
```

Worst species (top-1):

| Species | n | top1 | deadly |
|---------|--:|-----:|:------:|
| Cortinarius rubellus | 1 | 0.000 | Y |
| Lepiota castanea | 16 | 0.688 | Y |
| Kuehneromyces mutabilis | 30 | 0.700 |  |
| Amanita rubescens | 30 | 0.767 |  |
| Lepiota subincarnata | 9 | 0.778 | Y |
| Amanita citrina | 30 | 0.800 |  |
| Leccinum scabrum | 30 | 0.833 |  |
| Imleria badia | 30 | 0.867 |  |

## Local GBIF reconstruction

```json
{
  "local_gbif": {
    "pre_cap_imgs": 38003,
    "pre_cap_obs": 24649,
    "post_cap_imgs": 18311,
    "post_cap_obs": 7385,
    "split": {
      "n_train_obs": 5168,
      "n_val_obs": 1108,
      "n_test_obs": 1108,
      "n_species": 39,
      "n_species_pre_min_filter": 40,
      "species_dropped_min_per_class": [
        "Cortinarius rubellus"
      ],
      "min_per_class": 4,
      "leaks": {
        "train_val": 0,
        "train_test": 0,
        "val_test": 0
      },
      "pass": true
    },
    "note": "GBIF-only fair_cap uses full 200/400 per species; E19 mixed FT+GBIF reserved ~half cap per source \u2014 observation sets differ."
  },
  "stem_audit_gbif_only": {
    "status": "ok",
    "n_unique_stems": 18311,
    "n_cross_source_stems": 0,
    "n_cross_source_media_ids": 0,
    "n_cross_source_size_stem_prefix": 0,
    "n_stems_multi_species": 0,
    "examples_cross_stem": {},
    "examples_multi_species_stem": {},
    "pass_cross_source": true
  }
}
```

## Limitations

- E19 train/val/test observation_id lists were NOT saved as artifacts; only counts (6065/1300/1300) and test_predictions.npz (labels only).
- FungiTastic is not available locally — cannot fully rebuild the mixed FT+GBIF post-cap pool (23263 imgs) used on Kaggle.

## Product recommendation

No proven observation_id train/test leak (runtime IDs unverified offline). Metrics inflated by mixed easy pool / top-3 generosity / possible cross-source near-dups; plus `safety_recall_deadly` is deadly top-1 mislabeled as @3 in gates. NOT sufficient alone to unlock product Identify.

### Follow-up: GBIF-only hold-out (if present)

| Metric | E19 mixed | GBIF hold-out |
|--------|----------:|--------------:|
| MAP@3 | 0.9600000000000002 | 0.9240373044524668 |
| Top-1 | 0.9361538461538461 | 0.8962093862815884 |
| Deadly **top-1** | 0.9626373626373627 | 0.9240506329113924 |
| Deadly **@3** | 0.9934065934065934 | 0.9696202531645569 |
| ECE naive | 0.0630488328062571 | 0.10392672770290168 |
| ECE 15-bin | — | 0.09710197607963093 |

See `e19_gbif_holdout.md`. Contamination risk medium-high; not product unlock.

Required next step: true unseen field photos + source-holdout retrain (E20). Do **not** unlock product ID on E19 headline alone. Fix deadly@3 naming in future kernels.

## Fix proposals (if expanding to E20)

1. Persist `train_obs.json` / `val_obs.json` / `test_obs.json` (observation_ids + source_db).
2. Cross-source stem + media-id + file-size near-dup collapse before split.
3. Prefer **source-holdout**: train on FT, test pure `gbif_es` (or vice versa).
4. Save per-source metrics at eval time; store **both** deadly top-1 and deadly@3 with clear keys.
5. Use `test_es_gbif` industrial split for product gates (currently pending images).
6. Align test-cell safety metric with val-loop deadly@3 (or rename fields).
