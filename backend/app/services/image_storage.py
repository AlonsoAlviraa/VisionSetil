"""Hardened image upload: extension + magic-byte + size + dims + path-traversal (S4)."""

from __future__ import annotations

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


def read_image_dimensions(content: bytes, extension: str) -> tuple[int, int] | None:
    """Best-effort width/height without PIL. Returns None if unreadable."""
    ext = extension.lower().lstrip(".")
    try:
        if ext == "png" and len(content) >= 24 and content.startswith(b"\x89PNG\r\n\x1a\n"):
            w = int.from_bytes(content[16:20], "big")
            h = int.from_bytes(content[20:24], "big")
            return w, h
        if ext in ("jpg", "jpeg") and content.startswith(b"\xff\xd8"):
            i = 2
            while i + 9 < len(content):
                if content[i] != 0xFF:
                    i += 1
                    continue
                marker = content[i + 1]
                if marker in (0xD8, 0xD9):  # SOI / EOI
                    i += 2
                    continue
                if marker == 0x00:
                    i += 1
                    continue
                # SOF0–SOF3, SOF5–SOF7, SOF9–SOF11, SOF13–SOF15
                if marker in (
                    0xC0,
                    0xC1,
                    0xC2,
                    0xC3,
                    0xC5,
                    0xC6,
                    0xC7,
                    0xC9,
                    0xCA,
                    0xCB,
                    0xCD,
                    0xCE,
                    0xCF,
                ):
                    h = int.from_bytes(content[i + 5 : i + 7], "big")
                    w = int.from_bytes(content[i + 7 : i + 9], "big")
                    return w, h
                length = int.from_bytes(content[i + 2 : i + 4], "big")
                if length < 2:
                    break
                i += 2 + length
        if ext == "webp" and content.startswith(b"RIFF") and b"WEBP" in content[:16]:
            # VP8X or VP8 chunk
            if b"VP8X" in content[:40] and len(content) >= 30:
                # canvas size is 24-bit little-endian at offset after chunk header
                idx = content.find(b"VP8X")
                if idx != -1 and idx + 14 < len(content):
                    w = 1 + int.from_bytes(content[idx + 8 : idx + 11], "little")
                    h = 1 + int.from_bytes(content[idx + 11 : idx + 14], "little")
                    return w, h
    except Exception:  # noqa: BLE001 — best-effort only
        return None
    return None


def validate_image_dimensions(content: bytes, extension: str) -> None:
    """Reject images exceeding MAX_IMAGE_DIMENSION (when dimensions parse)."""
    max_dim = int(getattr(settings, "max_image_dimension", 4096) or 4096)
    dims = read_image_dimensions(content, extension)
    if dims is None:
        return
    w, h = dims
    # Incomplete / stub PNGs may report 0 — treat as unreadable, not hard fail
    if w <= 0 or h <= 0:
        return
    if w > max_dim or h > max_dim:
        raise HTTPException(
            status_code=400,
            detail=f"Image dimensions {w}x{h} exceed maximum {max_dim}px",
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

    max_count = int(getattr(settings, "max_images_per_request", 10) or 10)
    if len(images) > max_count:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {max_count} images per request",
        )

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
        validate_image_dimensions(content, extension)

        safe_name = f"{observation.id}-{uuid4().hex}.{extension}"
        target = _safe_target_path(safe_name)
        target.write_bytes(content)

        lowered = original_name.lower()
        view_type = _guess_view_type(lowered)
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
