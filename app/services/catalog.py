import json
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DangerousSpecies


def load_species_seed(path: Path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))


def seed_species(session: Session, records: list[dict]) -> None:
    existing = session.scalar(select(DangerousSpecies.id))
    if existing is not None:
        return
    for item in records:
        session.add(DangerousSpecies(**item))
    session.commit()


def list_species(session: Session) -> list[DangerousSpecies]:
    stmt = select(DangerousSpecies).order_by(DangerousSpecies.risk_level, DangerousSpecies.common_name)
    return list(session.scalars(stmt))
