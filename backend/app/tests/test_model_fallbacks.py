from app.ml.model_registry import build_model_registry
from app.services.species_catalog import list_mock_species_catalog


def test_model_registry_uses_fallbacks_when_real_models_disabled():
    registry = build_model_registry()
    assert getattr(registry.detector, "is_real", False) is False
    assert getattr(registry.visual_embedder, "is_real", False) is False
    assert getattr(registry.image_text_embedder, "is_real", False) is False


def test_catalog_loads_from_json():
    catalog = list_mock_species_catalog()
    assert len(catalog) >= 4
    assert any(item["taxon"] == "Amanita phalloides" for item in catalog)
