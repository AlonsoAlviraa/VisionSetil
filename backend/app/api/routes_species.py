from fastapi import APIRouter

from app.services.species_catalog import list_poisonous_species

router = APIRouter()


@router.get("/species/poisonous")
def poisonous_species() -> list[dict]:
    return list_poisonous_species()
