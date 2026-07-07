"""FastAPI application entrypoint for VisionSetil."""

from __future__ import annotations

import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.routes_classification import router as classification_router
from app.api.routes_health import router as health_router
from app.api.routes_human_review import router as human_review_router
from app.api.routes_images import router as images_router
from app.api.routes_models import router as models_router
from app.api.routes_observations import router as observations_router
from app.api.routes_species import router as species_router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.database import Base, engine
from app.services.species_catalog import ensure_seed_data

settings = get_settings()
configure_logging(level=settings.log_level, fmt=settings.log_format)

settings.upload_dir.mkdir(parents=True, exist_ok=True)
Base.metadata.create_all(bind=engine)
ensure_seed_data()

app = FastAPI(title="mushroom-photo-id")


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Propagate a correlation id to logs and responses."""

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get(settings.request_id_header) or str(uuid.uuid4())
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers[settings.request_id_header] = request_id
        return response


app.add_middleware(RequestIDMiddleware)

# CORS: never combine the wildcard origin with credentials.
_cors_origins = list(settings.cors_origins)
_allow_credentials = "*" not in _cors_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_allow_credentials,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
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
