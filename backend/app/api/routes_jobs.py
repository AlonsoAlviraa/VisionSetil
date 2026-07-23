"""API routes for async classification jobs (Sprint N+4 SC-3 + SC-4).

Endpoints
---------
POST /classify/async
    Upload images, create observation + job, return job ID immediately.
    Form parity with sync ``POST /classify`` for ``view_types`` + ``locale`` (B-44).

GET /jobs/{job_id}
    Poll job status. Returns ``ClassificationJobRead``.

GET /jobs/{job_id}/result
    Returns the dual-write job envelope if completed (B-14 / D-B18)::

        {
          "schema_version": 2,
          "simple": <SimpleClassificationResult>,  # always gated
          "raw": <ClassificationResponse|null>     # permanent admin/debug
        }

    Product clients must read ``simple`` only. Returns 409 if still running.

GET /jobs/stats/summary
    Aggregate counts by status (monitoring), scoped to caller's org.
"""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import get_db
from app.db.models import Observation
from app.db.schemas import ClassificationJobRead, JobResultEnvelope
from app.services import unified_catalog as catalog
from app.services.image_storage import store_observation_images
from app.services.task_queue import create_job, get_job, get_queue_stats, run_classification_job
from app.services.view_classifier import CANONICAL_VIEWS

router = APIRouter()


def _get_org_id(request: Request) -> str:
    """Extract the organization_id from request state (set by APIKeyMiddleware)."""
    return getattr(request.state, "organization_id", "default")


def _locale_from_form(locale: str | None) -> str:
    """Optional form locale; omit/blank → es; invalid raises ValueError (caller → 400)."""
    if locale is None or not str(locale).strip():
        return catalog.DEFAULT_LOCALE
    return catalog.normalize_locale(locale)


def _parse_view_types(view_types: str | None, n_images: int) -> list[str] | None:
    """Parse comma-separated ``view_types`` (sync /classify parity).

    Returns ``None`` if absent (auto-label). Invalid labels → HTTP 400.
    """
    if not view_types:
        return None
    parts = [v.strip().lower() for v in view_types.split(",") if v.strip()]
    invalid = [p for p in parts if p not in CANONICAL_VIEWS]
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Invalid view_types label(s): {invalid}. "
                f"Valid labels: {list(CANONICAL_VIEWS)}."
            ),
        )
    while len(parts) < n_images:
        parts.append("")
    return parts[:n_images]


@router.post("/classify/async", response_model=ClassificationJobRead, status_code=202)
async def classify_async(
    request: Request,
    background_tasks: BackgroundTasks,
    images: list[UploadFile] = File(...),
    title: str | None = Form(default=None),
    country: str | None = Form(default=None),
    region: str | None = Form(default=None),
    habitat: str | None = Form(default=None),
    substrate: str | None = Form(default=None),
    notes: str | None = Form(default=None),
    smell: str | None = Form(default=None),
    view_types: str | None = Form(
        default=None,
        description=(
            "Optional comma-separated view labels, one per image "
            "(e.g. 'gills,front,habitat,detail'). If omitted, the backend "
            "auto-classifies each image with the View Classifier service. "
            f"Valid labels: {list(CANONICAL_VIEWS)}. Parity with POST /classify (B-44)."
        ),
    ),
    locale: str | None = Form(
        default=None,
        description=(
            "Optional UI locale for localized safety/copy (es|ca|eu|en). "
            "Invalid values return HTTP 400 with supported list. Default: es. "
            "Parity with POST /classify (B-44 / D-B5)."
        ),
    ),
    db: Session = Depends(get_db),
) -> ClassificationJobRead | JSONResponse:
    """Submit images for async classification.

    Returns a job ID immediately (HTTP 202).  The client should poll
    ``GET /jobs/{job_id}`` until ``status == "completed"``.

    Form parity (B-44): accepts the same ``view_types`` and ``locale`` fields
    as sync ``POST /classify`` and passes them into the worker's
    ``classify_to_simple`` path.
    """
    org_id = _get_org_id(request)

    try:
        resolved_locale = _locale_from_form(locale)
    except ValueError:
        return JSONResponse(
            status_code=400,
            content={
                "error": "invalid_locale",
                "supported": list(catalog.SUPPORTED_LOCALES),
            },
        )

    if not images:
        raise HTTPException(status_code=400, detail="At least one image is required")
    max_images = int(getattr(settings, "max_images_per_request", 10) or 10)
    if len(images) > max_images:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {max_images} images per request",
        )

    for img in images:
        ext = (img.filename or "").rsplit(".", 1)[-1].lower() if img.filename else ""
        if ext and ext not in settings.allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported extension '{ext}'. Allowed: {sorted(settings.allowed_extensions)}",
            )

    # Parse view_types before creating observation so bad labels fail fast (no orphan row).
    parsed_view_types = _parse_view_types(view_types, len(images))

    # Create observation (org-scoped)
    observation = Observation(
        organization_id=org_id,
        title=title or "Clasificación asíncrona",
        country=country or None,
        region=region or None,
        habitat=habitat or None,
        substrate=substrate or None,
        notes=notes or None,
        smell=smell or None,
        nearby_trees=[],
    )
    db.add(observation)
    db.commit()
    db.refresh(observation)

    try:
        await store_observation_images(db, observation, images)
    except HTTPException:
        db.delete(observation)
        db.commit()
        raise

    # Create job (org-scoped)
    job = create_job(db, observation.id, organization_id=org_id)

    # Enqueue background worker with form-parity kwargs (B-44)
    background_tasks.add_task(
        run_classification_job,
        job.id,
        view_types=parsed_view_types,
        locale=resolved_locale,
    )

    return ClassificationJobRead.model_validate(job)


@router.get("/jobs/{job_id}", response_model=ClassificationJobRead)
def get_job_status(
    job_id: str,
    request: Request,
    db: Session = Depends(get_db),
) -> ClassificationJobRead:
    """Get the current status of an async classification job.

    Jobs are scoped to the caller's organization (SC-4).
    """
    org_id = _get_org_id(request)
    job = get_job(db, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    # Strict multi-tenant: never treat "default" as super-org (audit S4).
    if job.organization_id != org_id:
        raise HTTPException(status_code=404, detail="Job not found")
    return ClassificationJobRead.model_validate(job)


@router.get("/jobs/{job_id}/result", response_model=JobResultEnvelope)
def get_job_result(
    job_id: str,
    request: Request,
    db: Session = Depends(get_db),
) -> dict:
    """Get the dual-write classification result for a completed job (B-14).

    Envelope: ``{schema_version: 2, simple, raw}``. ``simple`` is always
    quality-gated via ``classify_to_simple``; ``raw`` is permanent (D-B24).

    Product clients must read ``simple`` only. Returns 409 if not completed.
    """
    org_id = _get_org_id(request)
    job = get_job(db, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.organization_id != org_id:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != "completed":
        raise HTTPException(
            status_code=409,
            detail=f"Job status is '{job.status}', not 'completed'.",
        )
    if job.result is None:
        raise HTTPException(status_code=500, detail="Job completed but result is missing.")
    return job.result


@router.get("/jobs/stats/summary")
def jobs_stats(
    request: Request,
    db: Session = Depends(get_db),
) -> dict:
    """Aggregate counts by status for monitoring (Sprint N+4 SC-3).

    Scoped to the caller's organization (SC-4).
    """
    org_id = _get_org_id(request)
    from app.db.models import ClassificationJob
    from sqlalchemy import func

    stmt = (
        select(ClassificationJob.status, func.count(ClassificationJob.id))
        .where(ClassificationJob.organization_id == org_id)
        .group_by(ClassificationJob.status)
    )
    rows = db.execute(stmt).all()
    return dict(rows)
