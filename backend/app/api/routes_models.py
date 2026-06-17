from fastapi import APIRouter

from app.ml.model_registry import build_model_registry

router = APIRouter()


@router.get("/models/status")
def models_status() -> dict:
    registry = build_model_registry()
    return {
        "detector": getattr(registry.detector, "model_name", "fallback"),
        "visual_embedder": getattr(registry.visual_embedder, "model_name", "fallback"),
        "image_text_embedder": getattr(registry.image_text_embedder, "model_name", "fallback"),
        "detector_real": getattr(registry.detector, "is_real", False),
        "visual_real": getattr(registry.visual_embedder, "is_real", False),
        "image_text_real": getattr(registry.image_text_embedder, "is_real", False),
    }
