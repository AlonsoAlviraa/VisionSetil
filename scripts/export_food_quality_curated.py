"""Export curated food quality from FE mushroomDatabase TS sources → BE JSON.

Never invents edibility: only taxa with explicit edibility fields (except desconocido).
"""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FE_FILES = [
    ROOT / "frontend/src/data/mushroomDatabase.ts",
    ROOT / "frontend/src/data/additionalSpecies.ts",
    ROOT / "frontend/src/data/extendedSpecies.ts",
]
OUT = ROOT / "backend/app/data/food_quality_curated.json"

MAP_ED = {
    "excelente": "comestible",
    "buen_comestible": "comestible",
    "comestible_con_cautela": "no_comestible",
    "no_recomendado": "no_comestible",
    "toxico": "toxica",
    "mortifero": "mortal",
}
LABELS = {
    "comestible": "Comestible",
    "no_comestible": "No comestible",
    "toxica": "Tóxica",
    "mortal": "Mortal",
}


def main() -> None:
    text = "\n".join(f.read_text(encoding="utf-8") for f in FE_FILES if f.exists())
    blocks = re.split(r"scientificName:\s*'", text)[1:]
    records = []
    seen: set[str] = set()
    for b in blocks:
        m_tax = re.match(r"([^']+)'", b)
        if not m_tax:
            continue
        taxon = m_tax.group(1)
        m_ed = re.search(r"edibility:\s*'([^']+)'", b)
        m_com = re.search(r"commonNames:\s*\[\s*'([^']+)'", b)
        if not m_ed:
            continue
        ed = m_ed.group(1)
        fc = MAP_ED.get(ed)
        if not fc:
            continue
        key = taxon.lower()
        if key in seen:
            continue
        seen.add(key)
        records.append(
            {
                "taxon": taxon,
                "common": m_com.group(1) if m_com else taxon,
                "food_class": fc,
                "food_label": LABELS[fc],
                "documented_edibility": ed,
                "food_sources": ["mushroomDatabase (curada Iberia/Europa)"],
            }
        )
    payload = {
        "version": "1.0.0",
        "policy": "orientation_only; never invent; parsed from FE mushroomDatabase sources",
        "count": len(records),
        "by_class": dict(Counter(r["food_class"] for r in records)),
        "records": records,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(records)} records -> {OUT}")
    print(payload["by_class"])


if __name__ == "__main__":
    main()
