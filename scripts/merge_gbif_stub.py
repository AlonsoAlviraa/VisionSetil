#!/usr/bin/env python3
"""Stub: merge a GBIF occurrence download (Darwin Core) into industrial JSONL.

Expects a directory with occurrence.txt (or .csv) and optional multimedia.txt
from a GBIF download. Filters to industrial allowlist scientific names.

Does NOT download GBIF (needs account). Safe to run dry without files.

Usage:
  python scripts/merge_gbif_stub.py --gbif-dir path/to/dwca --out data/industrial_v1/obs_gbif.jsonl
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]


def load_allowlist() -> set[str]:
    allow = json.loads(
        (REPO / "data" / "industrial_v1" / "species_allowlist.json").read_text(
            encoding="utf-8"
        )
    )
    return {s["latin_name"].lower() for s in allow["species"]}


def find_occurrence(gbif_dir: Path) -> Path | None:
    for name in ("occurrence.txt", "occurrence.csv", "Occurrence.txt"):
        p = gbif_dir / name
        if p.is_file():
            return p
    # sometimes nested
    hits = list(gbif_dir.rglob("occurrence.txt"))
    return hits[0] if hits else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--gbif-dir", type=Path, default=None)
    ap.add_argument(
        "--out",
        type=Path,
        default=REPO / "data" / "industrial_v1" / "obs_gbif.jsonl",
    )
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    allow = load_allowlist()

    if args.gbif_dir is None or not args.gbif_dir.is_dir():
        status = {
            "status": "waiting_for_gbif_download",
            "allowlist_size": len(allow),
            "instruction": "Place Darwin Core extract in --gbif-dir then re-run",
            "package": "data/industrial_v1/gbif/gbif_es_allowlist_package.json",
            "external_blocker": "GBIF account required for bulk download",
        }
        print(json.dumps(status, indent=2))
        return 0

    occ = find_occurrence(args.gbif_dir)
    if occ is None:
        print(json.dumps({"error": "occurrence.txt not found", "dir": str(args.gbif_dir)}))
        return 1

    # GBIF occurrence is usually tab-separated
    n_in = n_keep = 0
    rows_out = []
    with occ.open(encoding="utf-8", errors="replace", newline="") as f:
        # sniff delimiter
        sample = f.read(4096)
        f.seek(0)
        delim = "\t" if sample.count("\t") >= sample.count(",") else ","
        reader = csv.DictReader(f, delimiter=delim)
        for row in reader:
            n_in += 1
            sp = (
                row.get("species")
                or row.get("scientificName")
                or row.get("acceptedScientificName")
                or ""
            )
            # strip author: take first two tokens if binomial
            parts = sp.replace("_", " ").split()
            binomial = " ".join(parts[:2]) if len(parts) >= 2 else sp
            if binomial.lower() not in allow and sp.lower() not in allow:
                continue
            n_keep += 1
            oid = row.get("gbifID") or row.get("id") or f"gbif_{n_in}"
            media = row.get("identifier") or row.get("media") or ""
            rows_out.append(
                {
                    "observation_id": f"gbif_{oid}",
                    "species": binomial if binomial.lower() in allow else sp,
                    "image_paths": [media] if media else [],
                    "source": "gbif_es",
                    "country": row.get("countryCode") or "ES",
                    "license": row.get("license") or row.get("rights") or "",
                    "notes": "orientation_only_never_consume",
                }
            )

    if args.dry_run:
        print(json.dumps({"n_in": n_in, "n_keep": n_keep, "sample": rows_out[:3]}, indent=2))
        return 0

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8") as f:
        for r in rows_out:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(json.dumps({"wrote": str(args.out), "n_in": n_in, "n_keep": n_keep}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
