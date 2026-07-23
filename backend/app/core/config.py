"""Application settings powered by pydantic-settings.

All settings can be overridden via environment variables or a `.env` file at the
repository root. This module is the single source of truth for configuration and
is documented in `docs/configuration.md`.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

# backend/app/core/config.py → parents[2] = backend package root
_BASE_DIR = Path(__file__).resolve().parents[2]
# monorepo root (…/VisionSetil) — kaggle weights live here, not under backend/
_REPO_ROOT = Path(__file__).resolve().parents[3]

# Emit quality-gate disable warn at most once per process (boot + gate path).
_gate_disable_warned: bool = False

# ENVIRONMENT values that count as production for guardrails (B-19 / B-23).
_PRODUCTION_ENV_ALIASES = frozenset({"production", "prod"})


def _is_production_env_value(env: str | None) -> bool:
    """Case-insensitive production check used by Settings + helpers."""
    return str(env or "").strip().lower() in _PRODUCTION_ENV_ALIASES


class Settings(BaseSettings):
    """Strongly-typed, env-driven configuration for VisionSetil."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
        # Allow both field names and env aliases in constructors/tests
        populate_by_name=True,
    )

    # --- Runtime environment (ops / guardrails) -----------------------------
    # Used for prod guardrails (D-B3 / B-19 warn, B-23 hard refuse). Disable
    # quality-gate block only for local/dev; production must stay fail-closed.
    environment: str = Field(default="development")

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
    # D-B3 fail-closed: when True (default), species ID is blocked if metrics
    # fail the gate. Setting False is fail-open — local/dev only. B-23 refuses
    # False when ENVIRONMENT is production/prod (Settings construction fails).
    # Non-prod disable still emits warn_if_quality_gate_block_disabled() (B-19).
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
    # When true, rate limiter trusts first X-Forwarded-For hop (only behind a
    # reverse proxy that strips/forges client XFF). Default false = use socket IP.
    trust_proxy: bool = Field(default=False, validation_alias="TRUST_PROXY")
    # Comma-separated API keys (key | key:org | key:org:scopes). Empty = auth off
    # in development; production requires non-empty (see model_validator).
    api_keys: str = Field(default="", validation_alias="API_KEYS")

    # --- E-08 session cookie (opt-in; bearer still works) --------------------
    # When true: Set-Cookie HttpOnly on login/register; accept cookie as session.
    auth_cookie_enabled: bool = Field(default=False, validation_alias="AUTH_COOKIE_ENABLED")
    auth_cookie_name: str = Field(default="visionsetil_session", validation_alias="AUTH_COOKIE_NAME")
    # Secure flag: default True in production, False in development unless forced.
    auth_cookie_secure: bool | None = Field(default=None, validation_alias="AUTH_COOKIE_SECURE")
    # lax | strict | none
    auth_cookie_samesite: str = Field(default="lax", validation_alias="AUTH_COOKIE_SAMESITE")
    # When cookies enabled, omit raw token from JSON body (FE uses cookie only).
    auth_cookie_omit_token_body: bool = Field(
        default=True, validation_alias="AUTH_COOKIE_OMIT_TOKEN_BODY"
    )

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

    @model_validator(mode="after")
    def _refuse_gate_disable_in_production(self) -> Settings:
        """B-23: hard-refuse fail-open quality gate when ENVIRONMENT is production.

        Disabling ``model_block_species_id_when_below_gate`` is dev-only.
        In production/prod, Settings construction raises so the process cannot
        boot fail-open (B-19 still warns in non-prod).
        """
        if (
            not self.model_block_species_id_when_below_gate
            and _is_production_env_value(self.environment)
        ):
            raise ValueError(
                "MODEL_BLOCK_SPECIES_ID_WHEN_BELOW_GATE cannot be false when "
                "ENVIRONMENT is production/prod (B-23 / D-B3: gate disable is "
                "dev-only; keep fail-closed or set ENVIRONMENT=development)"
            )
        return self

    @model_validator(mode="after")
    def _production_security_defaults(self) -> Settings:
        """Refuse insecure production boots: empty API_KEYS, mock fallbacks, CORS *.

        Development may keep open API for local SPA work. Production/prod must
        set API_KEYS and keep mock inference off.
        """
        if not _is_production_env_value(self.environment):
            return self
        keys = (self.api_keys or "").strip()
        if not keys:
            raise ValueError(
                "API_KEYS is required when ENVIRONMENT is production/prod "
                "(open API surface is development-only)"
            )
        if self.allow_mock_fallbacks:
            raise ValueError(
                "ALLOW_MOCK_FALLBACKS cannot be true when ENVIRONMENT is "
                "production/prod (R3: no mocks in production)"
            )
        if self.model_fallback_to_mock:
            raise ValueError(
                "MODEL_FALLBACK_TO_MOCK cannot be true when ENVIRONMENT is "
                "production/prod"
            )
        if any(o.strip() == "*" for o in self.cors_origins):
            raise ValueError(
                "CORS_ORIGINS cannot include '*' when ENVIRONMENT is production/prod; "
                "set explicit frontend origins"
            )
        return self


@lru_cache
def get_settings() -> Settings:
    """Cached settings accessor (override in tests via `app.dependency_overrides`)."""
    return Settings()


# Backwards-compatible module-level singleton.
settings = get_settings()


def is_production_environment(env: str | None = None) -> bool:
    """True when ENVIRONMENT is production/prod (case-insensitive)."""
    value = env if env is not None else getattr(settings, "environment", "development")
    return _is_production_env_value(value)


def warn_if_quality_gate_block_disabled(
    *,
    force: bool = False,
    settings_obj: Settings | None = None,
) -> bool:
    """Emit a structured warning if the quality gate is fail-open (disabled).

    D-B3 / B-19: default is fail-closed (``model_block_species_id_when_below_gate=True``).
    Disabling is intended for local/dev only. B-23 hard-refuses disable at
    Settings construction when ``ENVIRONMENT`` is production/prod, so this
    path should only fire for non-prod fail-open (or tests that monkeypatch).
    Logs at most once per process unless ``force=True``.

    Returns True if a warning was emitted (or would be: gate is disabled).
    """
    global _gate_disable_warned
    s = settings_obj if settings_obj is not None else settings
    block_enabled = bool(getattr(s, "model_block_species_id_when_below_gate", True))
    if block_enabled:
        return False

    if _gate_disable_warned and not force:
        return True

    _gate_disable_warned = True
    from app.core.logging import get_logger

    env = str(getattr(s, "environment", "development") or "development")
    prod = is_production_environment(env)
    logger = get_logger(__name__)
    logger.warning(
        "quality_gate block DISABLED (fail-open) — species ID allowed despite bad metrics; "
        "intended for local/dev only",
        extra={
            "event": "quality_gate_block_disabled",
            "block_enabled": False,
            "model_block_species_id_when_below_gate": False,
            "environment": env,
            "is_production": prod,
            "severity": "critical" if prod else "warning",
            "setting": "model_block_species_id_when_below_gate",
        },
    )
    return True


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
