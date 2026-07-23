"""Auth routes: register, login, me, logout (+ E-08 optional HttpOnly cookie)."""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps_auth import cookie_name, extract_session_token, get_current_user
from app.core.config import get_settings, is_production_environment
from app.db.database import get_db
from app.db.models import User
from app.services.auth_service import authenticate, create_session, create_user, revoke_token

router = APIRouter(prefix="/auth", tags=["auth"])

_USERNAME_RE = re.compile(r"^[a-zA-Z0-9_\.\-]{3,32}$")


class RegisterRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=8, max_length=128)
    display_name: str | None = Field(default=None, max_length=120)


class LoginRequest(BaseModel):
    login: str = Field(min_length=3, max_length=255, description="Email or username")
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    id: int
    email: str
    username: str
    display_name: str
    role: str = "user"

    model_config = {"from_attributes": True}


class AuthResponse(BaseModel):
    token: str
    token_type: str = "bearer"
    user: UserOut
    # E-08: when cookie mode, token may be empty and auth_via=cookie
    auth_via: str = "bearer"


def _cookie_secure() -> bool:
    s = get_settings()
    forced = getattr(s, "auth_cookie_secure", None)
    if forced is not None:
        return bool(forced)
    return is_production_environment(s.environment)


def _cookie_samesite() -> str:
    s = get_settings()
    raw = (getattr(s, "auth_cookie_samesite", None) or "lax").strip().lower()
    if raw in {"lax", "strict", "none"}:
        return raw
    return "lax"


def _set_session_cookie(response: Response, raw_token: str) -> None:
    s = get_settings()
    if not getattr(s, "auth_cookie_enabled", False):
        return
    # Max-age aligns with session TTL (~7 days)
    max_age = 7 * 24 * 3600
    response.set_cookie(
        key=cookie_name(),
        value=raw_token,
        httponly=True,
        secure=_cookie_secure(),
        samesite=_cookie_samesite(),
        max_age=max_age,
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    s = get_settings()
    if not getattr(s, "auth_cookie_enabled", False):
        return
    response.delete_cookie(key=cookie_name(), path="/")


def _auth_response(user: User, raw_token: str, response: Response) -> AuthResponse:
    s = get_settings()
    cookies_on = bool(getattr(s, "auth_cookie_enabled", False))
    omit = bool(getattr(s, "auth_cookie_omit_token_body", True))
    if cookies_on:
        _set_session_cookie(response, raw_token)
        token_out = "" if omit else raw_token
        return AuthResponse(
            token=token_out,
            token_type="cookie" if omit else "bearer",
            user=UserOut.model_validate(user),
            auth_via="cookie",
        )
    return AuthResponse(
        token=raw_token,
        token_type="bearer",
        user=UserOut.model_validate(user),
        auth_via="bearer",
    )


@router.post("/register", response_model=AuthResponse, status_code=201)
def register(
    body: RegisterRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> AuthResponse:
    email = body.email.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Email inválido")
    if not _USERNAME_RE.match(body.username):
        raise HTTPException(
            status_code=400,
            detail="Username: 3-32 chars, letras/números/._-",
        )
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="Email ya registrado")
    if db.query(User).filter(User.username == body.username.strip()).first():
        raise HTTPException(status_code=409, detail="Username ya en uso")

    user = create_user(
        db,
        email=email,
        username=body.username.strip(),
        password=body.password,
        display_name=body.display_name,
    )
    session = create_session(db, user)
    return _auth_response(user, session.token, response)


@router.post("/login", response_model=AuthResponse)
def login(
    body: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> AuthResponse:
    user = authenticate(db, email_or_username=body.login, password=body.password)
    if not user:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    session = create_session(db, user)
    return _auth_response(user, session.token, response)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(user)


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    token = extract_session_token(request)
    if token:
        revoke_token(db, token)
    _clear_session_cookie(response)
    return {"ok": True, "user_id": user.id}
