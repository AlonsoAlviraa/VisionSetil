#!/usr/bin/env python3
"""Sync species_catalog_v2 (520 SSOT) → FE snapshot + CatalogSpecies JSON + BE expanded.

Single source of truth: data/species_catalog/species_catalog_v2.json

Outputs:
  - frontend/src/data/generated/species_catalog_snapshot.json  (v2 copy)
  - frontend/src/data/speciesCatalog.json                     (CatalogSpecies shape)
  - backend/app/data/species_catalog_expanded.json            (expanded FE/BE shape)

Policy: orientation_only; never consumption permission.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
V2_PATH = ROOT / "data" / "species_catalog" / "species_catalog_v2.json"
FE_SNAPSHOT = ROOT / "frontend" / "src" / "data" / "generated" / "species_catalog_snapshot.json"
FE_CATALOG = ROOT / "frontend" / "src" / "data" / "speciesCatalog.json"
BE_EXPANDED = ROOT / "backend" / "app" / "data" / "species_catalog_expanded.json"
SYNONYMS_SSOT = ROOT / "data" / "species_catalog" / "taxon_synonyms.json"
FE_SYNONYMS = ROOT / "frontend" / "src" / "data" / "taxon_synonyms.json"

POLICY = "orientation_only; unsafe_to_consume; never_forage_permission"


def risk_label_from_v2(risk_level: str, edibility_code: str) -> str:
    """Map v2 risk/edibility → expanded CatalogSpecies risk_label (safety-first)."""
    r = (risk_level or "").lower().strip()
    e = (edibility_code or "").lower().strip()
    if r in ("deadly", "critical") or e == "mortifero":
        return "deadly"
    if r in ("high",) or e == "toxico":
        return "toxic"
    if r in ("risky_lookalikes",) or e == "comestible_con_cautela":
        return "unknown_or_risky"
    if r in ("medium",) or e in ("no_recomendado", "inedible"):
        return "dangerous_or_unknown"
    if r in ("low",) or e in ("excelente", "buen_comestible", "comestible"):
        # Never surface "edible" as permission — educational unknown/low-risk bucket
        return "unknown_or_risky"
    return "dangerous_or_unknown"


def polish_taxon(taxon: str) -> str:
    parts = taxon.strip().split()
    if len(parts) < 2:
        return taxon.strip()
    genus = parts[0][:1].upper() + parts[0][1:].lower()
    rest = " ".join(p.lower() for p in parts[1:])
    return f"{genus} {rest}"


def slugify(taxon: str, slug: str | None = None) -> str:
    if slug:
        return str(slug).lower().strip()
    s = taxon.lower().strip()
    out = []
    prev_dash = False
    for ch in s:
        if ch.isalnum():
            out.append(ch)
            prev_dash = False
        elif not prev_dash:
            out.append("-")
            prev_dash = True
    return "".join(out).strip("-")


def vernaculars_for(rec: dict, loc: str) -> list[str]:
    vern = rec.get("vernacular_names") or {}
    names: list[str] = []
    for n in vern.get(loc) or []:
        s = str(n).strip()
        if s and s not in names:
            names.append(s)
    return names


def vernaculars(rec: dict) -> list[str]:
    """Spanish-primary list (legacy callers). Prefer vernaculars_for(loc)."""
    return vernaculars_for(rec, "es")


def description_es(rec: dict) -> str:
    desc = rec.get("description") or {}
    if isinstance(desc, dict):
        text = desc.get("es") or desc.get("en") or ""
    else:
        text = str(desc or "")
    if text.strip():
        return text.strip()
    taxon = rec.get("scientific_name") or rec.get("taxon") or "Taxon"
    return (
        f"{taxon}. Entrada micológica orientativa. "
        "Nunca para orientación de consumo."
    )


def food_class_from_edibility(edibility_code: str) -> str | None:
    """Map v2 edibility → FoodClass bucket. Never store praise codes as labels."""
    e = (edibility_code or "").lower().strip()
    if e in ("excelente", "buen_comestible", "comestible"):
        return "comestible"
    if e in ("comestible_con_cautela", "no_recomendado", "inedible"):
        return "no_comestible"
    if e == "toxico":
        return "toxica"
    if e == "mortifero":
        return "mortal"
    return None


def normalize_lookalike_names(lookalikes) -> list[str]:
    """SSOT objects → scientific-name strings for FE/BE expanded catalogs."""
    out: list[str] = []
    for lk in lookalikes or []:
        name = ""
        if isinstance(lk, str):
            name = lk.strip()
        elif isinstance(lk, dict):
            name = str(lk.get("scientific_name") or lk.get("taxon") or "").strip()
        if name and name not in out:
            out.append(name)
    return out


def to_catalog_species(rec: dict) -> dict:
    taxon = polish_taxon(str(rec.get("scientific_name") or rec.get("taxon") or ""))
    slug = slugify(taxon, rec.get("slug") or rec.get("id"))
    names_es = vernaculars_for(rec, "es")
    names_en = vernaculars_for(rec, "en")
    names_ca = vernaculars_for(rec, "ca")
    names_eu = vernaculars_for(rec, "eu")
    if not names_es:
        names_es = [taxon]
    risk = risk_label_from_v2(
        str(rec.get("risk_level") or "unknown"),
        str(rec.get("edibility_code") or "desconocido"),
    )
    edib = str(rec.get("edibility_code") or "desconocido")
    food = food_class_from_edibility(edib)
    lookalikes = normalize_lookalike_names(rec.get("lookalikes"))
    out = {
        "taxon": taxon,
        "slug": slug,
        "rank": "species",
        "common_names": names_es,
        "common_names_en": names_en or None,
        "common_names_ca": names_ca or None,
        "common_names_eu": names_eu or None,
        "risk_label": risk,
        "family": rec.get("family"),
        "description": description_es(rec),
        "source": "species_catalog_v2",
        # FoodClass buckets only — never raw "excelente" / "buen_comestible" praise strings
        "food_class": food,
        "food_label": food,
        "food_sources": None,
        "documented_edibility": food,
        # Educational confusions from SSOT — never invented; list[str] for API/FE
        "lookalikes": lookalikes,
    }
    # Drop null locale bags for smaller JSON
    return {k: v for k, v in out.items() if v is not None}


def load_v2() -> dict:
    if not V2_PATH.exists():
        raise SystemExit(f"SSOT missing: {V2_PATH}")
    data = json.loads(V2_PATH.read_text(encoding="utf-8"))
    species = data.get("species") or []
    if len(species) < 500:
        raise SystemExit(f"SSOT too small: {len(species)} (expected ~520)")
    return data


def assert_unique_slugs(species: list[dict], key: str = "slug") -> None:
    slugs = [str(s.get(key) or "") for s in species]
    if any(not s for s in slugs):
        raise SystemExit("Empty slug detected")
    if len(slugs) != len(set(slugs)):
        from collections import Counter

        dups = [k for k, v in Counter(slugs).items() if v > 1]
        raise SystemExit(f"Duplicate slugs: {dups[:10]}")


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def sync(*, dry_run: bool = False) -> dict:
    v2 = load_v2()
    v2_species = v2.get("species") or []
    assert_unique_slugs(v2_species, key="slug")

    catalog_rows = [to_catalog_species(r) for r in v2_species]
    assert_unique_slugs(catalog_rows, key="slug")

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    fe_payload = {
        "version": str(v2.get("catalog_version") or "2.2.0"),
        "generated": now,
        "policy": POLICY,
        "count": len(catalog_rows),
        "sources": [
            "species_catalog_v2.json",
            "data/species_catalog (SSOT)",
        ],
        "species": catalog_rows,
    }

    be_payload = {
        "version": f"ssot-v2-{v2.get('catalog_version', '2')}",
        "generated": now,
        "policy": POLICY,
        "count": len(catalog_rows),
        "sources": [
            "species_catalog_v2.json",
            "sync_catalog_ssot.py",
        ],
        "species": catalog_rows,
        "food_quality_sync": {
            "note": "edibility_code mirrored from v2; never consumption permission",
            "synced_from": "species_catalog_v2",
        },
    }

    report = {
        "ssot_count": len(v2_species),
        "fe_catalog_count": len(catalog_rows),
        "be_expanded_count": len(catalog_rows),
        "unique_slugs": len({r["slug"] for r in catalog_rows}),
        "deadly": sum(1 for r in catalog_rows if r["risk_label"] == "deadly"),
        "dry_run": dry_run,
        "paths": {
            "v2": str(V2_PATH.relative_to(ROOT)),
            "fe_snapshot": str(FE_SNAPSHOT.relative_to(ROOT)),
            "fe_catalog": str(FE_CATALOG.relative_to(ROOT)),
            "be_expanded": str(BE_EXPANDED.relative_to(ROOT)),
        },
    }

    if dry_run:
        print(json.dumps(report, indent=2, ensure_ascii=False))
        return report

    # Snapshot is the full v2 document (FE loadSpeciesCatalog prefers it)
    write_json(FE_SNAPSHOT, v2)
    write_json(FE_CATALOG, fe_payload)
    write_json(BE_EXPANDED, be_payload)
    # Keep FE synonym map in lockstep with repo SSOT
    if SYNONYMS_SSOT.is_file():
        FE_SYNONYMS.parent.mkdir(parents=True, exist_ok=True)
        FE_SYNONYMS.write_text(SYNONYMS_SSOT.read_text(encoding="utf-8"), encoding="utf-8")
        report["paths"]["fe_synonyms"] = str(FE_SYNONYMS.relative_to(ROOT))

    print(json.dumps(report, indent=2, ensure_ascii=False))
    print("OK: SSOT synced to FE snapshot, FE catalog, BE expanded")
    return report


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate and report only; do not write files",
    )
    args = p.parse_args(argv)
    sync(dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    sys.exit(main())
