from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

HIGH_RISK_GENERA = {"amanita", "galerina", "cortinarius", "lepiota", "gyromitra"}

# Fallback if SSOT file missing (tests / partial checkouts)
_FALLBACK_SYNONYMS: dict[str, str] = {
    "coprinopsis atramentaria": "Coprinus atramentarius",
    "coprinus atramentarus": "Coprinus atramentarius",
    "tricholoma sulfureum": "Tricholoma sulphureum",
}


@lru_cache(maxsize=1)
def load_taxon_synonyms() -> dict[str, str]:
    """Load curated synonyms from SSOT JSON (keys lowercase)."""
    root = Path(__file__).resolve().parents[3]
    path = root / "data" / "species_catalog" / "taxon_synonyms.json"
    if not path.is_file():
        return dict(_FALLBACK_SYNONYMS)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return dict(_FALLBACK_SYNONYMS)
    syn = data.get("synonyms") if isinstance(data, dict) else None
    if not isinstance(syn, dict):
        return dict(_FALLBACK_SYNONYMS)
    out: dict[str, str] = {}
    for k, v in syn.items():
        if k and v:
            out[str(k).strip().lower()] = str(v).strip()
    return out or dict(_FALLBACK_SYNONYMS)


def canonical_taxon_name(name: str) -> str:
    """Map known aliases/typos to SSOT spelling; otherwise return stripped name."""
    raw = (name or "").strip()
    if not raw:
        return ""
    if " (" in raw:
        raw = raw.split(" (", 1)[0].strip()
    mapped = load_taxon_synonyms().get(raw.lower())
    return mapped or raw


def normalize_lookalike_names(lookalikes) -> list[str]:
    """Normalize catalog lookalikes to scientific-name strings.

    SSOT stores objects ``{scientific_name, note_key}``; API/open-set expect
    ``list[str]``. Accept both shapes (and bare strings) without inventing taxa.
    Applies curated synonym map so Identify lookalikes join the catalog.
    """
    out: list[str] = []
    for lk in lookalikes or []:
        name = ""
        if isinstance(lk, str):
            name = lk.strip()
        elif isinstance(lk, dict):
            name = str(lk.get("scientific_name") or lk.get("taxon") or "").strip()
        name = canonical_taxon_name(name)
        if name and name not in out:
            out.append(name)
    return out


def elevate_risk_for_genus(taxon: str, lookalikes: list[str]) -> tuple[str, list[str]]:
    genus = taxon.split()[0].lower() if taxon else ""
    warnings = normalize_lookalike_names(lookalikes)
    if genus in HIGH_RISK_GENERA:
        return "high", warnings
    if warnings:
        return "risky_lookalikes", warnings
    return "unknown", warnings
