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

    def _missing_evidence(
        self, observation: Observation, images: list[ObservationImage]
    ) -> list[str]:
        present = {image.view_type for image in images if image.view_type}
        # D5b: each row satisfied by canonical OR legacy labels
        evidence_groups = [
            ({"cap_top", "front", "stem"}, "Foto del sombrero/frente"),
            ({"gills_or_pores", "gills"}, "Foto clara de laminas o poros"),
            ({"base", "detail", "cross_section"}, "Foto de la base del pie o detalle"),
            ({"environment", "habitat"}, "Foto del entorno o sustrato"),
        ]
        missing = [label for keys, label in evidence_groups if present.isdisjoint(keys)]
        if not observation.nearby_trees:
            missing.append("Informacion de arboles cercanos")
        if not observation.substrate:
            missing.append("Informacion de sustrato")
        return missing

    def _questions(self, observation: Observation, images: list[ObservationImage]) -> list[str]:
        questions = []
        present = {image.view_type for image in images if image.view_type}
        if present.isdisjoint({"base", "detail", "cross_section"}):
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
