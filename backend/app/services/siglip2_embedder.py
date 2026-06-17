from dataclasses import dataclass

from app.core.config import Settings
from app.core.logging import get_logger
from app.ml.fallbacks import MockImageTextEmbedder
from app.ml.interfaces import ImageEmbedding, ImageTextEmbedder, TextEmbedding

logger = get_logger(__name__)


@dataclass
class SigLIP2Embedder(ImageTextEmbedder):
    model_name: str
    model_path: str
    is_real: bool = False
    fallback: MockImageTextEmbedder = MockImageTextEmbedder()

    @classmethod
    def from_settings(cls, config: Settings) -> "SigLIP2Embedder":
        is_real = bool(config.use_real_siglip2 and (config.siglip_model_name or config.siglip_model_path))
        if not is_real:
            logger.warning("SigLIP 2 real model not available, using fallback image-text embedder")
        return cls(
            model_name=config.siglip_model_name or "mock-siglip2",
            model_path=config.siglip_model_path,
            is_real=is_real,
        )

    def embed_images(self, image_paths: list[str]) -> list[ImageEmbedding]:
        if not self.is_real:
            return self.fallback.embed_images(image_paths)
        logger.warning("SigLIP2 adapter configured as real but currently delegates to fallback until model loading is wired")
        return self.fallback.embed_images(image_paths)

    def embed_texts(self, texts: list[str]) -> list[TextEmbedding]:
        if not self.is_real:
            return self.fallback.embed_texts(texts)
        logger.warning("SigLIP2 adapter configured as real but currently delegates to fallback until model loading is wired")
        return self.fallback.embed_texts(texts)

    def similarity(self, image_embedding: ImageEmbedding, text_embedding: TextEmbedding) -> float:
        return self.fallback.similarity(image_embedding, text_embedding)
