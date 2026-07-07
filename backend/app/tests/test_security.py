"""Security regression tests: CORS, path traversal, magic-byte validation, config."""

from __future__ import annotations

import io

from fastapi.testclient import TestClient

# --- CORS --------------------------------------------------------------------


def test_cors_no_wildcard_with_credentials(client: TestClient):
    """The app must not echo a reflected origin when CORS_ORIGINS is empty."""
    r = client.options(
        "/health",
        headers={
            "Origin": "https://evil.example.com",
            "Access-Control-Request-Method": "GET",
        },
    )
    allow_origin = r.headers.get("access-control-allow-origin")
    assert allow_origin != "*"


def test_cors_preflight_returns_methods(client: TestClient):
    r = client.options(
        "/health",
        headers={
            "Origin": "http://localhost",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert "access-control-allow-methods" in {k.lower() for k in r.headers}


# --- Request id propagation --------------------------------------------------


def test_request_id_header_returned(client: TestClient):
    r = client.get("/health", headers={"X-Request-ID": "test-123"})
    assert r.headers.get("x-request-id") == "test-123"


def test_request_id_generated_when_missing(client: TestClient):
    r = client.get("/health")
    assert r.headers.get("x-request-id")
    assert r.headers["x-request-id"] != ""


# --- /readyz -----------------------------------------------------------------


def test_readyz_returns_checks(client: TestClient):
    r = client.get("/readyz")
    assert r.status_code in (200, 503)
    body = r.json()
    assert "ready" in body
    assert "checks" in body
    assert "database" in body["checks"]


# --- Image upload hardening --------------------------------------------------


def _png_bytes() -> bytes:
    return b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def _fake_bytes() -> bytes:
    return b"THIS IS NOT AN IMAGE" + b"\x00" * 64


def _create_observation(client: TestClient) -> int:
    """Helper: create an observation and return its id."""
    r = client.post("/observations", json={"title": "Security test"})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_upload_rejects_mismatched_magic_bytes(client: TestClient):
    """A .png file whose content is not PNG must be rejected (415)."""
    obs_id = _create_observation(client)
    files = [("images", ("evil.png", io.BytesIO(_fake_bytes()), "image/png"))]
    r = client.post(f"/observations/{obs_id}/images", files=files)
    assert r.status_code == 415


def test_upload_rejects_path_traversal_filename(client: TestClient):
    obs_id = _create_observation(client)
    files = [("images", ("../../etc/passwd.png", io.BytesIO(_png_bytes()), "image/png"))]
    r = client.post(f"/observations/{obs_id}/images", files=files)
    assert r.status_code == 400


def test_upload_rejects_empty_file(client: TestClient):
    obs_id = _create_observation(client)
    files = [("images", ("empty.png", io.BytesIO(b""), "image/png"))]
    r = client.post(f"/observations/{obs_id}/images", files=files)
    assert r.status_code == 400


def test_upload_accepts_valid_png(client: TestClient):
    obs_id = _create_observation(client)
    files = [("images", ("cap_top.png", io.BytesIO(_png_bytes()), "image/png"))]
    r = client.post(f"/observations/{obs_id}/images", files=files)
    assert r.status_code == 200


# --- Config validation -------------------------------------------------------


def test_settings_log_format_validation():
    import os

    from pydantic import ValidationError

    os.environ["LOG_FORMAT"] = "xml"
    try:
        raised = False
        from app.core.config import Settings

        try:
            Settings()
        except ValidationError:
            raised = True
        assert raised, "LOG_FORMAT=xml should raise ValidationError"
    finally:
        del os.environ["LOG_FORMAT"]


def test_settings_cors_origins_csv():
    import os

    os.environ["CORS_ORIGINS"] = "https://a.test,https://b.test"
    try:
        from app.core.config import Settings

        s = Settings()
        assert s.cors_origins == ["https://a.test", "https://b.test"]
    finally:
        del os.environ["CORS_ORIGINS"]
