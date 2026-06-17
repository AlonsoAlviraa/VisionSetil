from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import get_db
from app.db.models import Observation
from app.db.schemas import CandidateResult, ClassificationResponse, ModelStackResponse, QualityAssessmentResponse, TraceResponse
from app.ml.interfaces import MushroomObservationMetadata
from app.ml.model_registry import build_model_registry
from app.services.candidate_ranker import CandidateRanker
from app.services.classifier import MockMushroomClassifier
from app.services.image_quality import ImageQualityValidationService
from app.services.metadata_encoder import MetadataEncoder
from app.services.multimodal_fusion import MultimodalFusionService
from app.services.safety_explanation import SafetyExplanationService
from app.services.safety_layer import SafetyLayer
from app.services.species_catalog import list_mock_species_catalog

router = APIRouter()


@router.post("/observations/{observation_id}/classify")
def classify_observation(observation_id: int, db: Session = Depends(get_db)) -> ClassificationResponse:
    observation = db.get(Observation, observation_id)
    if observation is None:
        raise HTTPException(status_code=404, detail="Observation not found")
    classifier = MockMushroomClassifier()
    result = classifier.classify(observation, list(observation.images))
    observation.last_classification = result.model_dump()
    db.add(observation)
    db.commit()
    return result


@router.post("/observations/{observation_id}/classify-advanced", response_model=ClassificationResponse)
def classify_observation_advanced(observation_id: int, db: Session = Depends(get_db)) -> ClassificationResponse:
    observation = db.get(Observation, observation_id)
    if observation is None:
        raise HTTPException(status_code=404, detail="Observation not found")

    images = list(observation.images)
    image_paths = [str(settings.base_dir / image.stored_path.lstrip("/")) for image in images]
    metadata = MushroomObservationMetadata(
        country=observation.country,
        region=observation.region,
        latitude=observation.latitude,
        longitude=observation.longitude,
        observed_at=observation.observed_at,
        habitat=observation.habitat,
        substrate=observation.substrate,
        nearby_trees=observation.nearby_trees or [],
        altitude_m=observation.altitude_m,
        smell=observation.smell,
        color_change_on_cut=observation.color_change_on_cut,
        user_notes=observation.notes,
    )

    quality_service = ImageQualityValidationService()
    quality = quality_service.evaluate(images)
    registry = build_model_registry()
    detections = registry.detector.detect_and_crop(image_paths)
    detected_views = [item.estimated_view_type for item in detections]
    crop_paths = [item.crop_path for item in detections]
    dino_embeddings = registry.visual_embedder.embed_images(crop_paths)
    siglip_image_embeddings = registry.image_text_embedder.embed_images(crop_paths)
    species_catalog = list_mock_species_catalog()
    species_text_embeddings = registry.image_text_embedder.embed_texts([item["description"] for item in species_catalog])
    metadata_vector = MetadataEncoder().encode(metadata)
    representation = MultimodalFusionService().fuse(
        dino_embeddings=dino_embeddings,
        siglip_image_embeddings=siglip_image_embeddings,
        metadata_vector=metadata_vector,
        detected_views=detected_views,
    )
    ranked = CandidateRanker().rank(
        observation_representation=representation,
        species_catalog=species_catalog,
        species_text_embeddings=species_text_embeddings,
        siglip_image_embeddings=siglip_image_embeddings,
        top_k=settings.top_k_candidates,
    )

    mock = MockMushroomClassifier()
    baseline = mock.classify(observation, images)
    safe = SafetyLayer().apply(
        candidates=ranked,
        missing_evidence=list(baseline.missing_evidence),
        metadata=metadata,
        quality_warnings=quality.quality_warnings,
    )

    candidates = [
        CandidateResult(
            taxon=item["taxon"],
            rank=item["rank"],
            confidence=item["confidence"],
            evidence_score=item["evidence_score"],
            metadata_score=item["metadata_score"],
            visual_score=item["visual_score"],
            risk_level=item["risk_level"],
            edibility_label=item["edibility_label"],
            reasoning=baseline.candidates[0].reasoning if baseline.candidates else [],
            danger_notes=baseline.candidates[0].danger_notes if baseline.candidates else [],
            lookalikes=item["lookalikes"],
            explanation=item["explanation"],
        )
        for item in safe["candidates"]
    ]
    primary_risk_state = baseline.risk_state
    result = ClassificationResponse(
        observation_id=observation.id,
        status=safe["status"],
        safety_level=safe["safety_level"],
        risk_state=primary_risk_state,
        message=safe["message"],
        model_stack=ModelStackResponse(
            detector="YOLOE-26" if getattr(registry.detector, "is_real", False) else "YOLOE-26 or fallback",
            visual_embedder="DINOv3" if getattr(registry.visual_embedder, "is_real", False) else "DINOv3 or fallback",
            image_text_embedder="SigLIP 2" if getattr(registry.image_text_embedder, "is_real", False) else "SigLIP 2 or fallback",
            metadata_encoder="FungiTastic/FungiCLEF-inspired metadata encoder",
        ),
        candidates=candidates,
        top_candidates=candidates,
        missing_evidence=safe["missing_evidence"],
        explanation=baseline.explanation,
        questions_for_user=baseline.questions_for_user,
        warnings=safe["warnings"],
        dangerous_lookalikes=candidates[0].lookalikes if candidates else [],
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
            pipeline_version="advanced-mvp-v1",
            classifier_strategy="yoloe_dinov3_siglip2_metadata_ranker_with_safety_fallbacks",
            segmentation_strategy="yoloe_or_full_image_mock_crop",
            visual_backbone_plan=["DINOv3", "SigLIP2", "FungiTastic/FungiCLEF metadata"],
            metadata_fusion_plan="weighted_multi_image_plus_metadata_fusion",
            open_set_strategy="fallback_margin_and_unknown_rejection_planned",
            human_review_path="expert_review_recommended_for_risky_or_low_evidence_cases",
        ),
        final_warning=safe["final_warning"],
    )
    observation.last_classification = result.model_dump()
    db.add(observation)
    db.commit()
    return result
