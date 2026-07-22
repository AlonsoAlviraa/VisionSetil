"""Tests for expanded species catalog (risk-first artifact)."""

from __future__ import annotations

from pathlib import Path

from app.services.species_catalog import (
    get_species_by_slug,
    list_expanded_species,
    list_expanded_species_catalog,
    list_mock_species_catalog,
)


def test_expanded_catalog_larger_than_mock_and_has_risk_labels():
    mock = list_mock_species_catalog()
    expanded = list_expanded_species_catalog()
    species = expanded["species"]
    assert expanded["count"] == len(species)
    assert len(species) > len(mock)
    assert len(species) > 50
    assert "orientation_only" in expanded.get("policy", "")
    for row in species[:20]:
        assert row.get("taxon")
        assert row.get("slug")
        assert row.get("risk_label")
        # Never grant consumption permission via label
        assert "edible" not in str(row.get("risk_label", "")).lower()


def test_list_and_slug_lookup():
    deadly = list_expanded_species(risk_label="deadly", limit=10)
    assert len(deadly) >= 1
    assert all(r["risk_label"] == "deadly" for r in deadly)
    sample = deadly[0]
    found = get_species_by_slug(sample["slug"])
    assert found is not None
    assert found["taxon"] == sample["taxon"]


def test_expanded_json_file_exists():
    path = (
        Path(__file__).resolve().parents[1]
        / "data"
        / "species_catalog_expanded.json"
    )
    assert path.exists()
    assert path.stat().st_size > 1000
