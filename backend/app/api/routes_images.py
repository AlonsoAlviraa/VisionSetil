from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import Observation
from app.db.schemas import ImageUploadResponse
from app.services.image_storage import store_observation_images

router = APIRouter()


@router.post("/observations/{observation_id}/images", response_model=ImageUploadResponse)
async def upload_images(
    observation_id: int,
    images: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
) -> ImageUploadResponse:
    observation = db.get(Observation, observation_id)
    if observation is None:
        raise HTTPException(status_code=404, detail="Observation not found")
    saved = await store_observation_images(db, observation, images)
    return ImageUploadResponse(
        observation_id=observation_id, uploaded_count=len(saved), images=saved
    )
