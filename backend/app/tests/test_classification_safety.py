def test_classification_without_images_is_low_confidence_and_warns(client):
    create = client.post(
        "/observations",
        json={
            "title": "Seta posible amanita",
            "notes": "amanita con laminas blancas",
            "country": "Espana",
        },
    )
    observation_id = create.json()["id"]
    response = client.post(f"/observations/{observation_id}/classify")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "orientation_only"
    assert payload["candidates"][0]["confidence"] <= 0.3
    assert payload["risk_state"] == "needs_more_evidence"
    assert "No consumas ninguna seta" in payload["final_warning"]
    assert payload["quality_assessment"]["has_base_view"] is False


def test_classification_never_returns_safe_to_eat(client):
    create = client.post("/observations", json={"title": "Boletal dudoso", "habitat": "pinar"})
    observation_id = create.json()["id"]
    response = client.post(f"/observations/{observation_id}/classify")
    payload = response.json()
    assert "safe_to_eat" not in str(payload)
    assert payload["safety_level"] == "unsafe_to_consume"
    assert payload["trace"]["classifier_strategy"] == "mock_multimodal_ranker_with_risk_layer"


def test_poisonous_catalog_loads(client):
    response = client.get("/species/poisonous")
    assert response.status_code == 200
    names = {item["latin_name"] for item in response.json()}
    assert "Amanita phalloides" in names
    assert "Lepiota brunneoincarnata" in names


def test_classification_with_high_risk_lookalikes_exposes_trace_and_warnings(client):
    create = client.post(
        "/observations",
        json={"title": "Amanita en bosque", "notes": "amanita con volva", "nearby_trees": ["roble"]},
    )
    observation_id = create.json()["id"]
    files = [
        ("images", ("cap-top.jpg", b"cap-image-content-here", "image/jpeg")),
        ("images", ("gills-view.jpg", b"gills-image-content-here", "image/jpeg")),
        ("images", ("base-view.jpg", b"base-image-content-here", "image/jpeg")),
        ("images", ("context-entorno.jpg", b"context-image-content-here", "image/jpeg")),
    ]
    upload = client.post(f"/observations/{observation_id}/images", files=files)
    assert upload.status_code == 200

    response = client.post(f"/observations/{observation_id}/classify")
    payload = response.json()
    assert payload["risk_state"] == "high_risk_lookalikes"
    assert "Amanita phalloides" in payload["dangerous_lookalikes"]
    assert payload["quality_assessment"]["has_lower_view"] is True
