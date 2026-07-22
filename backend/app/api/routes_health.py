"""Health and readiness probes.

``/health`` reports liveness (process is up). ``/readyz`` reports readiness
(database reachable + models loaded). Orchestrators (Docker, k8s) should use
``/health`` for liveness and ``/readyz`` for readiness.

B-10: ``/readyz`` also exposes nested dual-signal ``quality_gate`` and
``weights_present`` for Identify preflight. Gate fail does **not** force
``ready=false`` — only DB/models (and optional ``readyz_fail_on_mock_models``)
affect readiness HTTP status.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.core.logging import bind_request_id, get_logger
from app.db.database import engine

router = APIRouter()
logger = get_logger(__name__)
settings = get_settings()

# Dual-signal keys expected by preflight / QualityGatePayload (B-09/B-10).
_QUALITY_GATE_KEYS = (
    "species_id_allowed",
    "metrics_acceptable",
    "block_enabled",
    "reason",
    "reason_code",
    "test_map_at_3",
    "safety_recall_deadly",
    "min_map_at_3",
    "min_deadly_recall",
    "metrics_path",
    "version",
    "verdict",
)


def _fail_closed_gate_dict() -> dict[str, Any]:
    """Minimal dual-signal gate when evaluation itself errors."""
    return {
        "species_id_allowed": False,
        "metrics_acceptable": False,
        "block_enabled": True,
        "reason": "readyz_gate_eval_error",
        "reason_code": "no_metrics",
        "test_map_at_3": None,
        "safety_recall_deadly": None,
        "min_map_at_3": float(getattr(settings, "model_min_acceptable_map_at_3", 0.20)),
        "min_deadly_recall": 0.90,
        "metrics_path": None,
        "version": None,
        "verdict": "UNACCEPTABLE",
    }


def _quality_gate_for_readyz() -> dict[str, Any]:
    """Nested dual-signal quality_gate payload (same contract as /models/quality-gate)."""
    try:
        from app.ml.quality_gate import quality_gate_payload

        data = quality_gate_payload().model_dump()
        # Ensure stable key set even if schema gains extras later
        return {k: data.get(k) for k in _QUALITY_GATE_KEYS}
    except Exception as exc:  # noqa: BLE001
        logger.error("readyz quality_gate evaluation failed", exc_info=exc)
        return _fail_closed_gate_dict()


def _weights_present() -> bool:
    """True when a multi-view checkpoint file is discoverable on disk."""
    try:
        from app.ml.weight_discovery import resolve_multiview_weights_path

        repo_root = Path(getattr(settings, "repo_root", None) or settings.base_dir.parent)
        resolved = resolve_multiview_weights_path(
            configured=settings.multi_view_weights_path,
            repo_root=repo_root,
        )
        return bool(resolved is not None and resolved.is_file())
    except Exception as exc:  # noqa: BLE001
        logger.error("readyz weights_present check failed", exc_info=exc)
        return False


@router.get("/health")
def health() -> dict[str, str]:
    """Liveness probe — process is up and can serve requests."""
    return {"status": "ok", "service": "mushroom-photo-id"}


@router.get("/readyz")
def readyz() -> JSONResponse:
    """Readiness probe — dependencies (DB, models) are ready to serve.

    Response includes (B-10):
    - ``quality_gate``: nested dual-signal payload (metrics_acceptable vs
      species_id_allowed). **Does not** flip ``ready`` / HTTP 503 on gate fail.
    - ``weights_present``: whether multi-view weights exist on disk.
    """
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
        media_root = Path(settings.species_media_root)
        ph = media_root / "placeholders"
        checks["media_root"] = "ok" if media_root.exists() else "missing"
        checks["media_placeholders"] = "ok" if ph.exists() else "missing"
    except Exception as exc:  # noqa: BLE001
        checks["media_root"] = f"error: {exc.__class__.__name__}"

    # Dual-signal quality gate + weights (B-10). Advisory for preflight only.
    quality_gate = _quality_gate_for_readyz()
    weights_present = _weights_present()

    # Readiness: DB + models only. Quality-gate fail does NOT force ready=false
    # (gate is advisory for Identify preflight; only readyz_fail_on_mock_models
    # can degrade models → 503 when stack is all-mock).
    if checks.get("database") != "ok":
        ready = False
    elif str(checks.get("models", "")).startswith("error"):
        ready = False
    elif settings.readyz_fail_on_mock_models and checks.get("models") != "ok":
        ready = False
    else:
        ready = checks.get("database") == "ok" and not str(
            checks.get("models", "")
        ).startswith("error")

    code = status.HTTP_200_OK if ready else status.HTTP_503_SERVICE_UNAVAILABLE
    return JSONResponse(
        status_code=code,
        content={
            "ready": ready,
            "checks": checks,
            "classifier_mode": checks.get("classifier_mode", classifier_mode),
            "degraded": checks.get("classifier_mode") == "mock",
            "quality_gate": quality_gate,
            "weights_present": weights_present,
        },
    )
