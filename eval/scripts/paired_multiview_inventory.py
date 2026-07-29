#!/usr/bin/env python3
"""Inventory same-specimen multi-image packs for true multi-view holdout.

E20 train/val come from FungiTastic multi-photo observations; test (GBIF ES)
is typically single-image. This script:

1. Counts multi-image obs in train/val/test split JSONs
2. Checks whether image paths resolve on disk (local vs Kaggle-only)
3. Emits a readiness report for future leave-one-photo-out torch eval
4. Never sets product_unlock

  python eval/scripts/paired_multiview_inventory.py
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[2]
DEFAULT_MODELS = REPO / "kaggle" / "kernel_output_v20" / "models"
OUT = REPO / "eval" / "reports" / "ml_experiments" / "paired_multiview_inventory.json"
CANONICAL = ("gills", "front", "habitat", "detail")


def _hist(obs: list[dict]) -> dict[str, Any]:
    counts: Counter[int] = Counter()
    multi = 0
    max_n = 0
    by_species: Counter[str] = Counter()
    multi_species: Counter[str] = Counter()
    for o in obs:
        imgs = o.get("image_paths") or o.get("images") or []
        if isinstance(imgs, str):
            imgs = [imgs]
        n = len(imgs) if isinstance(imgs, list) else 1
        counts[n] += 1
        max_n = max(max_n, n)
        sp = str(o.get("species") or o.get("latin_name") or "?")
        by_species[sp] += 1
        if n >= 2:
            multi += 1
            multi_species[sp] += 1
    # packs with ≥2 and ≥4 images
    n_ge2 = sum(c for k, c in counts.items() if k >= 2)
    n_ge4 = sum(c for k, c in counts.items() if k >= 4)
    return {
        "n_obs": len(obs),
        "n_multi_ge2": n_ge2,
        "n_multi_ge4": n_ge4,
        "max_images": max_n,
        "hist": {str(k): int(v) for k, v in sorted(counts.items())},
        "n_species": len(by_species),
        "n_species_with_multi": len(multi_species),
        "top_multi_species": multi_species.most_common(12),
    }


def _path_probe(obs: list[dict], *, max_check: int = 200) -> dict[str, Any]:
    checked = 0
    exists = 0
    sample_missing: list[str] = []
    sample_ok: list[str] = []
    for o in obs:
        for p in o.get("image_paths") or []:
            if checked >= max_check:
                break
            checked += 1
            path = Path(str(p))
            if path.is_file():
                exists += 1
                if len(sample_ok) < 3:
                    sample_ok.append(str(p))
            else:
                if len(sample_missing) < 3:
                    sample_missing.append(str(p))
        if checked >= max_check:
            break
    return {
        "checked": checked,
        "exists_on_disk": exists,
        "frac_exist": float(exists / checked) if checked else None,
        "sample_ok": sample_ok,
        "sample_missing": sample_missing,
        "images_local": exists > 0 and (exists / max(checked, 1)) > 0.5,
    }


def invent(models: Path) -> dict[str, Any]:
    splits: dict[str, Any] = {}
    for name in ("train_obs.json", "val_obs.json", "test_obs.json"):
        p = models / name
        if not p.is_file():
            splits[name] = {"missing": True}
            continue
        obs = json.loads(p.read_text(encoding="utf-8"))
        if not isinstance(obs, list):
            splits[name] = {"error": "not_a_list"}
            continue
        h = _hist(obs)
        probe = _path_probe(obs)
        splits[name.replace("_obs.json", "")] = {**h, "path_probe": probe}

    val = splits.get("val") or {}
    train = splits.get("train") or {}
    test = splits.get("test") or {}
    # True LOO readiness: need multi packs + local images
    val_ready = bool(val.get("n_multi_ge2", 0) >= 20 and (val.get("path_probe") or {}).get("images_local"))
    train_ready = bool(
        train.get("n_multi_ge2", 0) >= 50 and (train.get("path_probe") or {}).get("images_local")
    )
    # Local industrial GBIF multi-media same-occurrence packs (filename id prefix)
    gbif_root = REPO / "data" / "industrial_v1" / "gbif" / "images"
    gbif_same_occ = gbif_root.is_dir()
    loo_report = REPO / "eval" / "reports" / "ml_experiments" / "paired_multiview_loo_eval.json"
    loo_ok = False
    if loo_report.is_file():
        try:
            loo = json.loads(loo_report.read_text(encoding="utf-8"))
            loo_ok = bool((loo.get("torch") or {}).get("ok"))
        except (OSError, ValueError, TypeError):
            loo_ok = False

    true_loo = bool(val_ready or train_ready or loo_ok)
    blocker = None
    if not true_loo:
        blocker = "multi_image_paths_point_to_kaggle_not_local_disk"
    elif loo_ok and not (val_ready or train_ready):
        blocker = None  # local GBIF same-occurrence eval available

    return {
        "generated": datetime.now(timezone.utc).isoformat(),
        "product_unlock": False,
        "policy": "orientation_only_never_consume",
        "models_dir": str(models),
        "canonical_views": list(CANONICAL),
        "splits": splits,
        "readiness": {
            "true_leave_one_photo_out": true_loo,
            "ft_val_ready": val_ready,
            "ft_train_ready": train_ready,
            "gbif_local_same_occurrence": gbif_same_occ,
            "gbif_loo_eval_ok": loo_ok,
            "val_multi_ge2": val.get("n_multi_ge2"),
            "train_multi_ge2": train.get("n_multi_ge2"),
            "test_multi_ge2": test.get("n_multi_ge2"),
            "images_local_val": (val.get("path_probe") or {}).get("images_local"),
            "images_local_train": (train.get("path_probe") or {}).get("images_local"),
            "blocker": blocker,
            "next": (
                "Local GBIF same-occurrence multi-image packs evaluated via "
                "eval/scripts/paired_multiview_loo_eval.py. Optional: mount FungiTastic "
                "for labeled view slots."
                if loo_ok
                else "Mount FungiTastic images locally or run paired_multiview_loo_eval on industrial GBIF."
            ),
        },
        "product_note": (
            "E20 GBIF ES pure test JSON is mostly single-image (domain holdout). "
            "Local industrial GBIF media often has multiple files per occurrence id — "
            "used for true multi-photo torch n-views eval. FT train/val multi packs "
            "remain Kaggle-path until mounted."
        ),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", type=Path, default=DEFAULT_MODELS)
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args()
    if not args.models.is_dir():
        print(f"ERROR: models dir missing {args.models}", file=sys.stderr)
        return 2
    rep = invent(args.models)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(rep, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    md = args.out.with_suffix(".md")
    r = rep["readiness"]
    lines = [
        "# Paired multi-view inventory",
        "",
        f"**Generated:** {rep['generated']}",
        f"**product_unlock:** `{rep['product_unlock']}`",
        "",
        "## Readiness",
        "",
        f"- true_leave_one_photo_out: **{r['true_leave_one_photo_out']}**",
        f"- train multi≥2: {r['train_multi_ge2']} · val multi≥2: {r['val_multi_ge2']} · test multi≥2: {r['test_multi_ge2']}",
        f"- images_local train/val: {r['images_local_train']} / {r['images_local_val']}",
        f"- blocker: `{r['blocker']}`",
        f"- next: {r['next']}",
        "",
        "## Splits",
        "",
    ]
    for name, block in (rep.get("splits") or {}).items():
        if not isinstance(block, dict) or block.get("missing"):
            lines.append(f"- **{name}**: missing")
            continue
        lines.append(
            f"- **{name}**: n={block.get('n_obs')} multi≥2={block.get('n_multi_ge2')} "
            f"multi≥4={block.get('n_multi_ge4')} species_multi={block.get('n_species_with_multi')}"
        )
    lines.append("")
    lines.append(rep.get("product_note") or "")
    md.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "ok": True,
                "out": str(args.out),
                "true_loo_ready": r["true_leave_one_photo_out"],
                "blocker": r["blocker"],
                "train_multi_ge2": r["train_multi_ge2"],
                "val_multi_ge2": r["val_multi_ge2"],
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
