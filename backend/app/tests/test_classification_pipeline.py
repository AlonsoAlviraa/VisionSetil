from io import BytesIO


def test_advanced_endpoint_responds_and_uses_fallbacks(client):
    create = client.post(
        "/observations",
        json={
            "title": "Amanita dudosa",
            "country": "Espana",
            "region": "Navarra",
            "habitat": "oak forest",
            "substrate": "soil",
            "nearby_trees": ["oak"],
            "notes": "possible amanita with volva",
        },
    )
    observation_id = create.json()["id"]
    files = [
        ("images", ("cap-top.jpg", BytesIO(b"cap-image-content"), "image/jpeg")),
        ("images", ("gills-view.jpg", BytesIO(b"gills-image-content"), "image/jpeg")),
        ("images", ("base-view.jpg", BytesIO(b"base-image-content"), "image/jpeg")),
    ]
    upload = client.post(f"/observations/{observation_id}/images", files=files)
    assert upload.status_code == 200

    response = client.post(f"/observations/{observation_id}/classify-advanced")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "orientation_only"
    assert payload["safety_level"] == "unsafe_to_consume"
    assert "fallback" in payload["model_stack"]["detector"].lower()
    assert "fallback" in payload["model_stack"]["visual_embedder"].lower()
    assert "fallback" in payload["model_stack"]["image_text_embedder"].lower()
    assert payload["trace"]["ranker_version"] == "candidate_ranker_v2"
    assert payload["trace"]["similarity_metric"] == "cosine"
    assert "top1_score" in payload["trace"]
    assert "top1_margin" in payload["trace"]
    assert payload["open_set"]["reasons"]


def test_advanced_ranking_respects_top_k(client):
    create = client.post("/observations", json={"title": "Ranking test", "habitat": "forest"})
    observation_id = create.json()["id"]
    files = [("images", ("cap-top.jpg", BytesIO(b"image-content"), "image/jpeg"))]
    client.post(f"/observations/{observation_id}/images", files=files)

    response = client.post(f"/observations/{observation_id}/classify-advanced")
    payload = response.json()
    assert len(payload["candidates"]) <= 5
    assert payload["trace"]["ranker_version"] == "candidate_ranker_v2"
