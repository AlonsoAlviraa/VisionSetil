from io import BytesIO

# Magic bytes for JPEG (FFD8FF) and PNG (89504E470D0A1A0A).
_JPEG_MAGIC = b"\xff\xd8\xff\xe0" + b"\x00" * 16
_PNG_MAGIC = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16


def test_image_upload_endpoint_works(client):
    create = client.post("/observations", json={"title": "Carga guiada"})
    observation_id = create.json()["id"]
    files = [
        ("images", ("cap-top.jpg", BytesIO(_JPEG_MAGIC), "image/jpeg")),
        ("images", ("base-view.png", BytesIO(_PNG_MAGIC), "image/png")),
    ]
    response = client.post(f"/observations/{observation_id}/images", files=files)
    assert response.status_code == 200
    payload = response.json()
    assert payload["uploaded_count"] == 2
    assert payload["images"][0]["stored_path"].startswith("/uploads/")
