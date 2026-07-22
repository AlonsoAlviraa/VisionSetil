"""Unit tests for multiview_mock_rank + MockMushroomClassifier entry."""

from __future__ import annotations

import pytest
from types import SimpleNamespace

from app.services.multiview_mock_rank import (
    multi_view_bonus,
    rank_candidates,
    should_open_set_reject,
    views_present,
)
from app.services.classifier import MockMushroomClassifier
from app.db.models import Observation, ObservationImage


def _img(name: str, view: str | None = None) -> SimpleNamespace:
    return SimpleNamespace(original_name=name, view_type=view)


def test_views_present_from_names_and_types():
    imgs = [
        _img("cap.jpg", "front"),
        _img("gills-view.jpg", None),
        _img("base-volva.jpg", "detail"),
    ]
    present = views_present(imgs)
    assert "cap_top" in present
    assert "gills_or_pores" in present
    assert "base" in present


def test_multi_view_bonus_increases_with_coverage():
    one = multi_view_bonus([_img("a.jpg")])
    three = multi_view_bonus(
        [
            _img("cap.jpg", "front"),
            _img("gills.jpg", "gills"),
            _img("base.jpg", "base"),
            _img("habitat.jpg", "habitat"),
        ]
    )
    assert three > one


def test_rank_candidates_prefers_deadly_on_amanita_cues():
    scored = [
        (0.4, {"taxon": "Boletus edulis", "risk_level": "unknown", "keywords": []}),
        (0.41, {"taxon": "Amanita phalloides", "risk_level": "deadly", "keywords": ["amanita"]}),
    ]
    ranked = rank_candidates(
        scored,
        images=[_img("cap.jpg", "front"), _img("gills.jpg", "gills")],
        haystack="amanita con volva y laminas blancas",
    )
    assert ranked[0][1]["taxon"] == "Amanita phalloides"


def test_open_set_reject_low_confidence():
    reject, reason = should_open_set_reject(0.15, [_img("only.jpg")])
    assert reject is True
    assert reason is not None


def test_open_set_reject_low_margin():
    reject, reason = should_open_set_reject(
        0.42,
        [_img("cap.jpg", "front"), _img("gills.jpg", "gills")],
        second_confidence=0.4,
        min_margin=0.06,
    )
    assert reject is True
    assert reason is not None
    assert "margen" in reason.lower() or "duda" in reason.lower()


def test_confidence_margin_and_normalize():
    from app.services.multiview_mock_rank import confidence_margin, relative_normalize

    assert confidence_margin(0.5, 0.3) == pytest.approx(0.2)
    ranked = relative_normalize(
        [
            (0.5, {"taxon": "A"}),
            (0.4, {"taxon": "B"}),
            (0.2, {"taxon": "C"}),
        ]
    )
    assert ranked[0][1]["taxon"] == "A"
    assert ranked[0][0] >= ranked[1][0]


def test_mock_classifier_honest_stack_and_safety():
    clf = MockMushroomClassifier()
    obs = Observation(title="Amanita en bosque", notes="amanita con volva")
    obs.id = 1
    images = [
        ObservationImage(
            observation_id=1,
            original_name="cap-top.jpg",
            stored_name="c.jpg",
            stored_path="/uploads/c.jpg",
            content_type="image/jpeg",
            size_bytes=10,
            view_type="cap_top",
        ),
        ObservationImage(
            observation_id=1,
            original_name="gills-view.jpg",
            stored_name="g.jpg",
            stored_path="/uploads/g.jpg",
            content_type="image/jpeg",
            size_bytes=10,
            view_type="gills_or_pores",
        ),
        ObservationImage(
            observation_id=1,
            original_name="base-view.jpg",
            stored_name="b.jpg",
            stored_path="/uploads/b.jpg",
            content_type="image/jpeg",
            size_bytes=10,
            view_type="base",
        ),
    ]
    result = clf.classify(obs, images, view_types=["front", "gills", "detail"])
    assert result.status == "orientation_only"
    assert result.safety_level == "unsafe_to_consume"
    assert "mock" in result.model_stack.detector.lower()
    assert "mock" in result.model_stack.visual_embedder.lower()
    assert result.candidates
    assert result.final_warning
    assert "consum" in result.final_warning.lower()
    assert result.open_set is not None
    assert result.trace.classifier_strategy


def test_mock_classifier_open_set_without_images():
    clf = MockMushroomClassifier()
    obs = Observation(title="Sin fotos")
    obs.id = 2
    result = clf.classify(obs, [])
    assert result.open_set is not None
    assert result.open_set.is_unknown_or_uncertain is True
    assert result.candidates[0].confidence <= 0.3
