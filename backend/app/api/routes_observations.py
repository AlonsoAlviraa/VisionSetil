"""Observation CRUD — scoped by organization (E-04 AuthZ).

Anonymous dump of all observations is forbidden. When API keys are enabled,
list/get are scoped to ``request.state.organization_id``. When keys are off
(dev), list is still available for local SPA work but create stamps org=default.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db.database import get_db
from app.db.models import Observation
from app.db.schemas import ObservationCreate, ObservationRead
from app.middleware.api_key_auth import is_auth_enabled

router = APIRouter()


def _org_id(request: Request) -> str:
    return getattr(request.state, "organization_id", "default") or "default"


def _require_org_match(obs: Observation | None, org_id: str) -> Observation:
    if obs is None:
        raise HTTPException(status_code=404, detail="Observation not found")
    obs_org = getattr(obs, "organization_id", None) or "default"
    if is_auth_enabled() and obs_org != org_id:
        # Hide existence across tenants
        raise HTTPException(status_code=404, detail="Observation not found")
    return obs


@router.get("/observations", response_model=list[ObservationRead])
def list_observations(
    request: Request,
    db: Session = Depends(get_db),
) -> list[Observation]:
    """List observations for the caller's organization only (when API keys on)."""
    org_id = _org_id(request)
    stmt = (
        select(Observation)
        .options(selectinload(Observation.images))
        .order_by(Observation.created_at.desc())
    )
    if is_auth_enabled():
        stmt = stmt.where(Observation.organization_id == org_id)
    return list(db.scalars(stmt))


@router.get("/observations/{observation_id}", response_model=ObservationRead)
def get_observation(
    observation_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> Observation:
    obs = db.get(Observation, observation_id)
    return _require_org_match(obs, _org_id(request))


@router.post("/observations", response_model=ObservationRead, status_code=201)
def create_observation(
    payload: ObservationCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> Observation:
    data = payload.model_dump()
    # Stamp multi-tenant org from API key middleware (default when auth off)
    data["organization_id"] = _org_id(request)
    observation = Observation(**data)
    db.add(observation)
    db.commit()
    db.refresh(observation)
    return observation
