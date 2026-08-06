"""Tests for expanded species catalog (risk-first artifact / D1 SSOT 520)."""

from __future__ import annotations

from pathlib import Path

from app.services.species_catalog import (
    get_species_by_slug,
    list_expanded_species,
    list_expanded_species_catalog,
    list_mock_species_catalog,
)

# Expanded catalog grows with SSOT; keep a soft floor (was 520 historically).
SSOT_MIN = 520


def test_expanded_catalog_matches_ssot_scale_and_has_risk_labels():
    mock = list_mock_species_catalog()
    expanded = list_expanded_species_catalog()
    species = expanded["species"]
    assert expanded["count"] == len(species)
    assert len(species) > len(mock)
    assert len(species) >= SSOT_MIN
    assert "orientation_only" in expanded.get("policy", "")
    slugs = [str(r.get("slug") or "") for r in species]
    assert all(slugs)
    assert len(set(slugs)) == len(species)
    for row in species[:20]:
        assert row.get("taxon")
        assert row.get("slug")
        assert row.get("risk_label")
        # Never grant consumption permission via label
        assert "edible" not in str(row.get("risk_label", "")).lower()


def test_list_and_slug_lookup():
    deadly = list_expanded_species(risk_label="deadly", limit=20)
    assert len(deadly) >= 1
    assert all(r["risk_label"] == "deadly" for r in deadly)
    sample = deadly[0]
    found = get_species_by_slug(sample["slug"])
    assert found is not None
    assert found["taxon"] == sample["taxon"]
    phallo = get_species_by_slug("amanita-phalloides")
    assert phallo is not None
    assert phallo["risk_label"] == "deadly"


def test_expanded_json_file_exists():
    path = Path(__file__).resolve().parents[1] / "data" / "species_catalog_expanded.json"
    assert path.exists()
    assert path.stat().st_size > 1000
