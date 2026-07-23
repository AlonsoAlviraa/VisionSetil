"""Password hashing and session tokens (stdlib only).

E-07: session tokens are returned to the client once; only SHA-256 hash is
stored in the database so a DB leak does not yield usable bearer tokens.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.db.models import AuthSession, User

_PBKDF2_ITERS = 120_000
_TOKEN_BYTES = 32
_SESSION_DAYS = 7  # E-07: shorter TTL (was 14)


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


def hash_session_token(token: str) -> str:
    """SHA-256 hex digest of the raw bearer token (storage form)."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_user(
    db: Session,
    *,
    email: str,
    username: str,
    password: str,
    display_name: str | None = None,
    role: str = "user",
) -> User:
    user = User(
        email=email.strip().lower(),
        username=username.strip(),
        password_hash=hash_password(password),
        display_name=(display_name or username).strip(),
        role=(role or "user").strip().lower(),
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
    """Create a session; returns AuthSession whose ``token`` attribute holds the
    **raw** bearer for the HTTP response only. DB stores the hash.
    """
    raw = secrets.token_hex(_TOKEN_BYTES)
    session = AuthSession(
        user_id=user.id,
        token=hash_session_token(raw),
        expires_at=datetime.now(UTC) + timedelta(days=_SESSION_DAYS),
        revoked=False,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    # Expose raw token only on this instance for the response mapper
    session.token = raw  # type: ignore[assignment]
    return session


def get_user_by_token(db: Session, token: str | None) -> User | None:
    if not token:
        return None
    token = token.strip()
    if not token:
        return None
    token_hash = hash_session_token(token)
    # Support legacy plaintext tokens still in DB (pre E-07) for one deploy cycle
    session = (
        db.query(AuthSession)
        .filter(
            AuthSession.revoked.is_(False),
            (AuthSession.token == token_hash) | (AuthSession.token == token),
        )
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
    token = token.strip()
    token_hash = hash_session_token(token)
    session = (
        db.query(AuthSession)
        .filter((AuthSession.token == token_hash) | (AuthSession.token == token))
        .first()
    )
    if not session:
        return False
    session.revoked = True
    db.commit()
    return True
