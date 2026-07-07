from io import BytesIO

# Magic bytes: JPEG starts with FF D8 FF; PNG starts with 89 50 4E 47 0D 0A 1A 0A.
_JPEG_MAGIC = b"\xff\xd8\xff\xe0" + b"\x00" * 16
_PNG_MAGIC = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16


def test_create_observation_works(client):
    payload = {
        "title": "Seta encontrada en bosque",
        "country": "Espana",
        "region": "Navarra",
        "habitat": "bosque de hayas",
        "substrate": "suelo",
        "nearby_trees": ["haya", "roble"],
        "observed_at": "2026-06-17",
        "notes": "Sombrero marron, laminas claras",
        "smell": "suave",
        "color_change_on_cut": "no observado",
    }
    response = client.post("/observations", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == payload["title"]
    assert data["country"] == "Espana"


def test_upload_images_validates_and_saves(client):
    create = client.post("/observations", json={"title": "Con imagenes"})
    observation_id = create.json()["id"]
    files = [
        ("images", ("cap-top.jpg", BytesIO(_JPEG_MAGIC), "image/jpeg")),
        ("images", ("base-view.png", BytesIO(_PNG_MAGIC), "image/png")),
    ]
    response = client.post(f"/observations/{observation_id}/images", files=files)
    assert response.status_code == 200
    payload = response.json()
    assert payload["uploaded_count"] == 2
