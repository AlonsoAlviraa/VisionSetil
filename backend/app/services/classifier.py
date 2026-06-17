from typing import Protocol

from app.core.safety import FINAL_WARNING, ORIENTATION_ONLY_STATUS, PRIMARY_MESSAGE, UNSAFE_TO_CONSUME
from app.db.models import Observation, ObservationImage
from app.db.schemas import CandidateResult, ClassificationResponse, ModelStackResponse, QualityAssessmentResponse, TraceResponse
from app.services.quality_validation import ImageQualityValidationService
from app.services.safety_explanation import SafetyExplanationService
from app.services.species_catalog import list_mock_species_catalog, list_poisonous_species


class MushroomClassifier(Protocol):
    def classify(
        self,
        observation: Observation,
        images: list[ObservationImage],
    ) -> ClassificationResponse:
        ...


class MockMushroomClassifier:
    def __init__(self) -> None:
        self.catalog = list_mock_species_catalog()
        self.poisonous = list_poisonous_species()
        self.safety_service = SafetyExplanationService()
        self.quality_service = ImageQualityValidationService()

    def classify(
        self,
        observation: Observation,
        images: list[ObservationImage],
    ) -> ClassificationResponse:
        quality = self.quality_service.evaluate(images)
        haystack = " ".join(
            filter(
                None,
                [
                    observation.title,
                    observation.habitat,
                    observation.substrate,
                    observation.notes,
                    observation.smell,
                    observation.color_change_on_cut,
                    " ".join(observation.nearby_trees or []),
                    " ".join((image.original_name for image in images)),
                ],
            )
        ).lower()

        matches: list[tuple[float, dict]] = []
        for candidate in self.catalog:
            score = 0.18
            keywords = candidate.get("keywords") or candidate.get("diagnostic_features", [])
            for keyword in keywords:
                if keyword in haystack:
                    score += 0.12
            if candidate["taxon"].lower().startswith("amanita") and "amanita" in haystack:
                score += 0.18
            matches.append((min(score, 0.82), candidate))

        matches.sort(key=lambda item: item[0], reverse=True)
        top_matches = matches[:3]
        if not images:
            top_matches = [(0.18, self.catalog[0])]

        candidates = [
            CandidateResult(
                taxon=candidate["taxon"],
                rank=candidate["rank"],
                confidence=self._adjust_confidence(score, images),
                evidence_score=round(max(0.12, 1.0 - self._missing_view_penalty(images)), 4),
                metadata_score=0.0,
                visual_score=round(score, 4),
                risk_level=candidate.get("risk_level", "unknown"),
                reasoning=self._reasoning(candidate, observation, images),
                danger_notes=self._danger_notes(candidate, images),
                lookalikes=self._lookalikes(candidate),
                explanation="Coincidencia visual orientativa, pero faltan rasgos diagnosticos.",
            )
            for score, candidate in top_matches
        ]

        primary = candidates[0]
        explanation = self.safety_service.build(
            observation=observation,
            images=images,
            lookalikes=primary.lookalikes,
            classifier_warning=primary.danger_notes[0],
            quality=quality,
        )

        return ClassificationResponse(
            observation_id=observation.id,
            status=ORIENTATION_ONLY_STATUS,
            safety_level=UNSAFE_TO_CONSUME,
            risk_state=explanation.risk_state,
            message=PRIMARY_MESSAGE,
            model_stack=ModelStackResponse(
                detector="YOLOE-26 or fallback",
                visual_embedder="DINOv3 or fallback",
                image_text_embedder="SigLIP 2 or fallback",
                metadata_encoder="FungiTastic/FungiCLEF-inspired metadata encoder",
            ),
            candidates=candidates,
            top_candidates=candidates,
            missing_evidence=explanation.missing_evidence,
            explanation=explanation.explanation,
            questions_for_user=explanation.questions_for_user,
            warnings=explanation.warnings,
            dangerous_lookalikes=primary.lookalikes,
            quality_assessment=QualityAssessmentResponse(
                sharpness_ok=quality.sharpness_ok,
                lighting_ok=quality.lighting_ok,
                mushroom_large_enough=quality.mushroom_large_enough,
                has_lower_view=quality.has_lower_view,
                has_base_view=quality.has_base_view,
                has_environment_view=quality.has_environment_view,
                possible_multiple_species=quality.possible_multiple_species,
                obstruction_detected=quality.obstruction_detected,
                heavy_compression_or_blur=quality.heavy_compression_or_blur,
                quality_warnings=quality.quality_warnings,
            ),
            trace=TraceResponse(
                pipeline_version="mvp-safety-v2",
                classifier_strategy="mock_multimodal_ranker_with_risk_layer",
                segmentation_strategy="planned_yoloe_or_yolo26_seg_crop",
                visual_backbone_plan=["DINOv3", "SigLIP2", "BioCLIP", "FungiTastic_or_FungiCLEF_checkpoint"],
                metadata_fusion_plan="planned_multi_image_plus_metadata_fusion",
                open_set_strategy="planned_margin_threshold_and_unknown_rejection",
                human_review_path="planned_expert_review_for_high_risk_or_low_evidence_cases",
            ),
            final_warning=FINAL_WARNING,
        )

    def _adjust_confidence(self, raw_score: float, images: list[ObservationImage]) -> float:
        confidence = raw_score
        if len(images) < 3:
            confidence -= 0.14
        if not any(image.view_type == "base" for image in images):
            confidence -= 0.08
        if not any(image.view_type == "gills_or_pores" for image in images):
            confidence -= 0.08
        if not any(
            token in image.original_name.lower()
            for image in images
            for token in ("context", "environment", "entorno", "habitat")
        ):
            confidence -= 0.06
        return max(0.12, min(confidence, 0.78))

    def _danger_notes(self, candidate: dict, images: list[ObservationImage]) -> list[str]:
        notes = [candidate.get("warning") or candidate.get("description", "La coincidencia requiere validacion experta.")]
        if not any(image.view_type == "base" for image in images):
            notes.append("Se necesita foto de la base y volva si existe.")
        if not any(image.view_type == "gills_or_pores" for image in images):
            notes.append("Se necesita vista inferior para revisar laminas o poros.")
        if any(item["latin_name"].startswith("Amanita") for item in self.poisonous) and candidate["taxon"].startswith("Amanita"):
            notes.append("El genero contiene especies mortales.")
        return notes

    def _reasoning(
        self,
        candidate: dict,
        observation: Observation,
        images: list[ObservationImage],
    ) -> list[str]:
        reasoning: list[str] = []
        corpus = " ".join(
            filter(
                None,
                [
                    observation.title,
                    observation.notes,
                    observation.habitat,
                    observation.substrate,
                    " ".join(observation.nearby_trees or []),
                ],
            )
        ).lower()
        for keyword in candidate.get("keywords") or candidate.get("diagnostic_features", []):
            if keyword in corpus:
                reasoning.append(f"Coincidencia textual con '{keyword}'.")
        if any(image.view_type == "base" for image in images):
            reasoning.append("Hay al menos una vista de la base del pie.")
        else:
            reasoning.append("Falta evidencia completa de la base del pie.")
        if any(image.view_type == "gills_or_pores" for image in images):
            reasoning.append("Hay vista inferior para revisar laminas o poros.")
        else:
            reasoning.append("Falta vista inferior diagnostica.")
        return reasoning[:4]

    def _missing_view_penalty(self, images: list[ObservationImage]) -> float:
        penalty = 0.0
        if len(images) < 3:
            penalty += 0.25
        if not any(image.view_type == "base" for image in images):
            penalty += 0.2
        if not any(image.view_type == "gills_or_pores" for image in images):
            penalty += 0.2
        if not any(image.view_type == "environment" for image in images):
            penalty += 0.15
        return penalty

    def _lookalikes(self, candidate: dict) -> list[str]:
        if candidate["taxon"].startswith("Amanita"):
            poisonous = [item["latin_name"] for item in self.poisonous if item["latin_name"].startswith("Amanita")]
            merged = poisonous + candidate.get("lookalikes", [])
            return list(dict.fromkeys(merged))
        return candidate.get("lookalikes", [])
