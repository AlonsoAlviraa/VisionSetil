"""Lookalike SSOT normalize + open-set string safety."""

from app.services.poisonous_lookalikes import (
    canonical_taxon_name,
    elevate_risk_for_genus,
    normalize_lookalike_names,
)
from app.services.species_catalog import list_expanded_species_catalog


def test_normalize_objects_and_strings():
    assert normalize_lookalike_names(
        [{"scientific_name": "Amanita phalloides", "note_key": "MORTAL"}]
    ) == ["Amanita phalloides"]
    assert normalize_lookalike_names(["Amanita verna (MORTAL)"]) == ["Amanita verna"]
    assert normalize_lookalike_names([None, "", {"scientific_name": ""}]) == []


def test_canonical_synonym_map():
    assert canonical_taxon_name("Coprinopsis atramentaria") == "Coprinus atramentarius"
    assert canonical_taxon_name("Tricholoma sulfureum") == "Tricholoma sulphureum"
    assert normalize_lookalike_names(
        ["Coprinopsis atramentaria", "Coprinus atramentarius"]
    ) == ["Coprinus atramentarius"]


def test_catalog_slug_and_name_resolve_synonyms():
    """Deep-link / API product gap: synonym slug or scientific → SSOT row."""
    from app.services.unified_catalog import (
        get_by_scientific_name,
        get_by_slug,
        resolve_ssot_slug,
        search_species,
    )

    rec_slug = get_by_slug("coprinopsis-atramentaria")
    assert rec_slug is not None
    assert rec_slug.get("scientific_name") == "Coprinus atramentarius"
    assert resolve_ssot_slug("coprinopsis-atramentaria") == "coprinus-atramentarius"

    rec_name = get_by_scientific_name("Coprinopsis atramentaria")
    assert rec_name is not None
    assert rec_name.get("scientific_name") == "Coprinus atramentarius"

    # Search by synonym scientific should surface SSOT taxon
    hits, total = search_species(q="Coprinopsis atramentaria", locale="es", limit=10)
    assert total >= 1
    assert any(h.get("scientific_name") == "Coprinus atramentarius" for h in hits)


def test_synonym_ssot_file_present():
    from pathlib import Path

    p = Path(__file__).resolve().parents[3] / "data" / "species_catalog" / "taxon_synonyms.json"
    assert p.is_file(), "taxon_synonyms.json SSOT missing"
    import json

    data = json.loads(p.read_text(encoding="utf-8"))
    assert "coprinopsis atramentaria" in {k.lower() for k in data["synonyms"]}


def test_elevate_risk_normalizes_objects():
    risk, warns = elevate_risk_for_genus(
        "Agaricus arvensis",
        [{"scientific_name": "Amanita virosa", "note_key": "MORTAL"}],
    )
    assert risk == "risky_lookalikes"
    assert warns == ["Amanita virosa"]


def test_expanded_catalog_preserves_lookalikes():
    list_expanded_species_catalog.cache_clear()
    payload = list_expanded_species_catalog()
    with_lk = [s for s in payload.get("species") or [] if s.get("lookalikes")]
    assert len(with_lk) >= 20, f"expected SSOT lookalikes in expanded catalog, got {len(with_lk)}"
    sample = next(s for s in with_lk if s.get("taxon") == "Agaricus arvensis")
    assert "Amanita virosa" in sample["lookalikes"]
