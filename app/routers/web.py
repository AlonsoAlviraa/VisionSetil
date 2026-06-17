from fastapi import APIRouter, Depends, Request
from fastapi.templating import Jinja2Templates
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.config import TEMPLATES_DIR
from app.database import get_session
from app.models import Observation
from app.services.catalog import list_species
from app.services.chatbot import SAFETY_DISCLAIMER

templates = Jinja2Templates(directory=str(TEMPLATES_DIR))
router = APIRouter(tags=["web"])


@router.get("/")
def home(request: Request, session: Session = Depends(get_session)):
    observations = list(
        session.scalars(
            select(Observation)
            .options(selectinload(Observation.photos))
            .order_by(Observation.created_at.desc())
            .limit(6)
        )
    )
    species = list_species(session)
    return templates.TemplateResponse(
        request,
        "index.html",
        {
            "observations": observations,
            "species": species,
            "safety_disclaimer": SAFETY_DISCLAIMER,
        },
    )
