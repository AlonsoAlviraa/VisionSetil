from dataclasses import dataclass

from app.core.config import settings
from app.services.dinov3_embedder import DINOv3Embedder
from app.services.siglip2_embedder import SigLIP2Embedder
from app.services.yoloe_detector import YOLOEDetector


@dataclass
class ModelRegistry:
    detector: YOLOEDetector
    visual_embedder: DINOv3Embedder
    image_text_embedder: SigLIP2Embedder

    def get_status(self) -> dict:
        # Avoid exposing full local path if not needed
        detector_path = self.detector.model_path
        if detector_path:
            detector_path = detector_path[-30:] if len(detector_path) > 30 else detector_path

        visual_backend = "real_dinov3" if self.visual_embedder.is_real else "mock_dinov3_fallback"
        siglip_backend = (
            "real_siglip2" if self.image_text_embedder.is_real else "mock_siglip2_fallback"
        )

        return {
            "detector": {
                "requested": "YOLOE-26",
                "backend": "real_yoloe" if self.detector.is_real else "mock_yoloe_fallback",
                "loaded": self.detector.is_real,
                "device": self.detector.device,
                "model_path": detector_path or None,
            },
            "visual_embedder": {
                "requested": "DINOv3",
                "backend": visual_backend,
                "loaded": self.visual_embedder.is_real,
                "device": self.visual_embedder.device,
                "embedding_dim": settings.dino_embedding_dim,
            },
            "image_text_embedder": {
                "requested": "SigLIP 2",
                "backend": siglip_backend,
                "loaded": self.image_text_embedder.is_real,
                "device": self.image_text_embedder.device,
                "embedding_dim": settings.siglip_embedding_dim,
                **({} if self.image_text_embedder.is_real else {"reason": "weights_not_found"}),
            },
        }


_registry_instance: ModelRegistry | None = None


def build_model_registry() -> ModelRegistry:
    global _registry_instance
    if _registry_instance is None:
        _registry_instance = ModelRegistry(
            detector=YOLOEDetector.from_settings(settings),
            visual_embedder=DINOv3Embedder.from_settings(settings),
            image_text_embedder=SigLIP2Embedder.from_settings(settings),
        )
    return _registry_instance


def get_model_status() -> dict:
    """Aggregate status of all models, including the multi-view classifier.

    Used by the ``/readyz`` endpoint to report real-vs-mock model status.
    Safe to call even when the registry cannot be built (returns error dict).
    """
    status_report: dict = {}

    # Legacy detector/embedder stack.
    try:
        registry = build_model_registry()
        status_report.update(registry.get_status())
    except Exception as exc:  # noqa: BLE001
        status_report["registry"] = f"error: {exc.__class__.__name__}: {exc}"

    # Multi-view classifier (v5).
    try:
        from app.services.multi_view_classifier import get_multi_view_classifier

        mv = get_multi_view_classifier()
        status_report["multi_view_classifier"] = mv.get_status()
    except Exception as exc:  # noqa: BLE001
        status_report["multi_view_classifier"] = {
            "backend": "error",
            "error": f"{exc.__class__.__name__}: {exc}",
        }

    return status_report
