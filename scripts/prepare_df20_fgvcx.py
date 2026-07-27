#!/usr/bin/env python3
"""Prepare / verify DF20 + FGVCx official sources for E19.

Does not invent downloads. Checks:
  - converter modules importable
  - fungi_csv_loader knows DF20/FGVCx paths
  - local roots if provided
  - documents Kaggle/GitHub access

Usage:
  python scripts/prepare_df20_fgvcx.py
  python scripts/prepare_df20_fgvcx.py --df20-root /path/to/df20
  python scripts/prepare_df20_fgvcx.py --write
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "kaggle"))


def check_converter(name: str, path: Path) -> dict:
    ok = path.is_file()
    return {
        "module": name,
        "path": str(path.relative_to(REPO)),
        "exists": ok,
        "status": "ok" if ok else "missing",
    }


def check_loader_support() -> dict:
    try:
        from fungi_csv_loader import (  # type: ignore
            KNOWN_CSV_REL_PATHS,
            KNOWN_IMAGE_SUBDIRS,
            load_csvs_from_root,
            dataset_kind,
        )
    except Exception as e:
        return {"import_ok": False, "error": str(e)}

    df20_csv = [p for p in KNOWN_CSV_REL_PATHS if "DF20" in p or "df20" in p.lower()]
    fgvc_csv = [p for p in KNOWN_CSV_REL_PATHS if "FungiCLEF" in p or "fungi" in p.lower()]
    img_df20 = [p for p in KNOWN_IMAGE_SUBDIRS if "DF20" in p or "df20" in p.lower()]
    return {
        "import_ok": True,
        "df20_csv_paths_known": df20_csv,
        "fungiclef_csv_paths_known": fgvc_csv[:12],
        "df20_image_subdirs_known": img_df20,
        "has_load_csvs_from_root": callable(load_csvs_from_root),
        "has_dataset_kind": callable(dataset_kind),
    }


def probe_local_root(root: Path | None, label: str) -> dict:
    if root is None:
        return {"label": label, "provided": False, "status": "not_local"}
    root = Path(root)
    if not root.is_dir():
        return {"label": label, "provided": True, "path": str(root), "status": "missing_dir"}
    # light scan
    csvs = list(root.rglob("*.csv"))[:20]
    imgs = []
    for ext in ("*.jpg", "*.JPG", "*.jpeg", "*.png"):
        imgs.extend(list(root.rglob(ext))[:5])
    status = "ok" if (csvs or imgs) else "empty"
    # try loader
    loader_rows = 0
    try:
        from fungi_csv_loader import load_csvs_from_root  # type: ignore

        df = load_csvs_from_root(root, source_db=label)
        loader_rows = 0 if df is None else len(df)
    except Exception as e:
        return {
            "label": label,
            "provided": True,
            "path": str(root),
            "status": status,
            "csv_samples": [str(c.relative_to(root)) for c in csvs[:8]],
            "loader_error": str(e),
        }
    return {
        "label": label,
        "provided": True,
        "path": str(root),
        "status": status,
        "csv_samples": [str(c.relative_to(root)) for c in csvs[:8]],
        "loader_rows": loader_rows,
        "ready_for_train": loader_rows > 100,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--df20-root", type=Path, default=None)
    ap.add_argument("--fgvcx-root", type=Path, default=None)
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "converters": [
            check_converter(
                "df20_to_visionsetil",
                REPO / "kaggle" / "converters" / "df20_to_visionsetil.py",
            ),
            check_converter(
                "fungiclef_to_visionsetil",
                REPO / "kaggle" / "converters" / "fungiclef_to_visionsetil.py",
            ),
            check_converter(
                "fungitastic_to_visionsetil",
                REPO / "kaggle" / "converters" / "fungitastic_to_visionsetil.py",
            ),
        ],
        "loader": check_loader_support(),
        "access": {
            "df20": {
                "github": "https://github.com/BohemianVRA/DanishFungiDataset",
                "site": "https://sites.google.com/view/danish-fungi-dataset",
                "kaggle_note": "Prefer official DF20 dump; not the seemshukla/fungiclef checkpoint pack",
            },
            "fgvcx_2018": {
                "kaggle_competition": "https://www.kaggle.com/c/fungi-challenge-fgvc-2018",
                "github": "https://github.com/visipedia/fgvcx_fungi_comp",
                "note": "Join competition or use published train split; map via fungiclef converter heuristics",
            },
        },
        "local": {
            "df20": probe_local_root(args.df20_root, "df20"),
            "fgvcx": probe_local_root(args.fgvcx_root, "fgvcx"),
        },
        "e19_kernel_metadata_suggestion": {
            "dataset_sources": [
                "picekl/fungitastic",
                # add user-uploaded private packs for df20/fgvcx if competition data restricted
            ],
            "kernel_sources_or_private": [
                "Upload DF20 metadata+images as private Kaggle dataset after download from official site",
                "Attach FGVCx train if available under competition rules",
            ],
        },
        "checklist": {
            "converter_df20_exists": True,
            "loader_knows_df20_paths": True,
            "local_df20_ready": False,
            "local_fgvcx_ready": False,
            "next": [
                "Download DF20 from official Danish Fungi site / GitHub instructions",
                "python scripts/prepare_df20_fgvcx.py --df20-root <path> --write",
                "If loader_rows>0 for allowlist: package private Kaggle dataset + E19 metadata",
            ],
        },
        "policy": "orientation_only; 40 spp until MAP@3>=0.22 and deadly@3>=0.50",
    }

    # update checklist from probes
    report["checklist"]["converter_df20_exists"] = report["converters"][0]["exists"]
    report["checklist"]["loader_knows_df20_paths"] = bool(
        report["loader"].get("df20_csv_paths_known")
    )
    report["checklist"]["local_df20_ready"] = bool(
        report["local"]["df20"].get("ready_for_train")
    )
    report["checklist"]["local_fgvcx_ready"] = bool(
        report["local"]["fgvcx"].get("ready_for_train")
    )

    print(json.dumps(report, indent=2, ensure_ascii=False)[:4000])
    if args.write:
        out = REPO / "data" / "industrial_v1" / "df20_fgvcx_prep.json"
        out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print("wrote", out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
