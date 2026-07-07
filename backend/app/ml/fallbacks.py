import hashlib
from pathlib import Path

from app.core.logging import get_logger
from app.ml.interfaces import (
    BoundingBox,
    DetectedMushroomCrop,
    ImageEmbedding,
    ImageTextEmbedder,
    MushroomDetector,
    TextEmbedding,
    VisualEmbedder,
)

logger = get_logger(__name__)


def _vector_from_text(text: str, size: int = 8) -> list[float]:
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    return [round(digest[index] / 255, 4) for index in range(size)]


class MockMushroomDetector(MushroomDetector):
    def detect_and_crop(self, image_paths: list[str]) -> list[DetectedMushroomCrop]:
        logger.warning("Using MockMushroomDetector fallback")
        detections: list[DetectedMushroomCrop] = []
        for path in image_paths:
            lower = Path(path).name.lower()
            if "gill" in lower or "lamina" in lower or "poro" in lower:
                view = "gills_or_pores"
            elif "base" in lower or "volva" in lower:
                view = "base"
            elif "stem" in lower or "pie" in lower:
                view = "stem"
            elif "cut" in lower or "corte" in lower or "section" in lower:
                view = "cross_section"
            elif "context" in lower or "entorno" in lower or "habitat" in lower:
                view = "environment"
            elif "cap" in lower or "top" in lower or "sombrero" in lower:
                view = "cap_top"
            else:
                view = "unknown"
            detections.append(
                DetectedMushroomCrop(
                    source_path=path,
                    crop_path=path,
                    mask_path=None,
                    bounding_box=BoundingBox(x1=0, y1=0, x2=1, y2=1),
                    score=0.55,
                    estimated_view_type=view,
                )
            )
        return detections


class MockVisualEmbedder(VisualEmbedder):
    def embed_images(self, image_paths: list[str]) -> list[ImageEmbedding]:
        logger.warning("Using MockVisualEmbedder fallback")
        return [
            ImageEmbedding(
                source_path=path,
                vector=_vector_from_text(f"visual::{path}"),
                model_name="mock-dinov3",
            )
            for path in image_paths
        ]


class MockImageTextEmbedder(ImageTextEmbedder):
    def embed_images(self, image_paths: list[str]) -> list[ImageEmbedding]:
        logger.warning("Using MockImageTextEmbedder fallback for images")
        return [
            ImageEmbedding(
                source_path=path,
                vector=_vector_from_text(f"siglip-image::{path}"),
                model_name="mock-siglip2",
            )
            for path in image_paths
        ]

    def embed_texts(self, texts: list[str]) -> list[TextEmbedding]:
        logger.warning("Using MockImageTextEmbedder fallback for texts")
        return [
            TextEmbedding(
                source_text=text,
                vector=_vector_from_text(f"siglip-text::{text}"),
                model_name="mock-siglip2",
            )
            for text in texts
        ]

    def similarity(self, image_embedding: ImageEmbedding, text_embedding: TextEmbedding) -> float:
        total = sum(
            abs(a - b) for a, b in zip(image_embedding.vector, text_embedding.vector, strict=False)
        )
        return round(max(0.0, 1.0 - total / len(image_embedding.vector)), 4)
