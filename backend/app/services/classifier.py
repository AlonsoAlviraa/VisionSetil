"""Mushroom classifier protocol + improved mock ranker (multi-view + expanded catalog)."""

from __future__ import annotations

from typing import Any, Protocol

from app.core.safety import (
    FINAL_WARNING,
    ORIENTATION_ONLY_STATUS,
    PRIMARY_MESSAGE,
    UNSAFE_TO_CONSUME,
)
from app.db.models import Observation, ObservationImage
from app.db.schemas import (
    CandidateResult,
    ClassificationResponse,
    ModelStackResponse,
    OpenSetResponse,
    QualityAssessmentResponse,
    TraceResponse,
)
from app.services.multiview_mock_rank import (
    build_ml_notes,
    confidence_margin,
    multi_view_penalty,
    normalize_view,
    rank_candidates,
    should_open_set_reject,
    view_coverage_list,
    views_present,
)
from app.services.quality_validation import ImageQualityValidationService
from app.services.safety_explanation import SafetyExplanationService
from app.services.species_catalog import (
    list_expanded_species,
    list_mock_species_catalog,
    list_poisonous_species,
)


class MushroomClassifier(Protocol):
    def classify(
        self,
        observation: Observation,
        images: list[ObservationImage],
    ) -> ClassificationResponse: ...


def _candidate_pool() -> list[dict[str, Any]]:
    """Prefer expanded catalog (risk + food quality); fall back to mock catalog."""
    try:
        expanded = list_expanded_species(limit=500, offset=0)
        if expanded:
            pool: list[dict[str, Any]] = []
            for row in expanded:
                risk = row.get("risk_label") or row.get("risk_level") or "unknown"
                food = row.get("food_class")
                # Prefer food_class for deadly/toxic when risk is vague
                if food in ("mortal", "toxica") and risk in (
                    "unknown_or_risky",
                    "dangerous_or_unknown",
                    "unknown",
                    None,
                    "",
                ):
                    risk = "deadly" if food == "mortal" else "toxic"
                pool.append(
                    {
                        "taxon": row.get("taxon"),
                        "rank": row.get("rank") or "species",
                        "common_names": row.get("common_names") or [],
                        "risk_level": risk,
                        "risk_label": risk,
                        "food_class": food,
                        "keywords": list(row.get("common_names") or [])
                        + ([row.get("family")] if row.get("family") else []),
                        "diagnostic_features": row.get("diagnostic_features") or [],
                        "habitats": row.get("habitats") or [],
                        "lookalikes": row.get("lookalikes") or [],
                        "description": row.get("description") or "",
                        "warning": row.get("description"),
                        "edibility": row.get("documented_edibility")
                        or row.get("food_class")
                        or risk,
                    }
                )
            # Always ensure poisonous list taxa are represented
            have = {str(p["taxon"]).lower() for p in pool if p.get("taxon")}
            for p in list_poisonous_species():
                lat = p.get("latin_name") or ""
                if lat.lower() in have:
                    continue
                pool.append(
                    {
                        "taxon": lat,
                        "rank": "species",
                        "common_names": [p.get("common_name")] if p.get("common_name") else [],
                        "risk_level": "deadly"
                        if str(p.get("risk_level", "")).lower() == "critical"
                        else "poisonous",
                        "keywords": [p.get("common_name") or "", lat],
                        "diagnostic_features": [],
                        "lookalikes": [],
                        "description": p.get("notes") or "",
                        "warning": p.get("notes"),
                        "edibility": "deadly",
                    }
                )
            return [p for p in pool if p.get("taxon")]
    except Exception:
        pass
    return list_mock_species_catalog()


class MockMushroomClassifier:
    """Deterministic mock ranker with multi-view scoring + honest model_stack.

    Uses expanded species catalog when available (larger, food-quality aware).
    Never claims production-real backends.
    """

    def __init__(self) -> None:
        self.catalog = _candidate_pool()
        self.poisonous = list_poisonous_species()
        self.safety_service = SafetyExplanationService()
        self.quality_service = ImageQualityValidationService()
        # Last-run diagnostics for simple API mapping
        self.last_view_coverage: list[str] = []
        self.last_confidence_margin: float | None = None
        self.last_ml_notes: list[str] = []

    def classify(
        self,
        observation: Observation,
        images: list[ObservationImage],
        view_types: list[str] | None = None,
    ) -> ClassificationResponse:
        if view_types:
            for i, img in enumerate(images):
                if i < len(view_types) and view_types[i]:
                    mapped = normalize_view(view_types[i])
                    if mapped:
                        img.view_type = mapped

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
                    " ".join(image.original_name for image in images),
                    " ".join(filter(None, (image.view_type for image in images))),
                ],
            )
        ).lower()

        matches: list[tuple[float, dict]] = []
        for candidate in self.catalog:
            score = 0.14
            keywords = candidate.get("keywords") or candidate.get("diagnostic_features", [])
            for keyword in keywords:
                if keyword and str(keyword).lower() in haystack:
                    score += 0.1
            taxon_l = str(candidate.get("taxon") or "").lower()
            genus = taxon_l.split()[0] if taxon_l else ""
            if genus and genus in haystack:
                score += 0.14
            if "phalloides" in taxon_l and any(
                k in haystack for k in ("verde", "phalloides", "oronja", "volva")
            ):
                score += 0.14
            if "virosa" in taxon_l and any(k in haystack for k in ("blanca", "virosa", "ángel", "angel")):
                score += 0.1
            if "galerina" in taxon_l and any(k in haystack for k in ("madera", "tronco", "wood")):
                score += 0.12
            # Documented deadly food class gets a small safety prior
            if candidate.get("food_class") == "mortal":
                score += 0.03
            matches.append((min(score, 0.82), candidate))

        ranked = rank_candidates(matches, images=images, haystack=haystack)
        top_matches = ranked[:3] if ranked else [(0.15, self.catalog[0])]
        if not images:
            top_matches = [(0.14, self.catalog[0])]

        candidates = [
            CandidateResult(
                taxon=candidate["taxon"],
                rank=candidate.get("rank") or "species",
                confidence=self._adjust_confidence(score, images),
                evidence_score=round(max(0.1, 1.0 - multi_view_penalty(images)), 4),
                metadata_score=0.0,
                visual_score=round(score, 4),
                risk_level=candidate.get("risk_level")
                or candidate.get("risk_label")
                or "unknown",
                reasoning=self._reasoning(candidate, observation, images),
                danger_notes=self._danger_notes(candidate, images),
                lookalikes=self._lookalikes(candidate),
                explanation="Coincidencia visual orientativa; faltan rasgos diagnósticos.",
                edibility_label=candidate.get("food_class")
                or candidate.get("edibility")
                or candidate.get("risk_level")
                or candidate.get("risk_label"),
            )
            for score, candidate in top_matches
        ]

        top_conf = candidates[0].confidence if candidates else 0.0
        second_conf = candidates[1].confidence if len(candidates) > 1 else None
        margin = confidence_margin(top_conf, second_conf)
        reject, reject_reason = should_open_set_reject(
            top_conf,
            images,
            second_confidence=second_conf,
        )
        if reject and candidates:
            for c in candidates:
                c.confidence = min(c.confidence, 0.27)

        primary = candidates[0]
        explanation = self.safety_service.build(
            observation=observation,
            images=images,
            lookalikes=primary.lookalikes,
            classifier_warning=primary.danger_notes[0] if primary.danger_notes else None,
            quality=quality,
        )

        open_set = OpenSetResponse(
            is_unknown_or_uncertain=reject,
            reason=reject_reason or "ok",
            top1_confidence=top_conf,
            decision="rejected" if reject else "accepted",
            reasons=[reject_reason] if reject and reject_reason else [],
        )

        present = views_present(images)
        strategy = (
            "mock_multiview_ranker_v3_margin_open_set"
            if present
            else "mock_multimodal_ranker_with_risk_layer_v3"
        )

        self.last_view_coverage = view_coverage_list(images)
        self.last_confidence_margin = round(margin, 4)
        self.last_ml_notes = build_ml_notes(
            images=images,
            top_conf=top_conf if not reject else min(top_conf, 0.27),
            second_conf=second_conf,
            rejected=reject,
        )

        return ClassificationResponse(
            observation_id=observation.id,
            status=ORIENTATION_ONLY_STATUS,
            safety_level=UNSAFE_TO_CONSUME,
            risk_state=explanation.risk_state,
            message=PRIMARY_MESSAGE,
            model_stack=ModelStackResponse(
                detector="mock_yoloe_fallback",
                visual_embedder="mock_dinov3_fallback",
                image_text_embedder="mock_siglip2_fallback",
                metadata_encoder="mock_metadata_encoder",
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
            open_set=open_set,
            trace=TraceResponse(
                pipeline_version="mvp-safety-v4-mock-multiview-expanded",
                classifier_strategy=strategy,
                segmentation_strategy="mock_roi_passthrough",
                visual_backbone_plan=[
                    "DINOv3",
                    "SigLIP2",
                    "multi_view_attention_fusion",
                ],
                metadata_fusion_plan="mock_metadata_plus_view_bonus_v3",
                open_set_strategy="confidence_margin_and_view_coverage",
                human_review_path="expert_review_for_high_risk_or_low_evidence",
            ),
            final_warning=FINAL_WARNING,
        )

    def _adjust_confidence(self, raw_score: float, images: list[ObservationImage]) -> float:
        confidence = raw_score
        confidence -= multi_view_penalty(images) * 0.55
        present = views_present(images)
        if len(present) >= 3:
            confidence += 0.04
        if len(present & {"gills_or_pores", "cap_top", "base"}) >= 3:
            confidence += 0.03
        return max(0.1, min(confidence, 0.84))

    def _danger_notes(self, candidate: dict, images: list[ObservationImage]) -> list[str]:
        notes = [
            candidate.get("warning")
            or candidate.get("description", "La coincidencia requiere validación experta.")
        ]
        present = views_present(images)
        if "base" not in present:
            notes.append("Falta foto de la base / volva.")
        if "gills_or_pores" not in present:
            notes.append("Falta vista inferior (láminas o poros).")
        if str(candidate.get("taxon", "")).startswith("Amanita"):
            notes.append("El género Amanita incluye especies mortales.")
        if candidate.get("food_class") == "mortal":
            notes.append("Calidad documentada: mortal (fuentes curadas).")
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
            if keyword and str(keyword).lower() in corpus:
                reasoning.append(f"Coincidencia textual con '{keyword}'.")
        present = views_present(images)
        if "base" in present:
            reasoning.append("Hay vista de base del pie.")
        else:
            reasoning.append("Falta evidencia de la base del pie.")
        if "gills_or_pores" in present:
            reasoning.append("Hay vista inferior (láminas/poros).")
        else:
            reasoning.append("Falta vista inferior diagnóstica.")
        if len(images) >= 3:
            reasoning.append(f"Multi-vista: {len(images)} imágenes.")
        if candidate.get("food_class"):
            reasoning.append(f"Calidad documentada en catálogo: {candidate['food_class']}.")
        return reasoning[:5]

    def _lookalikes(self, candidate: dict) -> list[str]:
        if str(candidate.get("taxon", "")).startswith("Amanita"):
            poisonous = [
                item["latin_name"]
                for item in self.poisonous
                if item["latin_name"].startswith("Amanita")
            ]
            merged = poisonous + list(candidate.get("lookalikes") or [])
            return list(dict.fromkeys(merged))
        return list(candidate.get("lookalikes") or [])
