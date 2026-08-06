"""Multi-view product contracts + offline bench summary (ops / dashboard).

Loads eval reports when present. Never unlocks Identify.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

CANONICAL_VIEWS = ("gills", "front", "habitat", "detail")
VIEW_WEIGHTS = {
    "gills": 0.38,
    "front": 0.32,
    "habitat": 0.15,
    "detail": 0.15,
}


def describe_multiview_product(repo_root: Path | str) -> dict[str, Any]:
    """Summary of multi-view contracts + four-photo bench + paired inventory."""
    root = Path(repo_root)
    out: dict[str, Any] = {
        "product_unlock": False,
        "policy": "orientation_only_never_consume",
        "canonical_order": list(CANONICAL_VIEWS),
        "view_weights": dict(VIEW_WEIGHTS),
        "soft_submit_min_photos": 1,
        "recommended_min_for_field_id": 2,
        "full_packet": 4,
        "note": "gills+front first (Picture Mushroom / field-guide style)",
    }
    bench_path = (
        root / "eval" / "reports" / "ml_experiments" / "multiview_four_photo_benchmark.json"
    )
    if bench_path.is_file():
        try:
            bench = json.loads(bench_path.read_text(encoding="utf-8"))
            by_n = (bench.get("proxy_ablation") or {}).get("by_n_views") or {}
            deltas = (bench.get("proxy_ablation") or {}).get("deltas") or {}
            out["benchmark"] = {
                "path": str(bench_path.relative_to(root)).replace("\\", "/"),
                "overall": bench.get("overall"),
                "map3_1": (by_n.get("1") or {}).get("map_at_3"),
                "map3_2": (by_n.get("2") or {}).get("map_at_3"),
                "map3_4": (by_n.get("4") or {}).get("map_at_3"),
                "reject_1": (by_n.get("1") or {}).get("reject_rate"),
                "reject_4": (by_n.get("4") or {}).get("reject_rate"),
                "map3_4_minus_1": deltas.get("map3_4_minus_1"),
                "torch_ok": (bench.get("torch_forward_smoke") or {}).get("ok"),
                "gates_pass": ((bench.get("proxy_ablation") or {}).get("gates") or {}).get("pass"),
                "method": (bench.get("proxy_ablation") or {}).get("method"),
            }
        except (OSError, ValueError, TypeError):
            out["benchmark"] = {"error": "unreadable"}

    inv_path = root / "eval" / "reports" / "ml_experiments" / "paired_multiview_inventory.json"
    if inv_path.is_file():
        try:
            inv = json.loads(inv_path.read_text(encoding="utf-8"))
            out["paired_inventory"] = {
                "path": str(inv_path.relative_to(root)).replace("\\", "/"),
                "true_leave_one_photo_out": (inv.get("readiness") or {}).get(
                    "true_leave_one_photo_out"
                ),
                "blocker": (inv.get("readiness") or {}).get("blocker"),
                "train_multi_ge2": (inv.get("readiness") or {}).get("train_multi_ge2"),
                "val_multi_ge2": (inv.get("readiness") or {}).get("val_multi_ge2"),
                "test_multi_ge2": (inv.get("readiness") or {}).get("test_multi_ge2"),
            }
        except (OSError, ValueError, TypeError):
            out["paired_inventory"] = {"error": "unreadable"}
    else:
        out["paired_inventory"] = {"status": "not_generated"}

    loo_path = root / "eval" / "reports" / "ml_experiments" / "paired_multiview_loo_eval.json"
    if loo_path.is_file():
        try:
            loo = json.loads(loo_path.read_text(encoding="utf-8"))
            by = (loo.get("torch") or {}).get("by_n_views") or {}
            out["paired_loo_eval"] = {
                "path": str(loo_path.relative_to(root)).replace("\\", "/"),
                "protocol": loo.get("protocol"),
                "packs_ge2": (loo.get("inventory") or {}).get("n_packs_ge2"),
                "packs_ge4": (loo.get("inventory") or {}).get("n_packs_ge4"),
                "torch_ok": (loo.get("torch") or {}).get("ok"),
                "map3_1": (by.get("1") or {}).get("map_at_3"),
                "map3_2": (by.get("2") or {}).get("map_at_3"),
                "map3_4": (by.get("4") or {}).get("map_at_3"),
                "top1_1": (by.get("1") or {}).get("top1"),
                "top1_4": (by.get("4") or {}).get("top1"),
                "reject_1": (by.get("1") or {}).get("reject_rate"),
                "reject_4": (by.get("4") or {}).get("reject_rate"),
                "deltas": loo.get("deltas"),
                "gates": loo.get("gates"),
                "loo_summary": loo.get("loo_summary")
                or (loo.get("torch") or {}).get("leave_one_photo_out"),
                "n_eval_packs": (loo.get("torch") or {}).get("n_packs_attempted"),
                "n_species": (loo.get("torch") or {}).get("n_species_in_sample"),
                "sampling": (loo.get("torch") or {}).get("sampling"),
                "temperature": (loo.get("torch") or {}).get("temperature"),
            }
            # Local GBIF same-occurrence packs enable true multi-image eval even
            # when FungiTastic Kaggle paths are not mounted.
            if (loo.get("torch") or {}).get("ok"):
                out["paired_same_occurrence_ready"] = True
        except (OSError, ValueError, TypeError):
            out["paired_loo_eval"] = {"error": "unreadable"}

    deadly_path = root / "eval" / "reports" / "ml_experiments" / "paired_multiview_loo_deadly.json"
    if deadly_path.is_file():
        try:
            dloo = json.loads(deadly_path.read_text(encoding="utf-8"))
            dby = (dloo.get("torch") or {}).get("by_n_views") or {}
            out["paired_loo_deadly"] = {
                "path": str(deadly_path.relative_to(root)).replace("\\", "/"),
                "protocol": dloo.get("protocol"),
                "torch_ok": (dloo.get("torch") or {}).get("ok"),
                "n_eval_packs": (dloo.get("torch") or {}).get("n_packs_attempted"),
                "n_species": (dloo.get("torch") or {}).get("n_species_in_sample"),
                "map3_1": (dby.get("1") or {}).get("map_at_3"),
                "map3_2": (dby.get("2") or {}).get("map_at_3"),
                "map3_4": (dby.get("4") or {}).get("map_at_3"),
                "deltas": dloo.get("deltas"),
                "gates": dloo.get("gates"),
                "note": (
                    "Deadly-only same-occurrence packs: multi-view MAP@3 does not "
                    "reliably improve vs single photo — keep SSOT lookalikes + open-set; "
                    "never forage permission."
                ),
            }
            # Product honesty: overall multi-view helps; deadly subset is flat
            d_delta = (dloo.get("deltas") or {}).get("map3_4_minus_1")
            if d_delta is not None and float(d_delta) < 0.02:
                out["deadly_multiview_caveat"] = True
        except (OSError, ValueError, TypeError):
            out["paired_loo_deadly"] = {"error": "unreadable"}

    # M3 canonical same-specimen field holdout report
    fh_path = root / "eval" / "reports" / "ml_experiments" / "field_multiview_holdout.json"
    if fh_path.is_file():
        try:
            fh = json.loads(fh_path.read_text(encoding="utf-8"))
            out["field_holdout_m3"] = {
                "path": str(fh_path.relative_to(root)).replace("\\", "/"),
                "protocol": fh.get("protocol"),
                "version": fh.get("version"),
                "gates_pass": (fh.get("gates") or {}).get("pass"),
                "readiness": fh.get("readiness"),
                "headline": fh.get("headline"),
                "deadly_multiview_caveat": bool(fh.get("deadly_multiview_caveat")),
                "product_unlock": False,
                "policy": fh.get("policy") or "orientation_only_never_consume",
            }
            if (fh.get("readiness") or {}).get("torch_field_eval_ok"):
                out["paired_same_occurrence_ready"] = True
        except (OSError, ValueError, TypeError):
            out["field_holdout_m3"] = {"error": "unreadable", "product_unlock": False}
    else:
        out["field_holdout_m3"] = {
            "status": "not_generated",
            "product_unlock": False,
            "hint": "python eval/scripts/field_multiview_holdout.py",
        }

    return out
