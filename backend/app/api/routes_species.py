"""Species catalog API (PR-07a) — list, detail, poisonous, lookup."""

from __future__ import annotations

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse

from app.services import unified_catalog as catalog
from app.services.species_catalog import list_poisonous_species

router = APIRouter(tags=["species"])


def _locale_from_request(request: Request, locale: str | None) -> str | JSONResponse:
    """Query locale wins over Accept-Language; default es; invalid → 400."""
    if locale is not None and locale.strip() != "":
        try:
            return catalog.normalize_locale(locale)
        except ValueError:
            return JSONResponse(
                status_code=400,
                content={
                    "error": "invalid_locale",
                    "supported": list(catalog.SUPPORTED_LOCALES),
                },
            )
    accept = request.headers.get("accept-language") or ""
    if accept:
        # take first tag
        first = accept.split(",")[0].strip().split(";")[0]
        try:
            return catalog.normalize_locale(first)
        except ValueError:
            pass
    return catalog.DEFAULT_LOCALE


@router.get("/species")
def list_species(
    request: Request,
    q: str | None = Query(default=None),
    locale: str | None = Query(default=None),
    category: str | None = Query(default=None),
    risk_level: str | None = Query(default=None),
    edibility_code: str | None = Query(default=None),
    featured: bool | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
):
    loc = _locale_from_request(request, locale)
    if isinstance(loc, JSONResponse):
        return loc
    items, total = catalog.search_species(
        q=q,
        locale=loc,
        category=category,
        risk_level=risk_level,
        edibility_code=edibility_code,
        featured=featured,
        limit=limit,
        offset=offset,
    )
    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
        "catalog_version": catalog.catalog_version(),
        "locale": loc,
    }


@router.get("/species/poisonous")
def poisonous_species(request: Request, locale: str | None = Query(default=None)):
    """Legacy poisonous list enriched with catalog fields when available."""
    loc = _locale_from_request(request, locale)
    if isinstance(loc, JSONResponse):
        return loc
    base = list_poisonous_species()
    enriched = []
    for item in base:
        latin = item.get("latin_name") or item.get("scientific_name")
        rec = catalog.get_by_scientific_name(latin) if latin else None
        if rec:
            summary = catalog.localize_summary(rec, loc)
            enriched.append({**item, **summary, "latin_name": latin})
        else:
            enriched.append(item)
    return enriched


@router.get("/species/lookup")
def lookup_species(
    request: Request,
    scientific_name: str = Query(...),
    locale: str | None = Query(default=None),
):
    loc = _locale_from_request(request, locale)
    if isinstance(loc, JSONResponse):
        return loc
    rec = catalog.get_by_scientific_name(scientific_name)
    if not rec:
        return JSONResponse(
            status_code=404,
            content={"error": "species_not_found", "scientific_name": scientific_name},
        )
    return catalog.localize_detail(rec, loc)


@router.get("/species/by-scientific-name/{name:path}")
def get_by_scientific_name(
    name: str,
    request: Request,
    locale: str | None = Query(default=None),
):
    loc = _locale_from_request(request, locale)
    if isinstance(loc, JSONResponse):
        return loc
    rec = catalog.get_by_scientific_name(name)
    if not rec:
        return JSONResponse(
            status_code=404,
            content={"error": "species_not_found", "scientific_name": name},
        )
    return catalog.localize_detail(rec, loc)


@router.get("/species/{slug}")
def get_species(
    slug: str,
    request: Request,
    locale: str | None = Query(default=None),
):
    loc = _locale_from_request(request, locale)
    if isinstance(loc, JSONResponse):
        return loc
    if not catalog.is_valid_slug(slug):
        # maybe scientific name with spaces encoded differently
        rec = catalog.get_by_scientific_name(slug)
        if rec:
            return catalog.localize_detail(rec, loc)
        return JSONResponse(
            status_code=400,
            content={"error": "invalid_query", "message": "invalid slug"},
        )
    rec = catalog.get_by_slug(slug)
    if not rec:
        return JSONResponse(
            status_code=404,
            content={"error": "species_not_found", "slug": slug},
        )
    return catalog.localize_detail(rec, loc)
