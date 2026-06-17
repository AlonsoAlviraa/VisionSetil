from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class Observation(Base):
    __tablename__ = "observations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(160))
    country: Mapped[str | None] = mapped_column(String(80), nullable=True)
    region: Mapped[str | None] = mapped_column(String(120), nullable=True)
    approx_location: Mapped[str | None] = mapped_column(String(160), nullable=True)
    latitude: Mapped[float | None] = mapped_column(nullable=True)
    longitude: Mapped[float | None] = mapped_column(nullable=True)
    habitat: Mapped[str | None] = mapped_column(String(160), nullable=True)
    nearby_trees: Mapped[list[str]] = mapped_column(JSON, default=list)
    substrate: Mapped[str | None] = mapped_column(String(120), nullable=True)
    altitude_m: Mapped[float | None] = mapped_column(nullable=True)
    observed_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    smell: Mapped[str | None] = mapped_column(String(120), nullable=True)
    color_change_on_cut: Mapped[str | None] = mapped_column(String(120), nullable=True)
    personal_collection: Mapped[bool] = mapped_column(Boolean, default=True)
    last_classification: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    images: Mapped[list["ObservationImage"]] = relationship(
        "ObservationImage", back_populates="observation", cascade="all, delete-orphan"
    )


class ObservationImage(Base):
    __tablename__ = "observation_images"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    observation_id: Mapped[int] = mapped_column(ForeignKey("observations.id"))
    original_name: Mapped[str] = mapped_column(String(255))
    stored_name: Mapped[str] = mapped_column(String(255))
    stored_path: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    view_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    crop_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    mask_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    observation: Mapped[Observation] = relationship("Observation", back_populates="images")
