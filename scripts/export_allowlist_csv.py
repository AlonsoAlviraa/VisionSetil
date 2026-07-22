#!/usr/bin/env python3
"""Export industrial allowlist + deadly flags as CSV for partners / spreadsheets."""

from __future__ import annotations

import csv
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "data" / "industrial_v1" / "species_allowlist.csv"


def main() -> int:
    allow = json.loads(
        (REPO / "data" / "industrial_v1" / "species_allowlist.json").read_text(
            encoding="utf-8"
        )
    )
    deadly = {
        s["latin_name"]
        for s in json.loads(
            (REPO / "data" / "industrial_v1" / "deadly_set.json").read_text(
                encoding="utf-8"
            )
        )["species"]
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(
            f,
            fieldnames=["latin_name", "role", "es_relevant", "is_deadly_set", "notes"],
        )
        w.writeheader()
        for s in allow["species"]:
            name = s["latin_name"]
            w.writerow(
                {
                    "latin_name": name,
                    "role": s.get("role", ""),
                    "es_relevant": s.get("es_relevant", True),
                    "is_deadly_set": name in deadly,
                    "notes": "orientation_only_never_consume",
                }
            )
    print(f"Wrote {OUT} rows={len(allow['species'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
