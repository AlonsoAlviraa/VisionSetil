from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Observation(Base):
    __tablename__ = "observations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(140))
    location_name: Mapped[str | None] = mapped_column(String(140), nullable=True)
    habitat: Mapped[str | None] = mapped_column(String(140), nullable=True)
    observed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    cap_shape: Mapped[str | None] = mapped_column(String(80), nullable=True)
    gill_color: Mapped[str | None] = mapped_column(String(80), nullable=True)
    stem_features: Mapped[str | None] = mapped_column(String(120), nullable=True)
    smell: Mapped[str | None] = mapped_column(String(80), nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    risk_level: Mapped[str] = mapped_column(String(32), default="unknown")
    provider_name: Mapped[str] = mapped_column(String(80), default="mock-conservative")
    classifier_summary: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    photos: Mapped[list["Photo"]] = relationship(
        "Photo", back_populates="observation", cascade="all, delete-orphan"
    )


class Photo(Base):
    __tablename__ = "photos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    observation_id: Mapped[int] = mapped_column(ForeignKey("observations.id"))
    file_name: Mapped[str] = mapped_column(String(200))
    stored_path: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    observation: Mapped[Observation] = relationship("Observation", back_populates="photos")


class DangerousSpecies(Base):
    __tablename__ = "dangerous_species"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    common_name: Mapped[str] = mapped_column(String(140))
    latin_name: Mapped[str] = mapped_column(String(140), unique=True, index=True)
    risk_level: Mapped[str] = mapped_column(String(32))
    warning: Mapped[str] = mapped_column(Text)
    lookalikes: Mapped[list[str]] = mapped_column(JSON, default=list)
    markers: Mapped[list[str]] = mapped_column(JSON, default=list)
    symptoms: Mapped[list[str]] = mapped_column(JSON, default=list)
    response: Mapped[str] = mapped_column(Text)
