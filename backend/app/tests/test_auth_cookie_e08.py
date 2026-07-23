"""E-08: HttpOnly session cookie opt-in."""

from __future__ import annotations

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.db.database import Base, get_db
from app.main import app


@pytest.fixture()
def cookie_client(tmp_path, monkeypatch) -> Generator[TestClient, None, None]:
    monkeypatch.setenv("AUTH_COOKIE_ENABLED", "true")
    monkeypatch.setenv("AUTH_COOKIE_OMIT_TOKEN_BODY", "true")
    monkeypatch.setenv("AUTH_COOKIE_SECURE", "false")
    get_settings.cache_clear()

    database_path = tmp_path / "cookie.db"
    engine = create_engine(
        f"sqlite:///{database_path}",
        connect_args={"check_same_thread": False},
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    def override_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()
    get_settings.cache_clear()


def test_login_sets_httponly_cookie(cookie_client: TestClient):
    reg = cookie_client.post(
        "/auth/register",
        json={
            "email": "cookie@test.local",
            "username": "cookieuser",
            "password": "password123",
        },
    )
    assert reg.status_code == 201, reg.text
    body = reg.json()
    assert body.get("auth_via") == "cookie"
    assert body.get("token") == ""
    assert body.get("token_type") == "cookie"
    assert "visionsetil_session" in cookie_client.cookies
    me = cookie_client.get("/auth/me")
    assert me.status_code == 200
    assert me.json()["username"] == "cookieuser"


def test_logout_clears_cookie(cookie_client: TestClient):
    cookie_client.post(
        "/auth/register",
        json={
            "email": "out@test.local",
            "username": "outuser",
            "password": "password123",
        },
    )
    assert "visionsetil_session" in cookie_client.cookies
    out = cookie_client.post("/auth/logout")
    assert out.status_code == 200
    # Client may still hold cookie jar entry; server session revoked
    me = cookie_client.get("/auth/me")
    assert me.status_code == 401


def test_bearer_still_works_when_cookies_off(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTH_COOKIE_ENABLED", "false")
    get_settings.cache_clear()

    database_path = tmp_path / "bearer.db"
    engine = create_engine(
        f"sqlite:///{database_path}",
        connect_args={"check_same_thread": False},
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    def override_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    try:
        with TestClient(app) as client:
            reg = client.post(
                "/auth/register",
                json={
                    "email": "bearer@test.local",
                    "username": "beareruser",
                    "password": "password123",
                },
            )
            assert reg.status_code == 201
            body = reg.json()
            assert body["auth_via"] == "bearer"
            assert len(body["token"]) == 64
            me = client.get(
                "/auth/me",
                headers={"Authorization": f"Bearer {body['token']}"},
            )
            assert me.status_code == 200
    finally:
        app.dependency_overrides.clear()
        get_settings.cache_clear()
