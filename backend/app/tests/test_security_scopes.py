"""S4: API key scopes + path rules (pure + middleware)."""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.security_scopes import (
    parse_api_key_entry,
    required_scope_for_path,
    scopes_imply,
)
from app.middleware.api_key_auth import APIKeyMiddleware


def test_parse_key_org_scopes():
    p = parse_api_key_entry("vs_a:acme:classify+review")
    assert p is not None
    assert p.key == "vs_a"
    assert p.organization_id == "acme"
    assert "classify" in p.scopes
    assert "review" in p.scopes


def test_parse_admin_implies_all():
    p = parse_api_key_entry("vs_b:org:admin")
    assert p is not None
    assert scopes_imply(p.scopes, "classify")
    assert scopes_imply(p.scopes, "review")


def test_required_scope_paths():
    assert required_scope_for_path("/classify") == "classify"
    assert required_scope_for_path("/human-reviews/1") == "review"
    assert required_scope_for_path("/metrics") == "admin"
    assert required_scope_for_path("/health") is None


def test_middleware_rejects_missing_review_scope(monkeypatch):
    monkeypatch.setenv("API_KEYS", "vs_only_classify:default:classify")

    app = FastAPI()
    app.add_middleware(APIKeyMiddleware)

    @app.get("/human-reviews")
    async def reviews():
        return {"ok": True}

    @app.post("/classify")
    async def classify():
        return {"ok": True}

    client = TestClient(app)

    # classify ok
    r = client.post("/classify", headers={"X-API-Key": "vs_only_classify"})
    assert r.status_code == 200

    # review forbidden
    r = client.get("/human-reviews", headers={"X-API-Key": "vs_only_classify"})
    assert r.status_code == 403
    assert r.json()["error"] == "insufficient_scope"


def test_middleware_admin_key_passes_review(monkeypatch):
    monkeypatch.setenv("API_KEYS", "vs_admin:default:admin")

    app = FastAPI()
    app.add_middleware(APIKeyMiddleware)

    @app.get("/human-reviews")
    async def reviews():
        return {"ok": True}

    client = TestClient(app)
    r = client.get("/human-reviews", headers={"X-API-Key": "vs_admin"})
    assert r.status_code == 200
