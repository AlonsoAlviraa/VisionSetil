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

# backend/app/core/config.py → parents[2] = backend package root
_BASE_DIR = Path(__file__).resolve().parents[2]
# monorepo root (…/VisionSetil) — kaggle weights live here, not under backend/
_REPO_ROOT = Path(__file__).resolve().parents[3]


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
    # Monorepo root for discovering in-repo Kaggle checkpoints / eval assets.
    repo_root: Path = Field(default=_REPO_ROOT)
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
    # Species catalog v2 + media store (Professional Upgrade)
    # _BASE_DIR is backend/; monorepo root is parent.
    species_catalog_v2_path: Path = Field(
        default=_BASE_DIR.parent / "data" / "species_catalog" / "species_catalog_v2.json"
    )
    species_media_root: Path = Field(default=_BASE_DIR.parent / "media")
    species_media_cdn_base: str = Field(default="")
    species_media_cdn_prefer_redirect: bool = Field(default=False)
    # Browser-facing media prefix for hydration URLs (plan §1.7.1).
    # FE Vite/nginx strip /api → FastAPI /media. Default matches VITE_MEDIA_PUBLIC_PREFIX.
    media_public_prefix: str = Field(default="/api/media")

    # --- Uploads ------------------------------------------------------------
    max_upload_size_bytes: int = Field(default=10 * 1024 * 1024, validation_alias="MAX_IMAGE_MB")
    # S4 upload hardening
    max_image_dimension: int = Field(default=4096, validation_alias="MAX_IMAGE_DIMENSION")
    max_images_per_request: int = Field(default=10, validation_alias="MAX_IMAGES_PER_REQUEST")
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
    # Defaults for stronger models. Weak few-shot v9 (MAP@3~0.08) is better
    # served by post-hoc thresholds from eval/reports/ml_experiments
    # (conf>=0.10 → ~16% acc@20% accept). Product still abstains aggressively.
    open_set_min_confidence: float = Field(default=0.48)
    open_set_min_margin: float = Field(default=0.10)
    # Recommended offline calibration for current multi-view v9 checkpoint
    # (see experiment_battery_report.json → best_open_set).
    multiview_open_set_conf_thr: float = Field(default=0.10)
    multiview_open_set_margin_thr: float = Field(default=0.0)
    multiview_temperature_recommended: float = Field(default=1.5)
    # Hard product gate: if on-disk test MAP@3 is below this, classify NEVER
    # returns decision=accepted (species ID blocked). v9 is ~0.076 → blocked.
    model_min_acceptable_map_at_3: float = Field(default=0.20)
    model_block_species_id_when_below_gate: bool = Field(default=True)
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

    # --- Multi-view model (v5) ----------------------------------------------
    # Path to the trained MultiViewModel checkpoint (torch .pt).
    # Prefer in-repo Kaggle best.pt when present; else backend/app/ml/weights/.
    multi_view_weights_path: Path = Field(
        default=_REPO_ROOT
        / "kaggle"
        / "kernel_output_v9"
        / "models"
        / "best.pt"
    )
    # Path to the view classifier ONNX weights.
    view_classifier_model_path: str = Field(default="")
    # Inference device: "cpu" or "cuda".
    model_device: str = Field(default="cpu")
    # Open-set cosine threshold for multi-view ArcFace embeddings.
    model_open_set_threshold: float = Field(default=0.55)
    # Fallback scalar temperature when no learned temperature is available.
    model_temperature: float = Field(default=1.5)
    # If True, fall back to MockMushroomClassifier when weights are absent.
    model_fallback_to_mock: bool = Field(default=True)
    # Toggle pipeline stages (allows A/B ablation per ML_IMPROVEMENT_PROMPT §6.2).
    model_enable_roi_detection: bool = Field(default=True)
    model_enable_view_classifier: bool = Field(default=True)
    model_enable_metadata_fusion: bool = Field(default=True)
    # Canonical 4-view taxonomy (ML_IMPROVEMENT_PROMPT §2.1).
    canonical_view_types: Annotated[tuple[str, ...], NoDecode] = Field(
        default=("gills", "front", "habitat", "detail")
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

    @field_validator("cors_origins", "allowed_extensions", "required_views", "canonical_view_types", mode="before")
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
