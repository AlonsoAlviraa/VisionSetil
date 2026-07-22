"""Auth routes: register, login, me, logout."""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps_auth import get_current_user
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

    model_config = {"from_attributes": True}


class AuthResponse(BaseModel):
    token: str
    token_type: str = "bearer"
    user: UserOut


def _bearer_token(request: Request) -> str | None:
    auth = request.headers.get("Authorization") or ""
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return request.headers.get("X-Session-Token")


@router.post("/register", response_model=AuthResponse, status_code=201)
def register(body: RegisterRequest, db: Session = Depends(get_db)) -> AuthResponse:
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
    return AuthResponse(token=session.token, user=UserOut.model_validate(user))


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    user = authenticate(db, email_or_username=body.login, password=body.password)
    if not user:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    session = create_session(db, user)
    return AuthResponse(token=session.token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(user)


@router.post("/logout")
def logout(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    token = _bearer_token(request)
    if token:
        revoke_token(db, token)
    return {"ok": True, "user_id": user.id}
