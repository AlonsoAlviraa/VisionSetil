"""
Merge documented food quality into the expanded species catalog.

Sources (only — never invent comestible for unknown taxa):
  1) backend/app/data/food_quality_curated.json  (exported from FE curated registry)
  2) backend/app/data/poisonous_species.json

Unknown taxa keep food_class unset / null.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.core.config import settings

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
CURATED_PATH = DATA_DIR / "food_quality_curated.json"
EXPANDED_PATH = DATA_DIR / "species_catalog_expanded.json"

# Severity rank for merges (higher wins)
_CLASS_RANK = {
    "comestible": 1,
    "no_comestible": 2,
    "toxica": 3,
    "mortal": 4,
}

_LABEL = {
    "comestible": "Comestible",
    "no_comestible": "No comestible",
    "toxica": "Tóxica",
    "mortal": "Mortal",
}


def _norm(taxon: str) -> str:
    return " ".join(str(taxon or "").strip().lower().split())


def _worse(a: str | None, b: str | None) -> str | None:
    if not a:
        return b
    if not b:
        return a
    return a if _CLASS_RANK.get(a, 0) >= _CLASS_RANK.get(b, 0) else b


def poison_level_to_class(level: str | None) -> str:
    k = (level or "").lower().strip()
    if k in {"critical", "deadly", "mortal"}:
        return "mortal"
    return "toxica"


@lru_cache(maxsize=1)
def load_curated_food_quality() -> dict[str, dict[str, Any]]:
    """Map normalized taxon -> curated record from FE export (if present)."""
    out: dict[str, dict[str, Any]] = {}
    if CURATED_PATH.exists():
        payload = json.loads(CURATED_PATH.read_text(encoding="utf-8"))
        rows = payload.get("records") if isinstance(payload, dict) else payload
        for row in rows or []:
            taxon = row.get("taxon") or ""
            food_class = row.get("food_class")
            if not taxon or food_class not in _CLASS_RANK:
                continue
            out[_norm(taxon)] = {
                "taxon": taxon,
                "food_class": food_class,
                "food_label": row.get("food_label") or _LABEL.get(food_class),
                "documented_edibility": row.get("documented_edibility"),
                "food_sources": list(row.get("food_sources") or row.get("sources") or []),
                "common": row.get("common"),
            }
    return out


def load_poison_overrides() -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    path = settings.poisonous_species_path
    if not Path(path).exists():
        path = DATA_DIR / "poisonous_species.json"
    if not Path(path).exists():
        return out
    rows = json.loads(Path(path).read_text(encoding="utf-8"))
    for row in rows:
        taxon = row.get("latin_name") or ""
        if not taxon:
            continue
        food_class = poison_level_to_class(row.get("risk_level"))
        out[_norm(taxon)] = {
            "taxon": taxon,
            "food_class": food_class,
            "food_label": _LABEL[food_class],
            "documented_edibility": None,
            "food_sources": ["poisonous_species.json"],
            "common": row.get("common_name"),
            "notes": row.get("notes"),
        }
    return out


def build_food_quality_index() -> dict[str, dict[str, Any]]:
    """Union of curated FE export + poisonous list; poisonous can only raise severity."""
    index = dict(load_curated_food_quality())
    for key, poison in load_poison_overrides().items():
        if key not in index:
            index[key] = poison
            continue
        merged_class = _worse(index[key].get("food_class"), poison.get("food_class"))
        sources = list(
            dict.fromkeys(
                list(index[key].get("food_sources") or [])
                + list(poison.get("food_sources") or [])
            )
        )
        index[key] = {
            **index[key],
            "food_class": merged_class,
            "food_label": _LABEL.get(merged_class or "", index[key].get("food_label")),
            "food_sources": sources,
        }
    return index


def apply_food_quality_to_species_row(
    row: dict[str, Any],
    index: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Return a copy of row with food_* fields only when documented in index."""
    idx = index if index is not None else build_food_quality_index()
    taxon = row.get("taxon") or ""
    hit = idx.get(_norm(taxon))
    out = dict(row)
    if not hit:
        # Explicitly do not invent — clear any prior invented fields if present
        out.pop("food_class", None)
        out.pop("food_label", None)
        out.pop("food_sources", None)
        out.pop("documented_edibility", None)
        return out
    out["food_class"] = hit["food_class"]
    out["food_label"] = hit.get("food_label") or _LABEL.get(hit["food_class"])
    out["food_sources"] = list(hit.get("food_sources") or [])
    if hit.get("documented_edibility"):
        out["documented_edibility"] = hit["documented_edibility"]
    return out


def sync_expanded_catalog(
    *,
    write: bool = False,
    expanded_path: Path | None = None,
) -> dict[str, Any]:
    """
    Apply food quality onto expanded catalog species list.
    Returns stats + optional updated payload.
    """
    path = expanded_path or EXPANDED_PATH
    payload = json.loads(path.read_text(encoding="utf-8"))
    species = list(payload.get("species") or [])
    index = build_food_quality_index()
    synced = 0
    for i, row in enumerate(species):
        before = row.get("food_class")
        species[i] = apply_food_quality_to_species_row(row, index)
        if species[i].get("food_class"):
            synced += 1
        # track change optional
        _ = before
    payload["species"] = species
    payload["food_quality_sync"] = {
        "documented_in_index": len(index),
        "species_with_food_class": synced,
        "sources": [
            "food_quality_curated.json",
            "poisonous_species.json",
        ],
        "policy": "orientation_only; never invent comestible for undocumented taxa",
    }
    if write:
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        # clear cache if loader uses lru
        try:
            from app.services.species_catalog import list_expanded_species_catalog

            list_expanded_species_catalog.cache_clear()
        except Exception:
            pass
    return {
        "path": str(path),
        "total_species": len(species),
        "synced": synced,
        "index_size": len(index),
        "payload": payload,
    }


def get_food_quality_for_taxon(taxon: str) -> dict[str, Any] | None:
    return build_food_quality_index().get(_norm(taxon))
