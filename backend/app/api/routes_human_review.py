from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps_auth import get_reviewer_user
from app.db.database import get_db
from app.db.models import HumanReviewRequest, Observation, User
from app.db.schemas import (
    HumanReviewRequestCreate,
    HumanReviewRequestRead,
    HumanReviewRequestUpdate,
)

router = APIRouter()


def check_safety_policy(notes: str | None, taxon: str | None):
    forbidden = [
        "safe_to_eat",
        "safe to eat",
        "comestible",
        "seguro para comer",
        "segura",
        "no es venenosa",
        "se puede comer",
        "comible",
    ]
    for text in (notes, taxon):
        if text:
            for word in forbidden:
                if word in text.lower():
                    raise HTTPException(
                        status_code=400,
                        detail="Safety policy violation: Reviewers are strictly forbidden from marking mushrooms as safe to eat.",
                    )


@router.post(
    "/observations/{observation_id}/request-human-review",
    response_model=HumanReviewRequestRead,
    status_code=201,
)
def request_human_review(
    observation_id: int, payload: HumanReviewRequestCreate, db: Session = Depends(get_db)
) -> HumanReviewRequest:
    observation = db.get(Observation, observation_id)
    if observation is None:
        raise HTTPException(status_code=404, detail="Observation not found")

    # Check if a pending/in_review request already exists
    existing = db.scalars(
        select(HumanReviewRequest)
        .where(HumanReviewRequest.observation_id == observation_id)
        .where(HumanReviewRequest.status.in_(["pending", "in_review"]))
    ).first()
    if existing is not None:
        return existing

    request = HumanReviewRequest(
        observation_id=observation_id,
        priority=payload.priority,
        reason=payload.reason,
        status="pending",
    )
    db.add(request)
    db.commit()
    db.refresh(request)
    return request


@router.get("/human-reviews", response_model=list[HumanReviewRequestRead])
def list_human_reviews(
    status: str | None = None,
    priority: str | None = None,
    assigned_to: str | None = None,
    limit: int = Query(default=100, le=500),
    offset: int = 0,
    db: Session = Depends(get_db),
    _reviewer: User = Depends(get_reviewer_user),
) -> list[HumanReviewRequest]:
    """List human review requests (E-05: reviewer/admin only)."""
    stmt = select(HumanReviewRequest)
    if status:
        stmt = stmt.where(HumanReviewRequest.status == status)
    if priority:
        stmt = stmt.where(HumanReviewRequest.priority == priority)
    if assigned_to:
        stmt = stmt.where(HumanReviewRequest.assigned_to == assigned_to)
    stmt = stmt.order_by(HumanReviewRequest.created_at.desc()).limit(limit).offset(offset)
    return list(db.scalars(stmt))


@router.get("/human-reviews/{review_id}", response_model=HumanReviewRequestRead)
def get_human_review(
    review_id: int,
    db: Session = Depends(get_db),
    _reviewer: User = Depends(get_reviewer_user),
) -> HumanReviewRequest:
    request = db.get(HumanReviewRequest, review_id)
    if request is None:
        raise HTTPException(status_code=404, detail="Human review request not found")
    return request


@router.patch("/human-reviews/{review_id}", response_model=HumanReviewRequestRead)
def update_human_review(
    review_id: int,
    payload: HumanReviewRequestUpdate,
    db: Session = Depends(get_db),
    _reviewer: User = Depends(get_reviewer_user),
) -> HumanReviewRequest:
    request = db.get(HumanReviewRequest, review_id)
    if request is None:
        raise HTTPException(status_code=404, detail="Human review request not found")

    check_safety_policy(payload.reviewer_notes, payload.reviewer_taxon)

    if payload.status is not None:
        request.status = payload.status
        if payload.status in ("resolved", "rejected"):
            request.resolved_at = datetime.now(UTC)
    if payload.reviewer_notes is not None:
        request.reviewer_notes = payload.reviewer_notes
    if payload.reviewer_taxon is not None:
        request.reviewer_taxon = payload.reviewer_taxon
    if payload.reviewer_confidence is not None:
        request.reviewer_confidence = payload.reviewer_confidence
    if payload.assigned_to is not None:
        request.assigned_to = payload.assigned_to

    db.add(request)
    db.commit()
    db.refresh(request)
    return request


# ─── MO-6: Batch assignment, statistics, and export ────────────────────────────


class BatchAssignRequest(BaseModel):
    """Pydantic model for batch assignment of review requests."""

    review_ids: list[int]
    assigned_to: str


class BatchAssignResponse(BaseModel):
    assigned_count: int
    skipped_ids: list[int]


@router.post("/human-reviews/batch-assign", response_model=BatchAssignResponse)
def batch_assign_reviews(
    payload: BatchAssignRequest,
    db: Session = Depends(get_db),
    _reviewer: User = Depends(get_reviewer_user),
) -> dict[str, Any]:
    """Assign multiple review requests to a single reviewer (E-05: reviewer only)."""
    assigned_count = 0
    skipped_ids: list[int] = []
    for rid in payload.review_ids:
        request = db.get(HumanReviewRequest, rid)
        if request is None:
            skipped_ids.append(rid)
            continue
        if request.status in ("resolved", "rejected"):
            skipped_ids.append(rid)
            continue
        request.assigned_to = payload.assigned_to
        if request.status == "pending":
            request.status = "in_review"
        db.add(request)
        assigned_count += 1
    db.commit()
    return {"assigned_count": assigned_count, "skipped_ids": skipped_ids}


@router.get("/human-reviews/stats/summary")
def get_review_stats(
    db: Session = Depends(get_db),
    _reviewer: User = Depends(get_reviewer_user),
) -> dict[str, Any]:
    """Aggregate statistics about the review queue (E-05: reviewer only)."""
    total = db.scalar(select(func.count(HumanReviewRequest.id)))
    by_status = dict(
        db.execute(
            select(HumanReviewRequest.status, func.count(HumanReviewRequest.id)).group_by(
                HumanReviewRequest.status
            )
        ).all()
    )
    by_priority = dict(
        db.execute(
            select(HumanReviewRequest.priority, func.count(HumanReviewRequest.id)).group_by(
                HumanReviewRequest.priority
            )
        ).all()
    )
    # Reviews resolved in the last 7 days
    cutoff = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = cutoff - timedelta(days=7)
    resolved_this_week = db.scalar(
        select(func.count(HumanReviewRequest.id)).where(
            HumanReviewRequest.status.in_(["resolved", "rejected"]),
            HumanReviewRequest.resolved_at >= week_ago,
        )
    )
    # Unique reviewers
    reviewers = db.scalars(
        select(HumanReviewRequest.assigned_to)
        .where(HumanReviewRequest.assigned_to.isnot(None))
        .distinct()
    ).all()
    return {
        "total": total or 0,
        "by_status": by_status,
        "by_priority": by_priority,
        "resolved_this_week": resolved_this_week or 0,
        "active_reviewers": list(reviewers),
    }


@router.get("/human-reviews/export/json")
def export_reviews_json(
    status: str | None = None,
    db: Session = Depends(get_db),
    _reviewer: User = Depends(get_reviewer_user),
) -> list[dict[str, Any]]:
    """Export review requests as JSON (E-05: reviewer only)."""
    stmt = select(HumanReviewRequest)
    if status:
        stmt = stmt.where(HumanReviewRequest.status == status)
    stmt = stmt.order_by(HumanReviewRequest.created_at.desc())
    reviews = list(db.scalars(stmt))
    return [
        {
            "id": r.id,
            "observation_id": r.observation_id,
            "status": r.status,
            "priority": r.priority,
            "reason": r.reason,
            "assigned_to": r.assigned_to,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None,
            "reviewer_notes": r.reviewer_notes,
            "reviewer_taxon": r.reviewer_taxon,
            "reviewer_confidence": r.reviewer_confidence,
        }
        for r in reviews
    ]
