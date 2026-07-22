"""Tests for documented food-quality sync (no invented comestibles)."""

from app.services.food_quality_sync import (
    apply_food_quality_to_species_row,
    build_food_quality_index,
    get_food_quality_for_taxon,
    poison_level_to_class,
    sync_expanded_catalog,
)


def test_poison_level_mapping():
    assert poison_level_to_class("critical") == "mortal"
    assert poison_level_to_class("high") == "toxica"


def test_known_documented_taxa():
    idx = build_food_quality_index()
    assert idx, "curated index must be non-empty"
    bolete = get_food_quality_for_taxon("Boletus edulis")
    assert bolete is not None
    assert bolete["food_class"] == "comestible"
    assert bolete.get("food_sources")

    death = get_food_quality_for_taxon("Amanita phalloides")
    assert death is not None
    assert death["food_class"] == "mortal"


def test_unknown_taxon_not_invented():
    assert get_food_quality_for_taxon("Fakeus inventus xyz") is None
    row = apply_food_quality_to_species_row(
        {"taxon": "Fakeus inventus xyz", "slug": "fakeus-inventus", "risk_label": "unknown_or_risky"}
    )
    assert "food_class" not in row or row.get("food_class") in (None, "")


def test_apply_to_row_sets_fields_for_known():
    row = apply_food_quality_to_species_row(
        {"taxon": "Boletus edulis", "slug": "boletus-edulis", "risk_label": "unknown_or_risky"}
    )
    assert row["food_class"] == "comestible"
    assert "food_label" in row
    assert row["food_sources"]


def test_sync_expanded_catalog_stats_no_write_required():
    stats = sync_expanded_catalog(write=False)
    assert stats["total_species"] > 100
    assert stats["index_size"] > 50
    # synced count <= index and total
    assert 0 < stats["synced"] <= stats["total_species"]
    # known species in payload has food_class
    species = stats["payload"]["species"]
    by_tax = {str(s.get("taxon", "")).lower(): s for s in species}
    if "boletus edulis" in by_tax:
        assert by_tax["boletus edulis"].get("food_class") == "comestible"
    if "amanita phalloides" in by_tax:
        assert by_tax["amanita phalloides"].get("food_class") == "mortal"
    # fake not present with comestible
    assert "fakeus inventus xyz" not in by_tax
