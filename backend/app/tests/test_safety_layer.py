from app.ml.interfaces import MushroomObservationMetadata
from app.services.safety_layer import SafetyLayer


def test_safety_layer_reduces_confidence_when_missing_critical_evidence():
    layer = SafetyLayer()
    response = layer.apply(
        candidates=[
            {
                "taxon": "Amanita phalloides",
                "rank": "species",
                "confidence": 0.44,
                "evidence_score": 0.3,
                "metadata_score": 0.2,
                "visual_score": 0.4,
                "risk_level": "deadly",
                "edibility_label": "dangerous_or_unknown",
                "lookalikes": ["Amanita virosa"],
                "explanation": "Base incompleta",
            }
        ],
        missing_evidence=["Foto clara de la base del pie", "Foto de laminas o poros"],
        metadata=MushroomObservationMetadata(country="Espana"),
        quality_warnings=["baja calidad de imagen"],
    )
    candidate = response["candidates"][0]
    assert candidate["confidence"] < 0.44
    assert response["status"] == "orientation_only"
    assert response["safety_level"] == "unsafe_to_consume"
    assert "safe_to_eat" not in str(response)


def test_safety_layer_elevates_risk_for_dangerous_genera():
    layer = SafetyLayer()
    response = layer.apply(
        candidates=[
            {
                "taxon": "Galerina marginata",
                "rank": "species",
                "confidence": 0.4,
                "evidence_score": 0.3,
                "metadata_score": 0.1,
                "visual_score": 0.4,
                "risk_level": "deadly",
                "edibility_label": "dangerous_or_unknown",
                "lookalikes": ["Kuehneromyces mutabilis"],
                "explanation": "Coincidencia orientativa",
            }
        ],
        missing_evidence=[],
        metadata=MushroomObservationMetadata(habitat="woodland", substrate="dead wood"),
        quality_warnings=[],
    )
    assert any("mortales" in warning for warning in response["warnings"])
