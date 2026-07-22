#!/usr/bin/env python3
"""Build industrial_v1 dataset manifests (obs-level, anti-leak ready).

Without local FungiCLEF image trees, this still materializes:
  - validated allowlist vs known label2idx dumps
  - deadly set intersection
  - empty obs placeholders + split stubs for Kaggle filter
  - datacard + E15 training filter config

When --from-label2idx is given, produces label subset + class weights for E15.

Usage:
  python scripts/build_industrial_dataset.py
  python scripts/build_industrial_dataset.py --from-label2idx kaggle/kernel_output_v14/models/label2idx.json
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "data" / "industrial_v1"


def load_json(path: Path) -> dict | list:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--from-label2idx",
        type=Path,
        default=REPO / "kaggle" / "kernel_output_v14" / "models" / "label2idx.json",
    )
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args()
    out: Path = args.out
    out.mkdir(parents=True, exist_ok=True)
    (out / "splits").mkdir(exist_ok=True)
    (out / "labels").mkdir(exist_ok=True)

    allow = load_json(out / "species_allowlist.json")
    deadly = load_json(out / "deadly_set.json")
    names = [s["latin_name"] for s in allow["species"] if s.get("latin_name")]
    deadly_names = {s["latin_name"] for s in deadly["species"]}

    present: list[str] = []
    missing: list[str] = []
    label2idx_src: dict[str, int] = {}
    if args.from_label2idx.is_file():
        label2idx_src = load_json(args.from_label2idx)
        src_set = set(label2idx_src.keys())
        for n in names:
            if n in src_set:
                present.append(n)
            else:
                missing.append(n)
    else:
        present = list(names)
        missing = []

    # Stable label2idx for industrial focus
    label2idx = {sp: i for i, sp in enumerate(sorted(present))}
    deadly_idx = [label2idx[n] for n in sorted(deadly_names) if n in label2idx]
    class_weights = [1.0] * len(label2idx)
    for i in deadly_idx:
        class_weights[i] = 10.0

    inventory = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "allowlist_count": len(names),
        "present_in_e14_label2idx": len(present),
        "missing_from_e14": missing,
        "deadly_in_allowlist": sorted(deadly_names & set(names)),
        "deadly_with_label": [n for n in sorted(deadly_names) if n in label2idx],
        "note": "Image paths not packed here; Kaggle notebook filters FT/FC to this allowlist.",
    }

    (out / "labels" / "label2idx.json").write_text(
        json.dumps(label2idx, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (out / "labels" / "class_weights.json").write_text(
        json.dumps(
            {
                "deadly_weight": 10.0,
                "default_weight": 1.0,
                "weights_by_idx": class_weights,
                "deadly_indices": deadly_idx,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    (out / "inventory.json").write_text(
        json.dumps(inventory, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    # Split stubs (filled when obs jsonl exists)
    for split in ("train_obs", "val_obs", "test_obs", "test_es_gbif"):
        p = out / "splits" / f"{split}.json"
        if not p.exists():
            p.write_text(
                json.dumps({"observation_ids": [], "status": "pending_images"}, indent=2)
                + "\n",
                encoding="utf-8",
            )

    e15 = {
        "experiment": "E15-focus40",
        "plan_week": 1,
        "max_species": 40,
        "allowlist_path": "data/industrial_v1/species_allowlist.json",
        "deadly_path": "data/industrial_v1/deadly_set.json",
        "label2idx_path": "data/industrial_v1/labels/label2idx.json",
        "training": {
            "epochs": 25,
            "batch_size": 16,
            "max_obs_per_species": 80,
            "min_obs_per_species": 8,
            "deadly_max_obs": 120,
            "deadly_class_weight": 10.0,
            "backbone": "convnextv2_tiny.fcmae_ft_in22k_in1k",
            "d_model": 512,
            "early_stop_metric": "safety_recall_deadly",
            "secondary_metric": "val_map3",
        },
        "success_criteria": {
            "test_map_at_3_min": 0.15,
            "safety_recall_deadly_at_3_min": 0.50,
        },
        "deploy_gate": {
            "test_map_at_3_min": 0.20,
            "safety_recall_deadly_min": 0.90,
            "note": "Do not point multi_view_weights_path here until gates pass",
        },
    }
    (out / "e15_config.json").write_text(
        json.dumps(e15, indent=2) + "\n", encoding="utf-8"
    )

    datacard = f"""# Data card — industrial_v1 (plan day 1)

Generated: {inventory['generated_at']}

## Purpose
Focused catalog for E15 (40 species). **Orientation only** — never consumption permission.

## Counts
- Allowlist entries: {len(names)}
- Present in E14 label2idx: {len(present)}
- Missing from E14 dump: {len(missing)} {missing}
- Deadly with labels: {inventory['deadly_with_label']}

## Sources (planned)
1. FungiCLEF + FungiTastic filtered to allowlist (Kaggle)
2. GBIF ES StillImage (week 2)
3. Micocyl / Montes de Soria / MA-Fungi (async request)

## Splits
Observation-level anti-leak (train/val/test). `test_es_gbif` hold-out week 2–3.

## Safety
Deadly taxa forced; class weight 10x in E15. Product quality gate blocks species ID until MAP@3≥0.20 and deadly≥0.90.
"""
    (out / "datacard.md").write_text(datacard, encoding="utf-8")

    # Progress marker for loop
    progress = {
        "plan": "PLAN_30D_MODELO_INDUSTRIAL",
        "week": 1,
        "day": 1,
        "completed": [
            "species_allowlist.json (40)",
            "deadly_set.json",
            "labels/label2idx.json",
            "labels/class_weights.json",
            "e15_config.json",
            "datacard.md",
            "build_industrial_dataset.py",
        ],
        "next": [
            "E15 Kaggle notebook filter to allowlist + train",
            "Wire metrics path industrial when E15 completes",
            "GBIF ES probe package (week 2)",
        ],
        "quality_gate": "still_block_species_id",
        "best_run_so_far": "E14 MAP@3=0.093 deadly~0.02",
    }
    (out / "PROGRESS.json").write_text(
        json.dumps(progress, indent=2) + "\n", encoding="utf-8"
    )

    print(json.dumps(inventory, indent=2, ensure_ascii=False))
    print("Wrote", out)
    print("label2idx size", len(label2idx), "deadly_idx", deadly_idx)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
