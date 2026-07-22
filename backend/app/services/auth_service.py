"""Password hashing and session tokens (stdlib only)."""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.db.models import AuthSession, User

_PBKDF2_ITERS = 120_000
_TOKEN_BYTES = 32
_SESSION_DAYS = 14


def hash_password(password: str, salt: bytes | None = None) -> str:
    """Return ``salt_hex$hash_hex`` using PBKDF2-HMAC-SHA256."""
    if salt is None:
        salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PBKDF2_ITERS)
    return f"{salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, hash_hex = stored.split("$", 1)
        salt = bytes.fromhex(salt_hex)
    except (ValueError, TypeError):
        return False
    candidate = hash_password(password, salt=salt)
    return hmac.compare_digest(candidate, stored)


def create_user(
    db: Session,
    *,
    email: str,
    username: str,
    password: str,
    display_name: str | None = None,
) -> User:
    user = User(
        email=email.strip().lower(),
        username=username.strip(),
        password_hash=hash_password(password),
        display_name=(display_name or username).strip(),
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate(db: Session, *, email_or_username: str, password: str) -> User | None:
    key = email_or_username.strip().lower()
    user = (
        db.query(User)
        .filter((User.email == key) | (User.username == email_or_username.strip()))
        .first()
    )
    if not user or not user.is_active:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


def create_session(db: Session, user: User) -> AuthSession:
    token = secrets.token_hex(_TOKEN_BYTES)
    session = AuthSession(
        user_id=user.id,
        token=token,
        expires_at=datetime.now(UTC) + timedelta(days=_SESSION_DAYS),
        revoked=False,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_user_by_token(db: Session, token: str | None) -> User | None:
    if not token:
        return None
    token = token.strip()
    if not token:
        return None
    session = (
        db.query(AuthSession)
        .filter(AuthSession.token == token, AuthSession.revoked.is_(False))
        .first()
    )
    if not session:
        return None
    exp = session.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=UTC)
    if exp < datetime.now(UTC):
        return None
    user = db.query(User).filter(User.id == session.user_id, User.is_active.is_(True)).first()
    return user


def revoke_token(db: Session, token: str) -> bool:
    session = db.query(AuthSession).filter(AuthSession.token == token).first()
    if not session:
        return False
    session.revoked = True
    db.commit()
    return True
