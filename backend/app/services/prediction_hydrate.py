"""Server-side prediction hydration from catalog_v2 + media URLs (Phase B / B-32 + B-41).

Fills vernacular common_name, slug, risk_level, and public media URLs so Identify
result cards are not empty shells after map+gate.

B-41: normalize ML / historical scientific synonyms to the preferred catalog name
via ``data/species_catalog/synonyms.yaml`` before catalog lookup.
"""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

from app.core.config import settings
from app.db.schemas import SimpleSpeciesPrediction
from app.services.unified_catalog import (
    DEFAULT_LOCALE,
    get_by_scientific_name,
    load_catalog,
    resolve_vernaculars,
    scientific_to_slug,
)

_COMMENT_RE = re.compile(r"\s+#.*$")
_KEY_RE = re.compile(r"^[A-Za-z]")


def _media_prefix() -> str:
    return (settings.media_public_prefix or "/api/media").rstrip("/")


def _normalize_locale(locale: str | None) -> str:
    if not locale or not str(locale).strip():
        return DEFAULT_LOCALE
    loc = str(locale).strip().lower().split("-")[0]
    return loc or DEFAULT_LOCALE


def _clean_taxon(name: str | None) -> str:
    """Collapse whitespace; strip; keep original letter case for display fallback."""
    if not name:
        return ""
    return " ".join(str(name).strip().split())


def _taxon_key(name: str) -> str:
    return _clean_taxon(name).casefold()


def _synonyms_path_candidates() -> list[Path]:
    """Resolve synonyms.yaml relative to settings / repo layout (same style as catalog)."""
    repo = getattr(settings, "repo_root", None)
    base = settings.base_dir
    candidates: list[Path] = []
    if repo is not None:
        candidates.append(Path(repo) / "data" / "species_catalog" / "synonyms.yaml")
    candidates.extend(
        [
            base.parent / "data" / "species_catalog" / "synonyms.yaml"
            if base.name == "backend"
            else base / "data" / "species_catalog" / "synonyms.yaml",
            base / "data" / "species_catalog" / "synonyms.yaml",
            Path(__file__).resolve().parents[3]
            / "data"
            / "species_catalog"
            / "synonyms.yaml",
            Path(__file__).resolve().parents[4]
            / "data"
            / "species_catalog"
            / "synonyms.yaml",
        ]
    )
    # Deduplicate while preserving order
    seen: set[str] = set()
    out: list[Path] = []
    for p in candidates:
        key = str(p.resolve()) if p.exists() else str(p)
        if key not in seen:
            seen.add(key)
            out.append(p)
    return out


def _strip_inline_comment(s: str) -> str:
    return _COMMENT_RE.sub("", s).strip()


def _parse_synonyms_yaml(text: str) -> dict[str, list[str]]:
    """Minimal YAML subset parser for preferred → [alts] (no PyYAML dependency)."""
    mapping: dict[str, list[str]] = {}
    current: str | None = None
    for raw in text.splitlines():
        line = raw.rstrip()
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        stripped = line.strip()
        # Preferred key line: "Amanita phalloides:"
        if _KEY_RE.match(stripped) and stripped.endswith(":") and not stripped.startswith("-"):
            key = _strip_inline_comment(stripped[:-1].strip())
            if key:
                current = key
                mapping[current] = []
            continue
        if current is not None and stripped.startswith("-"):
            alt = _strip_inline_comment(stripped[1:].strip())
            if alt:
                mapping[current].append(alt)
    return mapping


@lru_cache(maxsize=1)
def load_synonym_reverse_map() -> dict[str, str]:
    """Map casefolded scientific name (preferred or alt) → preferred scientific name.

    Safety (join-parity): never rewrite an alias that is already a first-class
    catalog scientific name (e.g. *Lactarius sanguifluus* must not collapse into
    *L. deliciosus* even if listed under it in ``synonyms.yaml``).
    """
    reverse: dict[str, str] = {}
    catalog_keys = {
        str(k).casefold() for k in (load_catalog().get("_by_name") or {})
    }
    for path in _synonyms_path_candidates():
        try:
            if not path.exists():
                continue
            groups = _parse_synonyms_yaml(path.read_text(encoding="utf-8"))
            for preferred, alts in groups.items():
                pref_key = _taxon_key(preferred)
                reverse[pref_key] = preferred
                for alt in alts:
                    alt_key = _taxon_key(alt)
                    if not alt_key or alt_key == pref_key:
                        continue
                    # Distinct catalog taxon → keep its own identity
                    if alt_key in catalog_keys:
                        continue
                    reverse[alt_key] = preferred
            return reverse
        except OSError:
            continue
    return reverse


def reload_synonyms() -> dict[str, str]:
    """Clear synonym cache (tests / hot-reload)."""
    load_synonym_reverse_map.cache_clear()
    return load_synonym_reverse_map()


def normalize_to_preferred_scientific_name(name: str | None) -> str:
    """Resolve historical/ML synonym to preferred scientific name when known.

    Order:
    1. clean whitespace
    2. if already a catalog scientific name → keep that catalog name (no collapse)
    3. synonym reverse map (alts not present in catalog)
    4. original cleaned name

    Does not invent names; unknown taxa pass through cleaned.
    """
    cleaned = _clean_taxon(name)
    if not cleaned:
        return ""
    # First-class catalog taxa must not be synonym-collapsed into another preferred.
    hit = get_by_scientific_name(cleaned)
    if hit:
        sci = str(hit.get("scientific_name") or cleaned).strip()
        return sci or cleaned
    preferred = load_synonym_reverse_map().get(_taxon_key(cleaned))
    return preferred if preferred else cleaned


def hydrate_prediction(
    species: str,
    confidence: float,
    edibility: str | None,
    locale: str,
) -> SimpleSpeciesPrediction:
    """Hydrate a single prediction from catalog_v2 + media public prefix.

    Contract (orphan test ``test_hydrate_image_card_url_uses_public_prefix``):
    - ``image_card_url`` uses ``settings.media_public_prefix`` and ends with ``/card.webp``
    - ``slug`` is catalog slug (or scientific_to_slug fallback)
    - ``risk_level`` from catalog when known
    - ``in_catalog`` is True only when catalog lookup hits

    B-41: synonym-normalize to preferred scientific name before lookup so ML
    labels like ``Galerina autumnalis`` hydrate as ``Galerina marginata``.
    """
    raw = _clean_taxon(species) or (species or "")
    preferred = normalize_to_preferred_scientific_name(raw) if raw else ""
    loc = _normalize_locale(locale)
    hit = get_by_scientific_name(preferred) if preferred else None

    if hit:
        catalog_name = str(hit.get("scientific_name") or preferred).strip() or preferred
        slug = str(hit.get("slug") or scientific_to_slug(catalog_name) or "") or None
        vern = resolve_vernaculars(hit, loc)
        common_name = vern[0] if vern else None
        risk_level = hit.get("risk_level")
        if isinstance(risk_level, str):
            risk_level = risk_level or None
        else:
            risk_level = None
        in_catalog = True
        taxon = catalog_name
    else:
        taxon = preferred or raw or species
        slug = scientific_to_slug(taxon) if taxon else None
        common_name = None
        risk_level = None
        in_catalog = False

    prefix = _media_prefix()
    image_card_url: str | None = None
    image_thumb_url: str | None = None
    if slug:
        image_card_url = f"{prefix}/species/{slug}/card.webp"
        image_thumb_url = f"{prefix}/species/{slug}/thumb.webp"

    return SimpleSpeciesPrediction(
        species=taxon or species,
        common_name=common_name,
        confidence=float(confidence),
        edibility=edibility,
        slug=slug,
        risk_level=risk_level,
        image_card_url=image_card_url,
        image_thumb_url=image_thumb_url,
        in_catalog=in_catalog,
    )


# Alias matching routes_classify / orphan test import name.
_hydrate_prediction = hydrate_prediction
