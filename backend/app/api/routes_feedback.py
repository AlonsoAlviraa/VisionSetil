"""Feedback endpoint for user-reported classification correctness.

Enables active learning by letting users mark identifications as
correct/incorrect and optionally provide the true species.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services.feedback_logger import feedback_logger

router = APIRouter()
logger = logging.getLogger(__name__)


class FeedbackRequest(BaseModel):
    """User feedback on a classification result."""

    request_id: str = Field(..., description="Original request_id from classification")
    is_correct: bool = Field(..., description="Whether the top prediction was correct")
    corrected_species: str | None = Field(
        None, description="Correct species if the prediction was wrong"
    )
    notes: str | None = Field(None, description="Optional free-text notes")


class FeedbackResponse(BaseModel):
    """Acknowledgement of received feedback."""

    status: str
    received: bool


@router.post("/feedback", response_model=FeedbackResponse)
def submit_feedback(payload: FeedbackRequest) -> FeedbackResponse:
    """Submit user feedback for a prior classification.

    Logs the feedback alongside the original classification entry,
    enabling active learning and human review queue prioritization.
    """
    feedback_type = "correct" if payload.is_correct else "incorrect"
    try:
        feedback_logger.log_feedback(
            request_id=payload.request_id,
            feedback_type=feedback_type,
            correct_species=payload.corrected_species,
            notes=payload.notes,
        )
        logger.info(
            "feedback_received",
            extra={
                "request_id": payload.request_id,
                "feedback_type": feedback_type,
                "has_correction": payload.corrected_species is not None,
            },
        )
    except Exception as e:
        logger.warning(f"Failed to log feedback: {e}")
        return FeedbackResponse(status="error", received=False)

    return FeedbackResponse(status="ok", received=True)
