#!/usr/bin/env python3
"""Observation-level anti-leak splits for industrial_v1 JSONL.

Input JSONL lines: {"observation_id": str, "species": str, "image_paths": [...], ...}
Writes train/val/test observation id lists under data/industrial_v1/splits/.

Usage:
  python scripts/industrial_anti_leak_split.py --jsonl path/to/obs.jsonl
"""

from __future__ import annotations

import argparse
import json
import random
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "data" / "industrial_v1" / "splits"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--jsonl", type=Path, required=True)
    ap.add_argument("--val", type=float, default=0.15)
    ap.add_argument("--test", type=float, default=0.15)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--min-per-class", type=int, default=6)
    args = ap.parse_args()

    by_sp: dict[str, list[str]] = defaultdict(list)
    n_lines = 0
    with args.jsonl.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            o = json.loads(line)
            n_lines += 1
            sp = o["species"]
            oid = str(o["observation_id"])
            if oid not in by_sp[sp]:
                by_sp[sp].append(oid)

    rng = random.Random(args.seed)
    train, val, test = [], [], []
    skipped = []
    for sp, oids in sorted(by_sp.items()):
        if len(oids) < args.min_per_class:
            skipped.append({"species": sp, "n_obs": len(oids)})
            continue
        rng.shuffle(oids)
        n = len(oids)
        n_test = max(1, int(round(n * args.test)))
        n_val = max(1, int(round(n * args.val)))
        if n_test + n_val >= n:
            n_test = 1
            n_val = 1
        test.extend(oids[:n_test])
        val.extend(oids[n_test : n_test + n_val])
        train.extend(oids[n_test + n_val :])

    OUT.mkdir(parents=True, exist_ok=True)
    for name, ids in ("train_obs", train), ("val_obs", val), ("test_obs", test):
        (OUT / f"{name}.json").write_text(
            json.dumps(
                {
                    "observation_ids": sorted(ids),
                    "count": len(ids),
                    "seed": args.seed,
                    "source_jsonl": str(args.jsonl),
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )

    summary = {
        "input_lines": n_lines,
        "species_kept": len(by_sp) - len(skipped),
        "species_skipped": skipped,
        "train": len(train),
        "val": len(val),
        "test": len(test),
        "policy": "split_by_observation_id_anti_leak",
    }
    (OUT / "split_summary.json").write_text(
        json.dumps(summary, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
