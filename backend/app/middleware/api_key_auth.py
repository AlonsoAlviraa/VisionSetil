"""API Key authentication dependency and middleware (Sprint N+2 + N+4 SC-4 + S4 scopes).

Supports two modes:
    1. DISABLED (default in development): no authentication required.
    2. ENABLED: requires a valid API key in the X-API-Key header.

API keys are validated against ``API_KEYS`` (comma-separated). Production
refuses empty ``API_KEYS`` at Settings construction (see config.py).

Formats (see ``app.core.security_scopes``)::

    vs_abc123                      → org=default, scopes=classify
    vs_abc123:acme                 → org=acme, scopes=classify
    vs_abc123:acme:classify+review → org=acme, scopes={classify, review}
    vs_abc123:acme:admin           → org=acme, all scopes

The resolved ``organization_id`` and ``scopes`` are stored on
``request.state`` so handlers can scope queries and enforce RBAC.
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
    "/docs",
    "/openapi.json",
    "/redoc",
    # Professional Upgrade: public read catalog + media
    "/media",
    "/species",
    # Colleague product: auth + community browse
    "/auth",
    "/community",
}

DEFAULT_ORG = "default"


def _parsed_entries() -> list[ParsedApiKey]:
    """Parse all API_KEYS entries once per call (env is small)."""
    raw = os.getenv("API_KEYS", "")
    out: list[ParsedApiKey] = []
    for entry in raw.split(","):
        parsed = parse_api_key_entry(entry, default_org=DEFAULT_ORG)
        if parsed is not None:
            out.append(parsed)
    return out


def get_valid_api_keys() -> set[str]:
    """Load valid API key material from API_KEYS (key part only)."""
    return {p.key for p in _parsed_entries()}


def get_key_org_map() -> dict[str, str]:
    """Return ``api_key → organization_id``."""
    return {p.key: p.organization_id for p in _parsed_entries()}


def get_key_scopes_map() -> dict[str, frozenset[str]]:
    """Return ``api_key → scopes``."""
    return {p.key: p.scopes for p in _parsed_entries()}


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


def _match_parsed_key(provided_key: str) -> ParsedApiKey | None:
    """Match plaintext or SHA-256-stored keys to a ParsedApiKey entry."""
    if not provided_key:
        return None
    entries = _parsed_entries()
    for parsed in entries:
        if hmac.compare_digest(provided_key, parsed.key):
            return parsed
    provided_hash = hash_api_key(provided_key)
    for parsed in entries:
        if len(parsed.key) == 64 and hmac.compare_digest(provided_hash, parsed.key):
            return parsed
    return None


def validate_api_key(provided_key: str) -> bool:
    """Validate an API key using constant-time comparison."""
    return _match_parsed_key(provided_key) is not None


def resolve_organization(provided_key: str) -> str:
    """Resolve the organization ID for a given API key."""
    matched = _match_parsed_key(provided_key)
    if matched is None:
        return DEFAULT_ORG
    return matched.organization_id


def resolve_scopes(provided_key: str) -> frozenset[str]:
    """Resolve scopes for a given API key (default classify when unknown)."""
    matched = _match_parsed_key(provided_key)
    if matched is None:
        return DEFAULT_SCOPES
    return matched.scopes


class APIKeyMiddleware(BaseHTTPMiddleware):
    """Middleware that enforces API key authentication when enabled.

    When API_KEYS is set, all non-public endpoints require a valid X-API-Key
    header and the scope required by the path (if any).
    """

    def __init__(self, app, header_name: str = "X-API-Key"):
        super().__init__(app)
        self.header_name = header_name

    def _is_public(self, path: str) -> bool:
        """Check if path is public (no auth required)."""
        return any(path == public or path.startswith(public + "/") for public in PUBLIC_PATHS)

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        # Always set defaults on request state
        request.state.organization_id = DEFAULT_ORG
        request.state.scopes = frozenset()

        # Skip if auth not enabled
        if not is_auth_enabled():
            return await call_next(request)

        # Skip public paths
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

        matched = _match_parsed_key(api_key)
        if matched is None:
            return JSONResponse(
                status_code=HTTP_401_UNAUTHORIZED,
                content={
                    "error": "invalid_api_key",
                    "message": "The provided API key is invalid or expired.",
                },
            )

        request.state.organization_id = matched.organization_id
        request.state.scopes = matched.scopes

        need = required_scope_for_path(request.url.path)
        if need is not None and not scopes_imply(matched.scopes, need):
            return JSONResponse(
                status_code=HTTP_403_FORBIDDEN,
                content={
                    "error": "insufficient_scope",
                    "message": f"API key lacks required scope '{need}'.",
                    "required_scope": need,
                },
            )

        return await call_next(request)
