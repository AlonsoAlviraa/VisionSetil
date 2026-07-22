"""Health and readiness probes.

``/health`` reports liveness (process is up). ``/readyz`` reports readiness
(database reachable + models loaded). Orchestrators (Docker, k8s) should use
``/health`` for liveness and ``/readyz`` for readiness.
"""

from __future__ import annotations

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.core.logging import bind_request_id, get_logger
from app.db.database import engine

router = APIRouter()
logger = get_logger(__name__)
settings = get_settings()


@router.get("/health")
def health() -> dict[str, str]:
    """Liveness probe — process is up and can serve requests."""
    return {"status": "ok", "service": "mushroom-photo-id"}


@router.get("/readyz")
def readyz() -> JSONResponse:
    """Readiness probe — dependencies (DB, models) are ready to serve."""
    bind_request_id(None)
    checks: dict[str, str] = {}

    # Database connectivity.
    try:
        with engine.connect() as conn:
            conn.exec_driver_sql("SELECT 1")
        checks["database"] = "ok"
    except Exception as exc:  # noqa: BLE001
        checks["database"] = f"error: {exc.__class__.__name__}"
        logger.error("readyz database check failed", exc_info=exc)

    # Model backend status (mock vs real) — PR-16 honest reporting.
    classifier_mode = "unknown"
    try:
        from app.ml.model_registry import get_model_status  # lazy import

        status_report = get_model_status()
        checks["models"] = "ok"
        checks["model_details"] = str(status_report)
        any_real = any(
            "real" in str(v).lower()
            for v in status_report.values()
            if isinstance(v, (str, dict))
        )
        classifier_mode = "real" if any_real else "mock"
        checks["classifier_mode"] = classifier_mode
        if settings.readyz_fail_on_mock_models and not any_real:
            checks["models"] = "degraded: all-mock"
    except Exception as exc:  # noqa: BLE001
        checks["models"] = f"error: {exc.__class__.__name__}"
        checks["classifier_mode"] = "error"

    # Catalog + media readiness (Professional Upgrade)
    try:
        from app.services.unified_catalog import catalog_version, load_catalog

        cat = load_catalog()
        n = len(cat.get("species") or [])
        checks["catalog"] = "ok" if n > 0 else "degraded: empty"
        checks["catalog_version"] = catalog_version()
        checks["catalog_count"] = str(n)
    except Exception as exc:  # noqa: BLE001
        checks["catalog"] = f"error: {exc.__class__.__name__}"

    try:
        from pathlib import Path

        media_root = Path(settings.species_media_root)
        ph = media_root / "placeholders"
        checks["media_root"] = "ok" if media_root.exists() else "missing"
        checks["media_placeholders"] = "ok" if ph.exists() else "missing"
    except Exception as exc:  # noqa: BLE001
        checks["media_root"] = f"error: {exc.__class__.__name__}"

    # catalog/media degraded does not fail readiness unless empty DB
    ready = all(
        v == "ok"
        for k, v in checks.items()
        if k
        in (
            "database",
            "models",
        )
        or (k == "models" and v == "ok")
    )
    # models may be degraded: all-mock
    if checks.get("database") != "ok":
        ready = False
    elif checks.get("models", "").startswith("error"):
        ready = False
    elif settings.readyz_fail_on_mock_models and checks.get("models") != "ok":
        ready = False
    else:
        ready = checks.get("database") == "ok" and not str(checks.get("models", "")).startswith(
            "error"
        )

    code = status.HTTP_200_OK if ready else status.HTTP_503_SERVICE_UNAVAILABLE
    return JSONResponse(
        status_code=code,
        content={
            "ready": ready,
            "checks": checks,
            "classifier_mode": checks.get("classifier_mode", classifier_mode),
            "degraded": checks.get("classifier_mode") == "mock",
        },
    )
