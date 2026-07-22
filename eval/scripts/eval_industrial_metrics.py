#!/usr/bin/env python3
"""Industrial metrics for allowlist runs (MAP@3, deadly@k, ECE, coverage-acc).

Usage:
  python eval/scripts/eval_industrial_metrics.py \\
    --pred kaggle/kernel_output_v15/models/test_predictions.npz \\
    --label2idx kaggle/kernel_output_v15/models/label2idx.json \\
    --out data/industrial_v1/eval_report.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[2]


def map_at_k(probs: np.ndarray, labels: np.ndarray, k: int = 3) -> float:
    top = np.argsort(probs, axis=1)[:, ::-1][:, :k]
    aps = []
    for i, y in enumerate(labels):
        ranks = np.where(top[i] == y)[0]
        aps.append(1.0 / (ranks[0] + 1) if len(ranks) else 0.0)
    return float(np.mean(aps))


def ece_score(probs: np.ndarray, labels: np.ndarray, n_bins: int = 15) -> float:
    conf = probs.max(axis=1)
    pred = probs.argmax(axis=1)
    correct = (pred == labels).astype(np.float64)
    bins = np.linspace(0.0, 1.0, n_bins + 1)
    ece = 0.0
    for i in range(n_bins):
        m = (conf >= bins[i]) & (conf < bins[i + 1] if i < n_bins - 1 else conf <= bins[i + 1])
        if np.any(m):
            ece += abs(correct[m].mean() - conf[m].mean()) * m.mean()
    return float(ece)


def deadly_at_k(probs, labels, deadly_idx: set[int], k: int = 3) -> dict:
    mask = np.array([int(y) in deadly_idx for y in labels])
    n = int(mask.sum())
    if n == 0:
        return {"n": 0, "species_top1": None, "any_deadly_top1": None, f"any_deadly_top{k}": None}
    topk = np.argsort(probs[mask], axis=1)[:, -k:]
    top1 = probs[mask].argmax(axis=1)
    true_y = labels[mask]
    return {
        "n": n,
        "species_top1": float((top1 == true_y).mean()),
        "any_deadly_top1": float(np.mean([int(t) in deadly_idx for t in top1])),
        f"any_deadly_top{k}": float(
            np.mean([any(int(j) in deadly_idx for j in row) for row in topk])
        ),
    }


def coverage_acc(probs, labels, conf_thr: float, margin_thr: float = 0.0) -> dict:
    order = np.argsort(probs, axis=1)[:, ::-1]
    top1 = probs[np.arange(len(probs)), order[:, 0]]
    top2 = probs[np.arange(len(probs)), order[:, 1]] if probs.shape[1] > 1 else np.zeros_like(top1)
    margin = top1 - top2
    accept = (top1 >= conf_thr) & (margin >= margin_thr)
    n_acc = int(accept.sum())
    if n_acc == 0:
        return {"conf_thr": conf_thr, "margin_thr": margin_thr, "accept_rate": 0.0, "acc_when_accept": 0.0}
    preds = probs.argmax(axis=1)
    return {
        "conf_thr": conf_thr,
        "margin_thr": margin_thr,
        "accept_rate": n_acc / len(labels),
        "acc_when_accept": float((preds[accept] == labels[accept]).mean()),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pred", type=Path, required=True)
    ap.add_argument("--label2idx", type=Path, required=True)
    ap.add_argument(
        "--deadly",
        type=Path,
        default=REPO / "data" / "industrial_v1" / "deadly_set.json",
    )
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()

    z = np.load(args.pred)
    probs = z["probs"].astype(np.float64)
    labels = z["labels"].astype(np.int64)
    probs = probs / np.clip(probs.sum(axis=1, keepdims=True), 1e-12, None)

    l2i = json.loads(args.label2idx.read_text(encoding="utf-8"))
    idx2 = {int(v): str(k) for k, v in l2i.items()}
    deadly_doc = json.loads(args.deadly.read_text(encoding="utf-8"))
    deadly_names = {s["latin_name"].lower() for s in deadly_doc["species"]}
    deadly_idx = {i for i, n in idx2.items() if n.lower() in deadly_names}

    report = {
        "n": int(len(labels)),
        "n_classes": int(probs.shape[1]),
        "top1": float((probs.argmax(axis=1) == labels).mean()),
        "top3": float(
            np.mean([labels[i] in np.argsort(probs[i])[-3:] for i in range(len(labels))])
        ),
        "map_at_3": map_at_k(probs, labels, 3),
        "ece": ece_score(probs, labels),
        "deadly": deadly_at_k(probs, labels, deadly_idx, k=3),
        "open_set_grid": [
            coverage_acc(probs, labels, c, m)
            for c in (0.1, 0.15, 0.2, 0.3)
            for m in (0.0, 0.05, 0.1)
        ],
        "week1_kpi": {
            "map_at_3_min": 0.15,
            "deadly_at_3_min": 0.50,
        },
        "deploy_gate": {
            "map_at_3_min": 0.20,
            "deadly_min": 0.90,
        },
        "policy": "orientation_only_never_consume",
    }
    d3 = report["deadly"].get("any_deadly_top3")
    report["week1_pass"] = bool(
        report["map_at_3"] >= 0.15 and d3 is not None and d3 >= 0.50
    )
    report["deploy_pass"] = bool(
        report["map_at_3"] >= 0.20 and d3 is not None and d3 >= 0.90
    )

    text = json.dumps(report, indent=2)
    print(text)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text + "\n", encoding="utf-8")
        # optional industrial metrics mirror for gate later
        if report["deploy_pass"]:
            print("DEPLOY_GATE_PASS — may consider multi_view_weights_path update")
        else:
            print("DEPLOY_GATE_FAIL — do not deploy weights")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
