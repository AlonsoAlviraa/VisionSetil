"""Server-side prediction hydration from catalog_v2 + media URLs (Phase B / B-32 + B-41 + B-42).

Fills vernacular common_name, slug, risk_level, and public media URLs so Identify
result cards are not empty shells after map+gate.

B-41: normalize ML / historical scientific synonyms to the preferred catalog name
via ``data/species_catalog/synonyms.yaml`` before catalog lookup (never collapse
first-class catalog taxa).

B-42: when catalog join yields deadly / poisonous (high) risk, surface that risk on
the prediction so Identify RiskChip + danger callouts are not blind to model
``edibility=unknown``. Hydrate only runs when species ID is allowed (blocked stays
empty — see ``classify_simple._hydrate_simple_result``).
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

# Severity ranks for max(model edibility, catalog risk) join (higher = more severe).
# Catalog SSOT uses deadly / high / medium / low / unknown / risky_lookalikes.
_RISK_SEVERITY: dict[str, int] = {
    "deadly": 100,
    "critical": 100,
    "mortifero": 100,
    "poisonous": 80,
    "high": 80,
    "toxic": 80,
    "toxico": 80,
    "risky_lookalikes": 50,
    "medium": 40,
    "caution": 40,
    "dangerous_or_unknown": 30,
    "unknown_or_risky": 25,
    "unknown": 10,
    "low": 5,
    "edible": 1,
    "safe": 1,
}

# Catalog risk_level → display risk for RiskChip / edibility field.
_CATALOG_RISK_TO_DISPLAY: dict[str, str] = {
    "deadly": "deadly",
    "critical": "deadly",
    "high": "poisonous",
    "poisonous": "poisonous",
    "toxic": "toxic",
}


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
    """Resolve synonyms.yaml relative to settings / repo layout."""
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
            Path(__file__).resolve().parents[3] / "data" / "species_catalog" / "synonyms.yaml",
            Path(__file__).resolve().parents[4] / "data" / "species_catalog" / "synonyms.yaml",
        ]
    )
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

    Never rewrite an alias that is already a first-class catalog scientific name.
    """
    reverse: dict[str, str] = {}
    catalog_keys = {str(k).casefold() for k in (load_catalog().get("_by_name") or {})}
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
    """Resolve historical/ML synonym to preferred scientific name when known."""
    cleaned = _clean_taxon(name)
    if not cleaned:
        return ""
    hit = get_by_scientific_name(cleaned)
    if hit:
        sci = str(hit.get("scientific_name") or cleaned).strip()
        return sci or cleaned
    preferred = load_synonym_reverse_map().get(_taxon_key(cleaned))
    return preferred if preferred else cleaned


def _norm_key(raw: str | None) -> str:
    if not raw:
        return ""
    return str(raw).strip().lower().replace(" ", "_")


def risk_severity(raw: str | None) -> int:
    """Numeric severity for comparing model edibility vs catalog risk_level."""
    k = _norm_key(raw)
    if not k:
        return 0
    if k in _RISK_SEVERITY:
        return _RISK_SEVERITY[k]
    # Unknown tokens treated as mild caution, not edible.
    return 15


def is_severe_catalog_risk(risk_level: str | None) -> bool:
    """True for deadly / poisonous join hits that must be visually boosted."""
    k = _norm_key(risk_level)
    return k in ("deadly", "critical", "high", "poisonous", "toxic")


def catalog_risk_to_display(risk_level: str | None) -> str | None:
    """Map catalog risk_level to FE RiskChip-friendly label."""
    k = _norm_key(risk_level)
    return _CATALOG_RISK_TO_DISPLAY.get(k)


def prefer_join_risk_for_edibility(
    model_edibility: str | None,
    catalog_risk_level: str | None,
) -> str | None:
    """Prefer catalog deadly/poisonous over weaker model edibility (B-42).

    Keeps model edibility when it is already at least as severe. Never invents
    edible from catalog low/unknown — only elevates severe join risk.
    """
    display = catalog_risk_to_display(catalog_risk_level)
    if not display:
        return model_edibility
    if risk_severity(display) > risk_severity(model_edibility):
        return display
    return model_edibility


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

    B-42: when join risk is deadly/poisonous (catalog high), also elevate
    ``edibility`` if the model left a weaker label (e.g. ``unknown``), so
    Identify RiskChip / danger callouts see the join without FE-only coupling.
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

    # B-42: surface severe catalog join on edibility for RiskChip consumers.
    out_edibility = prefer_join_risk_for_edibility(edibility, risk_level)

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
        edibility=out_edibility,
        slug=slug,
        risk_level=risk_level,
        image_card_url=image_card_url,
        image_thumb_url=image_thumb_url,
        in_catalog=in_catalog,
    )


# Alias matching routes_classify / orphan test import name.
_hydrate_prediction = hydrate_prediction
