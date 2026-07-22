#!/usr/bin/env python3
"""Package GBIF ES occurrence download request for industrial allowlist.

Writes a filter JSON + download instructions. Does not invent observations.
Requires network for live counts (optional --probe).

Usage:
  python scripts/package_gbif_es_allowlist.py
  python scripts/package_gbif_es_allowlist.py --probe
"""

from __future__ import annotations

import argparse
import json
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "data" / "industrial_v1" / "gbif"


def load_allowlist() -> list[str]:
    allow = json.loads(
        (REPO / "data" / "industrial_v1" / "species_allowlist.json").read_text(
            encoding="utf-8"
        )
    )
    return [s["latin_name"] for s in allow["species"]]


def match_usage_key(name: str, timeout: float = 20.0) -> int | None:
    """Resolve scientific name → GBIF usageKey (species match)."""
    q = urllib.parse.urlencode({"name": name, "limit": 1})
    url = f"https://api.gbif.org/v1/species/match?{q}"
    req = urllib.request.Request(url, headers={"User-Agent": "VisionSetil-Industrial/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        if data.get("usageKey") and data.get("matchType") in (
            "EXACT",
            "FUZZY",
            "HIGHERRANK",
        ):
            # Prefer species-rank keys
            return int(data["usageKey"])
        if data.get("speciesKey"):
            return int(data["speciesKey"])
    except Exception:
        return None
    return None


def count_es_media(taxon_key: int, timeout: float = 30.0) -> int | None:
    params = {
        "country": "ES",
        "taxonKey": str(taxon_key),
        "mediaType": "StillImage",
        "limit": "0",
    }
    qs = urllib.parse.urlencode(params)
    url = f"https://api.gbif.org/v1/occurrence/search?{qs}"
    req = urllib.request.Request(url, headers={"User-Agent": "VisionSetil-Industrial/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return int(data.get("count") or 0)
    except Exception:
        return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--probe", action="store_true", help="Live GBIF name match + counts")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)

    names = load_allowlist()
    rows = []
    total = 0
    for name in names:
        row: dict = {"latin_name": name}
        if args.probe:
            key = match_usage_key(name)
            row["gbif_usage_key"] = key
            if key is not None:
                n = count_es_media(key)
                row["es_still_image_count"] = n
                if n:
                    total += n
            else:
                row["es_still_image_count"] = None
        rows.append(row)

    # Predicate download template (user runs with GBIF account)
    taxon_keys = [r["gbif_usage_key"] for r in rows if r.get("gbif_usage_key")]
    predicate = {
        "type": "and",
        "predicates": [
            {"type": "equals", "key": "COUNTRY", "value": "ES"},
            {"type": "equals", "key": "MEDIA_TYPE", "value": "StillImage"},
            {
                "type": "in",
                "key": "TAXON_KEY",
                "values": [str(k) for k in taxon_keys],
            }
            if taxon_keys
            else {"type": "equals", "key": "TAXON_KEY", "value": "5"},
        ],
    }

    package = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "purpose": "Week-2 GBIF ES media for industrial allowlist",
        "license_note": "Prefer CC0/CC-BY for commercial; filter NC if product is commercial",
        "allowlist_species": names,
        "species_rows": rows,
        "es_still_image_total_if_probed": total if args.probe else None,
        "download_api": "https://api.gbif.org/v1/occurrence/download/request",
        "docs": "https://techdocs.gbif.org/en/data-use/api-downloads",
        "predicate": predicate,
        "manual_ui": "https://www.gbif.org/occurrence/search?country=ES&media_type=StillImage",
        "next_steps": [
            "Create free GBIF account",
            "POST predicate with basic auth to download API",
            "Filter licenses; map to observation_id multi-view JSONL",
            "Merge into industrial_v1 for E16",
        ],
        "external_blockers": [
            "GBIF bulk download requires user account (not automated without credentials)",
            "Micocyl/Montes de Soria/MA-Fungi collaboration still pending human contact",
        ],
    }

    out_path = OUT / "gbif_es_allowlist_package.json"
    out_path.write_text(json.dumps(package, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    readme = OUT / "README.md"
    readme.write_text(
        f"""# GBIF ES package (industrial_v1)

Generated: {package['generated_at']}

## Status
- Allowlist species: {len(names)}
- Probe live counts: {args.probe}
- Total ES StillImage (sum if probed): {package['es_still_image_total_if_probed']}

## Blockers (external)
- GBIF download needs authenticated account
- Socios CyL/Soria: contacto humano

## Files
- `gbif_es_allowlist_package.json` — predicate + per-species keys/counts
""",
        encoding="utf-8",
    )
    print(f"Wrote {out_path}")
    if args.probe:
        print(f"Total ES media (sum over species keys): {total}")
        for r in rows[:8]:
            print(f"  {r['latin_name']}: key={r.get('gbif_usage_key')} n={r.get('es_still_image_count')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
