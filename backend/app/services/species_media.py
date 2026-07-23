"""Species media resolution with catalog-risk placeholders (PR-03, D1b)."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from fastapi import HTTPException
from fastapi.responses import FileResponse, RedirectResponse, Response

from app.core.config import settings
from app.services.unified_catalog import (
    get_by_slug,
    is_valid_slug,
    risk_to_placeholder_kind,
)

VARIANTS = frozenset({"thumb", "card", "detail", "lqip"})
PLACEHOLDER_KINDS = frozenset({"default", "toxic", "deadly", "unknown"})

# Stub size floors (Phase C / D-C1) — keep in sync with scripts/audit_media.py
# and frontend/vite.config.ts MIN_BYTES_BY_VARIANT.
MIN_BYTES_BY_VARIANT: dict[str, int] = {
    "card": 8192,
    "thumb": 1500,
    "detail": 15000,
    "lqip": 200,
}

# Minimal 1x1 PNG used as last-resort inline body if placeholders missing on disk.
_MIN_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0"
    b"\x00\x00\x00\x03\x00\x01\x00\x05\xfe\xd4\xef\x00\x00\x00\x00IEND\xaeB`\x82"
)


def media_root() -> Path:
    return Path(settings.species_media_root).resolve()


def _safe_under(root: Path, *parts: str) -> Path:
    candidate = (root.joinpath(*parts)).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid media path") from exc
    return candidate


def _cdn_allowed_host() -> str | None:
    base = (settings.species_media_cdn_base or "").strip()
    if not base:
        return None
    parsed = urlparse(base if "://" in base else f"https://{base}")
    host = parsed.hostname
    if not host:
        raise RuntimeError("SPECIES_MEDIA_CDN_BASE host invalid")
    return host.lower()


def validate_cdn_config_at_boot() -> None:
    """Call from app startup — raises if CDN base is malformed."""
    try:
        _cdn_allowed_host()
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"Invalid SPECIES_MEDIA_CDN_BASE: {exc}") from exc


@lru_cache(maxsize=4)
def load_slim_manifest() -> dict[str, Any]:
    path = media_root() / "manifests" / "species_images_slim_v1.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {"version": 1, "species": {}, "count": 0}


@lru_cache(maxsize=2)
def load_full_manifest() -> dict[str, Any]:
    path = media_root() / "manifests" / "species_images_v1.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {"version": 1, "species": {}, "count": 0}


def placeholder_path(kind: str) -> Path:
    if kind not in PLACEHOLDER_KINDS:
        kind = "default"
    root = media_root()
    for name in (f"{kind}.webp", f"{kind}.png"):
        p = _safe_under(root, "placeholders", name)
        if p.exists():
            return p
    # fallback default
    for name in ("default.webp", "default.png"):
        p = _safe_under(root, "placeholders", name)
        if p.exists():
            return p
    raise FileNotFoundError("placeholders missing")


def species_variant_path(slug: str, variant: str) -> Path | None:
    root = media_root()
    for ext in (".webp", ".png"):
        p = _safe_under(root, "species", slug, f"{variant}{ext}")
        if p.exists() and p.is_file():
            return p
    return None


def resolve_placeholder_kind_for_slug(slug: str) -> str:
    rec = get_by_slug(slug)
    if not rec:
        return "unknown"
    return risk_to_placeholder_kind(rec.get("risk_level"), rec.get("edibility_code"))


def _file_response(
    path: Path,
    cache_seconds: int = 604800,
    *,
    quality: str | None = None,
) -> FileResponse:
    media_type = "image/webp" if path.suffix.lower() == ".webp" else "image/png"
    headers: dict[str, str] = {
        "Cache-Control": f"public, max-age={cache_seconds}",
    }
    if quality:
        headers["X-Media-Quality"] = quality
    return FileResponse(path, media_type=media_type, headers=headers)


def is_stub_asset(path: Path | None, variant: str) -> bool:
    """True if file is missing, tiny (below MIN floor), or non-file."""
    if path is None or not path.exists() or not path.is_file():
        return True
    floor = MIN_BYTES_BY_VARIANT.get(variant, 0)
    if floor and path.stat().st_size < floor:
        return True
    return False


def _sibling_variants(variant: str) -> list[str]:
    """Prefer usable sibling when requested variant is stub (thumb→card etc.)."""
    if variant == "thumb":
        return ["card", "detail"]
    if variant == "lqip":
        return ["thumb", "card"]
    if variant == "detail":
        return ["card"]
    if variant == "card":
        return ["detail", "thumb"]
    return []


def serve_species_variant(
    slug: str,
    variant: str,
    *,
    fallback: bool = True,
    v: str | None = None,
) -> Response:
    if not is_valid_slug(slug):
        raise HTTPException(status_code=400, detail="Invalid slug")
    # strip extension if client passed card.webp
    variant = variant.replace(".webp", "").replace(".png", "")
    if variant not in VARIANTS:
        raise HTTPException(status_code=400, detail="Invalid variant")

    cdn_host = _cdn_allowed_host()
    if cdn_host and settings.species_media_cdn_base:
        base = settings.species_media_cdn_base.rstrip("/")
        url = f"{base}/species/{slug}/{variant}.webp"
        parsed = urlparse(url)
        if parsed.hostname and parsed.hostname.lower() == cdn_host:
            # only redirect if we don't have local file? plan: optional redirect
            local = species_variant_path(slug, variant)
            if local is None and fallback:
                # still serve placeholder locally for reliability
                pass
            elif local is not None and settings.species_media_cdn_prefer_redirect:
                return RedirectResponse(url, status_code=302)

    path = species_variant_path(slug, variant)
    if path is not None and not is_stub_asset(path, variant):
        # MVP: coarse quality label (ok_* taxonomy needs meta resolve — Issue 5)
        return _file_response(
            path,
            cache_seconds=604800 if v else 86400,
            quality="ok",
        )

    # Issue 1: tiny/missing thumb (or other) → try non-stub sibling before placeholder
    for sib in _sibling_variants(variant):
        sib_path = species_variant_path(slug, sib)
        if sib_path is not None and not is_stub_asset(sib_path, sib):
            return _file_response(
                sib_path,
                cache_seconds=300,  # short: URL path still names original variant
                quality="sibling_fallback",
            )

    # Stub or missing
    if not fallback:
        raise HTTPException(status_code=404, detail="Media not found")

    kind = resolve_placeholder_kind_for_slug(slug)
    return serve_placeholder(kind, quality="stub_fallback", cache_seconds=300)


def serve_placeholder(
    kind: str,
    *,
    quality: str | None = None,
    cache_seconds: int = 86400 * 30,
) -> Response:
    # Accept optional .webp/.png suffix from FE URLs
    kind = kind.replace(".webp", "").replace(".png", "")
    if kind not in PLACEHOLDER_KINDS:
        kind = "default"
    try:
        path = placeholder_path(kind)
        return _file_response(
            path,
            cache_seconds=cache_seconds,
            quality=quality or "ok_procedural",
        )
    except FileNotFoundError:
        headers = {
            "Cache-Control": "public, max-age=3600",
            "X-Placeholder": kind,
        }
        if quality:
            headers["X-Media-Quality"] = quality
        return Response(
            content=_MIN_PNG,
            media_type="image/png",
            headers=headers,
        )


def load_species_meta(slug: str) -> dict[str, Any]:
    if not is_valid_slug(slug):
        return {}
    path = _safe_under(media_root(), "species", slug, "meta.json")
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def list_gallery(slug: str) -> dict[str, Any]:
    """Return gallery image URLs for a species (public prefix paths)."""
    if not is_valid_slug(slug):
        raise HTTPException(status_code=400, detail="Invalid slug")
    prefix = (settings.media_public_prefix or "/api/media").rstrip("/")
    meta = load_species_meta(slug)
    items: list[dict[str, Any]] = []

    # Always include hero variants as first logical item if card exists
    card = species_variant_path(slug, "card")
    detail = species_variant_path(slug, "detail")
    if card or detail:
        items.append(
            {
                "role": "hero",
                "url": f"{prefix}/species/{slug}/detail.webp",
                "thumb_url": f"{prefix}/species/{slug}/thumb.webp",
                "license": meta.get("license"),
                "attribution_text": meta.get("attribution_text"),
                "source": meta.get("source"),
            }
        )

    gallery_dir = _safe_under(media_root(), "species", slug, "gallery")
    if gallery_dir.exists() and gallery_dir.is_dir():
        files = sorted(
            [p for p in gallery_dir.iterdir() if p.suffix.lower() in (".webp", ".png", ".jpg", ".jpeg")]
        )
        meta_gallery = meta.get("gallery") or []
        for i, p in enumerate(files):
            extra = meta_gallery[i] if i < len(meta_gallery) and isinstance(meta_gallery[i], dict) else {}
            items.append(
                {
                    "role": "gallery",
                    "url": f"{prefix}/species/{slug}/gallery/{p.name}",
                    "thumb_url": f"{prefix}/species/{slug}/gallery/{p.name}",
                    "file": f"gallery/{p.name}",
                    "license": extra.get("license") or meta.get("license"),
                    "attribution_text": extra.get("attribution_text") or meta.get("attribution_text"),
                    "source": meta.get("source"),
                }
            )

    return {
        "slug": slug,
        "count": len(items),
        "items": items,
        "meta": {
            "license": meta.get("license"),
            "creator": meta.get("creator"),
            "attribution_text": meta.get("attribution_text"),
            "source": meta.get("source"),
            "source_url": meta.get("source_url"),
        },
    }


def serve_gallery_file(slug: str, filename: str) -> Response:
    if not is_valid_slug(slug):
        raise HTTPException(status_code=400, detail="Invalid slug")
    # only basename, no path traversal
    name = Path(filename).name
    if not name or name != filename.replace("\\", "/").split("/")[-1]:
        raise HTTPException(status_code=400, detail="Invalid filename")
    if not re_match_gallery_name(name):
        raise HTTPException(status_code=400, detail="Invalid gallery filename")
    path = _safe_under(media_root(), "species", slug, "gallery", name)
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="Gallery image not found")
    return _file_response(path, cache_seconds=604800)


def re_match_gallery_name(name: str) -> bool:
    import re

    return bool(re.fullmatch(r"[0-9]{2}\.(webp|png|jpg|jpeg)", name, flags=re.IGNORECASE))
