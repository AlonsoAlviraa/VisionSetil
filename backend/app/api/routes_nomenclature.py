"""Nomenclature routes — Index Fungorum backbone (orientation names only)."""
from __future__ import annotations

from fastapi import APIRouter, Query

from app.services.index_fungorum import (
    attribution_block,
    is_alive,
    resolve_name,
    resolve_name_cached,
)

router = APIRouter(prefix="/nomenclature", tags=["nomenclature"])


@router.get("/attribution")
def nomenclature_attribution() -> dict:
    """Static attribution block for Index Fungorum (Kew)."""
    return {
        **attribution_block(),
        "product_unlock": False,
        "policy": "nomenclature_only_never_consumption",
    }


@router.get("/health")
def nomenclature_health() -> dict:
    alive = is_alive()
    return {
        "ok": alive,
        "provider": "index_fungorum",
        "alive": alive,
        "product_unlock": False,
        "attribution": attribution_block(),
    }


@router.get("/resolve")
def nomenclature_resolve(
    q: str = Query(..., min_length=2, max_length=120, description="Scientific name"),
    max_hits: int = Query(12, ge=1, le=40),
    cache: bool = Query(True, description="Use process-local cache"),
) -> dict:
    """
    Resolve a scientific name via Index Fungorum API.

    Never returns edibility. Does not overwrite product SSOT catalog names.
    """
    if cache:
        payload = resolve_name_cached(q.strip(), max_hits)
    else:
        payload = resolve_name(q.strip(), max_number=max_hits, include_synonyms=True)
    payload["product_unlock"] = False
    return payload
