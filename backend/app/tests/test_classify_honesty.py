"""B-12 — BE honesty regression: quality_gate never stripped + HTTP mode matrix.

Integration (HTTP /classify), not pure unit like B-02 ``test_classify_mode``.

Coverage:
  - JSON response always includes dual-signal ``quality_gate`` (pass and fail).
  - HTTP matrix: is_mock_stack × species_id_allowed → mode via monkeypatch gate/stack.
  - ``is_mock_stack`` remains stack truth independent of ``mode``.
  - blocked clears species predictions; allowed retains them.
"""

from __future__ import annotations

import io
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.db.schemas import (
    CandidateResult,
    ClassificationResponse,
    HumanReviewResponse,
    ModelStackResponse,
    OpenSetResponse,
    QualityAssessmentResponse,
    TraceResponse,
)
from app.ml.classify_mode import derive_classify_mode
from app.ml.quality_gate import clear_metrics_cache


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

_GATE_KEYS = {
    "species_id_allowed",
    "metrics_acceptable",
    "block_enabled",
    "reason",
    "reason_code",
    "verdict",
}


def _png_bytes() -> bytes:
    """Minimal valid 1x1 PNG."""
    return (
        b"\x89PNG\r\n\x1a\n"
        b"\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde"
        b"\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N"
        b"\x00\x00\x00\x00IEND\xaeB`\x82"
    )


def _post_classify(client: TestClient, **form: Any):
    png = _png_bytes()
    return client.post(
        "/classify",
        data=form or None,
        files=[("images", ("honesty.png", io.BytesIO(png), "image/png"))],
    )


def _assert_quality_gate_present(body: dict) -> dict:
    """JSON must always carry dual-signal quality_gate (D-B2 / D-B15)."""
    assert "quality_gate" in body, "quality_gate stripped from /classify JSON"
    gate = body["quality_gate"]
    assert isinstance(gate, dict)
    missing = _GATE_KEYS - set(gate.keys())
    assert not missing, f"quality_gate missing dual-signal keys: {missing}"
    assert gate["reason_code"] != "unset"
    assert gate["reason"] != "unset_fail_closed"
    assert gate["verdict"] in ("ACCEPTABLE", "UNACCEPTABLE")
    # verdict tracks metrics_acceptable only
    expected_verdict = "ACCEPTABLE" if gate["metrics_acceptable"] else "UNACCEPTABLE"
    assert gate["verdict"] == expected_verdict
    return gate


def _fake_gate(
    *,
    species_id_allowed: bool,
    metrics_acceptable: bool | None = None,
    block_enabled: bool = True,
) -> dict[str, Any]:
    """Controlled dual-signal gate for HTTP matrix (monkeypatch)."""
    ma = metrics_acceptable if metrics_acceptable is not None else species_id_allowed
    if not block_enabled:
        reason_code = "gate_disabled"
        reason = "gate_disabled (http_matrix)"
        allowed = True
    elif ma and species_id_allowed:
        reason_code = "gates_passed"
        reason = "gates_passed"
        allowed = True
    else:
        reason_code = "map_below"
        reason = "map_at_3=0.0500<0.2 (unacceptable)"
        allowed = species_id_allowed
    return {
        "species_id_allowed": allowed,
        "metrics_acceptable": ma,
        "block_enabled": block_enabled,
        "reason": reason,
        "reason_code": reason_code,
        "test_map_at_3": 0.45 if ma else 0.05,
        "safety_recall_deadly": 0.95 if ma else 0.0,
        "min_map_at_3": 0.20,
        "min_deadly_recall": 0.90,
        "metrics_path": "/tmp/http_matrix/metrics.json",
        "version": "http-matrix",
        "verdict": "ACCEPTABLE" if ma else "UNACCEPTABLE",
    }


class _StackFakeClassifier:
    """Classifier whose stack truth (is_real / model_stack) is under test control."""

    def __init__(self, *, is_real: bool) -> None:
        self.is_real = is_real
        self.last_view_coverage: list[str] = ["front"]
        self.last_ml_notes: list[str] = []
        self.last_confidence_margin: float | None = 0.12
        self.resolved_weights_path: str | None = None
        # classify_to_simple prefers _mock_fallback for diagnostics; leave None
        # so this instance is the diag source (is_real honored).

    def classify(self, observation, images, view_types=None) -> ClassificationResponse:
        backend = "real_backend" if self.is_real else "mock"
        cand = CandidateResult(
            taxon="Amanita muscaria",
            rank="species",
            confidence=0.62,
            danger_notes=["toxic lookalike family"],
            lookalikes=["Amanita pantherina"],
            edibility_label="toxic",
        )
        return ClassificationResponse(
            observation_id=getattr(observation, "id", None) or 0,
            status="orientation_only",
            safety_level="unsafe_to_consume",
            risk_state="unknown",
            message="honesty matrix test",
            model_stack=ModelStackResponse(
                detector=backend,
                visual_embedder=backend,
                image_text_embedder=backend,
                metadata_encoder=backend,
            ),
            candidates=[cand],
            top_candidates=[cand],
            missing_evidence=[],
            explanation="test",
            questions_for_user=[],
            warnings=[],
            dangerous_lookalikes=[],
            quality_assessment=QualityAssessmentResponse(
                sharpness_ok=True,
                lighting_ok=True,
                mushroom_large_enough=True,
                has_lower_view=False,
                has_base_view=False,
                has_environment_view=False,
                possible_multiple_species=False,
                obstruction_detected=False,
                heavy_compression_or_blur=False,
            ),
            trace=TraceResponse(
                pipeline_version="test",
                classifier_strategy="http_matrix",
                segmentation_strategy="none",
                visual_backbone_plan=[],
                metadata_fusion_plan="none",
                open_set_strategy="none",
                human_review_path="none",
            ),
            final_warning="Nunca consumas setas basándote en esta aplicación.",
            open_set=OpenSetResponse(
                is_unknown_or_uncertain=False,
                reason="ok",
                decision="accept",
            ),
            human_review=HumanReviewResponse(
                recommended=False, priority="low", reason="none"
            ),
        )


def _patch_http_matrix(
    monkeypatch: pytest.MonkeyPatch,
    *,
    is_mock_stack: bool,
    species_id_allowed: bool,
) -> None:
    """Inject fake classifier (stack) + fake gate (policy) for HTTP mode matrix."""
    clear_metrics_cache()
    fake_clf = _StackFakeClassifier(is_real=not is_mock_stack)

    def _get_clf():
        return fake_clf

    monkeypatch.setattr(
        "app.api.routes_classify.get_multi_view_classifier", _get_clf
    )
    monkeypatch.setattr(
        "app.services.classify_simple.get_multi_view_classifier", _get_clf
    )

    gate = _fake_gate(species_id_allowed=species_id_allowed)

    def _status(*, loaded_weights_path=None, repo_root=None):
        return dict(gate)

    monkeypatch.setattr("app.ml.quality_gate.quality_gate_status", _status)


# Normative HTTP matrix (same as B-02 unit, but over POST /classify)
_HTTP_MODE_MATRIX = [
    # (is_mock_stack, species_id_allowed, expected_mode)
    (False, False, "blocked"),
    (True, False, "blocked"),
    (True, True, "mock"),
    (False, True, "real"),
]


# --------------------------------------------------------------------------- #
# Strip regression — live /classify JSON always has quality_gate
# --------------------------------------------------------------------------- #


def test_classify_json_always_has_quality_gate(client: TestClient) -> None:
    """Default path (whatever gate/stack CI has): quality_gate never stripped."""
    response = _post_classify(client)
    assert response.status_code == 200, response.text
    body = response.json()
    gate = _assert_quality_gate_present(body)
    assert body["mode"] in ("real", "mock", "blocked")
    assert "is_mock_stack" in body
    # mode must match pure derive (B-02 contract over HTTP)
    expected = derive_classify_mode(
        is_mock_stack=bool(body["is_mock_stack"]),
        species_id_allowed=bool(gate["species_id_allowed"]),
    )
    assert body["mode"] == expected.value


def test_classify_json_quality_gate_on_pass_path(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Pass path (species_id_allowed) still attaches quality_gate — not strip-on-pass."""
    _patch_http_matrix(
        monkeypatch, is_mock_stack=True, species_id_allowed=True
    )
    response = _post_classify(client)
    assert response.status_code == 200, response.text
    body = response.json()
    gate = _assert_quality_gate_present(body)
    assert gate["species_id_allowed"] is True
    assert body["mode"] == "mock"
    assert body["is_mock_stack"] is True
    # Allowed path retains demo/real predictions (not force-cleared)
    assert isinstance(body["predictions"], list)
    assert len(body["predictions"]) >= 1


def test_classify_json_quality_gate_on_block_path(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Fail/block path attaches quality_gate and clears species predictions."""
    _patch_http_matrix(
        monkeypatch, is_mock_stack=False, species_id_allowed=False
    )
    response = _post_classify(client)
    assert response.status_code == 200, response.text
    body = response.json()
    gate = _assert_quality_gate_present(body)
    assert gate["species_id_allowed"] is False
    assert body["mode"] == "blocked"
    assert body["decision"] == "rejected"
    assert body["predictions"] == []
    # Stack truth independent: real stack + blocked mode
    assert body["is_mock_stack"] is False


# --------------------------------------------------------------------------- #
# HTTP mode matrix (monkeypatch gate × stack)
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "is_mock_stack,species_id_allowed,expected_mode",
    _HTTP_MODE_MATRIX,
    ids=[
        "http-real+blocked",
        "http-mock+blocked",
        "http-mock+allowed",
        "http-real+allowed",
    ],
)
def test_classify_http_mode_matrix(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    is_mock_stack: bool,
    species_id_allowed: bool,
    expected_mode: str,
) -> None:
    """POST /classify mode matrix — integration counterpart to B-02 unit matrix."""
    _patch_http_matrix(
        monkeypatch,
        is_mock_stack=is_mock_stack,
        species_id_allowed=species_id_allowed,
    )
    response = _post_classify(client, locale="es")
    assert response.status_code == 200, response.text
    body = response.json()

    gate = _assert_quality_gate_present(body)
    assert gate["species_id_allowed"] is species_id_allowed
    assert body["mode"] == expected_mode
    assert body["is_mock_stack"] is is_mock_stack
    assert body["locale"] == "es"

    # Pure derive agrees with HTTP serialization
    assert (
        derive_classify_mode(
            is_mock_stack=is_mock_stack,
            species_id_allowed=species_id_allowed,
        ).value
        == expected_mode
    )

    if not species_id_allowed:
        assert body["decision"] == "rejected"
        assert body["predictions"] == []
        assert body["mode"] == "blocked"
    else:
        assert len(body["predictions"]) >= 1
        assert body["mode"] in ("mock", "real")


def test_http_blocked_modes_share_mode_but_not_stack(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """real+blocked and mock+blocked both yield mode=blocked; stack flag free."""
    bodies = []
    for is_mock in (False, True):
        _patch_http_matrix(
            monkeypatch, is_mock_stack=is_mock, species_id_allowed=False
        )
        response = _post_classify(client)
        assert response.status_code == 200, response.text
        bodies.append(response.json())

    assert bodies[0]["mode"] == "blocked"
    assert bodies[1]["mode"] == "blocked"
    assert bodies[0]["is_mock_stack"] is False
    assert bodies[1]["is_mock_stack"] is True
    # Same product mode, opposite stack — cannot infer stack from mode alone
    assert bodies[0]["mode"] == bodies[1]["mode"]
    assert bodies[0]["is_mock_stack"] != bodies[1]["is_mock_stack"]


def test_http_mode_not_derived_from_is_mock_stack_alone(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Gate wins: mock stack + denied species ID → blocked, not mock."""
    _patch_http_matrix(
        monkeypatch, is_mock_stack=True, species_id_allowed=False
    )
    response = _post_classify(client)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["is_mock_stack"] is True
    assert body["mode"] == "blocked"
    assert body["mode"] != "mock"
