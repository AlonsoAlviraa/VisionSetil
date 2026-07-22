"""Auth + community feed integration tests (real API paths)."""

from __future__ import annotations

import io

from fastapi.testclient import TestClient


def _register(client: TestClient, suffix: str = "a") -> dict:
    res = client.post(
        "/auth/register",
        json={
            "email": f"user{suffix}@example.com",
            "username": f"user_{suffix}",
            "password": "secretpass1",
            "display_name": f"User {suffix}",
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


def test_register_login_me_logout(client: TestClient):
    reg = _register(client, "auth1")
    token = reg["token"]
    assert reg["user"]["username"] == "user_auth1"

    login = client.post(
        "/auth/login",
        json={"login": "user_auth1", "password": "secretpass1"},
    )
    assert login.status_code == 200
    assert login.json()["token"]

    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "userauth1@example.com"
    assert me.json()["username"] == "user_auth1"

    bad = client.post("/auth/login", json={"login": "user_auth1", "password": "wrongpass1"})
    assert bad.status_code == 401

    out = client.post("/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert out.status_code == 200
    me2 = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me2.status_code == 401


def test_community_post_comment_and_r1_filter(client: TestClient):
    auth = _register(client, "comm1")
    headers = {"Authorization": f"Bearer {auth['token']}"}

    # Unauthenticated write blocked
    denied = client.post("/community/posts", data={"body": "hola"})
    assert denied.status_code == 401

    # Create text post
    post = client.post(
        "/community/posts",
        data={"body": "Encontré una Amanita — solo orientación, no consumo."},
        headers=headers,
    )
    assert post.status_code == 201, post.text
    data = post.json()
    assert data["orientation_only"] is True
    assert data["author"]["username"] == "user_comm1"
    post_id = data["id"]

    # Forbidden consumption language
    bad = client.post(
        "/community/posts",
        data={"body": "Esta es segura para comer sin duda"},
        headers=headers,
    )
    assert bad.status_code == 400

    # Comment
    c = client.post(
        f"/community/posts/{post_id}/comments",
        json={"body": "Cuidado con lookalikes mortales."},
        headers=headers,
    )
    assert c.status_code == 201, c.text
    assert "lookalikes" in c.json()["body"]

    # List feed public
    feed = client.get("/community/posts")
    assert feed.status_code == 200
    assert any(p["id"] == post_id for p in feed.json())
    listed = next(p for p in feed.json() if p["id"] == post_id)
    assert len(listed["comments"]) >= 1


def test_community_photo_upload(client: TestClient):
    auth = _register(client, "photo1")
    headers = {"Authorization": f"Bearer {auth['token']}"}
    # Minimal valid 1x1 PNG
    png = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00"
        b"\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    files = {"image": ("cap.png", io.BytesIO(png), "image/png")}
    res = client.post(
        "/community/posts",
        data={"body": "Foto de seta para orientación comunitaria"},
        files=files,
        headers=headers,
    )
    assert res.status_code == 201, res.text
    assert res.json()["image_url"]
    assert "/uploads/community/" in res.json()["image_url"]
