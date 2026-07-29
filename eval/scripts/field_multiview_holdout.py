#!/usr/bin/env python3
"""M3 — Same-specimen multi-view field holdout (canonical report).

Protocol (honest):
  - Local industrial GBIF images grouped by occurrence-id prefix (same specimen).
  - Not FungiTastic labeled view slots (order = filename sort).
  - Metrics from paired LOO torch eval (+ optional deadly subset).
  - Orientation only — never product_unlock / forage permission.

  python eval/scripts/field_multiview_holdout.py
  python eval/scripts/field_multiview_holdout.py --refresh-torch --max-packs 32
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[2]
EXP = REPO / "eval" / "reports" / "ml_experiments"
LOO_PATH = EXP / "paired_multiview_loo_eval.json"
DEADLY_PATH = EXP / "paired_multiview_loo_deadly.json"
INV_PATH = EXP / "paired_multiview_inventory.json"
OUT_JSON = EXP / "field_multiview_holdout.json"
OUT_MD = EXP / "field_multiview_holdout.md"
LOO_SCRIPT = REPO / "eval" / "scripts" / "paired_multiview_loo_eval.py"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        return None


def _gates_from_loo(loo: dict[str, Any]) -> dict[str, Any]:
    by = ((loo.get("torch") or {}).get("by_n_views") or {})
    m1 = (by.get("1") or {}).get("map_at_3")
    m2 = (by.get("2") or {}).get("map_at_3")
    m4 = (by.get("4") or {}).get("map_at_3")
    r1 = (by.get("1") or {}).get("reject_rate")
    r4 = (by.get("4") or {}).get("reject_rate")
    gates = {
        "torch_ok": bool((loo.get("torch") or {}).get("ok")),
        "map3_full_ge_single": None
        if m1 is None or m4 is None
        else float(m4) + 1e-9 >= float(m1),
        "map3_pair_ge_single": None
        if m1 is None or m2 is None
        else float(m2) + 1e-9 >= float(m1),
        "reject_drops_or_flat_with_more_views": None
        if r1 is None or r4 is None
        else float(r4) <= float(r1) + 1e-9,
        "same_occurrence_protocol": True,
        "product_unlock": False,
    }
    gates["pass"] = all(
        v is True
        for k, v in gates.items()
        if k not in {"product_unlock"} and v is not None
    )
    return gates


def build_field_holdout_report(
    *,
    loo: dict[str, Any] | None,
    deadly: dict[str, Any] | None,
    inventory: dict[str, Any] | None,
) -> dict[str, Any]:
    """Assemble canonical M3 report (no GPU required if reports exist)."""
    report: dict[str, Any] = {
        "generated": now_iso(),
        "version": "1.9.5-m3-field-holdout",
        "protocol": "same_specimen_field_holdout_m3",
        "product_unlock": False,
        "policy": "orientation_only_never_consume",
        "definition": {
            "same_specimen": (
                "Multiple still images sharing a GBIF occurrence-id prefix "
                "in local industrial media folders — one observation/specimen."
            ),
            "not_labeled_slots": (
                "View order is filename sort, not gills/front/habitat/detail labels. "
                "Product wizard slots remain the capture UX contract."
            ),
            "field_holdout_meaning": (
                "Eval uses local GBIF multi-media packs (field-like multi-photo of "
                "one specimen). E20 primary train is separate (FT+soft); this report "
                "is honest multi-view stress on held media packs, not a forage gate."
            ),
            "leave_one_photo_out": (
                "full4 vs mean of leave-one-of-4 remaining views on the same occurrence."
            ),
        },
        "honesty_notes": [
            "Multi-view MAP@3 gains on general packs do not imply deadly safety.",
            "Deadly-only subset may be flat (see deadly block) — keep lookalikes + open-set.",
            "Never product_unlock from multi-view metrics alone.",
            "Never consumption permission.",
        ],
        "sources": {
            "paired_loo_eval": str(LOO_PATH.relative_to(REPO)).replace("\\", "/")
            if LOO_PATH.is_file()
            else None,
            "paired_loo_deadly": str(DEADLY_PATH.relative_to(REPO)).replace("\\", "/")
            if DEADLY_PATH.is_file()
            else None,
            "paired_inventory": str(INV_PATH.relative_to(REPO)).replace("\\", "/")
            if INV_PATH.is_file()
            else None,
        },
    }

    if inventory:
        report["inventory"] = {
            "readiness": inventory.get("readiness"),
            "n_packs_ge2": (inventory.get("readiness") or {}).get("train_multi_ge2")
            or (inventory.get("summary") or {}).get("n_packs_ge2"),
            "note": inventory.get("note") or inventory.get("protocol"),
        }
    if loo:
        torch = loo.get("torch") or {}
        by = torch.get("by_n_views") or {}
        report["field_eval"] = {
            "protocol": loo.get("protocol"),
            "torch_ok": torch.get("ok"),
            "n_eval_packs": torch.get("n_packs_attempted"),
            "n_species": torch.get("n_species_in_sample"),
            "sampling": torch.get("sampling"),
            "temperature": torch.get("temperature"),
            "inventory": loo.get("inventory"),
            "by_n_views": by,
            "deltas": loo.get("deltas"),
            "leave_one_photo_out": loo.get("loo_summary")
            or torch.get("leave_one_photo_out"),
            "thresholds": loo.get("thresholds"),
        }
        report["gates"] = _gates_from_loo(loo)
        # Headline metrics
        report["headline"] = {
            "map3_1": (by.get("1") or {}).get("map_at_3"),
            "map3_2": (by.get("2") or {}).get("map_at_3"),
            "map3_4": (by.get("4") or {}).get("map_at_3"),
            "map3_4_minus_1": (loo.get("deltas") or {}).get("map3_4_minus_1"),
            "reject_1": (by.get("1") or {}).get("reject_rate"),
            "reject_4": (by.get("4") or {}).get("reject_rate"),
            "loo_delta_map3_full_minus_leave1": (
                (loo.get("loo_summary") or torch.get("leave_one_photo_out") or {}).get(
                    "delta_map3_full_minus_loo"
                )
            ),
        }
    else:
        report["field_eval"] = {"status": "missing_paired_loo_eval"}
        report["gates"] = {
            "pass": False,
            "torch_ok": False,
            "product_unlock": False,
            "reason": "missing_loo_report",
        }
        report["headline"] = {}

    if deadly:
        dtorch = deadly.get("torch") or {}
        dby = dtorch.get("by_n_views") or {}
        d_delta = (deadly.get("deltas") or {}).get("map3_4_minus_1")
        report["deadly_subset"] = {
            "torch_ok": dtorch.get("ok"),
            "n_eval_packs": dtorch.get("n_packs_attempted"),
            "n_species": dtorch.get("n_species_in_sample"),
            "map3_1": (dby.get("1") or {}).get("map_at_3"),
            "map3_4": (dby.get("4") or {}).get("map_at_3"),
            "map3_4_minus_1": d_delta,
            "flat_multiview": d_delta is not None and float(d_delta) < 0.02,
            "note": (
                "Deadly-only same-occurrence packs: extra photos without diagnostic "
                "slot labels often do not fix discrimination — multi-view ≠ deadly-safe."
            ),
        }
        if report["deadly_subset"].get("flat_multiview"):
            report["deadly_multiview_caveat"] = True
    else:
        report["deadly_subset"] = {"status": "missing_deadly_loo"}

    report["readiness"] = {
        "same_specimen_packs_available": bool(
            loo and (loo.get("inventory") or {}).get("n_packs_ge2")
        ),
        "torch_field_eval_ok": bool((loo or {}).get("torch", {}).get("ok")),
        "leave_one_photo_out_ok": bool(
            (loo or {}).get("loo_summary")
            or ((loo or {}).get("torch") or {}).get("leave_one_photo_out")
        ),
        "true_leave_one_photo_out": True,  # local GBIF packs enable it
        "product_unlock": False,
        "status": "ready"
        if (loo and (loo.get("torch") or {}).get("ok"))
        else "incomplete",
    }
    return report


def write_markdown(report: dict[str, Any], path: Path) -> None:
    h = report.get("headline") or {}
    g = report.get("gates") or {}
    d = report.get("deadly_subset") or {}
    lines = [
        "# Same-specimen multi-view field holdout (M3)",
        "",
        f"**Generated:** {report.get('generated')}",
        f"**Protocol:** `{report.get('protocol')}`",
        f"**product_unlock:** `{report.get('product_unlock')}`",
        f"**Gates pass:** `{g.get('pass')}`",
        "",
        "## Protocol (honest)",
        "",
        f"- {report.get('definition', {}).get('same_specimen', '')}",
        f"- {report.get('definition', {}).get('not_labeled_slots', '')}",
        f"- {report.get('definition', {}).get('field_holdout_meaning', '')}",
        f"- {report.get('definition', {}).get('leave_one_photo_out', '')}",
        "",
        "## Headline (general packs)",
        "",
        f"| n_views | MAP@3 |",
        f"|--------:|------:|",
        f"| 1 | {h.get('map3_1')} |",
        f"| 2 | {h.get('map3_2')} |",
        f"| 4 | {h.get('map3_4')} |",
        f"| Δ(4−1) | {h.get('map3_4_minus_1')} |",
        "",
        f"- reject 1→4: {h.get('reject_1')} → {h.get('reject_4')}",
        f"- LOO Δ full−leave1 MAP@3: {h.get('loo_delta_map3_full_minus_leave1')}",
        "",
        "## Deadly subset",
        "",
        f"- MAP@3 1/4: {d.get('map3_1')} / {d.get('map3_4')} · Δ={d.get('map3_4_minus_1')}",
        f"- flat_multiview: `{d.get('flat_multiview')}`",
        f"- {d.get('note', '')}",
        "",
        "## Honesty",
        "",
    ]
    for n in report.get("honesty_notes") or []:
        lines.append(f"- {n}")
    lines.append("")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def maybe_refresh_torch(max_packs: int, device: str) -> int:
    if not LOO_SCRIPT.is_file():
        print("missing loo script", file=sys.stderr)
        return 2
    cmd = [
        sys.executable,
        str(LOO_SCRIPT),
        "--max-packs",
        str(max_packs),
        "--device",
        device,
    ]
    print("Refreshing torch LOO:", " ".join(cmd), flush=True)
    return int(subprocess.call(cmd, cwd=str(REPO)))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--refresh-torch",
        action="store_true",
        help="Re-run paired_multiview_loo_eval before assembling report",
    )
    ap.add_argument("--max-packs", type=int, default=32)
    ap.add_argument("--device", default="cpu")
    args = ap.parse_args()

    if args.refresh_torch:
        rc = maybe_refresh_torch(args.max_packs, args.device)
        if rc != 0:
            print(f"warn: torch refresh exit {rc}; assembling from existing reports", flush=True)

    loo = _load(LOO_PATH)
    deadly = _load(DEADLY_PATH)
    inv = _load(INV_PATH)
    report = build_field_holdout_report(loo=loo, deadly=deadly, inventory=inv)
    EXP.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    write_markdown(report, OUT_MD)
    print(json.dumps(
        {
            "wrote": str(OUT_JSON.relative_to(REPO)).replace("\\", "/"),
            "gates_pass": (report.get("gates") or {}).get("pass"),
            "headline": report.get("headline"),
            "readiness": report.get("readiness"),
            "product_unlock": False,
        },
        indent=2,
    ))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
