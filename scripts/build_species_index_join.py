#!/usr/bin/env python3
"""Join species_index prototypes with unified catalog + synonyms (PR-17).

Does not require GPU. Writes a lightweight join report JSON.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "data" / "species_catalog" / "species_catalog_v2.json"
SYNONYMS = ROOT / "data" / "species_catalog" / "synonyms.yaml"
OUT = ROOT / "data" / "species_catalog" / "species_index_join_report.json"


def load_synonyms() -> dict[str, list[str]]:
    if not SYNONYMS.exists():
        return {}
    text = SYNONYMS.read_text(encoding="utf-8")
    mapping: dict[str, list[str]] = {}
    current: str | None = None
    for line in text.splitlines():
        if not line.strip() or line.strip().startswith("#"):
            continue
        if re.match(r"^[A-Z]", line) and line.rstrip().endswith(":"):
            current = line.strip().rstrip(":")
            mapping[current] = []
        elif current and line.strip().startswith("-"):
            mapping[current].append(line.strip()[1:].strip())
    return mapping


def main() -> int:
    if not CATALOG.exists():
        print("catalog missing", file=sys.stderr)
        return 1
    cat = json.loads(CATALOG.read_text(encoding="utf-8"))
    syn = load_synonyms()
    reverse: dict[str, str] = {}
    for preferred, alts in syn.items():
        reverse[preferred.lower()] = preferred
        for a in alts:
            reverse[a.lower()] = preferred

    by_name = {s["scientific_name"].lower(): s for s in cat.get("species", [])}
    joined = 0
    missing = []
    for preferred in syn:
        if preferred.lower() in by_name:
            joined += 1
        else:
            missing.append(preferred)

    report = {
        "catalog_count": cat.get("count"),
        "synonym_groups": len(syn),
        "synonym_keys_in_catalog": joined,
        "synonym_keys_missing": missing,
        "resolve_example": reverse.get("galerina autumnalis", None),
    }
    OUT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
