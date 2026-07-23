"""FastAPI dependencies for user session auth (bearer + optional E-08 cookie)."""

from __future__ import annotations

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.database import get_db
from app.db.models import User
from app.services.auth_service import get_user_by_token

SESSION_COOKIE_NAME = "visionsetil_session"


def cookie_name() -> str:
    s = get_settings()
    return (getattr(s, "auth_cookie_name", None) or SESSION_COOKIE_NAME).strip() or SESSION_COOKIE_NAME


def extract_session_token(request: Request) -> str | None:
    """Resolve session token: Authorization Bearer → X-Session-Token → cookie."""
    auth = request.headers.get("Authorization") or ""
    if auth.lower().startswith("bearer "):
        tok = auth[7:].strip()
        if tok:
            return tok
    header = request.headers.get("X-Session-Token")
    if header and header.strip():
        return header.strip()
    # E-08: HttpOnly cookie (only when enabled)
    s = get_settings()
    if getattr(s, "auth_cookie_enabled", False):
        raw = request.cookies.get(cookie_name())
        if raw and raw.strip():
            return raw.strip()
    return None


# Back-compat alias used by older call sites
def _extract_bearer(request: Request) -> str | None:
    return extract_session_token(request)


def get_current_user_optional(
    request: Request,
    db: Session = Depends(get_db),
) -> User | None:
    return get_user_by_token(db, extract_session_token(request))


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    user = get_user_by_token(db, extract_session_token(request))
    if not user:
        raise HTTPException(status_code=401, detail="Login requerido")
    return user


_REVIEWER_ROLES = frozenset({"reviewer", "admin"})


def get_reviewer_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    """E-05: require logged-in user with reviewer or admin role."""
    user = get_user_by_token(db, extract_session_token(request))
    if not user:
        raise HTTPException(status_code=401, detail="Login requerido")
    role = (getattr(user, "role", None) or "user").lower()
    if role not in _REVIEWER_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Se requiere rol reviewer o admin para la cola de revisión",
        )
    return user
