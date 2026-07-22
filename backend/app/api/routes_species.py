from fastapi import APIRouter, HTTPException, Query

from app.services.species_catalog import (
    get_species_by_slug,
    list_expanded_species,
    list_expanded_species_catalog,
    list_poisonous_species,
)

router = APIRouter()


@router.get("/species/poisonous")
def poisonous_species() -> list[dict]:
    return list_poisonous_species()


@router.get("/species")
def species_list(
    q: str | None = Query(default=None, description="Search taxon / common name / family"),
    risk_label: str | None = Query(default=None, description="Filter by risk_label"),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> dict:
    """Expanded risk-first species catalog (orientation only)."""
    meta = list_expanded_species_catalog()
    items = list_expanded_species(q=q, risk_label=risk_label, limit=limit, offset=offset)
    return {
        "count": meta.get("count"),
        "policy": meta.get("policy"),
        "version": meta.get("version"),
        "sources": meta.get("sources"),
        "limit": limit,
        "offset": offset,
        "results": items,
    }


@router.get("/species/{slug}")
def species_detail(slug: str) -> dict:
    row = get_species_by_slug(slug)
    if not row:
        raise HTTPException(status_code=404, detail="Species not found")
    return row
