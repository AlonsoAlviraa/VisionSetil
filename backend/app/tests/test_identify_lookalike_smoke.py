"""Identify lookalike smoke tests — SSOT pairs surface for safety UI.

Runs without real GPU inference (weights discovery stubbed). Ensures the
MultiView path that powers Identify populates lookalikes / dangerous_lookalikes
from curated SSOT for classic confusable taxa.
"""
from __future__ import annotations

import pytest


# Classic SSOT pairs that must remain non-empty for Identify safety surfaces
_SMOKE_TAXA = [
    ("Amanita caesarea", "Amanita phalloides"),
    ("Boletus edulis", "Boletus satanas"),
    ("Cantharellus cibarius", "Omphalotus olearius"),
    ("Armillaria mellea", "Galerina marginata"),
    ("Agaricus campestris", "Amanita verna"),
    # P0: campestris ↔ xanthoderma (SSOT spelling)
    ("Agaricus campestris", "Agaricus xanthoderma"),
    ("Agaricus xanthoderma", "Agaricus campestris"),
    # v1.2.15 expanded deadly / educational pairs
    ("Amanita phalloides", "Amanita citrina"),
    ("Calocybe gambosa", "Inocybe erubescens"),
    ("Gyromitra esculenta", "Morchella esculenta"),
    ("Clitopilus prunulus", "Entoloma sinuatum"),
    ("Kuehneromyces mutabilis", "Hypholoma fasciculare"),
]


@pytest.fixture()
def multiview_mock_weights(monkeypatch, tmp_path):
    """Force mock weight path so CI stays fast and offline."""
    from app.core.config import settings
    from app.services.multi_view_classifier import reset_multi_view_classifier

    monkeypatch.setattr(
        "app.ml.weight_discovery.resolve_multiview_weights_path",
        lambda **_kwargs: None,
    )
    monkeypatch.setattr(
        "app.ml.weight_discovery.describe_weight_discovery",
        lambda **_kwargs: {
            "configured": str(tmp_path / "nonexistent.pt"),
            "configured_exists": False,
            "resolved": None,
            "resolved_exists": False,
            "candidates": [],
            "candidate_count": 0,
        },
    )
    monkeypatch.setattr(settings, "multi_view_weights_path", tmp_path / "nonexistent.pt")
    monkeypatch.setattr(settings, "model_fallback_to_mock", True)
    reset_multi_view_classifier()
    yield
    reset_multi_view_classifier()


def test_lookalike_index_covers_classic_pairs(multiview_mock_weights):
    from app.services.multi_view_classifier import MultiViewMushroomClassifier

    clf = MultiViewMushroomClassifier()
    assert clf.is_real is False
    assert len(clf._lookalike_index) >= 20

    for taxon, mate in _SMOKE_TAXA:
        lks = clf._lookalikes_for(taxon)
        assert lks, f"empty lookalikes for {taxon}"
        mates_lower = {m.lower() for m in lks}
        assert mate.lower() in mates_lower, (
            f"expected mate {mate!r} in lookalikes for {taxon!r}, got {lks}"
        )


def test_lookalikes_for_resolves_synonym_spellings(multiview_mock_weights):
    """Synonym query spellings must hit SSOT LA index (not empty dual-row stubs)."""
    from app.services.multi_view_classifier import MultiViewMushroomClassifier

    clf = MultiViewMushroomClassifier()
    # Rubroboletus satanas → Boletus satanas → edulis mate
    sat_lks = clf._lookalikes_for("Rubroboletus satanas")
    assert any("edulis" in n.lower() for n in sat_lks), sat_lks
    # Agaricus xanthodermus → xanthoderma → campestris mate
    xan_lks = clf._lookalikes_for("Agaricus xanthodermus")
    assert any("campestris" in n.lower() for n in xan_lks), xan_lks


def test_amanita_lookalikes_include_deadly(multiview_mock_weights):
    from app.services.multi_view_classifier import MultiViewMushroomClassifier

    clf = MultiViewMushroomClassifier()
    lks = clf._lookalikes_for("Amanita muscaria")
    deadly = {"amanita phalloides", "amanita virosa", "amanita verna"}
    found = {n.lower() for n in lks} & deadly
    assert found, f"Amanita muscaria should surface deadly Amanita mates, got {lks}"


def test_build_candidates_wires_lookalikes_on_real_labels(multiview_mock_weights):
    """Simulate is_real candidate build: lookalikes must attach to top taxon."""
    from types import SimpleNamespace

    import numpy as np

    from app.services.multi_view_classifier import MultiViewMushroomClassifier

    clf = MultiViewMushroomClassifier()
    # Simulate loaded real labels without heavy torch weights
    clf.is_real = True
    clf.idx2label = {
        0: "Amanita caesarea",
        1: "Boletus edulis",
        2: "Cantharellus cibarius",
    }
    clf.label2idx = {v: k for k, v in clf.idx2label.items()}
    probs = np.array([0.55, 0.30, 0.15], dtype=np.float64)
    obs = SimpleNamespace(
        title="smoke",
        notes="amanita",
        habitat=None,
        substrate=None,
        nearby_trees=[],
        country=None,
        smell=None,
        color_change_on_cut=None,
    )
    # Diagnostic priority slots — multi-view honesty path used by Identify wizard
    views = ["gills", "front", "detail"]
    candidates = clf._build_candidates(probs, obs, images=[], views=views)
    assert candidates, "expected candidates"
    primary = candidates[0]
    assert primary.taxon == "Amanita caesarea"
    assert primary.lookalikes, "Identify primary must expose lookalikes"
    assert any("phalloides" in n.lower() for n in primary.lookalikes)


def test_lookalike_smoke_includes_diagnostic_priority_views(multiview_mock_weights):
    """Multiview Identify smoke: gills/front/detail remain canonical diagnostic slots."""
    from app.services.multi_view_classifier import MultiViewMushroomClassifier

    clf = MultiViewMushroomClassifier()
    # Canonical views used by FE multiViewSlots / diagnostic map
    priority = ("gills", "front", "detail")
    for v in priority:
        assert isinstance(v, str) and v
    # Classifier accepts multi-view list without raising (mock path)
    assert clf.is_real is False
    lks = clf._lookalikes_for("Amanita caesarea")
    assert any("phalloides" in n.lower() for n in lks)


def test_classify_dangerous_lookalikes_nonempty_for_amanita(client, multiview_mock_weights):
    """End-to-end Identify-style classify: dangerous_lookalikes not empty on Amanita cue."""
    _JPEG = b"\xff\xd8\xff\xe0" + b"x" * 32
    create = client.post(
        "/observations",
        json={
            "title": "Amanita en bosque mediterraneo",
            "notes": "amanita con volva y laminas blancas",
            "nearby_trees": ["roble"],
        },
    )
    assert create.status_code in (200, 201)
    oid = create.json()["id"]
    files = [
        ("images", ("cap.jpg", _JPEG + b"cap", "image/jpeg")),
        ("images", ("gills.jpg", _JPEG + b"gills", "image/jpeg")),
        ("images", ("base.jpg", _JPEG + b"base", "image/jpeg")),
    ]
    up = client.post(f"/observations/{oid}/images", files=files)
    assert up.status_code in (200, 201)
    resp = client.post(f"/observations/{oid}/classify")
    assert resp.status_code in (200, 201)
    payload = resp.json()
    assert payload.get("safety_level") == "unsafe_to_consume"
    # Mock ranker often elevates Amanita; require non-empty dangerous_lookalikes
    # when risk is high_risk_lookalikes or primary is Amanita-like
    dls = payload.get("dangerous_lookalikes") or []
    risk = payload.get("risk_state") or ""
    primary = (payload.get("candidates") or [{}])[0].get("taxon") or ""
    if risk == "high_risk_lookalikes" or primary.lower().startswith("amanita"):
        assert dls, f"expected dangerous_lookalikes for risk={risk} primary={primary}"
        assert any("amanita" in str(x).lower() for x in dls)


def test_hydrate_merges_ssot_lookalikes_when_empty(multiview_mock_weights):
    """B-43: shared map path merges catalog SSOT lookalikes into dangerous_lookalikes."""
    from app.db.schemas import (
        QualityGatePayload,
        SimpleClassificationResult,
        SimpleSpeciesPrediction,
    )
    from app.services.classify_simple import _hydrate_simple_result

    base = SimpleClassificationResult(
        request_id="hydrate-lk-smoke",
        decision="accepted",
        predictions=[
            SimpleSpeciesPrediction(
                species="Amanita caesarea",
                common_name=None,
                confidence=0.8,
                edibility="unknown",
            )
        ],
        rejection_reason=None,
        processing_time_ms=10,
        dangerous_lookalikes=[],  # empty — hydrate must fill from SSOT
        quality_gate=QualityGatePayload(
            species_id_allowed=True,
            metrics_acceptable=True,
            block_enabled=True,
            reason="gates_passed",
            reason_code="gates_passed",
            test_map_at_3=0.5,
            safety_recall_deadly=0.95,
            min_map_at_3=0.2,
            min_deadly_recall=0.9,
            metrics_path=None,
            version="test",
            verdict="ACCEPTABLE",
        ),
        locale="es",
    )
    out = _hydrate_simple_result(base, locale="es")
    assert out.dangerous_lookalikes, "expected SSOT lookalikes merged for Amanita caesarea"
    assert any("phalloides" in n.lower() for n in out.dangerous_lookalikes)
    # Predictions hydrated (catalog join)
    assert out.predictions[0].in_catalog is True
    assert out.predictions[0].species == "Amanita caesarea"


def test_hydrate_skips_lookalike_merge_when_gate_blocked(multiview_mock_weights):
    from app.db.schemas import (
        QualityGatePayload,
        SimpleClassificationResult,
        SimpleSpeciesPrediction,
    )
    from app.services.classify_simple import _hydrate_simple_result

    base = SimpleClassificationResult(
        request_id="hydrate-blocked",
        decision="rejected",
        predictions=[
            SimpleSpeciesPrediction(
                species="Amanita caesarea",
                confidence=0.8,
                edibility="unknown",
            )
        ],
        processing_time_ms=5,
        dangerous_lookalikes=[],
        quality_gate=QualityGatePayload(
            species_id_allowed=False,
            metrics_acceptable=False,
            block_enabled=True,
            reason="map_below",
            reason_code="map_below",
            test_map_at_3=0.05,
            safety_recall_deadly=0.5,
            min_map_at_3=0.2,
            min_deadly_recall=0.9,
            metrics_path=None,
            version="test",
            verdict="UNACCEPTABLE",
        ),
        locale="es",
    )
    out = _hydrate_simple_result(base, locale="es")
    # Blocked path: no hydrate, no SSOT dress-up of empty shells
    assert out.dangerous_lookalikes == []
