#!/usr/bin/env python3
"""
VisionSetil — Full Evaluation Harness
======================================
Computes the complete metric suite referenced in model_metrics_report.md
and the mega_training configs.

Metrics computed:
  - Classification: Top-1/3/5 accuracy, macro/micro F1, balanced accuracy
  - FungiCLEF official: Observation-level MAP@3 (with bootstrap CI)
  - Open-set rejection: AUROC, F1 across thresholds, Precision-Recall curve
  - Calibration: ECE (Expected Calibration Error), MCE, reliability diagram
  - Safety: Toxic recall, deadly recall, false-edible rate, lookalike confusion
  - Per-class: precision/recall/F1/support, worst-N report
  - Confusion analysis: top confused pairs, genus-level aggregation

Usage:
    python compute_full_metrics.py \
        --predictions /path/to/test_predictions.npz \
        --metadata /path/to/test_metadata.csv \
        --toxicity-db /path/to/toxicity.json \
        --output-dir eval/reports/
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import (
    balanced_accuracy_score,
    classification_report,
    f1_score,
    precision_recall_curve,
    precision_recall_fscore_support,
    roc_auc_score,
)


# --------------------------------------------------------------------------- #
# 1. Classification Metrics                                                    #
# --------------------------------------------------------------------------- #
def compute_classification_metrics(
    labels: np.ndarray,
    preds: np.ndarray,
    probs: np.ndarray,
    idx2label: dict[int, str],
) -> dict:
    """Standard classification metrics."""
    num_samples = len(labels)

    def _top_k_acc(k: int) -> float:
        topk_preds = np.argpartition(probs, -k, axis=1)[:, -k:]
        hits = sum(1 for i, lbl in enumerate(labels) if lbl in topk_preds[i])
        return hits / num_samples

    f1_macro = float(f1_score(labels, preds, average="macro", zero_division=0))
    f1_micro = float(f1_score(labels, preds, average="micro", zero_division=0))
    bal_acc = float(balanced_accuracy_score(labels, preds))
    acc = float((preds == labels).mean())

    return {
        "top1_acc": acc,
        "top3_acc": _top_k_acc(3),
        "top5_acc": _top_k_acc(5),
        "f1_macro": f1_macro,
        "f1_micro": f1_micro,
        "balanced_acc": bal_acc,
        "num_samples": num_samples,
        "num_classes": len(idx2label),
    }


# --------------------------------------------------------------------------- #
# 2. Observation-level MAP@3 (official FungiCLEF metric) + Bootstrap CI       #
# --------------------------------------------------------------------------- #
def map_at_3_observation(
    probs: np.ndarray,
    labels: np.ndarray,
    obs_ids: np.ndarray,
    k: int = 3,
) -> float:
    """Observation-level MAP@K — official FungiCLEF metric."""
    df = pd.DataFrame({"obs_id": obs_ids, "label": labels})
    obs_labels = df.groupby("obs_id")["label"].first().to_dict()

    prob_df = pd.DataFrame(probs)
    prob_df["obs_id"] = obs_ids
    obs_probs = prob_df.groupby("obs_id").mean().values

    obs_ids_ordered = list(obs_labels.keys())
    map_sum = 0.0
    for i, obs_id in enumerate(obs_ids_ordered):
        true_label = obs_labels[obs_id]
        topk_idx = np.argsort(-obs_probs[i])[:k]
        for rank, pred_idx in enumerate(topk_idx):
            if pred_idx == true_label:
                map_sum += 1.0 / (rank + 1)
                break
    return map_sum / len(obs_ids_ordered)


def bootstrap_ci(
    metric_fn,
    probs: np.ndarray,
    labels: np.ndarray,
    obs_ids: np.ndarray,
    n_resamples: int = 10000,
    confidence: float = 0.95,
    seed: int = 42,
) -> dict:
    """Bootstrap confidence interval for any metric."""
    rng = np.random.default_rng(seed)
    point_estimate = metric_fn(probs, labels, obs_ids)

    # Build unique observation list for resampling
    unique_obs = np.unique(obs_ids)
    n_obs = len(unique_obs)

    bootstrap_scores = []
    for _ in range(n_resamples):
        # Resample at observation level (not image level)
        sampled_obs = rng.choice(unique_obs, size=n_obs, replace=True)
        mask = np.isin(obs_ids, sampled_obs)

        if mask.sum() < 2:
            continue

        try:
            score = metric_fn(probs[mask], labels[mask], obs_ids[mask])
            bootstrap_scores.append(score)
        except (ValueError, ZeroDivisionError):
            continue

    if not bootstrap_scores:
        return {"point": point_estimate, "ci_low": None, "ci_high": None}

    scores = np.array(bootstrap_scores)
    alpha = (1 - confidence) / 2
    ci_low = float(np.percentile(scores, alpha * 100))
    ci_high = float(np.percentile(scores, (1 - alpha) * 100))

    return {
        "point": point_estimate,
        "ci_low": ci_low,
        "ci_high": ci_high,
        "confidence": confidence,
        "n_resamples": len(scores),
        "std": float(np.std(scores)),
    }


# --------------------------------------------------------------------------- #
# 3. Open-Set Rejection Metrics                                                #
# --------------------------------------------------------------------------- #
def compute_open_set_metrics(
    probs: np.ndarray,
    labels: np.ndarray,
    in_dist_mask: np.ndarray,
    thresholds: list[float] | None = None,
) -> dict:
    """Open-set rejection: AUROC, F1, Precision-Recall across thresholds.

    Args:
        in_dist_mask: boolean array, True = in-distribution, False = OOD/novel.
    """
    # Max softmax probability as novelty score
    max_probs = probs.max(axis=1)
    # MaxLogit would require logits; max_prob is a good proxy

    # AUROC: can the score distinguish in-dist from OOD?
    ood_labels = (~in_dist_mask).astype(int)
    if len(np.unique(ood_labels)) == 2:
        auroc = float(roc_auc_score(ood_labels, -max_probs))
    else:
        auroc = None

    if thresholds is None:
        thresholds = [0.25, 0.30, 0.35, 0.40, 0.42, 0.45, 0.50, 0.55, 0.60, 0.70]

    threshold_results = []
    for thresh in thresholds:
        rejected = max_probs < thresh
        # For OOD samples: rejection = correct
        # For in-dist: rejection = false accept
        tp = (rejected & ~in_dist_mask).sum()  # OOD correctly rejected
        fp = (rejected & in_dist_mask).sum()  # in-dist incorrectly rejected
        fn = (~rejected & ~in_dist_mask).sum()  # OOD incorrectly accepted
        tn = (~rejected & in_dist_mask).sum()  # in-dist correctly accepted

        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
        false_accept_rate = fn / (fn + tn) if (fn + tn) > 0 else 0.0

        threshold_results.append(
            {
                "threshold": thresh,
                "precision": round(precision, 4),
                "recall": round(recall, 4),
                "f1": round(f1, 4),
                "false_accept_rate": round(false_accept_rate, 4),
            }
        )

    # Precision-Recall curve
    precision_arr, recall_arr, pr_thresholds = precision_recall_curve(
        ood_labels, -max_probs
    )

    return {
        "auroc": auroc,
        "method": "max_softmax_probability",
        "thresholds": threshold_results,
        "pr_curve": {
            "precision": precision_arr.tolist(),
            "recall": recall_arr.tolist(),
            "thresholds": pr_thresholds.tolist(),
        },
    }


# --------------------------------------------------------------------------- #
# 4. Calibration Metrics                                                       #
# --------------------------------------------------------------------------- #
def compute_calibration_metrics(
    probs: np.ndarray,
    labels: np.ndarray,
    preds: np.ndarray,
    n_bins: int = 15,
) -> dict:
    """Expected Calibration Error (ECE) and Maximum Calibration Error (MCE)."""
    confidences = probs.max(axis=1)
    correct = (preds == labels).astype(float)

    bins = np.linspace(0, 1, n_bins + 1)
    ece = 0.0
    mce = 0.0
    reliability = []

    for i in range(n_bins):
        lo, hi = bins[i], bins[i + 1]
        if i == 0:
            mask = (confidences >= lo) & (confidences <= hi)
        else:
            mask = (confidences > lo) & (confidences <= hi)

        n_bin = mask.sum()
        if n_bin == 0:
            reliability.append({"bin_lo": round(lo, 3), "bin_hi": round(hi, 3), "count": 0,
                                "avg_confidence": 0, "avg_accuracy": 0, "gap": 0})
            continue

        avg_conf = float(confidences[mask].mean())
        avg_acc = float(correct[mask].mean())
        gap = abs(avg_conf - avg_acc)

        ece += gap * n_bin / len(labels)
        mce = max(mce, gap)

        reliability.append({
            "bin_lo": round(lo, 3),
            "bin_hi": round(hi, 3),
            "count": int(n_bin),
            "avg_confidence": round(avg_conf, 4),
            "avg_accuracy": round(avg_acc, 4),
            "gap": round(gap, 4),
        })

    return {
        "ece": round(ece, 4),
        "mce": round(mce, 4),
        "n_bins": n_bins,
        "reliability_diagram": reliability,
    }


# --------------------------------------------------------------------------- #
# 5. Safety Metrics                                                            #
# --------------------------------------------------------------------------- #
def compute_safety_metrics(
    labels: np.ndarray,
    preds: np.ndarray,
    probs: np.ndarray,
    idx2label: dict[int, str],
    toxicity_db: dict[str, str],
    rejection_threshold: float = 0.42,
) -> dict:
    """Safety-focused metrics: toxic recall, false-edible rate.

    Args:
        toxicity_db: mapping species → "deadly" | "toxic" | "edible" | "unknown"
    """
    max_probs = probs.max(axis=1)
    rejected = max_probs < rejection_threshold

    def get_toxicity(label_idx: int) -> str:
        species = idx2label.get(label_idx, "__unknown__")
        return toxicity_db.get(species, "unknown")

    true_toxicity = np.array([get_toxicity(lbl) for lbl in labels])
    pred_toxicity = np.array([
        "rejected" if rejected[i] else get_toxicity(p) for i, p in enumerate(preds)
    ])

    # Toxic recall: toxic species correctly flagged as toxic OR rejected
    toxic_mask = true_toxicity == "toxic"
    if toxic_mask.sum() > 0:
        toxic_correct = (
            (pred_toxicity == "toxic") | (pred_toxicity == "rejected")
        )[toxic_mask].mean()
    else:
        toxic_correct = None

    # Deadly recall
    deadly_mask = true_toxicity == "deadly"
    if deadly_mask.sum() > 0:
        deadly_correct = (
            (pred_toxicity == "deadly") | (pred_toxicity == "toxic") | (pred_toxicity == "rejected")
        )[deadly_mask].mean()
    else:
        deadly_correct = None

    # False edible rate: deadly/toxic predicted as edible
    dangerous_mask = (true_toxicity == "deadly") | (true_toxicity == "toxic")
    if dangerous_mask.sum() > 0:
        false_edible = (pred_toxicity[dangerous_mask] == "edible").mean()
    else:
        false_edible = None

    return {
        "toxic_recall": round(float(toxic_correct), 4) if toxic_correct is not None else None,
        "deadly_recall": round(float(deadly_correct), 4) if deadly_correct is not None else None,
        "false_edible_rate": round(float(false_edible), 4) if false_edible is not None else None,
        "rejection_threshold": rejection_threshold,
        "n_toxic": int(toxic_mask.sum()),
        "n_deadly": int(deadly_mask.sum()),
    }


# --------------------------------------------------------------------------- #
# 6. Confusion Analysis                                                        #
# --------------------------------------------------------------------------- #
def compute_confusion_analysis(
    labels: np.ndarray,
    preds: np.ndarray,
    idx2label: dict[int, str],
    top_n: int = 20,
) -> dict:
    """Top confused species pairs + genus-level breakdown."""
    # Top confused pairs
    confused_pairs = {}
    for true_lbl, pred_lbl in zip(labels, preds, strict=True):
        if true_lbl != pred_lbl:
            pair = (idx2label.get(true_lbl, "?"), idx2label.get(pred_lbl, "?"))
            confused_pairs[pair] = confused_pairs.get(pair, 0) + 1

    top_confused = sorted(confused_pairs.items(), key=lambda x: -x[1])[:top_n]
    top_confused_list = [
        {"true_species": t, "pred_species": p, "count": c}
        for (t, p), c in top_confused
    ]

    # Genus-level accuracy
    genus_correct = {}
    genus_total = {}
    for true_lbl, pred_lbl in zip(labels, preds, strict=True):
        true_species = idx2label.get(true_lbl, "?")
        genus = true_species.split()[0] if " " in true_species else true_species
        genus_total[genus] = genus_total.get(genus, 0) + 1
        if true_lbl == pred_lbl:
            genus_correct[genus] = genus_correct.get(genus, 0) + 1

    genus_acc = sorted(
        [
            {"genus": g, "accuracy": genus_correct.get(g, 0) / n, "samples": n}
            for g, n in genus_total.items()
            if n >= 10  # only genera with enough samples
        ],
        key=lambda x: x["accuracy"],
    )

    return {
        "top_confused_pairs": top_confused_list,
        "genus_accuracy": genus_acc,
    }


# --------------------------------------------------------------------------- #
# 7. Per-class Report                                                          #
# --------------------------------------------------------------------------- #
def compute_per_class_report(
    labels: np.ndarray,
    preds: np.ndarray,
    idx2label: dict[int, str],
    worst_n: int = 20,
) -> dict:
    """Full per-class precision/recall/F1 with worst-N highlighted."""
    report = classification_report(
        labels, preds, output_dict=True, zero_division=0
    )

    # Extract per-class metrics
    per_class = []
    precision, recall, fscore, support = precision_recall_fscore_support(
        labels, preds, zero_division=0
    )
    for i in range(len(idx2label)):
        per_class.append({
            "class_id": i,
            "species": idx2label.get(i, f"class_{i}"),
            "precision": round(float(precision[i]), 4),
            "recall": round(float(recall[i]), 4),
            "f1": round(float(fscore[i]), 4),
            "support": int(support[i]),
        })

    # Sort by F1 (worst first)
    worst = sorted(per_class, key=lambda x: x["f1"])[:worst_n]
    best = sorted(per_class, key=lambda x: -x["f1"])[:worst_n]

    return {
        "full_report": per_class,
        "worst_classes": worst,
        "best_classes": best,
        "macro_avg": report.get("macro avg", {}),
        "weighted_avg": report.get("weighted avg", {}),
    }


# --------------------------------------------------------------------------- #
# 7b. Multi-view ablation (ML_IMPROVEMENT_PROMPT §6.2)                         #
# --------------------------------------------------------------------------- #
CANONICAL_VIEWS: tuple[str, ...] = ("gills", "front", "habitat", "detail")


def compute_multi_view_ablation(
    probs: np.ndarray,
    labels: np.ndarray,
    obs_ids: np.ndarray,
    view_sets: np.ndarray,
    k: int = 3,
) -> dict:
    """MAP@K by number of views present and by view combination.

    Parameters
    ----------
    view_sets
        Object array (length = n_samples) where each element is a tuple/frozenset
        of view labels present for that observation/image (e.g. ``("gills", "front")``).
        If ``None`` entries are present they are treated as "unknown".
    """
    df = pd.DataFrame({
        "obs_id": obs_ids,
        "label": labels,
        "n_views": [len(vs) if vs is not None else 0 for vs in view_sets],
        "view_combo": [
            ",".join(sorted(vs)) if vs else "unknown" for vs in view_sets
        ],
    })

    # Aggregate probs by observation (mean over images of the same observation).
    prob_df = pd.DataFrame(probs)
    prob_df["obs_id"] = obs_ids
    obs_probs = prob_df.groupby("obs_id").mean().values
    obs_meta = df.groupby("obs_id").first()

    # MAP@K per number of views.
    by_count: dict[int, float] = {}
    for n in sorted(df["n_views"].unique()):
        if n == 0:
            continue
        idxs = obs_meta.index[obs_meta["n_views"] == n].tolist()
        if not idxs:
            continue
        sub_probs = obs_probs[[list(obs_meta.index).index(i) for i in idxs]]
        sub_labels = obs_meta.loc[idxs, "label"].values
        sub_obs = np.array(idxs)
        by_count[int(n)] = float(map_at_3_observation(sub_probs, sub_labels, sub_obs, k=k))

    # MAP@K per view combination (top-10 most frequent).
    combo_counts = df["view_combo"].value_counts().head(10)
    by_combo: dict[str, dict] = {}
    for combo, count in combo_counts.items():
        idxs = obs_meta.index[obs_meta["view_combo"] == combo].tolist()
        if not idxs:
            continue
        sub_probs = obs_probs[[list(obs_meta.index).index(i) for i in idxs]]
        sub_labels = obs_meta.loc[idxs, "label"].values
        sub_obs = np.array(idxs)
        by_combo[combo] = {
            "map_at_k": float(map_at_3_observation(sub_probs, sub_labels, sub_obs, k=k)),
            "n_observations": len(idxs),
        }

    # Leave-one-out contribution per canonical view (Shapley approximation).
    contribution: dict[str, float] = {}
    overall = float(map_at_3_observation(obs_probs, obs_meta["label"].values, obs_meta.index.to_numpy(), k=k))
    for view in CANONICAL_VIEWS:
        without = obs_meta.index[~obs_meta["view_combo"].apply(lambda c: view in c)]
        if len(without) < 10:
            contribution[view] = 0.0
            continue
        idx_positions = [list(obs_meta.index).index(i) for i in without]
        sub_probs = obs_probs[idx_positions]
        sub_labels = obs_meta.loc[without, "label"].values
        sub_obs = np.array(list(without))
        without_map = float(map_at_3_observation(sub_probs, sub_labels, sub_obs, k=k))
        contribution[view] = round(overall - without_map, 4)

    return {
        "map_at_k_by_view_count": {str(kk): round(v, 4) for kk, v in by_count.items()},
        "map_at_k_by_view_combo": {
            c: {**v, "map_at_k": round(v["map_at_k"], 4)} for c, v in by_combo.items()
        },
        "leave_one_out_contribution": contribution,
        "overall_map_at_k": round(overall, 4),
        "k": k,
    }


# --------------------------------------------------------------------------- #
# 8. Main — Full Report                                                        #
# --------------------------------------------------------------------------- #
def generate_full_report(
    probs: np.ndarray,
    preds: np.ndarray,
    labels: np.ndarray,
    obs_ids: np.ndarray,
    idx2label: dict[int, str],
    in_dist_mask: np.ndarray | None = None,
    toxicity_db: dict | None = None,
    view_sets: np.ndarray | None = None,
    output_dir: Path = Path("eval/reports"),
) -> dict:
    """Generate the complete metric report."""
    output_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("  VisionSetil Full Evaluation Harness")
    print("=" * 60)
    print(f"  Samples: {len(labels)} | Classes: {len(idx2label)}")
    print(f"  Observations: {len(np.unique(obs_ids))}")
    print("=" * 60)

    # 1. Classification metrics
    print("\n📊 Computing classification metrics...")
    clf_metrics = compute_classification_metrics(labels, preds, probs, idx2label)
    print(f"   Top-1 Acc: {clf_metrics['top1_acc']:.4f}")
    print(f"   Top-3 Acc: {clf_metrics['top3_acc']:.4f}")
    print(f"   F1 Macro:  {clf_metrics['f1_macro']:.4f}")

    # 2. MAP@3 + Bootstrap CI
    print("\n🎯 Computing observation-level MAP@3 with bootstrap CI...")
    map3_ci = bootstrap_ci(map_at_3_observation, probs, labels, obs_ids, n_resamples=1000)
    print(f"   MAP@3: {map3_ci['point']:.4f} "
          f"[{map3_ci['ci_low']:.4f}, {map3_ci['ci_high']:.4f}]")

    # 3. Open-set rejection
    open_set = None
    if in_dist_mask is not None:
        print("\n🛡️  Computing open-set rejection metrics...")
        open_set = compute_open_set_metrics(probs, labels, in_dist_mask)
        if open_set["auroc"]:
            print(f"   AUROC: {open_set['auroc']:.4f}")

    # 4. Calibration
    print("\n📐 Computing calibration metrics...")
    calibration = compute_calibration_metrics(probs, labels, preds)
    print(f"   ECE: {calibration['ece']:.4f}")
    print(f"   MCE: {calibration['mce']:.4f}")

    # 5. Safety
    safety = None
    if toxicity_db:
        print("\n☠️  Computing safety metrics...")
        safety = compute_safety_metrics(labels, preds, probs, idx2label, toxicity_db)
        if safety["toxic_recall"] is not None:
            print(f"   Toxic Recall:  {safety['toxic_recall']:.4f}")
        if safety["deadly_recall"] is not None:
            print(f"   Deadly Recall: {safety['deadly_recall']:.4f}")
        if safety["false_edible_rate"] is not None:
            print(f"   False Edible:  {safety['false_edible_rate']:.4f}")

    # 6. Confusion analysis
    print("\n🔀 Computing confusion analysis...")
    confusion = compute_confusion_analysis(labels, preds, idx2label)
    print(f"   Top confused: {confusion['top_confused_pairs'][0]['true_species']} "
          f"→ {confusion['top_confused_pairs'][0]['pred_species']} "
          f"({confusion['top_confused_pairs'][0]['count']} cases)")

    # 7. Per-class report
    print("\n📋 Computing per-class report...")
    per_class = compute_per_class_report(labels, preds, idx2label)

    # 7b. Multi-view ablation (optional, when view_sets provided)
    multi_view = None
    if view_sets is not None:
        print("\n🔬 Computing multi-view ablation (MAP@K by view count/combo)...")
        multi_view = compute_multi_view_ablation(probs, labels, obs_ids, view_sets)
        print(f"   Overall MAP@K: {multi_view['overall_map_at_k']:.4f}")
        print(f"   Leave-one-out contribution:")
        for view, delta in multi_view["leave_one_out_contribution"].items():
            print(f"     {view:8s}: {delta:+.4f}")

    # Assemble full report
    full_report = {
        "metadata": {
            "num_samples": len(labels),
            "num_observations": len(np.unique(obs_ids)),
            "num_classes": len(idx2label),
        },
        "classification": clf_metrics,
        "map_at_3": map3_ci,
        "open_set": open_set,
        "calibration": calibration,
        "safety": safety,
        "confusion": confusion,
        "per_class": per_class,
        "multi_view_ablation": multi_view,
    }

    # Save JSON
    report_path = output_dir / "full_metrics_report.json"
    with open(report_path, "w") as f:
        json.dump(full_report, f, indent=2)
    print(f"\n✅ Full report saved to: {report_path}")

    # Save human-readable summary
    summary_path = output_dir / "full_metrics_summary.md"
    with open(summary_path, "w") as f:
        f.write("# VisionSetil — Full Evaluation Report\n\n")
        f.write(f"- **Samples:** {len(labels)}\n")
        f.write(f"- **Observations:** {len(np.unique(obs_ids))}\n")
        f.write(f"- **Classes:** {len(idx2label)}\n\n")
        f.write("## Key Metrics\n\n")
        f.write("| Metric | Value | 95% CI |\n|--------|-------|--------|\n")
        f.write(f"| **MAP@3 (obs)** | **{map3_ci['point']:.4f}** | "
                f"[{map3_ci['ci_low']:.4f}, {map3_ci['ci_high']:.4f}] |\n")
        f.write(f"| Top-1 Accuracy | {clf_metrics['top1_acc']:.4f} | — |\n")
        f.write(f"| Top-3 Accuracy | {clf_metrics['top3_acc']:.4f} | — |\n")
        f.write(f"| F1 Macro | {clf_metrics['f1_macro']:.4f} | — |\n")
        f.write(f"| Balanced Acc | {clf_metrics['balanced_acc']:.4f} | — |\n")
        if open_set and open_set["auroc"]:
            f.write(f"| Open-set AUROC | {open_set['auroc']:.4f} | — |\n")
        f.write(f"| ECE | {calibration['ece']:.4f} | — |\n")
        if safety:
            f.write("\n## Safety\n\n| Metric | Value |\n|--------|-------|\n")
            if safety["toxic_recall"] is not None:
                f.write(f"| Toxic Recall | {safety['toxic_recall']:.4f} |\n")
            if safety["deadly_recall"] is not None:
                f.write(f"| Deadly Recall | {safety['deadly_recall']:.4f} |\n")
            if safety["false_edible_rate"] is not None:
                f.write(f"| False Edible Rate | {safety['false_edible_rate']:.4f} |\n")

    print(f"📝 Summary saved to: {summary_path}")
    return full_report


# --------------------------------------------------------------------------- #
# CLI                                                                          #
# --------------------------------------------------------------------------- #
def main() -> None:
    parser = argparse.ArgumentParser(description="VisionSetil Full Evaluation Harness")
    parser.add_argument(
        "--predictions", required=True,
        help="Path to test_predictions.npz from mega_training.py"
    )
    parser.add_argument(
        "--label2idx", required=True,
        help="Path to label2idx.json (maps species name → class id)"
    )
    parser.add_argument(
        "--toxicity-db", default=None,
        help="JSON mapping species → toxicity level"
    )
    parser.add_argument(
        "--ood-labels", default=None,
        help="Comma-separated list of label indices that are OOD (for open-set eval)"
    )
    parser.add_argument(
        "--views-column", default=None,
        help="Optional CSV column name or .npz key containing per-sample view tuples "
             "(enables multi-view ablation A8)."
    )
    parser.add_argument(
        "--output-dir", default="eval/reports",
        help="Output directory for reports"
    )
    args = parser.parse_args()

    # Load predictions
    data = np.load(args.predictions, allow_pickle=True)
    probs = data["probs"]
    preds = data["preds"]
    labels = data["labels"]
    obs_ids = data["obs_ids"].astype(str)

    # Optional: multi-view ablation input.
    view_sets: np.ndarray | None = None
    if args.views_column and args.views_column in data.files:
        view_sets = data[args.views_column]

    # Load label map
    with open(args.label2idx) as f:
        label2idx = json.load(f)
    idx2label = {v: k for k, v in label2idx.items()}

    # Load toxicity DB
    toxicity_db = None
    if args.toxicity_db and Path(args.toxicity_db).exists():
        with open(args.toxicity_db) as f:
            toxicity_db = json.load(f)

    # Determine in-dist vs OOD
    in_dist_mask = None
    if args.ood_labels:
        ood_set = set(int(x) for x in args.ood_labels.split(","))
        in_dist_mask = ~np.isin(labels, list(ood_set))
    else:
        # If no OOD labels specified, treat all as in-dist
        in_dist_mask = np.ones(len(labels), dtype=bool)

    generate_full_report(
        probs=probs,
        preds=preds,
        labels=labels,
        obs_ids=obs_ids,
        idx2label=idx2label,
        in_dist_mask=in_dist_mask,
        toxicity_db=toxicity_db,
        view_sets=view_sets,
        output_dir=Path(args.output_dir),
    )


if __name__ == "__main__":
    main()
