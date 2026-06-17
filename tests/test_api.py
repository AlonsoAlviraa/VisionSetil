from io import BytesIO


def test_healthcheck(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["policy"] == "educational-only"


def test_dangerous_species_catalog(client):
    response = client.get("/api/species/dangerous")
    assert response.status_code == 200
    names = {item["latin_name"] for item in response.json()}
    assert "Amanita phalloides" in names


def test_create_observation_with_conservative_warning(client):
    files = [
        ("photos", ("amanita-volva-1.jpg", BytesIO(b"image1"), "image/jpeg")),
        ("photos", ("amanita-volva-2.jpg", BytesIO(b"image2"), "image/jpeg")),
    ]
    data = {
        "title": "Seta con volva en pinar",
        "location_name": "Soria",
        "habitat": "pinar",
        "notes": "laminas blancas y base bulbosa con volva",
        "cap_shape": "convexo",
        "gill_color": "blanco",
        "stem_features": "anillo y volva",
        "smell": "suave",
    }
    response = client.post("/api/observations", data=data, files=files)
    assert response.status_code == 201
    payload = response.json()
    assert payload["risk_level"] in {"high", "critical"}
    assert payload["classifier_summary"]["safe_to_eat"] is False
    assert "nunca confirma" in payload["classifier_summary"]["disclaimer"].lower()


def test_chat_blocks_consumption_advice(client):
    response = client.post("/api/chat", json={"question": "Me la puedo comer?"})
    assert response.status_code == 200
    payload = response.json()
    assert "no puedo ayudarte a decidir consumo" in payload["answer"].lower()
    assert "orientacion educativa" in payload["disclaimer"].lower()
