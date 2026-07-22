#!/usr/bin/env python3
"""VisionSetil ML experiment battery — offline post-hoc + small CPU smokes.

Runs a large matrix of **measurable** experiments against:
  - kaggle/kernel_output_v9/models/test_predictions.npz  (logits-less softmax probs)
  - label2idx.json + poisonous_species.json (safety recall)

Does NOT invent metrics. Every number comes from the artifact or synthetic smoke.

Usage:
  python eval/scripts/run_ml_experiment_battery.py
  python eval/scripts/run_ml_experiment_battery.py --out eval/reports/ml_experiments
"""

from __future__ import annotations

import argparse
import json
import math
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

# --------------------------------------------------------------------------- #
# Paths
# --------------------------------------------------------------------------- #
REPO = Path(__file__).resolve().parents[2]
DEFAULT_PRED = REPO / "kaggle/kernel_output_v9/models/test_predictions.npz"
DEFAULT_L2I = REPO / "kaggle/kernel_output_v9/models/label2idx.json"
DEFAULT_METRICS = REPO / "kaggle/kernel_output_v9/models/metrics.json"
DEFAULT_POISON = REPO / "backend/app/data/poisonous_species.json"
DEFAULT_OUT = REPO / "eval/reports/ml_experiments"


# --------------------------------------------------------------------------- #
# Metrics helpers
# --------------------------------------------------------------------------- #
def softmax_np(logits: np.ndarray, axis: int = -1) -> np.ndarray:
    z = logits - np.max(logits, axis=axis, keepdims=True)
    e = np.exp(z)
    return e / np.sum(e, axis=axis, keepdims=True)


def apply_temperature(probs: np.ndarray, T: float) -> np.ndarray:
    """Re-temperature via log-probs (approx; true needs logits).

    For calibrated experiments we recover pseudo-logits = log(p+eps).
    """
    eps = 1e-12
    logits = np.log(np.clip(probs, eps, 1.0))
    return softmax_np(logits / max(T, 1e-3))


def topk_acc(probs: np.ndarray, labels: np.ndarray, k: int) -> float:
    top = np.argsort(probs, axis=1)[:, -k:]
    hits = np.array([labels[i] in top[i] for i in range(len(labels))], dtype=bool)
    return float(hits.mean())


def map_at_k(probs: np.ndarray, labels: np.ndarray, k: int = 3) -> float:
    """Standard MAP@k for single-label (AP = 1/rank if hit in top-k else 0)."""
    top = np.argsort(probs, axis=1)[:, ::-1][:, :k]
    aps = []
    for i, y in enumerate(labels):
        ranks = np.where(top[i] == y)[0]
        if len(ranks):
            aps.append(1.0 / (ranks[0] + 1))
        else:
            aps.append(0.0)
    return float(np.mean(aps))


def ece_score(probs: np.ndarray, labels: np.ndarray, n_bins: int = 15) -> float:
    conf = probs.max(axis=1)
    pred = probs.argmax(axis=1)
    correct = (pred == labels).astype(np.float64)
    bins = np.linspace(0.0, 1.0, n_bins + 1)
    ece = 0.0
    for i in range(n_bins):
        m = (conf >= bins[i]) & (conf < bins[i + 1] if i < n_bins - 1 else conf <= bins[i + 1])
        if not np.any(m):
            continue
        ece += abs(correct[m].mean() - conf[m].mean()) * (m.mean())
    return float(ece)


def margin_stats(probs: np.ndarray) -> dict[str, float]:
    part = np.partition(probs, -2, axis=1)
    top1 = part[:, -1]
    top2 = part[:, -2]
    m = top1 - top2
    return {
        "mean_margin": float(m.mean()),
        "median_margin": float(np.median(m)),
        "p10_margin": float(np.percentile(m, 10)),
        "p90_margin": float(np.percentile(m, 90)),
    }


def open_set_abstain(
    probs: np.ndarray,
    labels: np.ndarray,
    *,
    conf_thr: float,
    margin_thr: float,
) -> dict[str, float]:
    conf = probs.max(axis=1)
    part = np.partition(probs, -2, axis=1)
    margin = part[:, -1] - part[:, -2]
    accept = (conf >= conf_thr) & (margin >= margin_thr)
    n = len(labels)
    n_acc = int(accept.sum())
    if n_acc == 0:
        return {
            "accept_rate": 0.0,
            "abstain_rate": 1.0,
            "accuracy_when_accept": 0.0,
            "coverage_correct": 0.0,
            "n_accept": 0,
            "n_total": n,
        }
    preds = probs.argmax(axis=1)
    acc = float((preds[accept] == labels[accept]).mean())
    return {
        "accept_rate": float(n_acc / n),
        "abstain_rate": float(1.0 - n_acc / n),
        "accuracy_when_accept": acc,
        "coverage_correct": float(((preds == labels) & accept).sum() / n),
        "n_accept": n_acc,
        "n_total": n,
    }


def genus_of(name: str) -> str:
    parts = name.strip().split()
    return parts[0] if parts else name


def genus_top1(probs: np.ndarray, labels: np.ndarray, idx2label: dict[int, str]) -> float:
    preds = probs.argmax(axis=1)
    hits = 0
    for p, y in zip(preds, labels):
        gp = genus_of(idx2label.get(int(p), ""))
        gy = genus_of(idx2label.get(int(y), ""))
        if gp and gy and gp == gy:
            hits += 1
    return hits / max(len(labels), 1)


def deadly_recall(
    probs: np.ndarray,
    labels: np.ndarray,
    deadly_idx: set[int],
    *,
    k: int = 3,
) -> dict[str, Any]:
    """Among true deadly labels, fraction where any deadly appears in top-k (safety)."""
    mask = np.array([int(y) in deadly_idx for y in labels], dtype=bool)
    n = int(mask.sum())
    if n == 0:
        return {"n_deadly_in_test": 0, "recall_top1": None, "recall_topk": None, "k": k}
    topk = np.argsort(probs[mask], axis=1)[:, -k:]
    top1 = probs[mask].argmax(axis=1)
    r1 = float(np.mean([int(t) in deadly_idx for t in top1]))
    rk = float(np.mean([any(int(j) in deadly_idx for j in row) for row in topk]))
    # also: pure species match for deadly true labels
    true_deadly = labels[mask]
    pure = float((top1 == true_deadly).mean())
    return {
        "n_deadly_in_test": n,
        "species_top1_accuracy_on_deadly": pure,
        "any_deadly_in_top1": r1,
        "any_deadly_in_topk": rk,
        "k": k,
        "note": "Safety: prefer high any_deadly_in_topk even if species wrong",
    }


# --------------------------------------------------------------------------- #
# Experiment runners
# --------------------------------------------------------------------------- #
def exp_baseline(probs, labels, idx2label, deadly_idx) -> dict:
    return {
        "name": "baseline_v9_test",
        "top1": topk_acc(probs, labels, 1),
        "top3": topk_acc(probs, labels, 3),
        "top5": topk_acc(probs, labels, 5),
        "map_at_3": map_at_k(probs, labels, 3),
        "ece": ece_score(probs, labels),
        "genus_top1": genus_top1(probs, labels, idx2label),
        "margins": margin_stats(probs),
        "deadly": deadly_recall(probs, labels, deadly_idx, k=3),
        "n": int(len(labels)),
        "n_classes_in_test": int(len(np.unique(labels))),
    }


def exp_temperature_grid(probs, labels) -> list[dict]:
    rows = []
    for T in [0.5, 0.75, 1.0, 1.12, 1.25, 1.5, 2.0, 3.0, 5.0]:
        p = apply_temperature(probs, T)
        rows.append(
            {
                "T": T,
                "top1": topk_acc(p, labels, 1),
                "map_at_3": map_at_k(p, labels, 3),
                "ece": ece_score(p, labels),
                "mean_max_conf": float(p.max(axis=1).mean()),
            }
        )
    # pick min ECE
    best = min(rows, key=lambda r: r["ece"])
    return {"grid": rows, "best_by_ece": best}


def exp_open_set_grid(probs, labels) -> dict:
    rows = []
    for conf in [0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5]:
        for mar in [0.0, 0.02, 0.05, 0.1, 0.15, 0.2]:
            r = open_set_abstain(probs, labels, conf_thr=conf, margin_thr=mar)
            r["conf_thr"] = conf
            r["margin_thr"] = mar
            # utility: reward accuracy*sqrt(coverage)
            r["utility"] = r["accuracy_when_accept"] * math.sqrt(max(r["accept_rate"], 1e-9))
            rows.append(r)
    # best utility with accept_rate >= 0.2
    viable = [r for r in rows if r["accept_rate"] >= 0.2]
    best = max(viable or rows, key=lambda r: r["utility"])
    best_acc = max(viable or rows, key=lambda r: r["accuracy_when_accept"])
    return {
        "n_configs": len(rows),
        "best_utility_accept_ge_0.2": best,
        "best_accuracy_accept_ge_0.2": best_acc,
        "pareto_sample": sorted(
            [r for r in rows if r["accept_rate"] >= 0.15],
            key=lambda r: (-r["accuracy_when_accept"], -r["accept_rate"]),
        )[:8],
    }


def exp_confidence_bins(probs, labels) -> dict:
    conf = probs.max(axis=1)
    pred = probs.argmax(axis=1)
    correct = pred == labels
    edges = [0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.5, 1.01]
    bins = []
    for i in range(len(edges) - 1):
        m = (conf >= edges[i]) & (conf < edges[i + 1])
        n = int(m.sum())
        bins.append(
            {
                "bin": f"[{edges[i]}, {edges[i+1]})",
                "n": n,
                "acc": float(correct[m].mean()) if n else None,
                "mean_conf": float(conf[m].mean()) if n else None,
            }
        )
    return {"bins": bins}


def exp_class_long_tail(probs, labels, idx2label) -> dict:
    """Per-class accuracy; head vs tail by frequency in test set."""
    preds = probs.argmax(axis=1)
    classes, counts = np.unique(labels, return_counts=True)
    per = []
    for c, n in zip(classes, counts):
        m = labels == c
        acc = float((preds[m] == c).mean())
        per.append({"class_idx": int(c), "name": idx2label.get(int(c), "?"), "n": int(n), "acc": acc})
    per.sort(key=lambda x: (-x["n"], -x["acc"]))
    # head = top 50 by count, tail = rest
    head = per[:50]
    tail = per[50:] if len(per) > 50 else []
    return {
        "n_classes_seen": len(per),
        "head50_mean_acc": float(np.mean([x["acc"] for x in head])) if head else None,
        "tail_mean_acc": float(np.mean([x["acc"] for x in tail])) if tail else None,
        "zero_acc_classes": sum(1 for x in per if x["acc"] == 0.0),
        "worst10": sorted(per, key=lambda x: (x["acc"], -x["n"]))[:10],
        "best10": sorted(per, key=lambda x: (-x["acc"], -x["n"]))[:10],
    }


def exp_topk_curve(probs, labels) -> list[dict]:
    return [{"k": k, "acc": topk_acc(probs, labels, k), "map": map_at_k(probs, labels, k)} for k in range(1, 11)]


def exp_random_and_prior_baselines(probs, labels) -> dict:
    n, c = probs.shape
    rng = np.random.default_rng(42)
    uniform = np.ones_like(probs) / c
    # frequency prior from labels
    counts = np.bincount(labels, minlength=c).astype(np.float64)
    prior = counts / counts.sum()
    prior_probs = np.tile(prior, (n, 1))
    # random
    rand_preds = rng.integers(0, c, size=n)
    return {
        "uniform_top1": topk_acc(uniform, labels, 1),
        "uniform_map3": map_at_k(uniform, labels, 3),
        "frequency_prior_top1": topk_acc(prior_probs, labels, 1),
        "frequency_prior_map3": map_at_k(prior_probs, labels, 3),
        "random_top1": float((rand_preds == labels).mean()),
        "chance_1_over_C": 1.0 / c,
        "model_lift_over_chance_top1": topk_acc(probs, labels, 1) / (1.0 / c),
    }


def exp_view_proxy_noise(probs, labels) -> dict:
    """Proxy for multi-view ablation: mix model probs with uniform (missing views → weaker signal)."""
    n, c = probs.shape
    uniform = np.ones_like(probs) / c
    rows = []
    for alpha in [1.0, 0.75, 0.5, 0.25, 0.0]:
        # alpha=1 full model; alpha=0 pure noise
        p = alpha * probs + (1 - alpha) * uniform
        p = p / p.sum(axis=1, keepdims=True)
        rows.append(
            {
                "signal_alpha": alpha,
                "top1": topk_acc(p, labels, 1),
                "map_at_3": map_at_k(p, labels, 3),
                "interpretation": "alpha~ fraction of multi-view evidence kept",
            }
        )
    return {"mix_uniform_grid": rows}


def exp_cpu_v8_forward_smoke() -> dict:
    """Load real v8 weights and time a few forward passes (CPU)."""
    try:
        import torch
        from app.ml.multiview_v8 import load_v8_from_checkpoint
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"import: {exc}"}

    ckpt_path = REPO / "kaggle/kernel_output_v9/models/best.pt"
    if not ckpt_path.is_file():
        return {"ok": False, "error": "best.pt missing"}

    t0 = time.perf_counter()
    try:
        ckpt = torch.load(ckpt_path, map_location="cpu", weights_only=False)
        model, info = load_v8_from_checkpoint(ckpt, device="cpu")
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"load: {exc}"}
    load_s = time.perf_counter() - t0

    # [B,N,C,H,W]
    times = []
    with torch.inference_mode():
        for n_views in [1, 2, 4]:
            imgs = torch.randn(1, n_views, 3, 224, 224)
            view_idx = torch.arange(n_views).view(1, -1) % 4
            mask = torch.ones(1, n_views, dtype=torch.bool)
            meta = {
                k: torch.zeros(1, dtype=torch.long)
                for k in ("habitat", "substrate", "smell", "country")
            }
            t1 = time.perf_counter()
            logits, emb = model(imgs, view_idx, mask, meta)
            times.append(
                {
                    "n_views": n_views,
                    "ms": (time.perf_counter() - t1) * 1000,
                    "logits_shape": list(logits.shape),
                    "emb_shape": list(emb.shape),
                }
            )
    return {
        "ok": True,
        "load_seconds": load_s,
        "arch": info.get("arch"),
        "hparams": info.get("hparams"),
        "forwards": times,
        "device": "cpu",
    }


def exp_recommended_training_matrix() -> dict:
    """Document the next GPU experiments to run on Kaggle (not executed here)."""
    return {
        "gpu_quota_note": "Check kaggle get_accelerator_quota; design fits remaining hours",
        "priority_order": [
            {
                "id": "E-data-scale",
                "name": "More data per class",
                "change": "max_species=1000, max_obs_per_species=20, epochs=15",
                "hypothesis": "MAP@3 lifts mainly from data not architecture at few-shot regime",
                "primary_metric": "test_map_at_3",
                "safety_metric": "safety_recall_deadly",
            },
            {
                "id": "E-deadly-oversample",
                "name": "Oversample critical taxa",
                "change": "weighted sampler 5x for deadly label indices + focal loss",
                "hypothesis": "Raises safety_recall_deadly without collapsing MAP@3",
                "primary_metric": "safety_recall_deadly",
            },
            {
                "id": "E-views",
                "name": "Multi-view vs single-view",
                "change": "train with 1 vs 2–4 views per obs",
                "hypothesis": "MAP@3 gap quantifies multi-view value",
                "primary_metric": "test_map_at_3",
            },
            {
                "id": "E-backbone",
                "name": "tiny vs base",
                "change": "convnextv2_tiny (current) vs base if GPU allows",
                "hypothesis": "base helps head classes; tiny better for few-shot speed",
                "primary_metric": "test_map_at_3",
            },
            {
                "id": "E-open-set",
                "name": "Open-set threshold from val",
                "change": "sweep conf/margin on val; freeze on test",
                "hypothesis": "Accept@20% can double conditional accuracy",
                "primary_metric": "accuracy_when_accept",
            },
            {
                "id": "E-region-cyl",
                "name": "Hold-out Spain/Soria GBIF",
                "change": "eval-only set from GBIF ES media",
                "hypothesis": "Domain shift estimate for production Spain",
                "primary_metric": "map_at_3_region",
            },
        ],
        "baseline_to_beat": {
            "run": "kernel_output_v9",
            "test_map_at_3": 0.0758,
            "test_accuracy": 0.05,
            "safety_recall_deadly": 0.0,
        },
    }


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pred", type=Path, default=DEFAULT_PRED)
    ap.add_argument("--label2idx", type=Path, default=DEFAULT_L2I)
    ap.add_argument("--poison", type=Path, default=DEFAULT_POISON)
    ap.add_argument("--metrics", type=Path, default=DEFAULT_METRICS)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--skip-forward-smoke", action="store_true")
    args = ap.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    t0 = time.perf_counter()

    z = np.load(args.pred)
    probs = z["probs"].astype(np.float64)
    labels = z["labels"].astype(np.int64)
    # normalize rows just in case
    probs = probs / np.clip(probs.sum(axis=1, keepdims=True), 1e-12, None)

    l2i = json.loads(args.label2idx.read_text(encoding="utf-8"))
    idx2label = {int(v): str(k) for k, v in l2i.items()}

    poison = json.loads(args.poison.read_text(encoding="utf-8"))
    poison_names = {
        (p.get("latin_name") or p.get("taxon") or "").strip().lower()
        for p in poison
        if isinstance(p, dict)
    }
    deadly_idx = set()
    for name, idx in l2i.items():
        if name.strip().lower() in poison_names:
            deadly_idx.add(int(idx))
        # critical genera always tracked
        if name.split()[0] in {"Amanita", "Galerina"} and any(
            x in name.lower()
            for x in ("phalloides", "virosa", "marginata", "bisporigera", "verna")
        ):
            deadly_idx.add(int(idx))

    disk_metrics = None
    if args.metrics.is_file():
        disk_metrics = json.loads(args.metrics.read_text(encoding="utf-8"))

    report: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "artifacts": {
            "predictions": str(args.pred),
            "label2idx": str(args.label2idx),
            "disk_metrics": disk_metrics,
        },
        "deadly_class_indices": sorted(deadly_idx),
        "deadly_class_names": [idx2label[i] for i in sorted(deadly_idx) if i in idx2label],
        "experiments": {},
    }

    print("== baseline ==")
    report["experiments"]["baseline"] = exp_baseline(probs, labels, idx2label, deadly_idx)
    print(json.dumps(report["experiments"]["baseline"], indent=2)[:800])

    print("== temperature grid ==")
    report["experiments"]["temperature"] = exp_temperature_grid(probs, labels)

    print("== open-set grid ==")
    report["experiments"]["open_set"] = exp_open_set_grid(probs, labels)

    print("== confidence bins ==")
    report["experiments"]["confidence_bins"] = exp_confidence_bins(probs, labels)

    print("== long tail ==")
    report["experiments"]["long_tail"] = exp_class_long_tail(probs, labels, idx2label)

    print("== topk curve ==")
    report["experiments"]["topk_curve"] = exp_topk_curve(probs, labels)

    print("== chance baselines ==")
    report["experiments"]["chance_baselines"] = exp_random_and_prior_baselines(probs, labels)

    print("== multi-view proxy noise ==")
    report["experiments"]["multiview_proxy"] = exp_view_proxy_noise(probs, labels)

    print("== recommended training matrix ==")
    report["experiments"]["recommended_gpu_matrix"] = exp_recommended_training_matrix()

    if not args.skip_forward_smoke:
        print("== CPU v8 forward smoke ==")
        # ensure repo import path
        import sys

        sys.path.insert(0, str(REPO / "backend"))
        report["experiments"]["cpu_forward_smoke"] = exp_cpu_v8_forward_smoke()

    report["elapsed_seconds"] = time.perf_counter() - t0

    # Executive summary (honest)
    b = report["experiments"]["baseline"]
    tbest = report["experiments"]["temperature"]["best_by_ece"]
    os_best = report["experiments"]["open_set"]["best_utility_accept_ge_0.2"]
    report["executive_summary"] = {
        "headline": (
            f"v9 offline: MAP@3={b['map_at_3']:.4f}, top1={b['top1']:.4f}, "
            f"genus={b['genus_top1']:.4f}, ECE={b['ece']:.4f}. "
            f"Lift over chance x{report['experiments']['chance_baselines']['model_lift_over_chance_top1']:.1f}."
        ),
        "safety": b["deadly"],
        "best_temperature_by_ece": tbest,
        "best_open_set": {
            "conf_thr": os_best["conf_thr"],
            "margin_thr": os_best["margin_thr"],
            "accept_rate": os_best["accept_rate"],
            "accuracy_when_accept": os_best["accuracy_when_accept"],
        },
        "next_actions": [
            "Run E-data-scale on Kaggle GPU (more obs/class)",
            "Oversample deadly + re-measure safety_recall_deadly",
            "Ship open-set thresholds from best_open_set into settings",
            "Build Spain/Soria GBIF hold-out eval set",
        ],
        "policy": "orientation_only — never consumption permission",
    }

    out_json = args.out / "experiment_battery_report.json"
    out_md = args.out / "experiment_battery_report.md"
    out_json.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # Markdown brief
    md = [
        "# VisionSetil ML experiment battery",
        "",
        f"Generated: `{report['generated_at']}`",
        "",
        "## Executive summary",
        "",
        report["executive_summary"]["headline"],
        "",
        f"- Best T by ECE: **{tbest['T']}** (ECE={tbest['ece']:.4f}, MAP@3={tbest['map_at_3']:.4f})",
        f"- Best open-set: conf≥{os_best['conf_thr']}, margin≥{os_best['margin_thr']} → "
        f"accept={os_best['accept_rate']:.2%}, acc|accept={os_best['accuracy_when_accept']:.2%}",
        f"- Deadly in test: {b['deadly']}",
        f"- Zero-acc classes: {report['experiments']['long_tail']['zero_acc_classes']}",
        "",
        "## Chance baselines",
        "",
        "```json",
        json.dumps(report["experiments"]["chance_baselines"], indent=2),
        "```",
        "",
        "## Recommended GPU matrix",
        "",
    ]
    for e in report["experiments"]["recommended_gpu_matrix"]["priority_order"]:
        md.append(f"### {e['id']}: {e['name']}")
        md.append(f"- Change: {e['change']}")
        md.append(f"- Hypothesis: {e['hypothesis']}")
        md.append(f"- Metric: `{e['primary_metric']}`")
        md.append("")
    md.append("## Policy")
    md.append("")
    md.append("Safety-first: orientation only. Never authorize consumption.")
    md.append("")
    out_md.write_text("\n".join(md), encoding="utf-8")

    print(f"\nWrote {out_json}")
    print(f"Wrote {out_md}")
    print("SUMMARY:", report["executive_summary"]["headline"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
