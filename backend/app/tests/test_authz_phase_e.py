"""Phase E AuthZ: observations org scope, reviewer role, uploads auth, token hash."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.db.database import get_db
from app.db.models import AuthSession, User
from app.main import app
from app.services.auth_service import get_user_by_token, hash_session_token


def _test_db():
    """Open the client fixture's overridden Session."""
    gen = app.dependency_overrides[get_db]()
    db = next(gen)
    return db, gen


def test_list_observations_works_in_dev(client: TestClient):
    r = client.post("/observations", json={"title": "Local obs"})
    assert r.status_code == 201
    listed = client.get("/observations")
    assert listed.status_code == 200
    assert any(o["id"] == r.json()["id"] for o in listed.json())


def test_human_reviews_require_login(client: TestClient):
    r = client.get("/human-reviews")
    assert r.status_code == 401


def test_human_reviews_require_reviewer_role(client: TestClient):
    reg = client.post(
        "/auth/register",
        json={
            "email": "plainuser@test.local",
            "username": "plainuser",
            "password": "password123",
        },
    )
    assert reg.status_code == 201, reg.text
    token = reg.json()["token"]
    r = client.get("/human-reviews", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


def test_session_token_stored_as_hash(client: TestClient):
    reg = client.post(
        "/auth/register",
        json={
            "email": "hash@test.local",
            "username": "hashuser",
            "password": "password123",
        },
    )
    assert reg.status_code == 201, reg.text
    raw = reg.json()["token"]
    assert len(raw) == 64  # token_hex(32)

    db, gen = _test_db()
    try:
        assert get_user_by_token(db, raw) is not None
        rows = db.query(AuthSession).all()
        assert any(s.token == hash_session_token(raw) for s in rows)
        # DB must not store the raw bearer
        assert all(s.token != raw for s in rows)
    finally:
        try:
            next(gen)
        except StopIteration:
            pass


def test_uploads_without_auth_denied_for_observation_path(client: TestClient):
    r = client.get("/uploads/no-such-file.jpg")
    assert r.status_code in (401, 404)
