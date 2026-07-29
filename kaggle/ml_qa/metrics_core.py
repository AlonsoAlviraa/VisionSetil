"""Single source of truth for industrial ranking metrics.

Deadly safety:
  - deadly@3 = true class in top-3 among deadly-labeled samples
  - deadly@1 = top-1 among deadly samples (diagnostic only)
  - n_deadly==0 → recall 0.0 (never vacuous 1.0)

Orientation only — never consumption permission.
"""
from __future__ import annotations

from typing import Any

import numpy as np


def map_at_k(probs: np.ndarray, labels: np.ndarray, k: int = 3) -> float:
    """Mean average precision @ k (1/rank if true label in top-k else 0)."""
    probs = np.asarray(probs)
    labels = np.asarray(labels)
    if probs.ndim != 2 or len(labels) != probs.shape[0]:
        raise ValueError("probs must be (n, c) and labels length n")
    top = np.argsort(-probs, axis=1)[:, :k]
    aps = []
    for i, y in enumerate(labels):
        ranks = np.where(top[i] == y)[0]
        aps.append(1.0 / (float(ranks[0]) + 1.0) if len(ranks) else 0.0)
    return float(np.mean(aps)) if aps else 0.0


def top1_accuracy(probs: np.ndarray, labels: np.ndarray) -> float:
    probs = np.asarray(probs)
    labels = np.asarray(labels)
    if len(labels) == 0:
        return 0.0
    return float((probs.argmax(axis=1) == labels).mean())


def deadly_recall_at_k(
    probs: np.ndarray,
    labels: np.ndarray,
    deadly_idxs: set[int],
    k: int = 3,
) -> tuple[float, int]:
    """True deadly class in top-k among deadly-labeled samples."""
    probs = np.asarray(probs)
    labels = np.asarray(labels)
    top = np.argsort(-probs, axis=1)[:, :k]
    mask = np.array([int(y) in deadly_idxs for y in labels], dtype=bool)
    n = int(mask.sum())
    if n == 0:
        return 0.0, 0
    hits = sum(1 for i in range(len(labels)) if mask[i] and labels[i] in top[i])
    return float(hits / n), n


def deadly_top1(
    probs: np.ndarray,
    labels: np.ndarray,
    deadly_idxs: set[int],
) -> tuple[float, int]:
    """Top-1 among deadly-labeled samples (diagnostic only — not the product gate)."""
    probs = np.asarray(probs)
    labels = np.asarray(labels)
    mask = np.array([int(y) in deadly_idxs for y in labels], dtype=bool)
    n = int(mask.sum())
    if n == 0:
        return 0.0, 0
    preds = probs.argmax(axis=1)
    return float((preds[mask] == labels[mask]).mean()), n


def ece_naive(probs: np.ndarray, labels: np.ndarray) -> float:
    """mean(|max_prob - correct|) — matches some kernel test_ece fields."""
    probs = np.asarray(probs)
    labels = np.asarray(labels)
    if len(labels) == 0:
        return 0.0
    conf = probs.max(axis=1)
    correct = (probs.argmax(axis=1) == labels).astype(np.float64)
    return float(np.mean(np.abs(conf - correct)))


def ece_binned(probs: np.ndarray, labels: np.ndarray, n_bins: int = 15) -> float:
    """Standard reliability-diagram ECE."""
    probs = np.asarray(probs)
    labels = np.asarray(labels)
    if len(labels) == 0:
        return 0.0
    conf = probs.max(axis=1)
    pred = probs.argmax(axis=1)
    correct = (pred == labels).astype(np.float64)
    bins = np.linspace(0.0, 1.0, n_bins + 1)
    ece = 0.0
    for i in range(n_bins):
        hi = bins[i + 1]
        m = (conf >= bins[i]) & (conf < hi if i < n_bins - 1 else conf <= hi)
        if np.any(m):
            ece += abs(correct[m].mean() - conf[m].mean()) * float(m.mean())
    return float(ece)


def deadly_gate_eval(
    safety_recall_deadly_at_3: float,
    n_deadly: int,
    threshold: float = 0.50,
) -> dict[str, Any]:
    """Fail-closed expand deadly gate. Vacuous 1.0 never passes when n_deadly==0."""
    n = int(n_deadly)
    if n <= 0:
        return {
            "pass": False,
            "status": "unevaluable",
            "n_deadly": 0,
            "threshold": float(threshold),
            "value": None,
            "reason": "deadly gate unevaluable: 0 deadly samples in test",
        }
    val = float(safety_recall_deadly_at_3)
    return {
        "pass": val >= float(threshold),
        "status": "ok",
        "n_deadly": n,
        "threshold": float(threshold),
        "value": val,
        "reason": None,
    }


def recompute_all(
    probs: np.ndarray,
    labels: np.ndarray,
    deadly_idxs: set[int],
    k: int = 3,
) -> dict[str, Any]:
    """Full metric pack from prediction matrix."""
    d3, n_d = deadly_recall_at_k(probs, labels, deadly_idxs, k=k)
    d1, _ = deadly_top1(probs, labels, deadly_idxs)
    return {
        "map_at_k": map_at_k(probs, labels, k=k),
        "top1": top1_accuracy(probs, labels),
        "deadly_at_1": d1,
        "deadly_at_3": d3,
        "n_deadly": n_d,
        "ece_naive": ece_naive(probs, labels),
        "ece_binned_15": ece_binned(probs, labels, n_bins=15),
        "n": int(len(labels)),
    }
