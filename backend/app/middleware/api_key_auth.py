"""API Key authentication with org + scopes (Sprint N+2 + N+4 SC-4 + S4).

Supports two modes:
    1. DISABLED (default): no authentication required.
    2. ENABLED: requires a valid API key in the X-API-Key header.

API_KEYS formats (comma-separated)::

    vs_abc123
    vs_abc123:org_id
    vs_abc123:org_id:classify+review
    vs_abc123:org_id:admin

When auth is enabled, scoped routes require matching scope:
    classify → /classify, /jobs, /observations, /feedback
    review   → /human-reviews
    admin    → /metrics, /models (admin also implies all)
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from collections.abc import Awaitable, Callable

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.status import HTTP_401_UNAUTHORIZED, HTTP_403_FORBIDDEN

from app.core.security_scopes import (
    DEFAULT_SCOPES,
    ParsedApiKey,
    parse_api_key_entry,
    required_scope_for_path,
    scopes_imply,
)

# Paths that never require authentication
PUBLIC_PATHS = {
    "/health",
    "/healthz",
    "/readyz",
    "/models/status",
    "/models/discovery",
    "/models/training",
    "/models/data-sources",
    "/models/experiments",
    "/models/quality-gate",
    "/models/industrial-progress",
    "/docs",
    "/openapi.json",
    "/redoc",
    "/auth/register",
    "/auth/login",
    "/community/posts",
}

DEFAULT_ORG = "default"


def _parse_all_entries() -> list[ParsedApiKey]:
    raw = os.getenv("API_KEYS", "")
    out: list[ParsedApiKey] = []
    for entry in raw.split(","):
        parsed = parse_api_key_entry(entry, default_org=DEFAULT_ORG)
        if parsed:
            out.append(parsed)
    return out


def get_valid_api_keys() -> set[str]:
    """Load valid API key strings (key part only)."""
    return {p.key for p in _parse_all_entries()}


def get_key_org_map() -> dict[str, str]:
    """Return mapping of api_key → organization_id."""
    return {p.key: p.organization_id for p in _parse_all_entries()}


def get_key_scopes_map() -> dict[str, frozenset[str]]:
    """Return mapping of api_key → scopes."""
    return {p.key: p.scopes for p in _parse_all_entries()}


def hash_api_key(key: str) -> str:
    """Hash an API key with SHA-256 for secure storage/comparison."""
    return hashlib.sha256(key.encode()).hexdigest()


def generate_api_key(org_id: str | None = None) -> str:
    """Generate a new random API key with the vs_ prefix."""
    raw = f"vs_{secrets.token_urlsafe(32)}"
    if org_id:
        return f"{raw}:{org_id}"
    return raw


def is_auth_enabled() -> bool:
    """Check whether API key authentication is enabled."""
    return bool(get_valid_api_keys())


def validate_api_key(provided_key: str) -> bool:
    """Validate an API key using constant-time comparison."""
    if not provided_key:
        return False

    valid_keys = get_valid_api_keys()
    for valid_key in valid_keys:
        if hmac.compare_digest(provided_key, valid_key):
            return True

    provided_hash = hash_api_key(provided_key)
    for valid_key in valid_keys:
        if len(valid_key) == 64 and hmac.compare_digest(provided_hash, valid_key):
            return True

    return False


def resolve_organization(provided_key: str) -> str:
    """Resolve the organization ID for a given API key."""
    if not provided_key:
        return DEFAULT_ORG
    key_org = get_key_org_map()
    if provided_key in key_org:
        return key_org[provided_key]
    provided_hash = hash_api_key(provided_key)
    for stored_key, org in key_org.items():
        if len(stored_key) == 64 and hmac.compare_digest(provided_hash, stored_key):
            return org
    return DEFAULT_ORG


def resolve_scopes(provided_key: str) -> frozenset[str]:
    """Resolve scopes for a given API key."""
    if not provided_key:
        return DEFAULT_SCOPES
    scopes_map = get_key_scopes_map()
    if provided_key in scopes_map:
        return scopes_map[provided_key]
    provided_hash = hash_api_key(provided_key)
    for stored_key, scopes in scopes_map.items():
        if len(stored_key) == 64 and hmac.compare_digest(provided_hash, stored_key):
            return scopes
    return DEFAULT_SCOPES


class APIKeyMiddleware(BaseHTTPMiddleware):
    """Enforces API key auth + optional scope checks when API_KEYS is set."""

    def __init__(self, app, header_name: str = "X-API-Key"):
        super().__init__(app)
        self.header_name = header_name

    def _is_public(self, path: str) -> bool:
        return any(path == public or path.startswith(public + "/") for public in PUBLIC_PATHS)

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        request.state.organization_id = DEFAULT_ORG
        request.state.api_scopes = frozenset({"admin"})  # open mode: full access

        if not is_auth_enabled():
            return await call_next(request)

        if self._is_public(request.url.path):
            return await call_next(request)

        api_key = request.headers.get(self.header_name, "")
        if not api_key:
            return JSONResponse(
                status_code=HTTP_401_UNAUTHORIZED,
                content={
                    "error": "missing_api_key",
                    "message": f"API key required. Provide it in the {self.header_name} header.",
                },
            )

        if not validate_api_key(api_key):
            return JSONResponse(
                status_code=HTTP_401_UNAUTHORIZED,
                content={
                    "error": "invalid_api_key",
                    "message": "The provided API key is invalid or expired.",
                },
            )

        request.state.organization_id = resolve_organization(api_key)
        scopes = resolve_scopes(api_key)
        request.state.api_scopes = scopes

        need = required_scope_for_path(request.url.path)
        if need and not scopes_imply(scopes, need):
            return JSONResponse(
                status_code=HTTP_403_FORBIDDEN,
                content={
                    "error": "insufficient_scope",
                    "message": f"API key lacks required scope '{need}'.",
                    "required_scope": need,
                    "scopes": sorted(scopes),
                },
            )

        return await call_next(request)
