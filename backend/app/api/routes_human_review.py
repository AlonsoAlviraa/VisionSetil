from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import Observation, HumanReviewRequest
from app.db.schemas import HumanReviewRequestCreate, HumanReviewRequestRead, HumanReviewRequestUpdate

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
        "comible"
    ]
    for text in (notes, taxon):
        if text:
            for word in forbidden:
                if word in text.lower():
                    raise HTTPException(
                        status_code=400,
                        detail="Safety policy violation: Reviewers are strictly forbidden from marking mushrooms as safe to eat."
                    )


@router.post("/observations/{observation_id}/request-human-review", response_model=HumanReviewRequestRead, status_code=201)
def request_human_review(
    observation_id: int,
    payload: HumanReviewRequestCreate,
    db: Session = Depends(get_db)
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
    db: Session = Depends(get_db)
) -> list[HumanReviewRequest]:
    stmt = select(HumanReviewRequest)
    if status:
        stmt = stmt.where(HumanReviewRequest.status == status)
    stmt = stmt.order_by(HumanReviewRequest.created_at.desc())
    return list(db.scalars(stmt))


@router.get("/human-reviews/{review_id}", response_model=HumanReviewRequestRead)
def get_human_review(
    review_id: int,
    db: Session = Depends(get_db)
) -> HumanReviewRequest:
    request = db.get(HumanReviewRequest, review_id)
    if request is None:
        raise HTTPException(status_code=404, detail="Human review request not found")
    return request


@router.patch("/human-reviews/{review_id}", response_model=HumanReviewRequestRead)
def update_human_review(
    review_id: int,
    payload: HumanReviewRequestUpdate,
    db: Session = Depends(get_db)
) -> HumanReviewRequest:
    request = db.get(HumanReviewRequest, review_id)
    if request is None:
        raise HTTPException(status_code=404, detail="Human review request not found")

    check_safety_policy(payload.reviewer_notes, payload.reviewer_taxon)

    if payload.status is not None:
        request.status = payload.status
        if payload.status in ("resolved", "rejected"):
            request.resolved_at = datetime.utcnow()
    if payload.reviewer_notes is not None:
        request.reviewer_notes = payload.reviewer_notes
    if payload.reviewer_taxon is not None:
        request.reviewer_taxon = payload.reviewer_taxon
    if payload.reviewer_confidence is not None:
        request.reviewer_confidence = payload.reviewer_confidence

    db.add(request)
    db.commit()
    db.refresh(request)
    return request
