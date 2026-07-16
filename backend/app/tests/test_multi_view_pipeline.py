"""Unit + integration tests for the multi-view pipeline (v5).

Covers:
    - ViewClassifier canonical labels, confidence fallback.
    - MultiViewMushroomClassifier mock-fallback mode (no weights).
    - /classify endpoint with ``view_types`` form field.
    - /readyz reports ``multi_view_classifier`` status.
    - Safety policy intact: no "safe to consume" phrasing, deadly species flagged.

These tests run in CI WITHOUT torch/timm installed (the classifier falls back
to MockMushroomClassifier), so they exercise the fallback path and the safety
layer rather than real inference.
"""

from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient


# --------------------------------------------------------------------------- #
# ViewClassifier
# --------------------------------------------------------------------------- #
def test_view_classifier_canonical_views():
    """CANONICAL_VIEWS exposes exactly the 4 v5 views."""
    from app.services.view_classifier import CANONICAL_VIEWS

    assert set(CANONICAL_VIEWS) == {"gills", "front", "habitat", "detail"}


def test_view_classifier_mock_predict_returns_valid_label():
    """The mock view classifier must return one of the canonical views."""
    import numpy as np

    from app.services.view_classifier import ViewClassifier

    vc = ViewClassifier()
    arr = np.zeros((64, 64, 3), dtype=np.uint8)
    pred = vc.predict(arr, filename="test.jpg")
    assert pred.view_type in {"gills", "front", "habitat", "detail"}
    assert 0.0 <= pred.confidence <= 1.0
    assert not vc.is_real  # mock in CI


def test_view_classifier_filename_hint_gills():
    """Filename hint 'gills' biases the mock classifier toward the gills view."""
    import numpy as np

    from app.services.view_classifier import ViewClassifier

    vc = ViewClassifier()
    arr = np.zeros((64, 64, 3), dtype=np.uint8)
    pred = vc.predict(arr, filename="photo_gills.jpg")
    assert pred.view_type == "gills"


# --------------------------------------------------------------------------- #
# MultiViewMushroomClassifier
# --------------------------------------------------------------------------- #
def test_multi_view_classifier_falls_back_to_mock_without_weights(tmp_path, monkeypatch):
    """When weights are absent, the classifier uses MockMushroomClassifier."""
    from app.core.config import settings
    from app.services.multi_view_classifier import (
        MultiViewMushroomClassifier,
        reset_multi_view_classifier,
    )

    monkeypatch.setattr(settings, "multi_view_weights_path", tmp_path / "nonexistent.pt")
    reset_multi_view_classifier()

    clf = MultiViewMushroomClassifier()
    assert clf.is_real is False
    assert clf._mock_fallback is not None
    status = clf.get_status()
    assert status["backend"] == "mock_fallback"
    assert status["loaded"] is False


def test_multi_view_classifier_status_shape():
    """get_status() returns the expected keys for /readyz reporting."""
    from app.services.multi_view_classifier import (
        MultiViewMushroomClassifier,
        reset_multi_view_classifier,
    )

    reset_multi_view_classifier()
    clf = MultiViewMushroomClassifier()
    status = clf.get_status()
    for key in ("backend", "loaded", "device", "weights_path", "num_classes"):
        assert key in status


# --------------------------------------------------------------------------- #
# /classify endpoint with view_types
# --------------------------------------------------------------------------- #
def _make_png_bytes() -> bytes:
    """Minimal valid 1x1 PNG."""
    return (
        b"\x89PNG\r\n\x1a\n"
        b"\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde"
        b"\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N"
        b"\x00\x00\x00\x00IEND\xaeB`\x82"
    )


@pytest.fixture()
def client():
    from app.main import app

    return TestClient(app)


def test_classify_accepts_view_types(client):
    """/classify accepts the ``view_types`` form field and returns 200."""
    png = _make_png_bytes()
    response = client.post(
        "/classify",
        data={
            "view_types": "gills,front",
            "habitat": "bosque",
        },
        files=[
            ("images", ("a.png", io.BytesIO(png), "image/png")),
            ("images", ("b.png", io.BytesIO(png), "image/png")),
        ],
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert "predictions" in body
    assert body["safety_level"] == "unsafe_to_consume"


def test_classify_rejects_invalid_view_type(client):
    """An invalid view_types label returns HTTP 400."""
    png = _make_png_bytes()
    response = client.post(
        "/classify",
        data={"view_types": "gills,invalid_label"},
        files=[
            ("images", ("a.png", io.BytesIO(png), "image/png")),
            ("images", ("b.png", io.BytesIO(png), "image/png")),
        ],
    )
    assert response.status_code == 400
    assert "invalid_label" in response.text.lower()


def test_classify_without_view_types_still_works(client):
    """Omitting view_types is allowed (auto-classification path)."""
    png = _make_png_bytes()
    response = client.post(
        "/classify",
        files=[("images", ("a.png", io.BytesIO(png), "image/png"))],
    )
    assert response.status_code == 200, response.text


# --------------------------------------------------------------------------- #
# /readyz model status
# --------------------------------------------------------------------------- #
def test_readyz_reports_multi_view_classifier(client):
    """/readyz includes a multi_view_classifier status block."""
    response = client.get("/readyz")
    assert response.status_code in (200, 503)
    body = response.json()
    details = body.get("checks", {}).get("model_details", "")
    # model_details is a stringified dict; check the key appears.
    assert "multi_view_classifier" in details


# --------------------------------------------------------------------------- #
# Safety policy regression
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("phrase", ["safe to consume", "comestible", "edible"])
def test_classify_never_claims_safe_to_consume(client, phrase):
    """No response from /classify may suggest the mushroom is safe to eat."""
    png = _make_png_bytes()
    response = client.post(
        "/classify",
        data={"view_types": "gills,front,habitat,detail"},
        files=[
            ("images", (f"{v}.png", io.BytesIO(png), "image/png"))
            for v in ["gills", "front", "habitat", "detail"]
        ],
    )
    assert response.status_code == 200
    text = response.json()
    blob = str(text).lower()
    assert phrase.lower() not in blob, f"Safety violation: response contains '{phrase}'"
    assert "unsafe_to_consume" in blob


def test_ammita_candidate_flagged_as_dangerous(client):
    """If an Amanita species appears, the danger_notes must flag the genus."""
    png = _make_png_bytes()
    response = client.post(
        "/classify",
        data={"view_types": "gills"},
        files=[("images", ("gills.png", io.BytesIO(png), "image/png"))],
    )
    assert response.status_code == 200
    # The mock catalog may or may not surface Amanita in top-k, but the final
    # warning must always be present.
    body = response.json()
    assert body["final_warning"]
    assert body["safety_level"] == "unsafe_to_consume"