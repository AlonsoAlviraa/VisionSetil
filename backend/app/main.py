from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes_classification import router as classification_router
from app.api.routes_health import router as health_router
from app.api.routes_images import router as images_router
from app.api.routes_models import router as models_router
from app.api.routes_observations import router as observations_router
from app.api.routes_species import router as species_router
from app.api.routes_human_review import router as human_review_router
from app.core.config import settings
from app.db.database import Base, engine
from app.services.species_catalog import ensure_seed_data

settings.upload_dir.mkdir(parents=True, exist_ok=True)
Base.metadata.create_all(bind=engine)
ensure_seed_data()

app = FastAPI(title="mushroom-photo-id")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/uploads", StaticFiles(directory=str(settings.upload_dir)), name="uploads")
app.include_router(health_router)
app.include_router(observations_router)
app.include_router(images_router)
app.include_router(classification_router)
app.include_router(species_router)
app.include_router(models_router)
app.include_router(human_review_router)
