from io import BytesIO


def test_image_upload_endpoint_works(client):
    create = client.post("/observations", json={"title": "Carga guiada"})
    observation_id = create.json()["id"]
    files = [
        ("images", ("cap-top.jpg", BytesIO(b"cap-image"), "image/jpeg")),
        ("images", ("base-view.png", BytesIO(b"base-image"), "image/png")),
    ]
    response = client.post(f"/observations/{observation_id}/images", files=files)
    assert response.status_code == 200
    payload = response.json()
    assert payload["uploaded_count"] == 2
    assert payload["images"][0]["stored_path"].startswith("/uploads/")
