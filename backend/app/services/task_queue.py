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
* **Safety parity (B-14)** – worker uses the same ``classify_to_simple`` gate
  as sync ``POST /classify``; job.result is dual-write envelope
  ``{schema_version:2, simple, raw}`` (raw permanent per D-B18/D-B24).
* **Form parity (B-44)** – ``view_types`` + ``locale`` from async form are
  forwarded into ``classify_to_simple`` (same contract as sync).
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
from app.services.classify_simple import (
    build_job_result_envelope,
    classify_to_simple_with_raw,
)
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


def run_classification_job(
    job_id: str,
    *,
    view_types: list[str] | None = None,
    locale: str = "es",
) -> None:
    """Worker function executed in a background thread.

    Opens its own DB session, runs the classifier via shared
    ``classify_to_simple`` (gate + mode + locale), and dual-writes the job
    result envelope ``{schema_version: 2, simple, raw}``.

    ``view_types`` / ``locale`` come from the async form (B-44). When omitted
    (direct worker calls / legacy), ``view_types=None`` auto-labels and
    ``locale`` defaults to ``es``. Product FE must read ``simple`` only —
    never ungated ``raw`` predictions.
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
            request_id = f"job-{job_id[:12]}"

            # B-14 + B-44: same classify_to_simple path as sync (gate+mode+locale+views)
            simple, raw = classify_to_simple_with_raw(
                observation=observation,
                images=images,
                view_types=view_types,
                locale=locale,
                request_id=request_id,
                classifier=classifier,
                loaded_weights_path=getattr(classifier, "resolved_weights_path", None),
            )

            # Dual-write envelope (D-B18/D-B24): simple always gated; raw permanent
            envelope = build_job_result_envelope(simple, raw)
            job.result = envelope
            job.status = "completed"
            job.completed_at = datetime.now(UTC)

            # Product-facing simple on observation (parity with POST /classify)
            observation.last_classification = envelope["simple"]
            db.add(job)
            db.add(observation)
            db.commit()

            logger.info(
                "Job %s completed (mode=%s, locale=%s, species_id_allowed=%s)",
                job_id,
                getattr(simple.mode, "value", simple.mode),
                locale,
                bool(simple.quality_gate and simple.quality_gate.species_id_allowed),
            )

        except Exception as exc:
            logger.exception("Job %s failed", job_id)
            job.status = "failed"
            job.error = str(exc)
            job.completed_at = datetime.now(UTC)
            db.add(job)
            db.commit()

    finally:
        db.close()


def get_queue_stats(db: Session) -> dict[str, Any]:
    """Return aggregate counts by status for monitoring."""
    from sqlalchemy import func, select

    rows = db.execute(
        select(ClassificationJob.status, func.count(ClassificationJob.id)).group_by(
            ClassificationJob.status
        )
    ).all()
    return dict(rows)
