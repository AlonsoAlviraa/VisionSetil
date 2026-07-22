"""Observation-scoped classification routes (admin / internal / eval).

Product policy (Phase B D-B17 / B-47)
-------------------------------------
**Identify product** (frontend ``/identificar`` and public clients) uses **only**
``POST /classify`` (and optional async simple job result). See
``routes_classify.py`` for the honesty contract
(``SimpleClassificationResult``: ``mode``, ``quality_gate``, ``locale``, …).

These observation routes return ``ClassificationResponse`` (candidates, open_set,
human_review, trace) — a **different schema family**. They are **admin / internal
/ eval**, not the Identify product path.

Do **not** sprinkle fake honesty fields onto advanced responses to “match”
Identify; optional post-MVP wrapper mapping advanced → simple is out of Phase B
critical path.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import get_db
from app.db.models import HumanReviewRequest, Observation
from app.db.schemas import (
    CandidateResult,
    ClassificationResponse,
    HumanReviewResponse,
    ModelStackResponse,
    OpenSetResponse,
    QualityAssessmentResponse,
    TraceResponse,
)
from app.ml.interfaces import MushroomObservationMetadata
from app.ml.model_registry import build_model_registry
from app.services.candidate_ranker_v2 import CandidateRankerV2
from app.services.classifier import MockMushroomClassifier
from app.services.image_quality import ImageQualityValidationService
from app.services.metadata_encoder import MetadataEncoder
from app.services.multimodal_fusion import MultimodalFusionService
from app.services.open_set_rejection import OpenSetRejectionService
from app.services.poisonous_lookalikes import HIGH_RISK_GENERA
from app.services.safety_layer import SafetyLayer
from app.services.species_catalog import list_mock_species_catalog

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post(
    "/observations/{observation_id}/classify",
    summary="Classify observation (legacy mock; not Identify product)",
    response_description=(
        "ClassificationResponse from MockMushroomClassifier. Not the Identify "
        "product path — use POST /classify for SimpleClassificationResult."
    ),
)
def classify_observation(
    observation_id: int, db: Session = Depends(get_db)
) -> ClassificationResponse:
    """Legacy mock classifier on a stored observation.

    Admin/dev/legacy only. **Not** the Identify product endpoint (D-B17).
    Product Identify must call ``POST /classify``.
    """
    observation = db.get(Observation, observation_id)
    if observation is None:
        raise HTTPException(status_code=404, detail="Observation not found")
    classifier = MockMushroomClassifier()
    result = classifier.classify(observation, list(observation.images))
    observation.last_classification = result.model_dump()
    db.add(observation)
    db.commit()
    return result


@router.post(
    "/observations/{observation_id}/classify-advanced",
    response_model=ClassificationResponse,
    summary="Advanced classify (admin/internal; not Identify product)",
    response_description=(
        "Full ClassificationResponse (candidates, open_set, human_review, trace). "
        "Admin/internal/eval only. Identify product uses POST /classify only "
        "(SimpleClassificationResult honesty contract)."
    ),
)
def classify_observation_advanced(
    observation_id: int, db: Session = Depends(get_db)
) -> ClassificationResponse:
    """Run the full multi-view pipeline on a stored observation.

    **Product policy (D-B17 / B-47):** this endpoint is **admin / internal / eval**.
    It returns ``ClassificationResponse`` — not the Identify honesty contract.

    * **Identify product path:** ``POST /classify`` (and optional async simple).
    * **Do not** call this from the Identify FE or product clients.
    * **Do not** add fake ``mode`` / ``quality_gate`` fields here in Phase B;
      optional advanced→simple wrapper is post-MVP, out of critical path.
    * Eval harnesses may use this for full-trace inspection.
    """
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
    for img, det in zip(images, detections, strict=False):
        img.crop_path = det.crop_path
        img.mask_path = det.mask_path
        db.add(img)
    db.commit()

    detected_views = [
        image.view_type or detection.estimated_view_type
        for image, detection in zip(images, detections, strict=False)
    ]
    crop_paths = [item.crop_path for item in detections]
    dino_embeddings = registry.visual_embedder.embed_images(crop_paths)
    siglip_image_embeddings = registry.image_text_embedder.embed_images(crop_paths)

    # Try to load real species index with precomputed prototypes
    species_catalog = None
    index_metadata = {}
    catalog_version = "mock_catalog_v1"
    try:
        from app.services.species_catalog import load_real_species_index

        species_catalog, index_metadata = load_real_species_index()
        catalog_version = "real_species_catalog_v2"
    except FileNotFoundError:
        # Fallback to mock catalog
        species_catalog = list_mock_species_catalog()
        catalog_version = "mock_catalog_v1_fallback"

    if species_catalog and "dino_reference_embedding" in species_catalog[0]:
        species_text_embeddings = []
    else:
        species_text_embeddings = registry.image_text_embedder.embed_texts(
            [item["description"] for item in species_catalog]
        )
        for idx, text_emb in enumerate(species_text_embeddings):
            species_catalog[idx]["dino_reference_embedding"] = [0.0] * settings.dino_embedding_dim
            species_catalog[idx]["siglip_text_embedding"] = text_emb.vector
            species_catalog[idx]["siglip_reference_embedding"] = [
                0.0
            ] * settings.siglip_embedding_dim

    metadata_vector = MetadataEncoder().encode(metadata)
    representation = MultimodalFusionService().fuse(
        dino_embeddings=dino_embeddings,
        siglip_image_embeddings=siglip_image_embeddings,
        metadata_vector=metadata_vector,
        detected_views=detected_views,
    )
    ranker = CandidateRankerV2()
    ranked = ranker.rank(
        observation_representation=representation,
        species_catalog=species_catalog,
        species_text_embeddings=species_text_embeddings,
        siglip_image_embeddings=siglip_image_embeddings,
        top_k=settings.top_k_candidates,
    )

    mock = MockMushroomClassifier()
    baseline = mock.classify(observation, images)

    # Store raw candidates before safety layer or open-set rejection degrades them
    raw_candidates_results = [
        CandidateResult(
            taxon=item["taxon"],
            rank=item["rank"],
            confidence=item["confidence"],
            evidence_score=item["evidence_score"],
            metadata_score=item["metadata_score"],
            visual_score=item["visual_score"],
            species_visual_score=item.get("species_visual_score", 0.0),
            genus_visual_score=item.get("genus_visual_score", 0.0),
            family_visual_score=item.get("family_visual_score", 0.0),
            taxonomic_score=item.get("taxonomic_score", 0.0),
            prototype_quality=item.get("prototype_quality", 0.0),
            ranker_margin_to_next=item.get("ranker_margin_to_next", 0.0),
            dino_visual_score=item.get("dino_visual_score", 0.0),
            siglip_image_text_score=item.get("siglip_image_text_score", 0.0),
            siglip_visual_score=item.get("siglip_visual_score", 0.0),
            risk_score=item.get("risk_score", 0.0),
            fusion_score=item.get("fusion_score", 0.0),
            risk_level=item["risk_level"],
            edibility_label=item["edibility_label"],
            reasoning=baseline.candidates[0].reasoning if baseline.candidates else [],
            danger_notes=baseline.candidates[0].danger_notes if baseline.candidates else [],
            lookalikes=item["lookalikes"],
            explanation=item["explanation"],
            ranker_version=item.get("ranker_version"),
            similarity_metric=item.get("similarity_metric"),
            ml_improvement_version=item.get("ml_improvement_version"),
        )
        for item in ranked
    ]

    safe = SafetyLayer().apply(
        candidates=ranked,
        missing_evidence=list(baseline.missing_evidence),
        metadata=metadata,
        quality_warnings=quality.quality_warnings,
    )

    from sqlalchemy import select

    # 1. Open Set Rejection Evaluation
    open_set_service = OpenSetRejectionService()
    open_set_decision = open_set_service.evaluate(ranked, representation, safe["missing_evidence"])
    top1_score = ranked[0].get("confidence", 0.0) if ranked else 0.0
    top2_score = ranked[1].get("confidence", 0.0) if len(ranked) > 1 else 0.0
    top1_margin = round(top1_score - top2_score, 4)
    index_path = index_metadata.get("index_path", "")

    logger.info(
        "classification_phase6",
        extra={
            "ranker_version": ranker.version,
            "ml_improvement_version": ranker.improvement_version,
            "catalog_version": catalog_version,
            "index_path": index_path,
            "thresholds_path": open_set_decision.thresholds_path,
            "top1_score": top1_score,
            "top1_margin": top1_margin,
            "open_set_reasons": open_set_decision.reasons,
        },
    )

    # Apply degradation if rejection triggers
    if open_set_decision.is_unknown_or_uncertain:
        safe["candidates"] = open_set_service.degrade_candidates(
            safe["candidates"], open_set_decision
        )

    # Convert to schema structures
    candidates = [
        CandidateResult(
            taxon=item["taxon"],
            rank=item["rank"],
            confidence=item["confidence"],
            evidence_score=item["evidence_score"],
            metadata_score=item["metadata_score"],
            visual_score=item["visual_score"],
            species_visual_score=item.get("species_visual_score", 0.0),
            genus_visual_score=item.get("genus_visual_score", 0.0),
            family_visual_score=item.get("family_visual_score", 0.0),
            taxonomic_score=item.get("taxonomic_score", 0.0),
            prototype_quality=item.get("prototype_quality", 0.0),
            ranker_margin_to_next=item.get("ranker_margin_to_next", 0.0),
            dino_visual_score=item.get("dino_visual_score", 0.0),
            siglip_image_text_score=item.get("siglip_image_text_score", 0.0),
            siglip_visual_score=item.get("siglip_visual_score", 0.0),
            risk_score=item.get("risk_score", 0.0),
            fusion_score=item.get("fusion_score", 0.0),
            risk_level=item["risk_level"],
            edibility_label=item["edibility_label"],
            reasoning=baseline.candidates[0].reasoning if baseline.candidates else [],
            danger_notes=baseline.candidates[0].danger_notes if baseline.candidates else [],
            lookalikes=item["lookalikes"],
            explanation=item["explanation"],
            ranker_version=item.get("ranker_version"),
            similarity_metric=item.get("similarity_metric"),
            ml_improvement_version=item.get("ml_improvement_version"),
        )
        for item in safe["candidates"]
    ]

    # 2. Human Review Evaluation & DB persistence
    existing_req = db.scalars(
        select(HumanReviewRequest).where(HumanReviewRequest.observation_id == observation.id)
    ).first()

    recommend_review = False
    review_reason = "none"
    review_priority = "low"

    if open_set_decision.is_unknown_or_uncertain:
        recommend_review = True
        review_reason = open_set_decision.reason

        first_taxon = safe["candidates"][0]["taxon"] if safe["candidates"] else ""
        first_genus = first_taxon.split()[0].lower() if first_taxon else ""
        has_deadly_lookalike = False
        lookalikes = safe["candidates"][0].get("lookalikes", []) if safe["candidates"] else []
        for lk in lookalikes:
            if lk.split()[0].lower() in HIGH_RISK_GENERA:
                has_deadly_lookalike = True
                break

        if (
            open_set_decision.reason in ("high_risk_genus", "deadly_lookalike_or_high_risk_genus")
            or first_genus in HIGH_RISK_GENERA
            or has_deadly_lookalike
        ):
            review_priority = "critical"
        elif open_set_decision.reason == "missing_critical_evidence":
            review_priority = "high"
        else:
            review_priority = "medium"
    else:
        # Check high-risk genus or deadly lookalikes
        first_taxon = safe["candidates"][0]["taxon"] if safe["candidates"] else ""
        first_genus = first_taxon.split()[0].lower() if first_taxon else ""
        has_deadly_lookalike = False
        lookalikes = safe["candidates"][0].get("lookalikes", []) if safe["candidates"] else []
        for lk in lookalikes:
            if lk.split()[0].lower() in HIGH_RISK_GENERA:
                has_deadly_lookalike = True
                break

        if first_genus in HIGH_RISK_GENERA:
            recommend_review = True
            review_reason = "high_risk_genus"
            review_priority = "critical"
        elif has_deadly_lookalike:
            recommend_review = True
            review_reason = "deadly_lookalike_or_high_risk_genus"
            review_priority = "critical"
        elif quality.possible_multiple_species or quality.heavy_compression_or_blur:
            recommend_review = True
            review_reason = "image_quality_requires_review"
            review_priority = "medium"

    request_id = None
    if recommend_review:
        if existing_req is None:
            new_req = HumanReviewRequest(
                observation_id=observation.id,
                priority=review_priority,
                reason=review_reason,
                status="pending",
            )
            db.add(new_req)
            db.commit()
            db.refresh(new_req)
            request_id = new_req.id
        else:
            request_id = existing_req.id
    elif existing_req is not None:
        request_id = existing_req.id

    # If resolved human review, overwrite prediction
    if existing_req and existing_req.status == "resolved" and existing_req.reviewer_taxon:
        human_cand = CandidateResult(
            taxon=existing_req.reviewer_taxon,
            rank="species" if " " in existing_req.reviewer_taxon.strip() else "genus",
            confidence=existing_req.reviewer_confidence or 0.9,
            evidence_score=1.0,
            metadata_score=1.0,
            visual_score=1.0,
            risk_level="high",
            edibility_label="dangerous_or_unknown",
            reasoning=["Validado por revisor experto."],
            danger_notes=[existing_req.reviewer_notes or "Revisado por experto humano."],
            lookalikes=[],
            explanation=f"Revision humana completa: {existing_req.reviewer_notes or ''}",
        )
        candidates = [human_cand] + candidates

    primary_risk_state = baseline.risk_state
    registry_status = registry.get_status()
    result = ClassificationResponse(
        observation_id=observation.id,
        status=safe["status"],
        safety_level=safe["safety_level"],
        risk_state=primary_risk_state,
        message=safe["message"],
        model_stack=ModelStackResponse(
            detector=registry_status["detector"]["backend"],
            visual_embedder=registry_status["visual_embedder"]["backend"],
            image_text_embedder=registry_status["image_text_embedder"]["backend"],
            metadata_encoder="FungiTastic/FungiCLEF-inspired metadata encoder",
        ),
        candidates=candidates,
        top_candidates=candidates,
        raw_candidates=raw_candidates_results,
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
            pipeline_version="advanced-mvp-v2-phase6",
            classifier_strategy="candidate_ranker_v2_cosine_similarity_l2_normalized",
            segmentation_strategy="yoloe_or_full_image_mock_crop",
            visual_backbone_plan=["DINOv3", "SigLIP2", "FungiTastic/FungiCLEF metadata"],
            metadata_fusion_plan="weighted_multi_image_plus_metadata_fusion",
            open_set_strategy="calibrated_thresholds_with_margin_and_unknown_rejection",
            human_review_path="expert_review_recommended_for_risky_or_low_evidence_cases",
            ranker_version=ranker.version,
            ml_improvement_version=ranker.improvement_version,
            catalog_version=catalog_version,
            similarity_metric=ranker.similarity_metric,
            index_metadata=index_metadata,
            index_path=index_path,
            thresholds_path=open_set_decision.thresholds_path,
            open_set_thresholds=open_set_decision.thresholds_status,
            top1_score=top1_score,
            top1_margin=top1_margin,
            open_set_reasons=open_set_decision.reasons,
        ),
        final_warning=safe["final_warning"],
        open_set=OpenSetResponse(
            is_unknown_or_uncertain=open_set_decision.is_unknown_or_uncertain,
            reason=open_set_decision.reason,
            top1_confidence=open_set_decision.top1_confidence,
            top2_confidence=open_set_decision.top2_confidence,
            margin=open_set_decision.margin,
            entropy=open_set_decision.entropy,
            decision=open_set_decision.decision,
            reasons=open_set_decision.reasons,
            thresholds_path=open_set_decision.thresholds_path,
            thresholds_status=open_set_decision.thresholds_status,
        ),
        human_review=(
            HumanReviewResponse(
                recommended=recommend_review,
                priority=review_priority,
                reason=review_reason,
                request_id=request_id,
            )
            if (recommend_review or existing_req is not None)
            else None
        ),
    )
    observation.last_classification = result.model_dump()
    db.add(observation)
    db.commit()
    return result
