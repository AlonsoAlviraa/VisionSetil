"""S4: classify path uses stricter rate-limit bucket."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.middleware.rate_limit import RateLimitMiddleware, _is_classify_path


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
