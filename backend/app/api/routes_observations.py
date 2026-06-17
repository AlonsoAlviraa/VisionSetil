from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db.database import get_db
from app.db.models import Observation
from app.db.schemas import ObservationCreate, ObservationRead

router = APIRouter()


@router.get("/observations", response_model=list[ObservationRead])
def list_observations(db: Session = Depends(get_db)) -> list[Observation]:
    stmt = select(Observation).options(selectinload(Observation.images)).order_by(Observation.created_at.desc())
    return list(db.scalars(stmt))


@router.post("/observations", response_model=ObservationRead, status_code=201)
def create_observation(payload: ObservationCreate, db: Session = Depends(get_db)) -> Observation:
    observation = Observation(**payload.model_dump())
    db.add(observation)
    db.commit()
    db.refresh(observation)
    return observation
