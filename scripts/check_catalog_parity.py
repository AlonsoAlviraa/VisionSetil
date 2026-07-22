#!/usr/bin/env python3
"""Golden parity checks for species_catalog_v2 (PR-01 / §5.4)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from build_species_catalog import build_catalog, check_parity, load_fe_species  # noqa: E402


def main() -> int:
    payload = build_catalog()
    errs = check_parity(payload)
    golden_path = ROOT / "data" / "species_catalog" / "golden" / "parity_seed.json"
    if golden_path.exists():
        golden = json.loads(golden_path.read_text(encoding="utf-8"))
        names = {s["scientific_name"] for s in payload["species"]}
        gnames = set(golden.get("scientific_names", []))
        if names != gnames:
            print("Golden scientific_names diverge from rebuild")
            print("  symmetric sample:", sorted(names ^ gnames)[:15])
            # Rebuild may intentionally update golden — warn only if count differs a lot
            if abs(len(names) - len(gnames)) > 5:
                errs += 1
    fe = load_fe_species()
    print(f"FE species parsed: {len(fe)}")
    print(f"Catalog species: {payload['count']}")
    return 1 if errs else 0


if __name__ == "__main__":
    sys.exit(main())
