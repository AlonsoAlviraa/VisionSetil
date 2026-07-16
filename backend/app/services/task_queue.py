"""Async classification task queue (Sprint N+4 SC-3).

A lightweight, SQLite-backed job queue that runs classification tasks in
background threads.  Uses FastAPI's ``BackgroundTasks`` for fire-and-forget
execution but persists job state so clients can poll ``GET /jobs/{id}``.

Design goals
------------
* **No extra infrastructure** – works with the existing SQLite DB; optionally
  Redis if ``settings.redis_url`` is set (future).
* **Graceful degradation** – if the background worker fails, the job status
  is updated to ``failed`` with the error message.
* **Thread-safe** – each worker thread uses its own ``SessionLocal()``.
"""

from __future__ import annotations

import logging
import threading
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.db.database import SessionLocal
from app.db.models import ClassificationJob, Observation
from app.services.multi_view_classifier import get_multi_view_classifier

logger = logging.getLogger(__name__)

# Module-level lock to prevent duplicate concurrent workers on the same job.
_job_lock = threading.Lock()


def create_job(db: Session, observation_id: int, organization_id: str = "default") -> ClassificationJob:
    """Create a new ``ClassificationJob`` row in ``queued`` status."""
    job = ClassificationJob(
        id=str(uuid.uuid4()),
        observation_id=observation_id,
        organization_id=organization_id,
        status="queued",
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def get_job(db: Session, job_id: str) -> ClassificationJob | None:
    """Fetch a job by ID."""
    return db.get(ClassificationJob, job_id)


def run_classification_job(job_id: str) -> None:
    """Worker function executed in a background thread.

    Opens its own DB session, runs the classifier, and updates the job row.
    """
    db = SessionLocal()
    try:
        job = db.get(ClassificationJob, job_id)
        if job is None:
            logger.error("Job %s not found", job_id)
            return

        with _job_lock:
            if job.status == "running":
                # Already being processed by another thread
                return
            job.status = "running"
            job.started_at = datetime.now(UTC)
            db.add(job)
            db.commit()

        try:
            observation = db.get(Observation, job.observation_id)
            if observation is None:
                raise ValueError(f"Observation {job.observation_id} not found")

            images = list(observation.images)
            classifier = get_multi_view_classifier()

            if (
                hasattr(classifier, "classify")
                and "view_types" in classifier.classify.__code__.co_varnames
            ):
                result = classifier.classify(observation, images, view_types=None)
            else:
                result = classifier.classify(observation, images)

            # Serialize result
            job.result = _serialize_result(result)
            job.status = "completed"
            job.completed_at = datetime.now(UTC)

            # Also store on the observation
            observation.last_classification = job.result
            db.add(job)
            db.add(observation)
            db.commit()

            logger.info("Job %s completed successfully", job_id)

        except Exception as exc:
            logger.exception("Job %s failed", job_id)
            job.status = "failed"
            job.error = str(exc)
            job.completed_at = datetime.now(UTC)
            db.add(job)
            db.commit()

    finally:
        db.close()


def _serialize_result(result: Any) -> dict[str, Any]:
    """Serialize a ClassificationResponse (or similar) to a dict for DB storage."""
    if hasattr(result, "model_dump"):
        return result.model_dump()
    if isinstance(result, dict):
        return result
    return {"raw": str(result)}


def get_queue_stats(db: Session) -> dict[str, Any]:
    """Return aggregate counts by status for monitoring."""
    from sqlalchemy import func, select

    rows = db.execute(
        select(ClassificationJob.status, func.count(ClassificationJob.id)).group_by(
            ClassificationJob.status
        )
    ).all()
    return dict(rows)