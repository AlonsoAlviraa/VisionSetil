#!/usr/bin/env python3
"""Document E20 best.pt vs best_deadly.pt (val peaks only).

Holdout test_predictions.npz is from the training eval protocol using the
primary MAP checkpoint — full offline re-infer A/B is out of scope here.
Serve default remains best.pt. product_unlock never set True.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / "kaggle" / "kernel_output_v20" / "models"
OUT = ROOT / "eval" / "reports" / "ml_experiments" / "e20_checkpoint_ablate.json"


def _meta(path: Path) -> dict:
    import torch

    ck = torch.load(path, map_location="cpu", weights_only=False)
    return {
        "path": str(path.relative_to(ROOT)),
        "exists": True,
        "checkpoint_kind": ck.get("checkpoint_kind"),
        "epoch": ck.get("epoch"),
        "val_map3": ck.get("val_map3"),
        "val_deadly3": ck.get("val_deadly3"),
        "n_classes": len(ck.get("label2idx") or {}),
    }


def main() -> None:
    best = MODELS / "best.pt"
    deadly = MODELS / "best_deadly.pt"
    metrics = {}
    mp = MODELS / "metrics.json"
    if mp.is_file():
        metrics = json.loads(mp.read_text(encoding="utf-8"))
    report = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "policy": "orientation_only_never_consume",
        "product_unlock": False,
        "serve_default": "best.pt",
        "serve_default_reason": "primary protocol is MAP@3 peak; holdout metrics attached to MAP path",
        "holdout_test": {
            "test_map_at_3": metrics.get("test_map_at_3"),
            "safety_recall_deadly_at_3": metrics.get("safety_recall_deadly_at_3"),
            "primary_checkpoint": metrics.get("primary_checkpoint"),
            "version": metrics.get("version"),
        },
        "checkpoints": {
            "best.pt": _meta(best) if best.is_file() else {"exists": False},
            "best_deadly.pt": _meta(deadly) if deadly.is_file() else {"exists": False},
        },
        "recommendation": (
            "Keep serve on best.pt. best_deadly.pt is an earlier-epoch deadly@3 peak "
            "with lower val MAP — use only for explicit safety ablations, not default serve."
        ),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
