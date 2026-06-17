from fastapi import APIRouter

from app.ml.model_registry import build_model_registry

router = APIRouter()


@router.get("/models/status")
def models_status() -> dict:
    registry = build_model_registry()
    return registry.get_status()
