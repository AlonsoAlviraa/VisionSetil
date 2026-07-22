"""Public species media routes (PR-03). Mounted at /media/* — no /api prefix."""

from __future__ import annotations

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse, Response

from app.services import species_media

router = APIRouter(prefix="/media", tags=["media"])


# Gallery routes MUST be registered before /species/{slug}/{variant}
# so "gallery" is not captured as a variant name.
@router.get("/species/{slug}/gallery")
def get_species_gallery(slug: str) -> JSONResponse:
    """JSON list of hero + gallery images for a species."""
    data = species_media.list_gallery(slug)
    return JSONResponse(
        content=data,
        headers={"Cache-Control": "public, max-age=300"},
    )


@router.get("/species/{slug}/gallery/{filename}")
def get_species_gallery_file(slug: str, filename: str) -> Response:
    return species_media.serve_gallery_file(slug, filename)


@router.get("/species/{slug}/{variant}")
def get_species_media(
    slug: str,
    variant: str,
    fallback: bool = Query(default=True),
    v: str | None = Query(default=None),
) -> Response:
    """Serve species WebP variant; catalog-joined placeholder when missing."""
    return species_media.serve_species_variant(slug, variant, fallback=fallback, v=v)


@router.get("/placeholder/{kind}")
def get_placeholder(kind: str) -> Response:
    return species_media.serve_placeholder(kind)


@router.get("/manifest")
def get_manifest() -> JSONResponse:
    data = species_media.load_full_manifest()
    return JSONResponse(
        content=data,
        headers={"Cache-Control": "public, max-age=300"},
    )


@router.get("/manifest/slim")
def get_slim_manifest() -> JSONResponse:
    data = species_media.load_slim_manifest()
    return JSONResponse(
        content=data,
        headers={"Cache-Control": "public, max-age=300"},
    )
