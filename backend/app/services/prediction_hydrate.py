"""Server-side prediction hydration from catalog_v2 + media URLs (Phase B / B-32).

Fills vernacular common_name, slug, risk_level, and public media URLs so Identify
result cards are not empty shells after map+gate.
"""

from __future__ import annotations

from app.core.config import settings
from app.db.schemas import SimpleSpeciesPrediction
from app.services.unified_catalog import (
    DEFAULT_LOCALE,
    get_by_scientific_name,
    resolve_vernaculars,
    scientific_to_slug,
)


def _media_prefix() -> str:
    return (settings.media_public_prefix or "/api/media").rstrip("/")


def _normalize_locale(locale: str | None) -> str:
    if not locale or not str(locale).strip():
        return DEFAULT_LOCALE
    loc = str(locale).strip().lower().split("-")[0]
    return loc or DEFAULT_LOCALE


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
    """
    taxon = (species or "").strip()
    loc = _normalize_locale(locale)
    hit = get_by_scientific_name(taxon) if taxon else None

    if hit:
        slug = str(hit.get("slug") or scientific_to_slug(taxon) or "") or None
        vern = resolve_vernaculars(hit, loc)
        common_name = vern[0] if vern else None
        risk_level = hit.get("risk_level")
        if isinstance(risk_level, str):
            risk_level = risk_level or None
        else:
            risk_level = None
        in_catalog = True
    else:
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
