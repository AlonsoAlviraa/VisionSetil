#!/usr/bin/env python3
"""Build frontend season pack from catalog v2 + season seeds (Phase C / C-21, D-C21).

Fail-closed: any seed not resolvable in species_catalog_v2.json exits non-zero.

Usage:
  python scripts/build_season_pack.py
  python scripts/build_season_pack.py --check  # exit 0 if pack exists and seeds resolve
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "data" / "species_catalog" / "species_catalog_v2.json"
MEDIA = ROOT / "media" / "species"
OUT = ROOT / "frontend" / "src" / "data" / "generated" / "season_pack_v1.json"
PRIORITY = ROOT / "media" / "manifests" / "priority_slugs_v1.json"

# Mirrors frontend/src/lib/seasonRadar.ts SEASON_TAXON_SEEDS (Verpa conica, D-C21)
SEASON_META = {
    "primavera": {
        "id": "primavera",
        "labelEs": "Primavera",
        "months": "Marzo – Mayo",
        "note": "Temporada corta; colmenillas y setas de prado. Solo orientación educativa.",
    },
    "verano": {
        "id": "verano",
        "labelEs": "Verano",
        "months": "Junio – Agosto",
        "note": "Depende de tormentas estivales. Observa rebozuelos y oronjas en zonas cálidas.",
    },
    "otono": {
        "id": "otono",
        "labelEs": "Otoño",
        "months": "Septiembre – Noviembre",
        "note": "Mayor diversidad. Incluye taxones de alto riesgo: no es permiso de recolección.",
    },
    "invierno": {
        "id": "invierno",
        "labelEs": "Invierno",
        "months": "Diciembre – Febrero",
        "note": "Pocas especies; trufas y ostras en contexto educativo.",
    },
}

SEASON_TAXON_SEEDS: dict[str, list[str]] = {
    "primavera": [
        "Morchella esculenta",
        "Calocybe gambosa",
        "Agaricus campestris",
        "Verpa conica",  # was Verpa bohemica — not in catalog v2
        "Sarcoscypha coccinea",
    ],
    "verano": [
        "Cantharellus cibarius",
        "Amanita caesarea",
        "Russula virescens",
        "Boletus aereus",
        "Amanita phalloides",
    ],
    "otono": [
        "Boletus edulis",
        "Lactarius deliciosus",
        "Amanita phalloides",
        "Hydnum repandum",
        "Macrolepiota procera",
        "Galerina marginata",
        "Hypholoma fasciculare",
    ],
    "invierno": [
        "Tuber melanosporum",
        "Pleurotus ostreatus",
        "Flammulina velutipes",
        "Hygrophorus marzuolus",
    ],
}

# Optional aliases (prefer replacing seeds directly)
SEASON_TAXON_ALIASES = {
    "Verpa bohemica": "Verpa conica",
}

MIN_CARD_BYTES = 8192
OK_REAL_CARD_BYTES = 20480

LICENSE_ALLOWLIST = {
    "cc0",
    "cc-by",
    "cc-by-sa",
    "public domain",
    "pd-us",
    "pd",
}


def license_ok(text: str | None) -> bool:
    if not text:
        return False
    t = text.lower().replace("_", " ").replace("/", " ")
    for allowed in LICENSE_ALLOWLIST:
        if allowed in t:
            return True
    if "creativecommons.org/publicdomain" in t:
        return True
    if "creativecommons.org/licenses/by" in t:
        return True
    return False


def risk_to_placeholder_kind(risk: str | None, edibility: str | None) -> str:
    r = (risk or "").lower()
    e = (edibility or "").lower()
    if r in ("deadly", "critical") or e == "mortifero":
        return "deadly"
    if r in ("high", "toxic", "risky_lookalikes", "medium") or e == "toxico":
        return "toxic"
    if r == "unknown" or e == "desconocido":
        return "unknown"
    return "default"


def risk_label_from_catalog(sp: dict) -> str:
    r = sp.get("risk_level") or sp.get("risk_label") or "unknown"
    e = sp.get("edibility_code") or ""
    if r in ("deadly", "critical") or e == "mortifero":
        return "deadly"
    if r in ("high",) or e == "toxico":
        return "high"
    if r in ("medium", "risky_lookalikes"):
        return "medium"
    if r in ("low",):
        return "low"
    return str(r)


def media_status(slug: str) -> str:
    card = MEDIA / slug / "card.webp"
    meta_path = MEDIA / slug / "meta.json"
    meta: dict = {}
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            meta = {}
    if not card.exists():
        return "missing"
    nbytes = card.stat().st_size
    src = str(meta.get("source") or "")
    procedural = src.startswith("procedural")
    lic = str(meta.get("license") or "") if meta.get("license") else None
    if nbytes < MIN_CARD_BYTES:
        return "stub"
    if not procedural and nbytes >= OK_REAL_CARD_BYTES and license_ok(lic):
        return "ok_real"
    if procedural:
        return "ok_procedural"
    return "legacy_unverified"


def resolve_seed(name: str, by_sci: dict[str, dict]) -> dict:
    resolved = SEASON_TAXON_ALIASES.get(name, name)
    sp = by_sci.get(resolved.lower())
    if not sp:
        raise KeyError(resolved)
    return sp


def build_pack(catalog: dict) -> dict:
    species = catalog.get("species") or []
    by_sci = {str(s.get("scientific_name") or "").lower(): s for s in species}
    seasons: dict = {}
    unresolved: list[str] = []

    for season_id, seeds in SEASON_TAXON_SEEDS.items():
        meta = SEASON_META[season_id]
        taxa = []
        for name in seeds:
            try:
                sp = resolve_seed(name, by_sci)
            except KeyError:
                unresolved.append(f"{season_id}:{name}")
                continue
            slug = sp["slug"]
            commons = sp.get("common_names") or sp.get("vernacular_names") or []
            if isinstance(commons, dict):
                commons = commons.get("es") or commons.get("en") or []
            common = ""
            if isinstance(commons, list) and commons:
                common = commons[0] if isinstance(commons[0], str) else str(commons[0])
            if not common:
                common = "Sin nombre común local"
            risk = risk_label_from_catalog(sp)
            taxa.append(
                {
                    "taxon": sp.get("scientific_name") or name,
                    "slug": slug,
                    "common_name": common,
                    "risk_label": risk,
                    "placeholder_kind": risk_to_placeholder_kind(
                        sp.get("risk_level"), sp.get("edibility_code")
                    ),
                    "urls": {
                        "thumb": f"/media/species/{slug}/thumb.webp",
                        "card": f"/media/species/{slug}/card.webp",
                        "lqip": f"/media/species/{slug}/lqip.webp",
                    },
                    "media_status": media_status(slug),
                }
            )
        seasons[season_id] = {
            **meta,
            "moodImage": "/media/placeholders/default.webp",
            "taxa": taxa,
        }

    if unresolved:
        raise SystemExit(
            "Fail-closed: seeds not in catalog v2:\n  " + "\n  ".join(unresolved)
        )

    return {
        "version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "seasons": seasons,
        "disclaimer": (
            "Radar educativo de temporada. No es guía de recolección ni permiso de consumo."
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Validate only; do not write")
    args = parser.parse_args()

    if not CATALOG.exists():
        print("catalog missing", file=sys.stderr)
        return 1
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    try:
        pack = build_pack(catalog)
    except SystemExit as e:
        print(e, file=sys.stderr)
        return 1

    if args.check:
        if OUT.exists():
            print("season pack OK (seeds resolve); existing file:", OUT)
        else:
            print("seeds resolve; pack file not yet written")
        return 0

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT} seasons={list(pack['seasons'])}")
    # Count taxa
    n = sum(len(s["taxa"]) for s in pack["seasons"].values())
    print(f"taxa entries={n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
