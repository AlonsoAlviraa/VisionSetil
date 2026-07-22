"""API Key authentication dependency and middleware (Sprint N+2 + N+4 SC-4).

Supports two modes:
    1. DISABLED (default): no authentication required.
    2. ENABLED: requires a valid API key in the X-API-Key header.

API keys are validated against a set of valid keys configured via
the API_KEYS environment variable (comma-separated).

Multi-tenant (SC-4)
-------------------
Keys can be scoped to an organization using the format ``key:org_id``.
If no org is specified, the key belongs to the ``default`` org.

Examples::

    API_KEYS="vs_abc123:acme,vs_def456:globex"

Keys without an explicit org are assigned to ``default``::

    API_KEYS="vs_abc123"

The resolved ``organization_id`` is stored on ``request.state.organization_id``
so downstream handlers can scope their queries.

For production, keys should be hashed (SHA-256) and stored in a
database or secrets manager. This implementation uses plaintext
comparison with constant-time comparison for security.
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
from starlette.status import HTTP_401_UNAUTHORIZED

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


def get_valid_api_keys() -> set[str]:
    """Load valid API keys from environment variable API_KEYS.

    Keys are comma-separated. Empty values are filtered out.
    Supports the ``key:org_id`` format (returns just the key part).
    """
    raw = os.getenv("API_KEYS", "")
    keys: set[str] = set()
    for entry in raw.split(","):
        entry = entry.strip()
        if not entry:
            continue
        # Split on last colon to allow keys containing colons (unlikely but safe)
        key_part = entry.rsplit(":", 1)[0] if ":" in entry else entry
        keys.add(key_part)
    return keys


def get_key_org_map() -> dict[str, str]:
    """Return a mapping of ``api_key → organization_id``.

    Keys without an explicit org are mapped to ``DEFAULT_ORG``.
    """
    raw = os.getenv("API_KEYS", "")
    key_org: dict[str, str] = {}
    for entry in raw.split(","):
        entry = entry.strip()
        if not entry:
            continue
        if ":" in entry:
            key_part, org_part = entry.rsplit(":", 1)
            key_org[key_part] = org_part.strip() or DEFAULT_ORG
        else:
            key_org[entry] = DEFAULT_ORG
    return key_org


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

    # Also check hashed keys (if stored as hashes)
    provided_hash = hash_api_key(provided_key)
    for valid_key in valid_keys:
        if len(valid_key) == 64 and hmac.compare_digest(provided_hash, valid_key):
            return True

    return False


def resolve_organization(provided_key: str) -> str:
    """Resolve the organization ID for a given API key.

    Returns ``DEFAULT_ORG`` if the key is not found or auth is disabled.
    """
    if not provided_key:
        return DEFAULT_ORG
    key_org = get_key_org_map()
    # Direct lookup
    if provided_key in key_org:
        return key_org[provided_key]
    # Hashed key lookup
    provided_hash = hash_api_key(provided_key)
    for stored_key, org in key_org.items():
        if len(stored_key) == 64 and hmac.compare_digest(provided_hash, stored_key):
            return org
    return DEFAULT_ORG


class APIKeyMiddleware(BaseHTTPMiddleware):
    """Middleware that enforces API key authentication when enabled.

    When the API_KEYS environment variable is set, all non-public
    endpoints require a valid X-API-Key header.

    Multi-tenant: resolves ``organization_id`` from the key and stores
    it on ``request.state.organization_id``.
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
        # Always set a default org on request state
        request.state.organization_id = DEFAULT_ORG

        # Skip if auth not enabled
        if not is_auth_enabled():
            return await call_next(request)

        # Skip public paths
        if self._is_public(request.url.path):
            return await call_next(request)

        # Check for API key
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

        # Resolve org and attach to request state (SC-4 multi-tenant)
        request.state.organization_id = resolve_organization(api_key)

        return await call_next(request)