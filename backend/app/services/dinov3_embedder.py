from dataclasses import dataclass

from app.core.config import Settings
from app.core.logging import get_logger
from app.ml.fallbacks import MockVisualEmbedder
from app.ml.interfaces import ImageEmbedding, VisualEmbedder

logger = get_logger(__name__)


@dataclass
class DINOv3Embedder(VisualEmbedder):
    model_name: str
    model_path: str
    is_real: bool = False
    fallback: MockVisualEmbedder = MockVisualEmbedder()

    @classmethod
    def from_settings(cls, config: Settings) -> "DINOv3Embedder":
        is_real = bool(config.use_real_dinov3 and (config.dino_model_name or config.dino_model_path))
        if not is_real:
            logger.warning("DINOv3 real model not available, using fallback embedder")
        return cls(
            model_name=config.dino_model_name or "mock-dinov3",
            model_path=config.dino_model_path,
            is_real=is_real,
        )

    def embed_images(self, image_paths: list[str]) -> list[ImageEmbedding]:
        if not self.is_real:
            return self.fallback.embed_images(image_paths)
        logger.warning("DINOv3 adapter configured as real but currently delegates to fallback until model loading is wired")
        return self.fallback.embed_images(image_paths)
