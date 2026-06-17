import json

from app.core.config import settings


def _load_json(path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))


def list_poisonous_species() -> list[dict]:
    return _load_json(settings.poisonous_species_path)


def list_mock_species_catalog() -> list[dict]:
    return _load_json(settings.mock_species_catalog_path)


def ensure_seed_data() -> None:
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
