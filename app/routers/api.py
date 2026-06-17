from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.config import UPLOADS_DIR
from app.database import get_session
from app.models import DangerousSpecies, Observation, Photo
from app.schemas import ChatRequest, ChatResponse, DangerousSpeciesOut, ObservationOut
from app.services.chatbot import SAFETY_DISCLAIMER, answer_question
from app.services.classifier import build_classifier
from app.services.catalog import list_species
from app.services.providers import ClassificationInput

router = APIRouter(prefix="/api", tags=["api"])


@router.get("/health")
def healthcheck() -> dict:
    return {"status": "ok", "policy": "educational-only"}


@router.get("/species/dangerous", response_model=list[DangerousSpeciesOut])
def dangerous_species(session: Session = Depends(get_session)) -> list[DangerousSpecies]:
    return list_species(session)


@router.get("/observations", response_model=list[ObservationOut])
def all_observations(session: Session = Depends(get_session)) -> list[Observation]:
    stmt = select(Observation).options(selectinload(Observation.photos)).order_by(Observation.created_at.desc())
    return list(session.scalars(stmt))


@router.get("/observations/{observation_id}", response_model=ObservationOut)
def observation_detail(observation_id: int, session: Session = Depends(get_session)) -> Observation:
    stmt = (
        select(Observation)
        .where(Observation.id == observation_id)
        .options(selectinload(Observation.photos))
    )
    observation = session.scalar(stmt)
    if observation is None:
        raise HTTPException(status_code=404, detail="Observation not found")
    return observation


@router.post("/observations", response_model=ObservationOut, status_code=201)
async def create_observation(
    title: str = Form(...),
    location_name: str = Form(""),
    habitat: str = Form(""),
    observed_at: str = Form(""),
    notes: str = Form(""),
    cap_shape: str = Form(""),
    gill_color: str = Form(""),
    stem_features: str = Form(""),
    smell: str = Form(""),
    photos: list[UploadFile] = File(...),
    session: Session = Depends(get_session),
) -> Observation:
    if not photos:
        raise HTTPException(status_code=400, detail="At least one photo is required")

    parsed_observed_at = None
    if observed_at:
        parsed_observed_at = datetime.fromisoformat(observed_at)

    observation = Observation(
        title=title,
        location_name=location_name or None,
        habitat=habitat or None,
        observed_at=parsed_observed_at,
        notes=notes or None,
        cap_shape=cap_shape or None,
        gill_color=gill_color or None,
        stem_features=stem_features or None,
        smell=smell or None,
    )
    session.add(observation)
    session.flush()

    stored_names: list[str] = []
    for photo in photos:
        suffix = Path(photo.filename or "image.jpg").suffix or ".jpg"
        generated_name = f"{observation.id}-{uuid4().hex}{suffix}"
        target = UPLOADS_DIR / generated_name
        content = await photo.read()
        target.write_bytes(content)
        stored_names.append(photo.filename or generated_name)
        session.add(
            Photo(
                observation_id=observation.id,
                file_name=photo.filename or generated_name,
                stored_path=f"/uploads/{generated_name}",
                content_type=photo.content_type,
                size_bytes=len(content),
            )
        )

    classifier = build_classifier(session)
    result = classifier.classify(
        ClassificationInput(
            title=title,
            notes=notes,
            habitat=habitat,
            cap_shape=cap_shape,
            gill_color=gill_color,
            stem_features=stem_features,
            smell=smell,
            file_names=stored_names,
        )
    )
    observation.provider_name = result.provider_name
    observation.confidence = result.confidence
    observation.risk_level = result.risk_level
    observation.classifier_summary = {
        "headline": result.headline,
        "guidance": result.guidance,
        "dangerous_matches": result.dangerous_matches,
        "educational_notes": result.educational_notes,
        "safe_to_eat": False,
        "disclaimer": SAFETY_DISCLAIMER,
    }
    session.commit()

    stmt = (
        select(Observation)
        .where(Observation.id == observation.id)
        .options(selectinload(Observation.photos))
    )
    return session.scalar(stmt)


@router.post("/chat", response_model=ChatResponse)
def chat(payload: ChatRequest, session: Session = Depends(get_session)) -> ChatResponse:
    observation = None
    if payload.observation_id is not None:
        observation = session.get(Observation, payload.observation_id)
    return ChatResponse(
        answer=answer_question(payload.question, observation),
        disclaimer=SAFETY_DISCLAIMER,
    )
