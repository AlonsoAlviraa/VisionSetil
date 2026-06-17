from io import BytesIO


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
        ("images", ("cap-top.jpg", BytesIO(b"cap"), "image/jpeg")),
        ("images", ("base-view.png", BytesIO(b"base"), "image/png")),
    ]
    response = client.post(f"/observations/{observation_id}/images", files=files)
    assert response.status_code == 200
    payload = response.json()
    assert payload["uploaded_count"] == 2
