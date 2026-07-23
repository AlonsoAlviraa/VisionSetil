"""FastAPI application entrypoint for VisionSetil."""

from __future__ import annotations

import os
import uuid
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.routes_auth import router as auth_router
from app.api.routes_classification import router as classification_router
from app.api.routes_classify import router as classify_router
from app.api.routes_community import router as community_router
from app.api.routes_feedback import router as feedback_router
from app.api.routes_health import router as health_router
from app.api.routes_human_review import router as human_review_router
from app.api.routes_images import router as images_router
from app.api.routes_jobs import router as jobs_router
from app.api.routes_media import router as media_router
from app.api.routes_metrics import router as metrics_router
from app.api.routes_models import router as models_router
from app.api.routes_observations import router as observations_router
from app.api.routes_species import router as species_router
from app.api.routes_uploads import router as uploads_router
from app.core.config import get_settings, warn_if_quality_gate_block_disabled
from app.core.logging import configure_logging
from app.db.database import init_db
from app.middleware.api_key_auth import APIKeyMiddleware
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.services.species_catalog import ensure_seed_data

settings = get_settings()
configure_logging(level=settings.log_level, fmt=settings.log_format)

settings.upload_dir.mkdir(parents=True, exist_ok=True)
Path(settings.species_media_root).mkdir(parents=True, exist_ok=True)
init_db()
ensure_seed_data()

# B-19 / D-B3: structured prod guardrail if quality gate is fail-open.
warn_if_quality_gate_block_disabled()

# Validate CDN host allowlist at boot (PR-03)
if settings.species_media_cdn_base:
    from app.services.species_media import validate_cdn_config_at_boot

    validate_cdn_config_at_boot()

# Hide OpenAPI UI in production (attack surface map); keep for local/dev.
_is_prod = str(getattr(settings, "environment", "") or "").strip().lower() in {
    "production",
    "prod",
}
app = FastAPI(
    title="mushroom-photo-id",
    docs_url=None if _is_prod else "/docs",
    redoc_url=None if _is_prod else "/redoc",
    openapi_url=None if _is_prod else "/openapi.json",
)


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Propagate a correlation id to logs and responses."""

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get(settings.request_id_header) or str(uuid.uuid4())
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers[settings.request_id_header] = request_id
        return response


app.add_middleware(RequestIDMiddleware)

# CORS: never combine the wildcard origin with credentials.
_cors_origins = list(settings.cors_origins)
_allow_credentials = "*" not in _cors_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_allow_credentials,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["*"],
)

# Rate limiting (Sprint N+2 + B-17 preflight)
# Exempt:
#   - public media/species GETs so encyclopedia grids (N cards × variants) don't trip 60/min
#   - Identify preflight cheap paths (/readyz, /models/quality-gate): FE polls on mount + every 60s;
#     multi-tab (≈5) must not 429 status probes. Prefer full exempt over a high bucket (≥120/min).
_rate_limit_requests = int(os.getenv("RATE_LIMIT_REQUESTS", "60"))
_rate_limit_window = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))
app.add_middleware(
    RateLimitMiddleware,
    max_requests=_rate_limit_requests,
    window_seconds=_rate_limit_window,
    exempt_paths={
        "/health",
        "/healthz",
        "/readyz",
        "/docs",
        "/openapi.json",
        "/redoc",
        "/media",
        "/species",
        # B-17: Identify preflight (mount + 60s poll); cached metrics, no GPU
        "/models/quality-gate",
    },
)

# API Key authentication (Sprint N+2) — active when API_KEYS env is set
app.add_middleware(APIKeyMiddleware)

# Security headers — OWASP best practices (HSTS, CSP, X-Frame-Options, etc.)
app.add_middleware(SecurityHeadersMiddleware)

# E-06: no public StaticFiles for user uploads — authenticated route instead.
# Species photos remain public via /media (species_media).
app.include_router(uploads_router)
app.include_router(health_router)
app.include_router(auth_router)
app.include_router(community_router)
app.include_router(observations_router)
app.include_router(images_router)
app.include_router(classification_router)
app.include_router(classify_router)
app.include_router(media_router)
app.include_router(species_router)
app.include_router(models_router)
app.include_router(human_review_router)
app.include_router(metrics_router)
app.include_router(feedback_router)
app.include_router(jobs_router)
