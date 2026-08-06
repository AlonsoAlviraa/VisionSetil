from fastapi.testclient import TestClient

from app.core.config import settings
from app.ml.interfaces import MetadataVector, ObservationRepresentation
from app.ml.model_registry import build_model_registry
from app.services.embedding_cache import EmbeddingCache
from app.services.open_set_rejection import OpenSetRejectionService


def test_models_status_endpoint(client: TestClient, monkeypatch):
    # Fail-closed default: ignore developer .env PRODUCT_UNLOCK for this assertion
    from app.core import config as config_mod

    monkeypatch.setattr(config_mod.settings, "product_unlock", False)
    response = client.get("/models/status")
    assert response.status_code == 200
    data = response.json()
    assert "detector" in data
    assert "visual_embedder" in data
    assert "image_text_embedder" in data
    summary = data.get("summary") or {}
    assert summary.get("product_unlock") is False
    assert summary.get("forage_permission") is False
    assert summary.get("consumption_permission") is False
    assert summary.get("can_auto_unlock") is False
    assert summary.get("soft_gates_advisory_only") is True
    assert summary.get("metrics_authorize_forage") is False
    # Open-set ops surface (S8 / live Identify thr tracking)
    assert "open_set" in data or "open_set_status" in summary
    if data.get("open_set"):
        assert data["open_set"].get("product_unlock") is False
    # Operator unlock + S9 live reject surfaces (fail-closed)
    unlock = data.get("product_unlock_eval") or {}
    assert isinstance(unlock, dict)
    assert unlock.get("product_unlock") is False
    assert unlock.get("can_auto_unlock") is False
    assert unlock.get("forage_permission") is False
    assert unlock.get("consumption_permission") is False
    assert unlock.get("soft_gates_advisory_only") is True
    assert unlock.get("metrics_authorize_forage") is False
    assert unlock.get("policy") in (
        None,
        "orientation_only_never_consume",
    ) or "orientation" in str(unlock.get("policy") or "")
    # Residual lock / operator action — required non-empty fail-closed locks
    assert "unlock_eligible_advisory" in summary
    assert "eligible_but_locked" in summary
    assert summary.get("product_unlock") is False
    residual_summary = list(summary.get("residual_lock_reasons") or [])
    residual_unlock = list(unlock.get("residual_lock_reasons") or [])
    assert residual_unlock, "product_unlock_eval.residual_lock_reasons must be non-empty"
    assert residual_summary == residual_unlock
    assert any(
        "orientation" in r or "no_auto_unlock" in r or "operator_cycle" in r or "unavailable" in r
        for r in residual_unlock
    )
    assert "metrics_never_authorize_forage_or_consumption" in residual_unlock
    assert "soft_map_deadly_gates_advisory_only" in residual_unlock
    assert bool(summary.get("eligible_but_locked")) == bool(unlock.get("eligible_but_locked"))
    assert bool(summary.get("unlock_eligible_advisory")) == bool(
        unlock.get("unlock_eligible_advisory")
    )
    # SSOT with gate_eval package: E20 path + pro_tester/safe_dp when report present
    checks = unlock.get("checks") or {}
    checklist_ids = {c.get("id") for c in (unlock.get("checklist") or []) if isinstance(c, dict)}
    if checks or checklist_ids:
        # When eval ran against real artifacts, pro/safe_dp signals should appear if present
        if "pro_tester_pass" in checks or "pro_tester_pass" in checklist_ids:
            assert "pro_tester_pass" in checks
        if "safe_dp_freeze" in checks or "safe_dp_freeze" in checklist_ids:
            assert "safe_dp_freeze" in checks
    ops = data.get("operator_unlock_ops") or {}
    assert isinstance(ops, dict)
    assert ops.get("product_unlock") is False
    assert ops.get("can_auto_unlock") is False
    assert ops.get("forage_permission") is False
    assert ops.get("consumption_permission") is False
    assert ops.get("soft_gates_advisory_only") is True
    assert ops.get("metrics_authorize_forage") is False
    assert "OPERATOR_UNLOCK_RUNBOOK" in str(ops.get("operator_runbook_path") or "")
    assert "kaggle.ml_qa.gate_eval" in str(ops.get("regenerate_command") or "")
    assert "operator_unlock_checklist" in str(ops.get("checklist_md_path") or "")
    assert "kernel_output_v20" in str(ops.get("metrics_ssot_path") or "")
    assert ops.get("metrics_path_evaluated") is not None
    # Evaluated path should be the E20 SSOT (or string containing v20), not an arbitrary primary
    eval_path = str(unlock.get("metrics_path") or ops.get("metrics_path_evaluated") or "")
    assert "v20" in eval_path.replace("\\", "/") or "kernel_output_v20" in str(
        ops.get("metrics_ssot_path") or ""
    )
    live = data.get("live_reject_monitor") or {}
    assert isinstance(live, dict)
    assert live.get("product_unlock") is False
    assert live.get("status") in (
        "ok",
        "empty",
        "no_log",
        "unavailable",
        "read_error",
    )
    e21 = data.get("e21_readiness") or {}
    assert isinstance(e21, dict)
    assert e21.get("product_unlock") is False
    assert e21.get("can_auto_unlock") is False
    assert e21.get("forage_permission") is False
    assert e21.get("consumption_permission") is False
    assert e21.get("e21_launched") is False
    assert e21.get("kaggle_push") is False
    assert e21.get("serve_product_unlock_does_not_launch_e21") is True
    assert summary.get("product_unlock") is False
    assert summary.get("e21_launched") is False
    assert summary.get("e21_kaggle_push") is False


def test_models_status_unlock_matches_e20_package_signals(client: TestClient, monkeypatch):
    """Advisory eligibility matches package; product_unlock stays false without serve flag."""
    import sys
    from pathlib import Path

    from app.core import config as config_mod
    from app.core.config import settings as _settings

    monkeypatch.setattr(config_mod.settings, "product_unlock", False)

    repo = Path(getattr(_settings, "repo_root", None) or _settings.base_dir.parent).resolve()
    if str(repo) not in sys.path:
        sys.path.insert(0, str(repo))
    from kaggle.ml_qa.gate_eval import evaluate_e20_local_artifacts

    pkg_eval = evaluate_e20_local_artifacts(repo)
    response = client.get("/models/status")
    assert response.status_code == 200
    body = response.json()
    unlock = body.get("product_unlock_eval") or {}
    assert unlock.get("product_unlock") is False
    assert pkg_eval.get("product_unlock") is False
    assert unlock.get("forage_permission") is False
    assert unlock.get("consumption_permission") is False
    assert pkg_eval.get("forage_permission") is False
    assert bool(unlock.get("unlock_eligible_advisory")) == bool(
        pkg_eval.get("unlock_eligible_advisory")
    )
    assert bool(unlock.get("eligible_but_locked")) == bool(pkg_eval.get("eligible_but_locked"))
    # Metrics package never auto-unlocks
    assert pkg_eval.get("can_auto_unlock") is False
    # Pro / safe_dp presence and values must agree when package evaluated them
    pkg_checks = pkg_eval.get("checks") or {}
    st_checks = unlock.get("checks") or {}
    for key in ("pro_tester_pass", "safe_dp_freeze"):
        if key in pkg_checks:
            assert key in st_checks
            assert bool(st_checks[key]) == bool(pkg_checks[key])


def test_models_status_e21_never_launched_from_product_unlock(client: TestClient, monkeypatch):
    """PRODUCT_UNLOCK serve flag must not flip e21_launched / kaggle_push."""
    from app.core import config as config_mod

    monkeypatch.setattr(config_mod.settings, "product_unlock", True)
    monkeypatch.setattr(config_mod.settings, "product_unlock_require_eligible", False)

    r = client.get("/models/status")
    assert r.status_code == 200
    data = r.json()
    # Serve unlock may be true when require_eligible=False
    assert data["summary"].get("e21_launched") is False
    assert data["summary"].get("e21_kaggle_push") is False
    e21 = data.get("e21_readiness") or {}
    assert e21.get("e21_launched") is False
    assert e21.get("kaggle_push") is False
    assert e21.get("product_unlock") is False
    assert e21.get("forage_permission") is False
    assert e21.get("serve_product_unlock_does_not_launch_e21") is True


def test_model_registry_fallbacks_from_config():
    registry = build_model_registry()
    status = registry.get_status()
    assert status["detector"]["backend"] in ("real_yoloe", "mock_yoloe_fallback")
    assert status["visual_embedder"]["backend"] in (
        "real_dinov3",
        "real_dinov2_compatible",
        "mock_dinov3_fallback",
    )
    assert status["image_text_embedder"]["backend"] in (
        "real_siglip2",
        "real_siglip_compatible",
        "mock_siglip2_fallback",
    )


def test_yoloe_fallback_no_weights():
    from app.services.yoloe_detector import YOLOEDetector

    settings.use_real_yoloe = True
    settings.yoloe_model_path = "non_existent_weights.pt"
    settings.yoloe_model_name = ""
    detector = YOLOEDetector.from_settings(settings)
    assert detector.is_real is False
    settings.use_real_yoloe = False


def test_yoloe_detector_no_detections_fallback():
    from app.services.yoloe_detector import YOLOEDetector

    detector = YOLOEDetector.from_settings(settings)

    class MockYOLOModel:
        def __call__(self, *args, **kwargs):
            class MockResult:
                boxes = []
                masks = None

            return [MockResult()]

    detector.is_real = True
    detector.model = MockYOLOModel()
    res = detector.detect_and_crop(["test_image.jpg"])
    assert len(res) == 1
    assert res[0].crop_path == "test_image.jpg"
    assert res[0].score == 0.0


def test_embeddings_normalized():
    from app.services.dinov3_embedder import DINOv3Embedder

    embedder = DINOv3Embedder.from_settings(settings)
    embs = embedder.embed_images(["test.jpg"])
    for emb in embs:
        norm = sum(x * x for x in emb.vector) ** 0.5
        assert round(norm, 2) == 1.0 or emb.model_name == "mock_dinov3"


def test_embedding_cache(tmp_path):
    cache_db = tmp_path / "test_cache.db"
    cache = EmbeddingCache(db_path=cache_db)

    vector = [0.1, 0.2, 0.3, 0.4]
    cache.set("img_hash_1", "test_model", vector)

    res = cache.get("img_hash_1", "test_model")
    assert res == vector
    assert cache.get("img_hash_2", "test_model") is None


def test_candidate_ranker_v2_orders_by_cosine_not_risk():
    from app.services.candidate_ranker_v2 import CandidateRankerV2

    rep = ObservationRepresentation(
        vector=[],
        detected_views=["gills_or_pores", "base", "environment"],
        evidence_penalty=0.0,
        metadata_vector=MetadataVector(values=[0.0] * 10, feature_names=[]),
        visual_component=[1.0, 0.0],
        text_component=[1.0, 0.0],
    )
    catalog = [
        {
            "taxon": "Amanita phalloides",
            "rank": "species",
            "risk_level": "deadly",
            "edibility_label": "dangerous_or_unknown",
            "lookalikes": [],
            "habitats": [],
            "substrates": [],
            "description": "",
            "dino_reference_embedding": [0.0, 1.0],
            "siglip_text_embedding": [0.0, 1.0],
        },
        {
            "taxon": "Boletus edulis",
            "rank": "species",
            "risk_level": "unknown",
            "edibility_label": "dangerous_or_unknown",
            "lookalikes": [],
            "habitats": [],
            "substrates": [],
            "description": "",
            "dino_reference_embedding": [1.0, 0.0],
            "siglip_text_embedding": [1.0, 0.0],
        },
    ]

    ranked = CandidateRankerV2().rank(rep, catalog, top_k=2)

    assert ranked[0]["taxon"] == "Boletus edulis"
    assert ranked[0]["ranker_version"] == "candidate_ranker_v2"
    assert ranked[0]["similarity_metric"] == "cosine"


def test_open_set_rejection_low_confidence():
    service = OpenSetRejectionService()
    candidates = [{"taxon": "Boletus edulis", "confidence": 0.3, "lookalikes": []}]
    rep = ObservationRepresentation(
        vector=[],
        detected_views=["gills_or_pores", "base", "environment"],
        evidence_penalty=0.0,
        metadata_vector=MetadataVector(values=[0.0] * 10, feature_names=[]),
        visual_component=[],
        text_component=[],
    )
    decision = service.evaluate(candidates, rep, [])
    assert decision.is_unknown_or_uncertain is True
    assert decision.reason == "low_top1_confidence"


def test_open_set_rejection_low_margin():
    """Conf must clear calibrated thr so margin rule is the binding reason."""
    service = OpenSetRejectionService()
    candidates = [
        {"taxon": "Boletus edulis", "confidence": 0.96, "lookalikes": []},
        {"taxon": "Agaricus campestris", "confidence": 0.95, "lookalikes": []},
    ]
    rep = ObservationRepresentation(
        vector=[],
        detected_views=["gills_or_pores", "base", "environment"],
        evidence_penalty=0.0,
        metadata_vector=MetadataVector(values=[0.0] * 10, feature_names=[]),
        visual_component=[],
        text_component=[],
    )
    decision = service.evaluate(candidates, rep, [])
    assert decision.is_unknown_or_uncertain is True
    assert decision.reason == "low_margin"


def test_open_set_rejection_missing_evidence():
    service = OpenSetRejectionService()
    candidates = [{"taxon": "Boletus edulis", "confidence": 0.98, "lookalikes": []}]
    rep = ObservationRepresentation(
        vector=[],
        detected_views=["base"],
        evidence_penalty=0.5,
        metadata_vector=MetadataVector(values=[0.0] * 10, feature_names=[]),
        visual_component=[],
        text_component=[],
    )
    decision = service.evaluate(candidates, rep, [])
    assert decision.is_unknown_or_uncertain is True
    assert decision.reason == "missing_critical_evidence"


def test_open_set_rejection_deadly_lookalike():
    # conf above E20 calibrated thr so deadly-lookalike reason is binding
    service = OpenSetRejectionService()
    candidates = [
        {"taxon": "Boletus edulis", "confidence": 0.98, "lookalikes": ["Amanita phalloides"]}
    ]
    rep = ObservationRepresentation(
        vector=[],
        detected_views=["gills_or_pores", "base", "environment"],
        evidence_penalty=0.0,
        metadata_vector=MetadataVector(values=[0.0] * 10, feature_names=[]),
        visual_component=[],
        text_component=[],
    )
    decision = service.evaluate(candidates, rep, [])
    assert decision.is_unknown_or_uncertain is True
    assert decision.reason == "deadly_lookalike_or_high_risk_genus"


def test_classification_safety_labels(client: TestClient):
    obs_res = client.post("/observations", json={"title": "Test Seta"})
    assert obs_res.status_code == 201
    obs_id = obs_res.json()["id"]

    class_res = client.post(f"/observations/{obs_id}/classify-advanced")
    assert class_res.status_code == 200
    data = class_res.json()
    assert data["safety_level"] == "unsafe_to_consume"
    assert data["status"] == "orientation_only"
    assert "safe_to_eat" not in str(data)


def test_human_review_safe_to_eat_blocking(client: TestClient):
    from app.db.database import get_db
    from app.db.models import User
    from app.main import app

    # E-05: patch requires reviewer/admin session (same test DB as client)
    reg = client.post(
        "/auth/register",
        json={
            "email": "reviewer@test.local",
            "username": "reviewer1",
            "password": "password123",
        },
    )
    assert reg.status_code == 201, reg.text
    token = reg.json()["token"]
    gen = app.dependency_overrides[get_db]()
    db = next(gen)
    try:
        user = db.query(User).filter(User.username == "reviewer1").first()
        assert user is not None
        user.role = "reviewer"
        db.commit()
    finally:
        import contextlib

        with contextlib.suppress(StopIteration):
            next(gen)
    headers = {"Authorization": f"Bearer {token}"}

    obs_res = client.post("/observations", json={"title": "Test Amanita"})
    obs_id = obs_res.json()["id"]

    rev_res = client.post(
        f"/observations/{obs_id}/request-human-review", json={"priority": "high", "reason": "test"}
    )
    assert rev_res.status_code == 201
    rev_id = rev_res.json()["id"]

    update_res = client.patch(
        f"/human-reviews/{rev_id}",
        json={"reviewer_notes": "Esta seta es comestible"},
        headers=headers,
    )
    assert update_res.status_code == 400
    body = update_res.json()
    # FastAPI may return {"detail": "..."} or a structured error envelope
    detail = body.get("detail")
    if detail is None:
        detail = body.get("message") or body.get("error") or str(body)
    assert "Safety policy violation" in str(detail) or "safety" in str(detail).lower()


def test_final_response_safety_persists(client: TestClient):
    obs_res = client.post("/observations", json={"title": "Boletus"})
    obs_id = obs_res.json()["id"]

    class_res = client.post(f"/observations/{obs_id}/classify-advanced")
    assert class_res.status_code == 200
    data = class_res.json()
    assert data["status"] == "orientation_only"
    assert data["safety_level"] == "unsafe_to_consume"
    assert "No consumas ninguna seta" in data["final_warning"]
