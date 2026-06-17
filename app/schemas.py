from datetime import datetime

from pydantic import BaseModel, Field


class PhotoOut(BaseModel):
    id: int
    file_name: str
    stored_path: str
    size_bytes: int

    model_config = {"from_attributes": True}


class ObservationOut(BaseModel):
    id: int
    title: str
    location_name: str | None
    habitat: str | None
    observed_at: datetime | None
    notes: str | None
    confidence: float
    risk_level: str
    provider_name: str
    classifier_summary: dict = Field(default_factory=dict)
    photos: list[PhotoOut] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class DangerousSpeciesOut(BaseModel):
    common_name: str
    latin_name: str
    risk_level: str
    warning: str
    lookalikes: list[str]
    markers: list[str]
    symptoms: list[str]
    response: str

    model_config = {"from_attributes": True}


class ChatRequest(BaseModel):
    question: str
    observation_id: int | None = None


class ChatResponse(BaseModel):
    answer: str
    disclaimer: str
