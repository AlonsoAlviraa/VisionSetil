"""Authenticated serving of user-uploaded files (E-06).

Replaces public StaticFiles mount on /uploads. Species media stays on /media
(public). Observation and community photos require a valid session **or**
API key (when keys enabled). Path traversal is rejected.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps_auth import get_current_user_optional
from app.core.config import settings
from app.db.database import get_db
from app.db.models import User
from app.middleware.api_key_auth import is_auth_enabled

router = APIRouter(tags=["uploads"])

_MIME = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}


def _safe_upload_path(rel: str) -> Path:
    root = settings.upload_dir.resolve()
    # Normalize and reject traversal
    cleaned = rel.replace("\\", "/").lstrip("/")
    if ".." in cleaned.split("/"):
        raise HTTPException(status_code=400, detail="Invalid path")
    candidate = (root / cleaned).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid path") from exc
    if not candidate.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return candidate


@router.get("/uploads/{file_path:path}")
def serve_upload(
    file_path: str,
    request: Request,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
) -> FileResponse:
    """Serve a file under upload_dir after auth check.

    - When API_KEYS is set: require valid API key (middleware) — already passed.
    - Always accept logged-in session users.
    - When auth is fully open (dev, no keys): still require a session **or**
      allow read if path is under community/ (soft) — default: require session
      when not using API keys to avoid world-readable field photos.

    Dev convenience: if neither keys nor session, allow only when
    ENVIRONMENT is development and file is under community/ or exists
    (local SPA). Production always needs session or keys.
    """
    from app.core.config import is_production_environment

    has_session = user is not None
    keys_on = is_auth_enabled()
    # APIKeyMiddleware already enforced key when enabled for non-public paths.
    # /uploads is not public, so keys_on ⇒ request already authorized.
    if keys_on or has_session:
        path = _safe_upload_path(file_path)
        return FileResponse(
            path,
            media_type=_MIME.get(path.suffix.lower(), "application/octet-stream"),
        )

    # Dev open mode without session: only community public-ish thumbs
    if not is_production_environment(settings.environment):
        if file_path.replace("\\", "/").startswith("community/"):
            path = _safe_upload_path(file_path)
            return FileResponse(
                path,
                media_type=_MIME.get(path.suffix.lower(), "application/octet-stream"),
            )

    raise HTTPException(status_code=401, detail="Login o API key requerido para /uploads")
