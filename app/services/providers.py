from dataclasses import dataclass
from typing import Protocol


@dataclass
class ClassificationInput:
    title: str
    notes: str
    habitat: str
    cap_shape: str
    gill_color: str
    stem_features: str
    smell: str
    file_names: list[str]


@dataclass
class ClassificationResult:
    provider_name: str
    confidence: float
    risk_level: str
    headline: str
    guidance: str
    dangerous_matches: list[dict]
    educational_notes: list[str]


class ClassifierProvider(Protocol):
    def classify(self, payload: ClassificationInput) -> ClassificationResult:
        ...
