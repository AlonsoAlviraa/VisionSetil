"""FastAPI dependencies for user session auth."""

from __future__ import annotations

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import User
from app.services.auth_service import get_user_by_token


def _extract_bearer(request: Request) -> str | None:
    auth = request.headers.get("Authorization") or ""
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    # Also accept X-Session-Token for simple clients
    return request.headers.get("X-Session-Token")


def get_current_user_optional(
    request: Request,
    db: Session = Depends(get_db),
) -> User | None:
    return get_user_by_token(db, _extract_bearer(request))


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    user = get_user_by_token(db, _extract_bearer(request))
    if not user:
        raise HTTPException(status_code=401, detail="Login requerido")
    return user


_REVIEWER_ROLES = frozenset({"reviewer", "admin"})


def get_reviewer_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    """E-05: require logged-in user with reviewer or admin role."""
    user = get_user_by_token(db, _extract_bearer(request))
    if not user:
        raise HTTPException(status_code=401, detail="Login requerido")
    role = (getattr(user, "role", None) or "user").lower()
    if role not in _REVIEWER_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Se requiere rol reviewer o admin para la cola de revisión",
        )
    return user
