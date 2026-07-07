"""Application settings powered by pydantic-settings.

All settings can be overridden via environment variables or a `.env` file at the
repository root. This module is the single source of truth for configuration and
is documented in `docs/configuration.md`.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

_BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Strongly-typed, env-driven configuration for VisionSetil."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- Core paths ---------------------------------------------------------
    base_dir: Path = Field(default=_BASE_DIR)
    database_path: Path = Field(default=_BASE_DIR / "mushroom_photo_id.db")
    upload_dir: Path = Field(default=_BASE_DIR / "uploads")
    poisonous_species_path: Path = Field(
        default=Path(__file__).resolve().parents[1] / "data" / "poisonous_species.json"
    )
    mock_species_catalog_path: Path = Field(
        default=Path(__file__).resolve().parents[1] / "data" / "mock_species_catalog.json"
    )
    metadata_schema_path: Path = Field(
        default=Path(__file__).resolve().parents[1] / "data" / "metadata_schema.json"
    )

    # --- Uploads ------------------------------------------------------------
    max_upload_size_bytes: int = Field(default=10 * 1024 * 1024, validation_alias="MAX_IMAGE_MB")
    allowed_extensions: Annotated[set[str], NoDecode] = Field(
        default_factory=lambda: {"jpg", "jpeg", "png", "webp"}
    )

    # --- Pipeline -----------------------------------------------------------
    top_k_candidates: int = Field(default=5)

    # --- Model activation flags --------------------------------------------
    use_real_yoloe: bool = Field(default=False)
    use_real_dinov3: bool = Field(default=False)
    use_real_siglip2: bool = Field(default=False)
    allow_mock_fallbacks: bool = Field(default=True)

    # --- Model identifiers --------------------------------------------------
    yoloe_model_name: str = Field(default="")
    yoloe_model_path: str = Field(default="")
    dino_model_name: str = Field(default="")
    dino_model_path: str = Field(default="")
    siglip_model_name: str = Field(default="")
    siglip_model_path: str = Field(default="")

    # --- Device / dims ------------------------------------------------------
    yoloe_device: str = Field(default="auto")
    yoloe_conf_threshold: float = Field(default=0.25)
    yoloe_iou_threshold: float = Field(default=0.7)
    dino_device: str = Field(default="auto")
    dino_embedding_dim: int = Field(default=1024)
    siglip_device: str = Field(default="auto")
    siglip_embedding_dim: int = Field(default=768)

    # --- Open-set rejection -------------------------------------------------
    open_set_min_confidence: float = Field(default=0.55)
    open_set_min_margin: float = Field(default=0.15)
    open_set_max_evidence_penalty: float = Field(default=0.3)
    open_set_reject_on_missing_critical_evidence: bool = Field(default=True)
    open_set_reject_on_deadly_lookalikes: bool = Field(default=True)
    required_views: Annotated[tuple[str, ...], NoDecode] = Field(
        default=(
            "cap_top",
            "gills_or_pores",
            "stem",
            "base",
            "cross_section",
            "environment",
        )
    )

    # --- Security / runtime (new in hardening sprint) ----------------------
    cors_origins: Annotated[list[str], NoDecode] = Field(default_factory=list)
    log_level: str = Field(default="INFO")
    log_format: str = Field(default="text")  # "text" | "json"
    request_id_header: str = Field(default="X-Request-ID")
    readyz_fail_on_mock_models: bool = Field(default=False)

    # --- Validators ---------------------------------------------------------
    @field_validator("log_format")
    @classmethod
    def _validate_log_format(cls, v: str) -> str:
        allowed = {"text", "json"}
        normalized = v.lower().strip()
        if normalized not in allowed:
            raise ValueError(f"log_format must be one of {allowed}, got {v!r}")
        return normalized

    @field_validator("max_upload_size_bytes", mode="before")
    @classmethod
    def _coerce_max_image_mb(cls, v):
        """Allow MAX_IMAGE_MB to be expressed in megabytes for backwards compat."""
        if isinstance(v, str) and v.strip().isdigit():
            mb = int(v)
            # Heuristic: values <= 2048 are megabytes, larger values are bytes.
            if mb <= 2048:
                return mb * 1024 * 1024
        return v

    @field_validator("cors_origins", "allowed_extensions", "required_views", mode="before")
    @classmethod
    def _split_csv(cls, v):
        """Accept comma-separated string or collection for complex env fields."""
        if isinstance(v, str):
            return [item.strip() for item in v.split(",") if item.strip()]
        return v


@lru_cache
def get_settings() -> Settings:
    """Cached settings accessor (override in tests via `app.dependency_overrides`)."""
    return Settings()


# Backwards-compatible module-level singleton.
settings = get_settings()


def is_cuda_really_compatible() -> bool:
    """Probe whether CUDA is actually usable (not just reported by torch)."""
    try:
        import torch

        if not torch.cuda.is_available():
            return False
        x = torch.ones(1, device="cuda")
        _ = x * 2.0
        torch.cuda.synchronize()
        return True
    except Exception:
        return False
