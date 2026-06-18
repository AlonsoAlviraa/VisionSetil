import json
from pathlib import Path

from app.core.config import settings


def _load_json(path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))


def list_poisonous_species() -> list[dict]:
    return _load_json(settings.poisonous_species_path)


def list_mock_species_catalog() -> list[dict]:
    return _load_json(settings.mock_species_catalog_path)


def load_real_species_index(index_dir: Path = None) -> tuple[list[dict], dict]:
    """Load real species visual prototypes and metadata from species_index directory.
    
    Returns:
        tuple: (species_catalog, index_metadata)
    """
    if index_dir is None:
        # Try default locations
        candidates = [
            Path("/kaggle/working/visionsetil_outputs/species_index"),
            settings.base_dir / "species_index",
            settings.base_dir / "eval" / "species_index",
        ]
        for candidate in candidates:
            if candidate.exists() and (candidate / "species_visual_prototypes.json").exists():
                index_dir = candidate
                break
    
    if index_dir is None or not index_dir.exists():
        raise FileNotFoundError(f"Species index directory not found. Tried: {candidates}")
    
    species_path = index_dir / "species_visual_prototypes.json"
    metadata_path = index_dir / "index_metadata.json"
    
    if not species_path.exists():
        raise FileNotFoundError(f"Species prototypes not found at {species_path}")
    
    species_catalog = json.loads(species_path.read_text(encoding="utf-8"))
    
    metadata = {}
    if metadata_path.exists():
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    
    return species_catalog, metadata


def load_open_set_thresholds(thresholds_path: Path = None) -> dict:
    """Load calibrated open-set thresholds from JSON file.
    
    Returns:
        dict: Calibrated thresholds with keys like 'calibrated_threshold', 'calibrated_margin'
    """
    if thresholds_path is None:
        # Try default locations
        candidates = [
            Path("/kaggle/working/visionsetil_outputs/open_set_thresholds.json"),
            settings.base_dir / "open_set_thresholds.json",
            settings.base_dir / "eval" / "reports" / "open_set_thresholds.json",
        ]
        for candidate in candidates:
            if candidate.exists():
                thresholds_path = candidate
                break
    
    if thresholds_path is None or not thresholds_path.exists():
        # Return default thresholds
        return {
            "calibrated_threshold": settings.open_set_min_confidence,
            "calibrated_margin": settings.open_set_min_margin,
            "source": "default_config",
        }
    
    thresholds = json.loads(thresholds_path.read_text(encoding="utf-8"))
    thresholds["source"] = str(thresholds_path)
    return thresholds


def ensure_seed_data() -> None:
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
