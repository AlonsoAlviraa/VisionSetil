"""Unified species_catalog_v2 loader and localization helpers (PR-01 / PR-07a)."""

from __future__ import annotations

import json
import re
import unicodedata
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.core.config import settings

SUPPORTED_LOCALES = ("es", "ca", "eu", "en")
DEFAULT_LOCALE = "es"
SLUG_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


def scientific_to_slug(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def is_valid_slug(slug: str) -> bool:
    return bool(SLUG_RE.match(slug))


def _catalog_candidates() -> list[Path]:
    return [
        Path(settings.species_catalog_v2_path),
        settings.base_dir / "data" / "species_catalog" / "species_catalog_v2.json",
        settings.base_dir.parent / "data" / "species_catalog" / "species_catalog_v2.json"
        if settings.base_dir.name == "backend"
        else settings.base_dir / "data" / "species_catalog" / "species_catalog_v2.json",
        Path(__file__).resolve().parents[3] / "data" / "species_catalog" / "species_catalog_v2.json",
    ]


def _index_catalog(data: dict[str, Any]) -> dict[str, Any]:
    """Build O(1) lookup maps after load."""
    by_slug: dict[str, dict[str, Any]] = {}
    by_name: dict[str, dict[str, Any]] = {}
    for sp in data.get("species") or []:
        slug = sp.get("slug")
        if slug:
            by_slug[str(slug)] = sp
        sci = str(sp.get("scientific_name") or "").strip().lower()
        if sci:
            by_name[sci] = sp
    data["_by_slug"] = by_slug
    data["_by_name"] = by_name
    return data


@lru_cache(maxsize=2)
def load_catalog() -> dict[str, Any]:
    for path in _catalog_candidates():
        try:
            if path.exists():
                data = json.loads(path.read_text(encoding="utf-8"))
                data["_path"] = str(path)
                return _index_catalog(data)
        except OSError:
            continue
    return _index_catalog(
        {
            "catalog_version": "0.0.0-empty",
            "species": [],
            "supported_locales": list(SUPPORTED_LOCALES),
            "count": 0,
            "_path": None,
        }
    )


def reload_catalog() -> dict[str, Any]:
    load_catalog.cache_clear()
    return load_catalog()


def catalog_version() -> str:
    return str(load_catalog().get("catalog_version", "unknown"))


def all_species() -> list[dict[str, Any]]:
    return list(load_catalog().get("species") or [])


def get_by_slug(slug: str) -> dict[str, Any] | None:
    if not slug:
        return None
    return load_catalog().get("_by_slug", {}).get(slug)


def get_by_scientific_name(name: str) -> dict[str, Any] | None:
    if not name:
        return None
    target = name.strip().lower()
    hit = load_catalog().get("_by_name", {}).get(target)
    if hit:
        return hit
    return get_by_slug(scientific_to_slug(name))


def normalize_locale(locale: str | None) -> str:
    if not locale:
        return DEFAULT_LOCALE
    loc = locale.strip().lower().split("-")[0]
    if loc not in SUPPORTED_LOCALES:
        raise ValueError(loc)
    return loc


def _fold(s: str) -> str:
    nk = unicodedata.normalize("NFKD", s)
    return "".join(c for c in nk if not unicodedata.combining(c)).casefold()


def resolve_text(record: dict[str, Any], field: str, locale: str) -> str | None:
    """Resolve localized string map field with fallback chain locale → es → en → any."""
    data = record.get(field)
    if not isinstance(data, dict):
        if isinstance(data, str) and data.strip():
            return data
        return None
    chain = [locale, "es", "en"] + [loc for loc in SUPPORTED_LOCALES if loc not in (locale, "es", "en")]
    for loc in chain:
        val = data.get(loc)
        if isinstance(val, str) and val.strip():
            return val
        if isinstance(val, list) and val:
            # not expected for text fields
            continue
    return None


def resolve_vernaculars(record: dict[str, Any], locale: str) -> list[str]:
    vern = record.get("vernacular_names") or {}
    names = vern.get(locale) or []
    if names:
        return list(names)
    for loc in ("es", "en") + tuple(SUPPORTED_LOCALES):
        fallback = vern.get(loc) or []
        if fallback:
            return list(fallback)
    return []


def resolve_string_list(record: dict[str, Any], field: str, locale: str) -> list[str]:
    data = record.get(field)
    if isinstance(data, list):
        return list(data)
    if not isinstance(data, dict):
        return []
    chain = [locale, "es", "en"] + [loc for loc in SUPPORTED_LOCALES if loc not in (locale, "es", "en")]
    for loc in chain:
        val = data.get(loc)
        if isinstance(val, list) and val:
            return list(val)
    return []


def risk_to_placeholder_kind(risk_level: str | None, edibility_code: str | None = None) -> str:
    risk = (risk_level or "").lower()
    ed = (edibility_code or "").lower()
    if risk in ("deadly", "critical") or ed == "mortifero":
        return "deadly"
    if risk in ("high", "toxic", "risky_lookalikes", "medium") or ed == "toxico":
        return "toxic"
    if risk == "unknown" or ed == "desconocido":
        return "unknown"
    return "default"


def localize_summary(record: dict[str, Any], locale: str) -> dict[str, Any]:
    vern = resolve_vernaculars(record, locale)
    return {
        "id": record.get("id"),
        "scientific_name": record.get("scientific_name"),
        "slug": record.get("slug"),
        "family": record.get("family"),
        "genus": record.get("genus"),
        "risk_level": record.get("risk_level"),
        "edibility_code": record.get("edibility_code"),
        "categories": record.get("categories") or [],
        "featured": bool(record.get("featured")),
        "icon": record.get("icon"),
        "vernacular_names": vern,
        "common_name": vern[0] if vern else None,
        "tagline": resolve_text(record, "tagline", locale),
        "season": resolve_text(record, "season", locale),
        "habitat": resolve_text(record, "habitat", locale),
        "image_slug": record.get("image_slug") or record.get("slug"),
    }


def _resolve_morph(morphology: dict, part: str, locale: str) -> str | None:
    part_data = morphology.get(part)
    if isinstance(part_data, dict):
        return resolve_text({part: part_data}, part, locale)
    if isinstance(part_data, str) and part_data.strip():
        return part_data
    return None


def localize_detail(record: dict[str, Any], locale: str) -> dict[str, Any]:
    summary = localize_summary(record, locale)
    morphology = record.get("morphology") or {}
    summary.update(
        {
            "description": resolve_text(record, "description", locale),
            "morphology": {
                "cap": _resolve_morph(morphology, "cap", locale),
                "stem": _resolve_morph(morphology, "stem", locale),
                "hymenium": _resolve_morph(morphology, "hymenium", locale),
            },
            "key_features": resolve_string_list(record, "key_features", locale),
            "toxicity_notes": resolve_text(record, "toxicity_notes", locale),
            "lookalikes": record.get("lookalikes") or [],
            "iberian_relevance": record.get("iberian_relevance"),
            "ml_taxon_key": record.get("ml_taxon_key"),
        }
    )
    return summary


def search_species(
    *,
    q: str | None = None,
    locale: str = DEFAULT_LOCALE,
    category: str | None = None,
    risk_level: str | None = None,
    edibility_code: str | None = None,
    featured: bool | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict[str, Any]], int]:
    items = all_species()
    if category:
        items = [s for s in items if category in (s.get("categories") or [])]
    if risk_level:
        items = [s for s in items if s.get("risk_level") == risk_level]
    if edibility_code:
        items = [s for s in items if s.get("edibility_code") == edibility_code]
    if featured is not None:
        items = [s for s in items if bool(s.get("featured")) is featured]
    if q:
        qf = _fold(q.strip())
        filtered = []
        for s in items:
            hay = [_fold(str(s.get("scientific_name", ""))), _fold(str(s.get("family", "")))]
            vern = s.get("vernacular_names") or {}
            for loc in SUPPORTED_LOCALES:
                for name in vern.get(loc) or []:
                    hay.append(_fold(str(name)))
            if any(qf in h for h in hay):
                filtered.append(s)
        items = filtered
    total = len(items)
    page = items[offset : offset + limit]
    return [localize_summary(s, locale) for s in page], total
