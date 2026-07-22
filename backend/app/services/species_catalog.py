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


@lru_cache(maxsize=1)
def list_expanded_species_catalog() -> dict:
    """Load the expanded risk-first species catalog artifact.

    Returns the full payload: {version, count, policy, sources, species: [...]}.
    Falls back to mock catalog wrapped in the same shape if the expanded file is missing.
    Documented food quality is applied from curated sources only (never invented).
    """
    from app.services.food_quality_sync import apply_food_quality_to_species_row, build_food_quality_index

    path = _expanded_catalog_path()
    if path.exists():
        payload = json.loads(path.read_text(encoding="utf-8"))
    else:
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
    limit = max(1, min(int(limit), 500))
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
