import json
import os
from functools import lru_cache
from pathlib import Path

from app.core.config import settings


def _load_json(path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))


def list_poisonous_species() -> list[dict]:
    return _load_json(settings.poisonous_species_path)


def list_mock_species_catalog() -> list[dict]:
    return _load_json(settings.mock_species_catalog_path)


def _expanded_catalog_path() -> Path:
    return Path(__file__).resolve().parents[1] / "data" / "species_catalog_expanded.json"


def _v2_ssot_path() -> Path:
    """Repo SSOT (species_catalog_v2) — preferred when expanded artifact is stale/missing."""
    try:
        from app.core.config import settings as _settings

        configured = Path(getattr(_settings, "species_catalog_v2_path", "") or "")
        if configured and configured.exists():
            return configured
    except Exception:
        pass
    here = Path(__file__).resolve()
    candidates = [
        here.parents[3] / "data" / "species_catalog" / "species_catalog_v2.json",
        here.parents[2].parent / "data" / "species_catalog" / "species_catalog_v2.json",
        Path.cwd() / "data" / "species_catalog" / "species_catalog_v2.json",
    ]
    for c in candidates:
        if c.exists():
            return c
    return candidates[0]


def _risk_label_from_v2(risk_level: str | None, edibility_code: str | None) -> str:
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
        return "unknown_or_risky"
    return "dangerous_or_unknown"


def _food_class_from_edibility(edibility_code: str | None) -> str | None:
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


def _rows_from_v2(v2: dict) -> list[dict]:
    rows: list[dict] = []
    for rec in v2.get("species") or []:
        taxon = str(rec.get("scientific_name") or "").strip()
        if not taxon:
            continue
        slug = str(rec.get("slug") or taxon.lower().replace(" ", "-"))
        vern = rec.get("vernacular_names") or {}
        names: list[str] = []
        for loc in ("es", "en", "ca", "eu"):
            for n in vern.get(loc) or []:
                if n and n not in names:
                    names.append(str(n))
        if not names:
            names = [taxon]
        desc = rec.get("description") or {}
        if isinstance(desc, dict):
            description = desc.get("es") or desc.get("en") or ""
        else:
            description = str(desc or "")
        edib = str(rec.get("edibility_code") or "desconocido")
        food = _food_class_from_edibility(edib)
        rows.append(
            {
                "taxon": taxon,
                "slug": slug,
                "rank": "species",
                "common_names": names,
                "risk_label": _risk_label_from_v2(
                    rec.get("risk_level"), rec.get("edibility_code")
                ),
                "family": rec.get("family"),
                "description": description
                or f"{taxon}. Entrada micológica orientativa. Nunca para orientación de consumo.",
                "source": "species_catalog_v2",
                "food_class": food,
                "food_label": food,
                "food_sources": None,
                "documented_edibility": food,
            }
        )
    return rows


@lru_cache(maxsize=1)
def list_expanded_species_catalog() -> dict:
    """Load the expanded risk-first species catalog artifact.

    Prefer backend expanded JSON when it has SSOT-scale (≥500). Otherwise promote
    species_catalog_v2 in-memory so FE/BE share the same 520 taxa. Falls back to mock.
    Documented food quality is applied from curated sources only (never invented).
    """
    from app.services.food_quality_sync import apply_food_quality_to_species_row, build_food_quality_index

    path = _expanded_catalog_path()
    payload: dict | None = None
    if path.exists():
        try:
            candidate = json.loads(path.read_text(encoding="utf-8"))
            n = len(candidate.get("species") or [])
            if n >= 500:
                payload = candidate
        except (OSError, json.JSONDecodeError):
            payload = None

    if payload is None:
        v2_path = _v2_ssot_path()
        if v2_path.exists():
            try:
                v2 = json.loads(v2_path.read_text(encoding="utf-8"))
                species = _rows_from_v2(v2)
                payload = {
                    "version": f"ssot-v2-{v2.get('catalog_version', '2')}",
                    "count": len(species),
                    "policy": "orientation_only; unsafe_to_consume; never_forage_permission",
                    "sources": ["species_catalog_v2.json", str(v2_path)],
                    "species": species,
                }
            except (OSError, json.JSONDecodeError):
                payload = None

    if payload is None:
        mock = list_mock_species_catalog()
        species = []
        for item in mock:
            species.append(
                {
                    "taxon": item.get("taxon"),
                    "slug": str(item.get("taxon", "")).lower().replace(" ", "-"),
                    "rank": item.get("rank", "species"),
                    "common_names": item.get("common_names") or [],
                    "risk_label": item.get("risk_level") or "dangerous_or_unknown",
                    "description": item.get("description"),
                    "source": "mock_fallback",
                }
            )
        payload = {
            "version": "mock-fallback",
            "count": len(species),
            "policy": "orientation_only; unsafe_to_consume",
            "sources": ["mock_species_catalog.json"],
            "species": species,
        }

    index = build_food_quality_index()
    payload["species"] = [
        apply_food_quality_to_species_row(row, index) for row in (payload.get("species") or [])
    ]
    payload["count"] = len(payload["species"])
    return payload


def list_expanded_species(
    *,
    q: str | None = None,
    risk_label: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict]:
    payload = list_expanded_species_catalog()
    rows: list[dict] = list(payload.get("species") or [])
    if q:
        ql = q.lower().strip()
        rows = [
            r
            for r in rows
            if ql in str(r.get("taxon", "")).lower()
            or any(ql in str(c).lower() for c in (r.get("common_names") or []))
            or ql in str(r.get("family") or "").lower()
        ]
    if risk_label:
        rl = risk_label.lower().strip()
        rows = [r for r in rows if str(r.get("risk_label", "")).lower() == rl]
    # SSOT is 520 taxones — allow full catalog pulls (was capped at 500).
    limit = max(1, min(int(limit), 2000))
    offset = max(0, int(offset))
    return rows[offset : offset + limit]


def get_species_by_slug(slug: str) -> dict | None:
    target = slug.lower().strip()
    for row in list_expanded_species_catalog().get("species") or []:
        if str(row.get("slug", "")).lower() == target:
            return row
    return None


@lru_cache(maxsize=4)
def load_real_species_index(index_dir: Path = None) -> tuple[list[dict], dict]:
    """Load real species visual prototypes and metadata from species_index directory.

    Returns:
        tuple: (species_catalog, index_metadata)
    """
    if index_dir is None:
        configured_index = os.getenv("SPECIES_INDEX_DIR")
        candidates = (
            [Path(configured_index)]
            if configured_index
            else [
                Path("/kaggle/working/visionsetil_outputs/species_index"),
                settings.base_dir / "species_index",
                settings.base_dir / "eval" / "species_index",
            ]
        )
        for candidate in candidates:
            if candidate.exists() and (candidate / "species_visual_prototypes.json").exists():
                index_dir = candidate
                break
    else:
        candidates = [index_dir]

    if index_dir is None or not index_dir.exists():
        raise FileNotFoundError(f"Species index directory not found. Tried: {candidates}")

    species_path = index_dir / "species_visual_prototypes.json"
    genus_path = index_dir / "genus_prototypes.json"
    family_path = index_dir / "family_prototypes.json"
    metadata_path = index_dir / "index_metadata.json"

    if not species_path.exists():
        raise FileNotFoundError(f"Species prototypes not found at {species_path}")

    species_catalog = json.loads(species_path.read_text(encoding="utf-8"))
    genus_catalog = (
        json.loads(genus_path.read_text(encoding="utf-8")) if genus_path.exists() else []
    )
    family_catalog = (
        json.loads(family_path.read_text(encoding="utf-8")) if family_path.exists() else []
    )
    genus_by_name = {
        item.get("genus", "").lower(): item for item in genus_catalog if item.get("genus")
    }
    family_by_name = {
        item.get("family", "").lower(): item for item in family_catalog if item.get("family")
    }

    for species in species_catalog:
        genus_prototype = genus_by_name.get(str(species.get("genus", "")).lower(), {})
        family_prototype = family_by_name.get(str(species.get("family", "")).lower(), {})
        species["genus_dino_prototype"] = genus_prototype.get("dino_prototype", [])
        species["genus_siglip_prototype"] = genus_prototype.get("siglip_prototype", [])
        species["genus_siglip_text_prototype"] = genus_prototype.get("siglip_text_prototype", [])
        species["genus_species_count"] = genus_prototype.get("species_count", 0)
        species["family_dino_prototype"] = family_prototype.get("dino_prototype", [])
        species["family_siglip_prototype"] = family_prototype.get("siglip_prototype", [])
        species["family_siglip_text_prototype"] = family_prototype.get("siglip_text_prototype", [])
        species["family_species_count"] = family_prototype.get("species_count", 0)

    metadata = {}
    if metadata_path.exists():
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    metadata["index_path"] = str(index_dir)
    metadata["species_prototypes_path"] = str(species_path)
    metadata["genus_prototypes_path"] = str(genus_path) if genus_path.exists() else ""
    metadata["family_prototypes_path"] = str(family_path) if family_path.exists() else ""
    metadata["genus_prototypes_loaded"] = len(genus_catalog)
    metadata["family_prototypes_loaded"] = len(family_catalog)
    metadata["catalog_version"] = "real_species_catalog_v2"

    return species_catalog, metadata


def load_open_set_thresholds(thresholds_path: Path = None) -> dict:
    """Load calibrated open-set thresholds from JSON file.

    Returns:
        dict: Calibrated thresholds with keys like 'calibrated_threshold', 'calibrated_margin'
    """
    if thresholds_path is None:
        configured_thresholds = os.getenv("OPEN_SET_THRESHOLDS_PATH")
        candidates = (
            [Path(configured_thresholds)]
            if configured_thresholds
            else [
                Path("/kaggle/working/visionsetil_outputs/open_set_thresholds.json"),
                settings.base_dir / "open_set_thresholds.json",
                settings.base_dir / "eval" / "reports" / "open_set_thresholds.json",
            ]
        )
        for candidate in candidates:
            if candidate.exists():
                thresholds_path = candidate
                break

    if thresholds_path is None or not thresholds_path.exists():
        # Return default thresholds
        return {
            "calibrated_threshold": settings.open_set_min_confidence,
            "calibrated_margin": settings.open_set_min_margin,
            "source": str(thresholds_path) if thresholds_path else "default_config",
            "status": "settings_fallback",
        }

    thresholds = json.loads(thresholds_path.read_text(encoding="utf-8"))
    thresholds["source"] = str(thresholds_path)
    thresholds["status"] = thresholds.get("status", "calibrated")
    return thresholds


def ensure_seed_data() -> None:
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
