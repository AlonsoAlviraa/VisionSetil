from dataclasses import dataclass

from app.core.config import settings
from app.services.dinov3_embedder import DINOv3Embedder
from app.services.siglip2_embedder import SigLIP2Embedder
from app.services.yoloe_detector import YOLOEDetector


@dataclass
class ModelRegistry:
    detector: object
    visual_embedder: object
    image_text_embedder: object


def build_model_registry() -> ModelRegistry:
    return ModelRegistry(
        detector=YOLOEDetector.from_settings(settings),
        visual_embedder=DINOv3Embedder.from_settings(settings),
        image_text_embedder=SigLIP2Embedder.from_settings(settings),
    )
