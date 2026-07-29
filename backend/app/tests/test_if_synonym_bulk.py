"""Unit tests for P16 IF bulk synonym merge (no live network)."""
from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "scripts" / "expand_synonyms_if_bulk.py"


def _load_mod():
    spec = importlib.util.spec_from_file_location("expand_synonyms_if_bulk", SCRIPT)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_proposals_from_if_resolve_maps_aliases_to_ssot():
    m = _load_mod()
    ssot = {"coprinus atramentarius", "amanita phalloides"}
    payload = {
        "ok": True,
        "current_name": "Coprinopsis atramentaria",
        "best": {"name": "Coprinus atramentarius", "current_name": "Coprinopsis atramentaria"},
        "synonyms": [
            {"name": "Agaricus atramentarius"},
            {"name": "Coprinus atramentarius"},  # self
        ],
    }
    props = m.proposals_from_if_resolve("Coprinus atramentarius", payload, ssot)
    aliases = {p["alias"].lower() for p in props}
    assert "coprinopsis atramentaria" in aliases
    assert "agaricus atramentarius" in aliases
    assert all(p["preferred"] == "Coprinus atramentarius" for p in props)
    # never map another SSOT taxon as alias
    payload2 = {
        "ok": True,
        "current_name": "Amanita phalloides",
        "best": {"name": "X"},
        "synonyms": [],
    }
    props2 = m.proposals_from_if_resolve("Coprinus atramentarius", payload2, ssot)
    assert not any(p["alias"].lower() == "amanita phalloides" for p in props2)


def test_merge_curated_wins_and_no_ssot_overwrite():
    m = _load_mod()
    ssot = {"coprinus atramentarius", "boletus edulis"}
    base = {"coprinopsis atramentaria": "Coprinus atramentarius"}
    proposals = [
        {
            "alias": "Agaricus atramentarius",
            "preferred": "Coprinus atramentarius",
            "reason": "if_synonym_cluster",
            "source": "index_fungorum",
        },
        {
            "alias": "Coprinopsis atramentaria",
            "preferred": "Boletus edulis",  # conflict — curated wins
            "reason": "evil",
            "source": "index_fungorum",
        },
        {
            "alias": "Boletus edulis",  # SSOT taxon as alias — reject
            "preferred": "Coprinus atramentarius",
            "reason": "bad",
            "source": "index_fungorum",
        },
    ]
    merged, accepted, rejected = m.merge_synonyms(base, proposals, ssot)
    assert merged["coprinopsis atramentaria"] == "Coprinus atramentarius"
    assert "agaricus atramentarius" in merged
    assert merged["agaricus atramentarius"] == "Coprinus atramentarius"
    assert any(r.get("reject") == "curated_conflict" for r in rejected)
    assert any(r.get("reject") == "alias_is_ssot_taxon" for r in rejected)
    assert len(accepted) == 1


def test_policy_never_consumption():
    m = _load_mod()
    assert "never" in m.POLICY_NOTE.lower() or "nomenclature" in m.POLICY_NOTE.lower()
    assert "consumption" in m.POLICY_NOTE.lower() or "forage" in m.POLICY.lower()
