#!/usr/bin/env python3
"""Compare two VisionSetil ML loop metric reports (v1 vs v2)."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def _load(path: Path) -> dict:
    candidates = [
        path / "image_ml_loop_metrics.json",
        path / "full_metrics_report.json",
        path if path.is_file() else None,
    ]
    for c in candidates:
        if c and c.exists() and c.is_file():
            return json.loads(c.read_text(encoding="utf-8"))
    raise FileNotFoundError(f"No metrics JSON under {path}")


def _pick(report: dict, *keys: str):
    cur: object = report
    for k in keys:
        if not isinstance(cur, dict) or k not in cur:
            return None
        cur = cur[k]
    return cur


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--a", required=True, help="Report dir or file A (baseline)")
    p.add_argument("--b", required=True, help="Report dir or file B (candidate)")
    args = p.parse_args()
    a = _load(Path(args.a))
    b = _load(Path(args.b))

    rows = [
        ("MAP@3", _pick(a, "map_at_3", "point"), _pick(b, "map_at_3", "point")),
        ("top1", _pick(a, "classification", "top1_acc"), _pick(b, "classification", "top1_acc")),
        ("top3", _pick(a, "classification", "top3_acc"), _pick(b, "classification", "top3_acc")),
        ("ECE", _pick(a, "calibration", "ece"), _pick(b, "calibration", "ece")),
        (
            "deadly_recall",
            _pick(a, "safety", "deadly_recall"),
            _pick(b, "safety", "deadly_recall"),
        ),
    ]
    print(f"{'metric':<16} {'A':>10} {'B':>10} {'delta':>10}")
    print("-" * 50)
    for name, va, vb in rows:
        try:
            fa = float(va) if va is not None else float("nan")
            fb = float(vb) if vb is not None else float("nan")
            delta = fb - fa
            print(f"{name:<16} {fa:10.4f} {fb:10.4f} {delta:+10.4f}")
        except (TypeError, ValueError):
            print(f"{name:<16} {va!s:>10} {vb!s:>10} {'n/a':>10}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
