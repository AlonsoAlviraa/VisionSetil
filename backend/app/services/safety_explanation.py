from dataclasses import dataclass

from app.core.safety import EXPERT_RECOMMENDATION
from app.db.models import Observation, ObservationImage
from app.services.quality_validation import QualityAssessment


@dataclass
class SafetyExplanation:
    explanation: str
    missing_evidence: list[str]
    warnings: list[str]
    questions_for_user: list[str]
    lookalikes: list[str]
    risk_state: str


class SafetyExplanationService:
    def build(
        self,
        observation: Observation,
        images: list[ObservationImage],
        lookalikes: list[str],
        classifier_warning: str,
        quality: QualityAssessment,
    ) -> SafetyExplanation:
        missing = self._missing_evidence(observation, images)
        warnings = [classifier_warning, EXPERT_RECOMMENDATION, *quality.quality_warnings]
        if lookalikes:
            warnings.append("Puede confundirse con especies toxicas parecidas.")
        questions = self._questions(observation, images)
        explanation = (
            "La identificacion no es concluyente. El sistema trabaja como orientacion educativa, "
            "usa varias fotos y metadatos, y prioriza evitar falsos seguros frente a maximizar aciertos. "
            "La arquitectura queda preparada para validacion de calidad, segmentacion, fusion multi-imagen, "
            "fusion con metadatos, capa de riesgo y revision humana."
        )
        risk_state = self._risk_state(images, lookalikes, quality)
        return SafetyExplanation(
            explanation=explanation,
            missing_evidence=missing,
            warnings=warnings,
            questions_for_user=questions,
            lookalikes=lookalikes,
            risk_state=risk_state,
        )

    def _missing_evidence(self, observation: Observation, images: list[ObservationImage]) -> list[str]:
        present = {image.view_type for image in images if image.view_type}
        missing_map = {
            "cap_top": "Foto del sombrero desde arriba",
            "gills_or_pores": "Foto clara de laminas o poros",
            "stem": "Foto del pie completo",
            "base": "Foto de la base del pie",
            "cross_section": "Foto de corte o seccion",
            "environment": "Foto del entorno o sustrato",
        }
        missing = [label for key, label in missing_map.items() if key not in present]
        if not observation.nearby_trees:
            missing.append("Informacion de arboles cercanos")
        if not observation.substrate:
            missing.append("Informacion de sustrato")
        return missing

    def _questions(self, observation: Observation, images: list[ObservationImage]) -> list[str]:
        questions = []
        if not any(image.view_type == "base" for image in images):
            questions.append("Puedes anadir una foto de la base para revisar volva o bulbo?")
        if not observation.nearby_trees:
            questions.append("Que arboles habia cerca del ejemplar?")
        if not observation.color_change_on_cut:
            questions.append("Has observado cambio de color al corte?")
        return questions

    def _risk_state(
        self,
        images: list[ObservationImage],
        lookalikes: list[str],
        quality: QualityAssessment,
    ) -> str:
        if len(images) < 2 or not quality.has_base_view or not quality.has_lower_view:
            return "needs_more_evidence"
        if quality.possible_multiple_species or quality.heavy_compression_or_blur:
            return "unknown_or_out_of_distribution"
        if lookalikes:
            return "high_risk_lookalikes"
        return "needs_expert_review"
