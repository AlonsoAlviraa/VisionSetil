"""Professional ML QA for VisionSetil industrial training.

Single contract for metrics, leak invariants, gates, and artifact audits.
Orientation only — never consumption permission.
"""
from __future__ import annotations

from kaggle.ml_qa.gate_eval import evaluate_product_gates
from kaggle.ml_qa.metrics_core import (
    deadly_gate_eval,
    deadly_recall_at_k,
    deadly_top1,
    ece_binned,
    ece_naive,
    map_at_k,
    top1_accuracy,
)

__all__ = [
    "map_at_k",
    "top1_accuracy",
    "deadly_recall_at_k",
    "deadly_top1",
    "ece_naive",
    "ece_binned",
    "deadly_gate_eval",
    "evaluate_product_gates",
]
