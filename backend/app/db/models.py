from datetime import UTC, date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class Observation(Base):
    __tablename__ = "observations"
    __table_args__ = (
        Index("ix_observations_organization_id", "organization_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[str] = mapped_column(String(80), default="default")
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
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))

    images: Mapped[list["ObservationImage"]] = relationship(
        "ObservationImage", back_populates="observation", cascade="all, delete-orphan"
    )
    human_reviews: Mapped[list["HumanReviewRequest"]] = relationship(
        "HumanReviewRequest", back_populates="observation", cascade="all, delete-orphan"
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
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))

    observation: Mapped[Observation] = relationship("Observation", back_populates="images")


class HumanReviewRequest(Base):
    __tablename__ = "human_review_requests"
    __table_args__ = (
        Index("ix_human_review_requests_organization_id", "organization_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    observation_id: Mapped[int] = mapped_column(ForeignKey("observations.id"))
    organization_id: Mapped[str] = mapped_column(String(80), default="default")
    status: Mapped[str] = mapped_column(
        String(40), default="pending"
    )  # pending, in_review, resolved, rejected
    priority: Mapped[str] = mapped_column(String(40), default="low")  # low, medium, high, critical
    reason: Mapped[str] = mapped_column(String(255))
    assigned_to: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reviewer_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewer_taxon: Mapped[str | None] = mapped_column(String(160), nullable=True)
    reviewer_confidence: Mapped[float | None] = mapped_column(nullable=True)

    observation: Mapped[Observation] = relationship("Observation", back_populates="human_reviews")


class ClassificationJob(Base):
    """Async classification job for the task queue (Sprint N+4 SC-3)."""

    __tablename__ = "classification_jobs"
    __table_args__ = (
        Index("ix_classification_jobs_organization_id", "organization_id"),
        Index("ix_classification_jobs_status", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    observation_id: Mapped[int] = mapped_column(ForeignKey("observations.id"))
    organization_id: Mapped[str] = mapped_column(String(80), default="default")
    status: Mapped[str] = mapped_column(
        String(20), default="queued"
    )  # queued, running, completed, failed
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    observation: Mapped[Observation] = relationship("Observation")


class User(Base):
    """Registered community user (login)."""

    __tablename__ = "users"
    __table_args__ = (Index("ix_users_email", "email", unique=True),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    username: Mapped[str] = mapped_column(String(80), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(120))
    # E-05: user | reviewer | admin — gates human-review write APIs
    role: Mapped[str] = mapped_column(String(40), default="user")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))

    sessions: Mapped[list["AuthSession"]] = relationship(
        "AuthSession", back_populates="user", cascade="all, delete-orphan"
    )
    posts: Mapped[list["CommunityPost"]] = relationship(
        "CommunityPost", back_populates="author", cascade="all, delete-orphan"
    )
    comments: Mapped[list["CommunityComment"]] = relationship(
        "CommunityComment", back_populates="author", cascade="all, delete-orphan"
    )


class AuthSession(Base):
    """Bearer token session for SPA login."""

    __tablename__ = "auth_sessions"
    __table_args__ = (Index("ix_auth_sessions_token", "token", unique=True),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    # E-07: store only SHA-256 hex of bearer token (never plaintext)
    token: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)

    user: Mapped[User] = relationship("User", back_populates="sessions")


class CommunityPost(Base):
    """Community feed post (chat-style) with optional photo."""

    __tablename__ = "community_posts"
    __table_args__ = (Index("ix_community_posts_created_at", "created_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    body: Mapped[str] = mapped_column(Text)
    image_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Safety: never consumption advice
    orientation_only: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))

    author: Mapped[User] = relationship("User", back_populates="posts")
    comments: Mapped[list["CommunityComment"]] = relationship(
        "CommunityComment",
        back_populates="post",
        cascade="all, delete-orphan",
        order_by="CommunityComment.created_at",
    )


class CommunityComment(Base):
    """Comment on a community post."""

    __tablename__ = "community_comments"
    __table_args__ = (Index("ix_community_comments_post_id", "post_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("community_posts.id"))
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))

    post: Mapped[CommunityPost] = relationship("CommunityPost", back_populates="comments")
    author: Mapped[User] = relationship("User", back_populates="comments")
