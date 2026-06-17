from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.config import STATIC_DIR, UPLOADS_DIR
from app.database import SessionLocal
from app.routers.api import router as api_router
from app.routers.web import router as web_router
from app.seed import initialize_database


UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(_: FastAPI):
    session = SessionLocal()
    try:
        initialize_database(session)
    finally:
        session.close()
    yield


app = FastAPI(
    title="VisionSetil",
    summary="Orientacion educativa sobre setas con deteccion conservadora de riesgo.",
    lifespan=lifespan,
)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")
app.include_router(web_router)
app.include_router(api_router)
