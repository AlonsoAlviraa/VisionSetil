"""Hardened image upload: extension + magic-byte + size + path-traversal + EXIF strip."""

from __future__ import annotations

import io
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import Observation, ObservationImage

# https://en.wikipedia.org/wiki/List_of_file_signatures
_MAGIC_BYTES: dict[str, tuple[bytes, ...]] = {
    "jpg": (b"\xff\xd8\xff",),
    "jpeg": (b"\xff\xd8\xff",),
    "png": (b"\x89PNG\r\n\x1a\n",),
    "webp": (b"RIFF",),  # WEBP starts with RIFF....WEBP
}

# Maximum number of bytes inspected for the magic-number check.
_MAGIC_SNIFF_LEN = 16

# Canonical view taxonomy (D5b) + legacy storage labels.
_LEGACY_TO_CANONICAL = {
    "gills_or_pores": "gills",
    "cap_top": "front",
    "stem": "front",
    "environment": "habitat",
    "base": "detail",
    "cross_section": "detail",
}


def strip_exif(content: bytes, extension: str) -> bytes:
    """Remove EXIF / metadata for privacy (PR-03b). Falls back to original on failure."""
    import logging

    log = logging.getLogger(__name__)
    try:
        from PIL import Image

        im = Image.open(io.BytesIO(content))
        # Drop EXIF by re-encoding without exif= kw
        data = list(im.getdata())
        clean = Image.new(im.mode, im.size)
        clean.putdata(data)
        buf = io.BytesIO()
        ext = extension.lower()
        if ext in ("jpg", "jpeg"):
            if clean.mode in ("RGBA", "P"):
                clean = clean.convert("RGB")
            clean.save(buf, format="JPEG", quality=92, optimize=True)
        elif ext == "png":
            clean.save(buf, format="PNG", optimize=True)
        elif ext == "webp":
            if clean.mode == "P":
                clean = clean.convert("RGBA")
            clean.save(buf, format="WEBP", quality=90, method=4)
        else:
            return content
        out = buf.getvalue()
        return out if out else content
    except Exception as exc:  # noqa: BLE001
        log.warning("EXIF strip failed (%s); storing original bytes", exc.__class__.__name__)
        return content


def _validate_magic(extension: str, content: bytes) -> None:
    """Ensure the file content matches its declared extension."""
    signatures = _MAGIC_BYTES.get(extension)
    if signatures is None:  # unknown exts not in allow-list anyway
        return
    head = content[:_MAGIC_SNIFF_LEN]
    if extension == "webp":
        if not head.startswith(b"RIFF") or b"WEBP" not in content[:16]:
            raise HTTPException(status_code=415, detail="File content does not match WebP")
        return
    if not any(head.startswith(sig) for sig in signatures):
        raise HTTPException(
            status_code=415,
            detail=f"File content does not match extension '{extension}'",
        )


def _safe_target_path(stored_name: str) -> Path:
    """Return the absolute path inside UPLOAD_DIR, rejecting traversal attempts."""
    upload_root = settings.upload_dir.resolve()
    # stored_name is server-generated, but double-check defensively.
    candidate = (upload_root / stored_name).resolve()
    try:
        candidate.relative_to(upload_root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid file path") from exc
    if candidate == upload_root or not candidate.is_relative_to(upload_root):
        raise HTTPException(status_code=400, detail="Invalid file path")
    return candidate


async def store_observation_images(
    db: Session,
    observation: Observation,
    images: list[UploadFile],
) -> list[ObservationImage]:
    if not images:
        raise HTTPException(status_code=400, detail="At least one image is required")

    saved_images: list[ObservationImage] = []
    for upload in images:
        original_name = upload.filename or "image"
        # Reject obvious path-traversal in the *client-provided* filename.
        if "/" in original_name or "\\" in original_name or ".." in original_name:
            raise HTTPException(status_code=400, detail="Invalid filename")

        extension = Path(original_name).suffix.lower().lstrip(".")
        if extension not in settings.allowed_extensions:
            raise HTTPException(status_code=400, detail="Unsupported image extension")

        content = await upload.read()
        if len(content) > settings.max_upload_size_bytes:
            raise HTTPException(status_code=400, detail="Image exceeds maximum allowed size")
        if not content:
            raise HTTPException(status_code=400, detail="Empty image upload")

        _validate_magic(extension, content)

        # PR-03b: strip EXIF / GPS before write
        content = strip_exif(content, extension)
        # Re-validate magic after re-encode (format may stay same)
        try:
            _validate_magic(extension, content)
        except HTTPException:
            # If re-encode changed container unexpectedly, keep stripped best-effort
            pass

        safe_name = f"{observation.id}-{uuid4().hex}.{extension}"
        target = _safe_target_path(safe_name)
        target.write_bytes(content)

        lowered = original_name.lower()
        view_type = _guess_view_type_canonical(lowered)
        image = ObservationImage(
            observation_id=observation.id,
            original_name=original_name,
            stored_name=safe_name,
            stored_path=f"/uploads/{safe_name}",
            content_type=upload.content_type,
            size_bytes=len(content),
            view_type=view_type,
            crop_path=None,
            mask_path=None,
        )
        db.add(image)
        saved_images.append(image)

    db.commit()
    for item in saved_images:
        db.refresh(item)
    return saved_images


def _guess_view_type(name: str) -> str | None:
    """Legacy labels (kept for callers / tests). Prefer _guess_view_type_canonical."""
    if "top" in name or "cap" in name or "sombrero" in name:
        return "cap_top"
    if "gill" in name or "lamina" in name or "poro" in name:
        return "gills_or_pores"
    if "stem" in name or "pie" in name:
        return "stem"
    if "base" in name or "volva" in name:
        return "base"
    if "cut" in name or "section" in name or "corte" in name:
        return "cross_section"
    if "context" in name or "entorno" in name or "habitat" in name or "substrate" in name:
        return "environment"
    return None


def _guess_view_type_canonical(name: str) -> str | None:
    """Map filename heuristics to CANONICAL_VIEWS (D5b)."""
    # Explicit canonical tokens first
    if "gills" in name or "gill" in name or "lamina" in name or "poro" in name:
        return "gills"
    if "habitat" in name or "environment" in name or "entorno" in name or "substrate" in name or "context" in name:
        return "habitat"
    if "detail" in name or "base" in name or "volva" in name or "cut" in name or "section" in name or "corte" in name:
        return "detail"
    if "front" in name or "top" in name or "cap" in name or "sombrero" in name or "stem" in name or "pie" in name:
        return "front"
    legacy = _guess_view_type(name)
    if legacy is None:
        return None
    return _LEGACY_TO_CANONICAL.get(legacy, legacy)
