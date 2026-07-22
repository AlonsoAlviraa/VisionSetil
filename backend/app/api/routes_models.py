"""Model / ML stack status endpoints for dashboard + ops."""

from __future__ import annotations

from fastapi import APIRouter

from app.core.config import settings
from app.db.schemas import QualityGatePayload
from app.ml.model_registry import get_model_status
from app.ml.training_metrics import describe_training_metrics
from app.ml.weight_discovery import describe_weight_discovery

router = APIRouter(tags=["models"])


@router.get("/models/status")
def models_status() -> dict:
    """Full ML stack status (registry components + multi-view + discovery)."""
    status = get_model_status()
    repo_root = getattr(settings, "repo_root", None) or settings.base_dir.parent
    status["weight_discovery"] = describe_weight_discovery(
        configured=settings.multi_view_weights_path,
        repo_root=repo_root,
    )
    training = describe_training_metrics(repo_root=repo_root)
    status["training_metrics"] = training
    status["config"] = {
        "model_device": settings.model_device,
        "model_fallback_to_mock": settings.model_fallback_to_mock,
        "multi_view_weights_path": str(settings.multi_view_weights_path),
        "open_set_threshold": settings.model_open_set_threshold,
        "repo_root": str(repo_root),
        "base_dir": str(settings.base_dir),
    }
    # Aggregate honesty summary for the dashboard
    mv = status.get("multi_view_classifier") or {}
    any_real = False
    for key in ("detector", "visual_embedder", "image_text_embedder"):
        comp = status.get(key) or {}
        if isinstance(comp, dict) and comp.get("loaded"):
            any_real = True
    if isinstance(mv, dict) and mv.get("loaded"):
        any_real = True
    primary_m = (training.get("primary") or {}).get("metrics") or {}
    status["summary"] = {
        "any_real_backend": any_real,
        "multi_view_loaded": bool(isinstance(mv, dict) and mv.get("loaded")),
        "multi_view_backend": mv.get("backend") if isinstance(mv, dict) else "unknown",
        "honesty": mv.get("honesty") if isinstance(mv, dict) else "unknown",
        "weights_discovered": bool(isinstance(mv, dict) and mv.get("weights_discovered")),
        "training_map_at_3": primary_m.get("test_map_at_3"),
        "training_num_classes": primary_m.get("num_classes"),
        "training_honesty": training.get("honesty"),
    }
    return status


@router.get("/models/discovery")
def models_discovery() -> dict:
    """Lightweight weight discovery only (no heavy model init)."""
    repo_root = getattr(settings, "repo_root", None) or settings.base_dir.parent
    return describe_weight_discovery(
        configured=settings.multi_view_weights_path,
        repo_root=repo_root,
    )


@router.get("/models/training")
def models_training() -> dict:
    """On-disk training metrics + data-source registry (no GPU)."""
    repo_root = getattr(settings, "repo_root", None) or settings.base_dir.parent
    return describe_training_metrics(repo_root=repo_root)


@router.get("/models/data-sources")
def models_data_sources() -> dict:
    """Public registry of training sources (Spain/Soria + ML datasets)."""
    repo_root = getattr(settings, "repo_root", None) or settings.base_dir.parent
    full = describe_training_metrics(repo_root=repo_root)
    return {
        "docs": full.get("docs"),
        "sources_registry": full.get("sources_registry"),
        "gbif_probe": full.get("gbif_probe_live_file"),
        "primary_metrics_summary": full.get("summary_line"),
        "honesty": full.get("honesty"),
    }


@router.get("/models/quality-gate", response_model=QualityGatePayload)
def models_quality_gate() -> QualityGatePayload:
    """Dual-signal product quality gate for preflight / dashboard (D-B15).

    Stable ``QualityGatePayload``:
    - ``metrics_acceptable`` — raw MAP@3 / deadly recall vs thresholds (never
      forced by disable)
    - ``species_id_allowed`` — serve policy (respects ``block_enabled``)
    - ``reason_code`` — machine code: no_metrics | map_below | deadly_below |
      gates_passed | gate_disabled
    - ``verdict`` — tracks **metrics only** (ACCEPTABLE/UNACCEPTABLE)

    No GPU / weight load — metrics read is cached. Safe for Identify preflight
    polling.

    B-17 rate limits: this path is **rate-limit exempt** (cheap status). The
    Identify client polls on mount and every **60s** (``PREFLIGHT_POLL_MS``);
    multi-tab traffic must not compete with the general 60/min bucket. Other
    ``/models/*`` routes remain rate-limited.
    """
    from app.ml.quality_gate import quality_gate_payload

    return quality_gate_payload()


@router.get("/models/industrial-progress")
def models_industrial_progress() -> dict:
    """Plan-30d industrial_v1 progress JSON (read-only, no GPU)."""
    from pathlib import Path
    import json

    repo_root = Path(getattr(settings, "repo_root", None) or settings.base_dir.parent)
    progress_path = repo_root / "data" / "industrial_v1" / "PROGRESS.json"
    if not progress_path.is_file():
        return {
            "available": False,
            "path": str(progress_path),
            "hint": "Run scripts/build_industrial_dataset.py",
        }
    try:
        data = json.loads(progress_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return {"available": False, "error": str(exc)}
    from app.ml.quality_gate import quality_gate_payload

    data["available"] = True
    # Same dual-signal shape as GET /models/quality-gate
    data["quality_gate_live"] = quality_gate_payload().model_dump()
    data["policy"] = "orientation_only_never_consume"
    return data


@router.get("/models/experiments")
def models_experiments() -> dict:
    """Latest offline experiment battery report (if present on disk)."""
    from pathlib import Path
    import json

    repo_root = Path(getattr(settings, "repo_root", None) or settings.base_dir.parent)
    report_path = repo_root / "eval" / "reports" / "ml_experiments" / "experiment_battery_report.json"
    if not report_path.is_file():
        return {
            "available": False,
            "path": str(report_path),
            "hint": "python eval/scripts/run_ml_experiment_battery.py",
        }
    try:
        data = json.loads(report_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return {"available": False, "error": str(exc), "path": str(report_path)}
    return {
        "available": True,
        "path": str(report_path),
        "generated_at": data.get("generated_at"),
        "executive_summary": data.get("executive_summary"),
        "baseline": (data.get("experiments") or {}).get("baseline"),
        "recommended_gpu_matrix": (data.get("experiments") or {}).get(
            "recommended_gpu_matrix"
        ),
        "calibrated_thresholds": {
            "temperature": getattr(settings, "multiview_temperature_recommended", None),
            "open_set_conf": getattr(settings, "multiview_open_set_conf_thr", None),
            "open_set_margin": getattr(settings, "multiview_open_set_margin_thr", None),
        },
    }
