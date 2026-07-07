from dataclasses import dataclass, field
from datetime import date
from typing import Protocol


@dataclass
class BoundingBox:
    x1: float
    y1: float
    x2: float
    y2: float


@dataclass
class DetectedMushroomCrop:
    source_path: str
    crop_path: str
    mask_path: str | None
    bounding_box: BoundingBox
    score: float
    estimated_view_type: str


@dataclass
class ImageEmbedding:
    source_path: str
    vector: list[float]
    model_name: str


@dataclass
class TextEmbedding:
    source_text: str
    vector: list[float]
    model_name: str


@dataclass
class MetadataVector:
    values: list[float]
    feature_names: list[str]


@dataclass
class MushroomObservationMetadata:
    country: str | None = None
    region: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    observed_at: date | None = None
    habitat: str | None = None
    substrate: str | None = None
    nearby_trees: list[str] = field(default_factory=list)
    altitude_m: float | None = None
    smell: str | None = None
    color_change_on_cut: str | None = None
    user_notes: str | None = None


@dataclass
class ObservationRepresentation:
    vector: list[float]
    detected_views: list[str]
    evidence_penalty: float
    metadata_vector: MetadataVector
    visual_component: list[float]
    text_component: list[float]


class MushroomDetector(Protocol):
    def detect_and_crop(self, image_paths: list[str]) -> list[DetectedMushroomCrop]: ...


class VisualEmbedder(Protocol):
    def embed_images(self, image_paths: list[str]) -> list[ImageEmbedding]: ...


class ImageTextEmbedder(Protocol):
    def embed_images(self, image_paths: list[str]) -> list[ImageEmbedding]: ...

    def embed_texts(self, texts: list[str]) -> list[TextEmbedding]: ...

    def similarity(
        self, image_embedding: ImageEmbedding, text_embedding: TextEmbedding
    ) -> float: ...
