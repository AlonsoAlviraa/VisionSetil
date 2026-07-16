"""Tests for SecurityHeadersMiddleware."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.middleware.security_headers import SecurityHeadersMiddleware


def _create_app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(SecurityHeadersMiddleware)

    @app.get("/test")
    async def test_endpoint():
        return {"status": "ok"}

    return app


class TestSecurityHeaders:
    """Verify all OWASP-recommended security headers are present."""

    def test_hsts_header_present(self):
        app = _create_app()
        client = TestClient(app)
        response = client.get("/test")
        assert "Strict-Transport-Security" in response.headers
        assert "max-age=63072000" in response.headers["Strict-Transport-Security"]
        assert "includeSubDomains" in response.headers["Strict-Transport-Security"]

    def test_content_type_options(self):
        app = _create_app()
        client = TestClient(app)
        response = client.get("/test")
        assert response.headers.get("X-Content-Type-Options") == "nosniff"

    def test_frame_options_denied(self):
        app = _create_app()
        client = TestClient(app)
        response = client.get("/test")
        assert response.headers.get("X-Frame-Options") == "DENY"

    def test_referrer_policy(self):
        app = _create_app()
        client = TestClient(app)
        response = client.get("/test")
        assert response.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"

    def test_csp_header_present(self):
        app = _create_app()
        client = TestClient(app)
        response = client.get("/test")
        csp = response.headers.get("Content-Security-Policy", "")
        assert "default-src 'self'" in csp
        assert "frame-ancestors 'none'" in csp

    def test_permissions_policy(self):
        app = _create_app()
        client = TestClient(app)
        response = client.get("/test")
        pp = response.headers.get("Permissions-Policy", "")
        assert "geolocation=()" in pp
        assert "camera=(self)" in pp

    def test_xss_protection(self):
        app = _create_app()
        client = TestClient(app)
        response = client.get("/test")
        assert response.headers.get("X-XSS-Protection") == "1; mode=block"

    def test_custom_csp_policy(self):
        app = FastAPI()
        app.add_middleware(SecurityHeadersMiddleware, csp_policy="default-src 'none'")
        client = TestClient(app)

        @app.get("/test")
        async def test_endpoint():
            return {"status": "ok"}

        response = client.get("/test")
        assert response.headers["Content-Security-Policy"] == "default-src 'none'"

    def test_custom_hsts_config(self):
        app = FastAPI()
        app.add_middleware(
            SecurityHeadersMiddleware,
            hsts_max_age=3600,
            hsts_include_subdomains=False,
        )
        client = TestClient(app)

        @app.get("/test")
        async def test_endpoint():
            return {"status": "ok"}

        response = client.get("/test")
        hsts = response.headers["Strict-Transport-Security"]
        assert "max-age=3600" in hsts
        assert "includeSubDomains" not in hsts

    def test_all_headers_via_main_app(self):
        """Verify security headers are present on the real app."""
        from app.main import app

        client = TestClient(app)
        response = client.get("/health")
        assert response.headers.get("X-Content-Type-Options") == "nosniff"
        assert response.headers.get("X-Frame-Options") == "DENY"
        assert "Content-Security-Policy" in response.headers
