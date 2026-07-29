#!/usr/bin/env python3
"""Export ArcFace class prototypes from E20 (or newest) best.pt as class_centroids.npy.

Usage:
  python scripts/export_e20_class_centroids.py
  python scripts/export_e20_class_centroids.py --weights kaggle/kernel_output_v20/models/best.pt

Orientation only — never consumption. Does not set product_unlock.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[1]


def extract_from_checkpoint(ckpt_path: Path) -> tuple[np.ndarray, dict]:
    import torch

    ck = torch.load(ckpt_path, map_location="cpu", weights_only=False)
    if not isinstance(ck, dict):
        raise TypeError(f"unexpected checkpoint type: {type(ck)}")
    ms = ck.get("model_state") or ck.get("state_dict") or {}
    arr = None
    source_key = None
    for key, w in ms.items():
        if str(key).endswith("arcface.weight") or key in ("arcface.weight", "head.weight"):
            a = w.detach().cpu().numpy() if hasattr(w, "detach") else np.asarray(w)
            if a.ndim == 2 and a.shape[0] >= 2:
                arr = a
                source_key = key
                break
    if arr is None:
        raise RuntimeError("no arcface.weight found in checkpoint")
    norms = np.linalg.norm(arr, axis=1, keepdims=True) + 1e-8
    cents = (arr / norms).astype(np.float32)
    meta = {
        "source_checkpoint": str(ckpt_path),
        "source_key": source_key,
        "shape": list(cents.shape),
        "num_classes": int(cents.shape[0]),
        "dim": int(cents.shape[1]),
        "label2idx_keys": list((ck.get("label2idx") or {}).keys())[:5],
        "n_labels": len(ck.get("label2idx") or {}),
        "product_unlock": False,
        "policy": "orientation_only_never_consume",
    }
    return cents, meta


def main() -> int:
    ap = argparse.ArgumentParser(description="Export ArcFace class centroids for open-set")
    ap.add_argument(
        "--weights",
        type=Path,
        default=REPO / "kaggle" / "kernel_output_v20" / "models" / "best.pt",
    )
    ap.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Default: sibling class_centroids.npy next to weights",
    )
    args = ap.parse_args()
    weights = args.weights
    if not weights.is_file():
        print(f"ERROR: weights not found: {weights}", file=sys.stderr)
        return 2
    out = args.out or (weights.parent / "class_centroids.npy")
    cents, meta = extract_from_checkpoint(weights)
    np.save(out, cents)
    meta_path = out.with_suffix(".meta.json")
    meta["out"] = str(out)
    meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "out": str(out), **meta}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
