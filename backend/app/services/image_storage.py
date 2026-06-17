from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import Observation, ObservationImage


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
        extension = Path(original_name).suffix.lower().lstrip(".")
        if extension not in settings.allowed_extensions:
            raise HTTPException(status_code=400, detail="Unsupported image extension")

        content = await upload.read()
        if len(content) > settings.max_upload_size_bytes:
            raise HTTPException(status_code=400, detail="Image exceeds maximum allowed size")

        safe_name = f"{observation.id}-{uuid4().hex}.{extension}"
        target = settings.upload_dir / safe_name
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
