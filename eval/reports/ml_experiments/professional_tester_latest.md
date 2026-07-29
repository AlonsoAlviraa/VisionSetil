# Professional ML Tester Report

**Generated:** 2026-07-28T11:21:27.676598+00:00
**Overall:** **PASS**
**Exit intent:** 0

> Orientation only — never consumption permission. Gates are advisory.

## Suites

**product_unlock:** `False` (fail-closed until E20 honest holdout)

### S1-S2 pytest (metrics+leak+loader+e20) — PASS
- ['........................................................................ [ 85%]', '............                                                             [100%]']

### S4 notebook guards E20 — PASS
- {"path": "C:\\Users\\Mariano\\Documents\\ALONSOO\\VISIONSETIL\\kaggle\\visionsetil_exp_v20_source_holdout.ipynb", "has_chr92": true, "has_train_obs": true, "has_deadly_at_3": true, "has_fail_closed": true, "has_dataparallel": true, "safe_dp_freeze": true, "no_broken_backslash_replace": true}

### S3 artifact audit — PASS
- n_dirs=10

### S5 lookalike pair metrics — PASS
- {"n_directed_pairs": 135, "n_pairs_in_label_space": 69, "n_eval_samples": 14455, "true_in_topk_rate": 0.9275, "lookalike_mate_in_topk_rate": 0.0988, "predictions_dir": "C:\\Users\\Mariano\\Documents\\ALONSOO\\VISIONSETIL\\kaggle\\kernel_output_v20\\models"}

### S6 product_unlock criteria (fail-closed) — PASS
- unlock_eligible_advisory=True; reasons=['all_checks_pass_but_product_unlock_forced_false_until_operator_cycle']; checks={'metrics_present': True, 'e20_experiment': True, 'dual_deadly_keys': True, 'soft_map': True, 'soft_deadly_at_3': True, 'n_deadly_nonzero': True, 'orientation_only_policy': True, 'pro_tester_pass': True, 'safe_dp_freeze': True}

### S7 E20 split integrity — PASS
- {"protocol": "source_holdout_e20", "pass": true, "leaks": {"train_val": 0, "train_test": 0, "val_test": 0}, "n_train_obs": 5767, "n_val_obs": 1018, "n_test_obs": 7385, "has_metrics": true}

### S8 E20 open-set + mate monitor — PASS
- {"n": 7385, "top1_accuracy": 0.802031144211239, "multiview_reject_rate": 0.0, "recommended_conf": 0.92, "recommended_margin": 0.05, "recommended_entropy": 0.15, "recommended_reject_rate": 0.1819905213270142, "recommended_acc_keep": 0.8808144346962423, "mate_in_topk": 0.0988, "true_in_topk": 0.9275, "paths": ["C:\\Users\\Mariano\\Documents\\ALONSOO\\VISIONSETIL\\eval\\reports\\open_set_thresholds.json", "C:\\Users\\Mariano\\Documents\\ALONSOO\\VISIONSETIL\\eval\\reports\\ml_experiments\\e20_open_set_holdout.json", "C:\\Users\\Mariano\\Documents\\ALONSOO\\VISIONSETIL\\backend\\eval\\reports\\open_set_thresholds.json"]}
- flag: multiview_thr_rejects_near_zero

### S9 live Identify reject monitor — PASS
- {"status": "ok", "n_entries": 1, "n_rejected": 1, "reject_rate": 1.0, "reject_rate_7d": 1.0, "n_entries_7d": 1, "reasons": {"high_entropy": 1}, "reason_histogram": {"high_entropy": 1}, "top_reason": "high_entropy", "health_flags": ["sparse_sample", "high_reject_rate_advisory"], "multiview": {"n_with_view_labels": 0, "n_multiview_ge2": 0, "n_diag_any": 0, "n_diag_full_gills_front_detail": 0, "n_single_non_diag": 0, "view_label_rate": 0.0, "multiview_ge2_rate": 0.0, "diag_full_rate": 0.0, "priority_views": ["detail", "front", "gills"], "note": "Advisory only: multi-photo without gills/front/detail is not deadly-safe. Never forage/consumption permission."}, "windows": {"24h": {"n_entries": 1, "reject_rate": 1.0, "top_reason": "high_entropy"}, "7d": {"n_entries": 1, "reject_rate": 1.0, "top_reason": "high_entropy"}, "30d": {"n_entries": 1, "reject_rate": 1.0, "top_reason": "high_entropy"}, "all": {"n_entries": 1, "reject_rate": 1.0, "top_reason": "high_entropy"}}, "log_path": "C:\\Users\\Mariano\\Documents\\ALONSOO\\VISIONSETIL\\data\\feedback\\classification_log.jsonl", "product_unlock": false}
- flag: sparse_sample
- flag: high_reject_rate_advisory

### S13 E21 scale readiness (no launch) — PASS
- {"ready": true, "status": "ready_for_operator_schedule", "e21_launched": false, "product_unlock": false, "map_at_3": 0.8603024148047814, "deadly_at_3": 0.9271317829457364}

### S10 paired multi-view inventory — PASS
- {"true_loo_ready": true, "train_multi_ge2": 3773, "val_multi_ge2": 656, "blocker": null}

### S11 paired multi-view LOO torch — PASS
- {"torch_ok": true, "n_packs": 48, "n_species": 38, "map3_1": 0.8472, "map3_4": 0.9236, "deltas": {"map3_4_minus_1": 0.0764, "map3_2_minus_1": 0.0695, "top1_4_minus_1": 0.0833, "reject_1_minus_4": 0.1458}, "loo_summary": {"full4_map_at_3": 0.9236, "loo_mean_map_at_3": 0.9201, "delta_map3_full_minus_loo": 0.0035}}

### S12 deadly multi-view LOO honesty — PASS
- {"torch_ok": true, "n_packs": 33, "map3_1": 0.8434, "map3_4": 0.8384, "deltas": {"map3_4_minus_1": -0.005, "map3_2_minus_1": 0.0, "top1_4_minus_1": -0.0303, "reject_1_minus_4": -0.0303}, "product_note": "flat multi-view on deadly → keep lookalikes+open-set"}
- flag: deadly_multiview_map3_flat

## Pair metrics

```json
{
  "n_directed_pairs": 135,
  "k": 3,
  "predictions_dir": "C:\\Users\\Mariano\\Documents\\ALONSOO\\VISIONSETIL\\kaggle\\kernel_output_v20\\models",
  "n_eval_samples": 14455,
  "n_pairs_in_label_space": 69,
  "true_in_topk_rate": 0.9275,
  "lookalike_mate_in_topk_rate": 0.0988,
  "note": "mate_in_topk is a confusion signal (not accuracy). Curated pairs only.",
  "by_pair_sample": {
    "Agaricus campestris||Amanita verna": {
      "n": 200,
      "mate_in_topk": 0,
      "true_in_topk": 177
    },
    "Amanita citrina||Amanita phalloides": {
      "n": 200,
      "mate_in_topk": 120,
      "true_in_topk": 193
    },
    "Amanita muscaria||Amanita caesarea": {
      "n": 400,
      "mate_in_topk": 0,
      "true_in_topk": 395
    },
    "Amanita muscaria||Amanita pantherina": {
      "n": 400,
      "mate_in_topk": 273,
      "true_in_topk": 395
    },
    "Amanita muscaria||Amanita fulva": {
      "n": 400,
      "mate_in_topk": 0,
      "true_in_topk": 395
    },
    "Amanita pantherina||Amanita muscaria": {
      "n": 400,
      "mate_in_topk": 13,
      "true_in_topk": 369
    },
    "Amanita pantherina||Amanita rubescens": {
      "n": 400,
      "mate_in_topk": 37,
      "true_in_topk": 369
    },
    "Amanita phalloides||Russula virescens": {
      "n": 400,
      "mate_in_topk": 0,
      "true_in_topk": 392
    },
    "Amanita phalloides||Tricholoma equestre": {
      "n": 400,
      "mate_in_topk": 0,
      "true_in_topk": 392
    },
    "Amanita phalloides||Amanita
```

## Open-set holdout monitor (S8)

- **top1_accuracy:** `0.802031144211239`
- **recommended conf/margin:** `0.92` / `0.05` (reject_rate=`0.1819905213270142`, acc_keep=`0.8808144346962423`)
- **mate@3 rate:** `0.0988` (true@3=`0.9275`)

```json
{
  "ok": true,
  "product_unlock": false,
  "generated": "2026-07-28T11:21:27.645591+00:00",
  "predictions_dir": "C:\\Users\\Mariano\\Documents\\ALONSOO\\VISIONSETIL\\kaggle\\kernel_output_v20\\models",
  "protocol": "source_holdout_e20",
  "version": "v20-E20-source-holdout",
  "n": 7385,
  "top1_accuracy": 0.802031144211239,
  "conf_stats": {
    "mean_correct": 0.9818292929703333,
    "mean_wrong": 0.875088734804524,
    "p5_correct": 0.9051994919776917,
    "p5_wrong": 0.4689792200922966,
    "p50_wrong": 0.9759523570537567
  },
  "margin_stats": {
    "mean_correct": 0.9697656552894771,
    "mean_wrong": 0.7999124722574499,
    "p5_wrong": 0.13286353945732116
  },
  "entropy_stats": {
    "mean_correct": 0.0747303850302931,
    "mean_wrong": 0.43600347782909715,
    "p90_correct": 0.1540431712088868,
    "p50_wrong": 0.1607682143297715
  },
  "current_multiview_thr": {
    "conf_thr": 0.1,
    "margin_thr": 0.0,
    "entropy_thr": null,
    "n": 7385,
    "n_reject": 0,
    "n_keep": 7385,
    "reject_rate": 0.0,
    "acc_keep": 0.802031144211239,
    "acc_reject": null,
    "wrong_kept": 1462,
    "correct_rejected": 0,
    "frac_correct_kept": 1.0,
    "deadly_reject_rate": 0.0,
    "deadly_at3_among_kept": 0.9271317829457364,
    "n_deadly": 2580,
    "n_deadly_kept": 2580
  },
  "current_generic_thr": {
    "conf_thr": 0.48,
    "margin_thr": 0.1,
    "entropy_thr": null,
    "n": 7385,
    "n_reject": 127,
    "n_keep": 7258,
    "reject_rate": 0.017197020988490182,
    "acc_keep": 0.8117938826122899,
    "acc_reject": 0.2440944881889764,
    "wrong_kept": 1366,
    "correct_rejected": 31,
    "frac_correct_kept": 0.994766165794361,
    "deadly_reject_rate": 0.005416384563303994,
    "deadly_at3_among_kept": 0.9322834645669291,
    "n_deadly": 2580,
    "n_deadly_kept": 2540
  },
  "recommended": {
    "conf_thr": 0.92,
    "margin_thr": 0.05,
    "entropy_thr": 0.15,
    "n": 7385,
    "n_reject": 1344,
    "n_keep": 6041,
    "reject_rate": 0.181990521
```

## product_unlock criteria evaluation

- **product_unlock:** `False`
- **unlock_eligible_advisory:** `True`
- **reasons:** ['all_checks_pass_but_product_unlock_forced_false_until_operator_cycle']
- **checks:** `{"metrics_present": true, "e20_experiment": true, "dual_deadly_keys": true, "soft_map": true, "soft_deadly_at_3": true, "n_deadly_nonzero": true, "orientation_only_policy": true, "pro_tester_pass": true, "safe_dp_freeze": true}`

## Artifact audits

- `C:\Users\Mariano\Documents\ALONSOO\VISIONSETIL\kaggle\kernel_output_v12\models`: flagged flags=['no test_predictions.npz — skip recompute', 'no train/test_obs.json (UNKNOWN offline re-audit)']
- `C:\Users\Mariano\Documents\ALONSOO\VISIONSETIL\kaggle\kernel_output_v13\models`: flagged flags=['no test_predictions.npz — skip recompute', 'no train/test_obs.json (UNKNOWN offline re-audit)']
- `C:\Users\Mariano\Documents\ALONSOO\VISIONSETIL\kaggle\kernel_output_v14\models`: flagged flags=['no test_predictions.npz — skip recompute', 'no train/test_obs.json (UNKNOWN offline re-audit)']
- `C:\Users\Mariano\Documents\ALONSOO\VISIONSETIL\kaggle\kernel_output_v16\models`: flagged flags=['no train/test_obs.json (UNKNOWN offline re-audit)']
- `C:\Users\Mariano\Documents\ALONSOO\VISIONSETIL\kaggle\kernel_output_v16_live\models`: flagged flags=['no train/test_obs.json (UNKNOWN offline re-audit)']
- `C:\Users\Mariano\Documents\ALONSOO\VISIONSETIL\kaggle\kernel_output_v17\models`: flagged flags=['no train/test_obs.json (UNKNOWN offline re-audit)']
- `C:\Users\Mariano\Documents\ALONSOO\VISIONSETIL\kaggle\kernel_output_v18\models`: flagged flags=['no train/test_obs.json (UNKNOWN offline re-audit)']
- `C:\Users\Mariano\Documents\ALONSOO\VISIONSETIL\kaggle\kernel_output_v19\models`: flagged flags=['no train/test_obs.json (UNKNOWN offline re-audit)']
- `C:\Users\Mariano\Documents\ALONSOO\VISIONSETIL\kaggle\kernel_output_v20\models`: ok flags=[]
- `C:\Users\Mariano\Documents\ALONSOO\VISIONSETIL\kaggle\kernel_output_v9\models`: flagged flags=['no train/test_obs.json (UNKNOWN offline re-audit)']

