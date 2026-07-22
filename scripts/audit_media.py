#!/usr/bin/env python3
"""Audit species media corpus for broken/missing cards.

Usage:
  python scripts/audit_media.py
  python scripts/audit_media.py --json
Exit 0 if every catalog species has a valid card.webp (RIFF/WEBP).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "data" / "species_catalog" / "species_catalog_v2.json"
MEDIA = ROOT / "media" / "species"
PLACEHOLDERS = ROOT / "media" / "placeholders"


def is_webp(path: Path) -> bool:
    if not path.exists() or not path.is_file():
        return False
    head = path.read_bytes()[:12]
    return head[:4] == b"RIFF" and head[8:12] == b"WEBP"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    if not CATALOG.exists():
        print("catalog missing", file=sys.stderr)
        return 2

    cat = json.loads(CATALOG.read_text(encoding="utf-8"))
    species = cat.get("species") or []
    missing: list[str] = []
    invalid: list[str] = []
    real = 0
    procedural = 0

    for sp in species:
        slug = sp.get("slug") or ""
        card = MEDIA / slug / "card.webp"
        if not card.exists():
            missing.append(slug)
            continue
        if not is_webp(card):
            invalid.append(slug)
            continue
        meta_path = MEDIA / slug / "meta.json"
        if meta_path.exists():
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
                src = str(meta.get("source") or "")
                if meta.get("status") == "ok" and "procedural" not in src:
                    real += 1
                else:
                    procedural += 1
            except json.JSONDecodeError:
                procedural += 1
        else:
            procedural += 1

    ph_ok = all(is_webp(PLACEHOLDERS / f"{k}.webp") for k in ("default", "toxic", "deadly", "unknown"))

    report = {
        "catalog_count": len(species),
        "with_valid_card": len(species) - len(missing) - len(invalid),
        "missing_card": missing,
        "invalid_webp": invalid,
        "real_photos": real,
        "procedural_or_unknown": procedural,
        "placeholders_ok": ph_ok,
        "ok": len(missing) == 0 and len(invalid) == 0 and ph_ok,
    }

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(f"catalog={report['catalog_count']} valid_cards={report['with_valid_card']}")
        print(f"real_photos={real} proceduralish={procedural}")
        print(f"missing={len(missing)} invalid={len(invalid)} placeholders_ok={ph_ok}")
        if missing[:10]:
            print("missing sample:", missing[:10])
        if invalid[:10]:
            print("invalid sample:", invalid[:10])
        print("STATUS:", "OK" if report["ok"] else "FAIL")

    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
