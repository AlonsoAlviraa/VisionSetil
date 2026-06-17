from dataclasses import dataclass

from app.core.config import Settings
from app.core.logging import get_logger
from app.ml.fallbacks import MockMushroomDetector
from app.ml.interfaces import DetectedMushroomCrop, MushroomDetector

logger = get_logger(__name__)


@dataclass
class YOLOEDetector(MushroomDetector):
    model_name: str
    model_path: str
    is_real: bool = False
    fallback: MockMushroomDetector = MockMushroomDetector()

    @classmethod
    def from_settings(cls, config: Settings) -> "YOLOEDetector":
        is_real = bool(config.use_real_yoloe and (config.yoloe_model_name or config.yoloe_model_path))
        if not is_real:
            logger.warning("YOLOE real model not available, using fallback detector")
        return cls(
            model_name=config.yoloe_model_name or "mock-yoloe-26",
            model_path=config.yoloe_model_path,
            is_real=is_real,
        )

    def detect_and_crop(self, image_paths: list[str]) -> list[DetectedMushroomCrop]:
        if not self.is_real:
            return self.fallback.detect_and_crop(image_paths)
        logger.warning("YOLOEDetector adapter is configured as real, but currently delegates to fallback until weights are wired")
        return self.fallback.detect_and_crop(image_paths)
