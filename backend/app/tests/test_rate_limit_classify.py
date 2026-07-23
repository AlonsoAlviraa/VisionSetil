"""S4: classify path uses stricter rate-limit bucket.

B-17: Identify preflight cheap paths are rate-limit exempt (mount + 60s poll).
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.middleware.rate_limit import (
    DEFAULT_EXEMPT_PATHS,
    RateLimitMiddleware,
    _is_classify_path,
)


def test_classify_path_detection():
    assert _is_classify_path("/classify")
    assert _is_classify_path("/classify/async")
    assert not _is_classify_path("/health")
    assert not _is_classify_path("/observations")


def test_classify_bucket_stricter_than_general():
    app = FastAPI()
    app.add_middleware(
        RateLimitMiddleware,
        max_requests=100,
        window_seconds=60,
        classify_max_requests=3,
    )

    @app.get("/health")
    async def health():
        return {"ok": True}

    @app.post("/classify")
    async def classify():
        return {"ok": True}

    client = TestClient(app)

    # General path not exhausted by classify budget
    for _ in range(5):
        assert client.get("/health").status_code == 200

    # Classify limited to 3
    codes = [client.post("/classify").status_code for _ in range(4)]
    assert codes[:3] == [200, 200, 200]
    assert codes[3] == 429


def test_default_exempt_includes_preflight_paths():
    """B-17: /readyz + /models/quality-gate stay out of the general bucket."""
    assert "/readyz" in DEFAULT_EXEMPT_PATHS
    assert "/models/quality-gate" in DEFAULT_EXEMPT_PATHS
    assert "/health" in DEFAULT_EXEMPT_PATHS
    # Other /models/* routes must remain limited (prefix-exempt would be too broad)
    assert "/models" not in DEFAULT_EXEMPT_PATHS
    assert "/models/status" not in DEFAULT_EXEMPT_PATHS


def test_preflight_paths_exempt_when_general_budget_exhausted():
    """Simulate multi-tab preflight: status GETs still 200 after general 429."""
    app = FastAPI()
    app.add_middleware(
        RateLimitMiddleware,
        max_requests=3,
        window_seconds=60,
        classify_max_requests=20,
        exempt_paths={
            "/health",
            "/readyz",
            "/models/quality-gate",
        },
    )

    @app.get("/observations")
    async def observations():
        return {"ok": True}

    @app.get("/readyz")
    async def readyz():
        return {"ready": True}

    @app.get("/models/quality-gate")
    async def quality_gate():
        return {"species_id_allowed": False, "metrics_acceptable": False}

    @app.get("/models/status")
    async def models_status():
        return {"ok": True}

    client = TestClient(app)

    # Exhaust general bucket
    assert [client.get("/observations").status_code for _ in range(3)] == [200, 200, 200]
    assert client.get("/observations").status_code == 429

    # Preflight cheap paths remain available (would be ~10/min with 5 tabs × 60s)
    for _ in range(10):
        assert client.get("/readyz").status_code == 200
        assert client.get("/models/quality-gate").status_code == 200

    # Non-exempt /models/status still counts against general budget
    assert client.get("/models/status").status_code == 429
