from fastapi.testclient import TestClient

from app.core.config import settings
from app.ml.interfaces import MetadataVector, ObservationRepresentation
from app.ml.model_registry import build_model_registry
from app.services.embedding_cache import EmbeddingCache
from app.services.open_set_rejection import OpenSetRejectionService


def test_models_status_endpoint(client: TestClient):
    response = client.get("/models/status")
    assert response.status_code == 200
    data = response.json()
    assert "detector" in data
    assert "visual_embedder" in data
    assert "image_text_embedder" in data


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
    service = OpenSetRejectionService()
    candidates = [
        {"taxon": "Boletus edulis", "confidence": 0.6, "lookalikes": []},
        {"taxon": "Agaricus campestris", "confidence": 0.55, "lookalikes": []},
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
    candidates = [{"taxon": "Boletus edulis", "confidence": 0.8, "lookalikes": []}]
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
    service = OpenSetRejectionService()
    candidates = [
        {"taxon": "Boletus edulis", "confidence": 0.8, "lookalikes": ["Amanita phalloides"]}
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
        try:
            next(gen)
        except StopIteration:
            pass
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
    assert "Safety policy violation" in update_res.json()["detail"]


def test_final_response_safety_persists(client: TestClient):
    obs_res = client.post("/observations", json={"title": "Boletus"})
    obs_id = obs_res.json()["id"]

    class_res = client.post(f"/observations/{obs_id}/classify-advanced")
    assert class_res.status_code == 200
    data = class_res.json()
    assert data["status"] == "orientation_only"
    assert data["safety_level"] == "unsafe_to_consume"
    assert "No consumas ninguna seta" in data["final_warning"]
