from sqlalchemy.orm import Session

from app.models import DangerousSpecies
from app.services.providers import ClassificationInput, ClassificationResult, ClassifierProvider


class MockConservativeClassifier(ClassifierProvider):
    def __init__(self, session: Session) -> None:
        self.session = session

    def classify(self, payload: ClassificationInput) -> ClassificationResult:
        corpus = " ".join(
            [
                payload.title,
                payload.notes,
                payload.habitat,
                payload.cap_shape,
                payload.gill_color,
                payload.stem_features,
                payload.smell,
                " ".join(payload.file_names),
            ]
        ).lower()
        species = self.session.query(DangerousSpecies).all()
        matches: list[tuple[int, DangerousSpecies]] = []
        for item in species:
            score = sum(1 for marker in item.markers if marker.lower() in corpus)
            if item.latin_name.lower() in corpus or item.common_name.lower() in corpus:
                score += 2
            if score:
                matches.append((score, item))
        matches.sort(key=lambda row: row[0], reverse=True)

        if matches:
            top_score, top = matches[0]
            confidence = min(0.25 + top_score * 0.16, 0.78)
            risk_level = "high" if top.risk_level != "critical" else "critical"
            headline = f"Posible coincidencia visual con {top.common_name}"
            guidance = (
                "La observacion muestra rasgos compatibles con una especie peligrosa o con un doble toxico. "
                "No la consumas ni la manipules sin criterio experto."
            )
        else:
            confidence = 0.22
            risk_level = "unknown"
            headline = "No hay base suficiente para una identificacion fiable"
            guidance = (
                "El clasificador mock es deliberadamente conservador. La ausencia de coincidencias no reduce el riesgo. "
                "Hace falta validacion humana con rasgos macroscopicos y, si procede, microscopicos."
            )

        educational_notes = [
            "Las fotos deben incluir sombrero, laminas o poros, pie, base completa y contexto del habitat.",
            "Nunca interpretes una baja confianza como seguridad alimentaria.",
            "La arquitectura esta preparada para conectar proveedores externos como FungiTastic, DF20 o FungiCLEF.",
        ]

        dangerous_matches = [
            {
                "common_name": item.common_name,
                "latin_name": item.latin_name,
                "risk_level": item.risk_level,
                "warning": item.warning,
            }
            for _, item in matches[:3]
        ]

        return ClassificationResult(
            provider_name="mock-conservative",
            confidence=confidence,
            risk_level=risk_level,
            headline=headline,
            guidance=guidance,
            dangerous_matches=dangerous_matches,
            educational_notes=educational_notes,
        )


def build_classifier(session: Session) -> ClassifierProvider:
    return MockConservativeClassifier(session)
