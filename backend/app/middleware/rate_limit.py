"""Rate limiting middleware with path-aware limits (S4 + B-17).

Env:
    RATE_LIMIT_REQUESTS — default max requests per window (60)
    RATE_LIMIT_WINDOW_SECONDS — window size (60)
    RATE_LIMIT_CLASSIFY_REQUESTS — stricter limit for /classify* (default 20)
    REDIS_URL — optional distributed store

Preflight (B-17 / Phase B Honest Identify)
------------------------------------------
Identify polls ``/readyz`` and ``/models/quality-gate`` on mount and every
**60s** (``PREFLIGHT_POLL_MS = 60_000`` on the FE). With several open tabs that
traffic would share the general bucket and risk 429s; both endpoints are
cheap (cached metrics / readiness checks, no GPU) and are **rate-limit
exempt** by default (same policy as public media/species GETs).

If a deployment must rate-limit them instead of exempting, use a dedicated
high limit of **≥120 req/min/IP** — never the classify bucket.
"""

from __future__ import annotations

import logging
import os
import time
from collections import defaultdict
from collections.abc import Awaitable, Callable

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.status import HTTP_429_TOO_MANY_REQUESTS

logger = logging.getLogger(__name__)

# Paths that use the stricter classify budget
CLASSIFY_PATH_PREFIXES = ("/classify",)

# Cheap ops / preflight status paths — never share the general or classify budget.
# Keep in sync with ``app.main`` middleware wiring.
DEFAULT_EXEMPT_PATHS: frozenset[str] = frozenset(
    {
        "/health",
        "/healthz",
        "/readyz",
        "/docs",
        "/openapi.json",
        "/redoc",
        # Identify preflight (B-17): mount + 60s poll; multi-tab safe
        "/models/quality-gate",
    }
)


def _is_classify_path(path: str) -> bool:
    return any(path == p or path.startswith(p + "/") for p in CLASSIFY_PATH_PREFIXES)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Sliding-window rate limiter keyed by client IP (+ path class)."""

    def __init__(
        self,
        app,
        max_requests: int = 60,
        window_seconds: int = 60,
        classify_max_requests: int | None = None,
        exempt_paths: set[str] | None = None,
        redis_url: str | None = None,
    ):
        super().__init__(app)
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.classify_max_requests = classify_max_requests or int(
            os.getenv("RATE_LIMIT_CLASSIFY_REQUESTS", "20")
        )
        self.exempt_paths = set(exempt_paths) if exempt_paths is not None else set(DEFAULT_EXEMPT_PATHS)
        self._requests: dict[str, list[float]] = defaultdict(list)
        self._redis = None

        redis_url = redis_url or os.getenv("REDIS_URL", "")
        if redis_url:
            try:
                import redis  # type: ignore

                self._redis = redis.from_url(
                    redis_url,
                    decode_responses=True,
                    socket_connect_timeout=2,
                    socket_timeout=2,
                )
                self._redis.ping()
                logger.info("RateLimitMiddleware: using Redis at %s", redis_url)
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "RateLimitMiddleware: Redis unavailable (%s) — using in-memory", exc
                )
                self._redis = None

    def _get_client_key(self, request: Request) -> str:
        forwarded = request.headers.get("X-Forwarded-For", "")
        if forwarded:
            ip = forwarded.split(",")[0].strip()
        else:
            ip = request.client.host if request.client else "unknown"
        # Separate buckets for classify vs general traffic
        bucket = "classify" if _is_classify_path(request.url.path) else "general"
        return f"{bucket}:{ip}"

    def _limit_for_request(self, request: Request) -> int:
        if _is_classify_path(request.url.path):
            return self.classify_max_requests
        return self.max_requests

    def _is_exempt(self, path: str) -> bool:
        return any(path == exempt or path.startswith(exempt + "/") for exempt in self.exempt_paths)

    def _cleanup_window(self, key: str, now: float) -> int:
        cutoff = now - self.window_seconds
        self._requests[key] = [ts for ts in self._requests[key] if ts > cutoff]
        return len(self._requests[key])

    def _redis_check_and_record(self, key: str, now: float) -> tuple[int, float]:
        redis_key = f"ratelimit:{key}"
        pipe = self._redis.pipeline()
        pipe.zremrangebyscore(redis_key, 0, now - self.window_seconds)
        pipe.zcard(redis_key)
        member = f"{now}:{time.time_ns()}"
        pipe.zadd(redis_key, {member: now})
        pipe.expire(redis_key, self.window_seconds + 1)
        results = pipe.execute()
        count = results[1]
        oldest = self._redis.zrange(redis_key, 0, 0, withscores=True)
        oldest_ts = oldest[0][1] if oldest else now
        return count, oldest_ts

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        if self._is_exempt(request.url.path):
            return await call_next(request)

        client_key = self._get_client_key(request)
        limit = self._limit_for_request(request)
        now = time.time()

        if self._redis is not None:
            try:
                count, oldest_ts = self._redis_check_and_record(client_key, now)
            except Exception as exc:  # noqa: BLE001
                logger.warning("RateLimitMiddleware: Redis error (%s) — falling back", exc)
                count = self._cleanup_window(client_key, now)
                self._requests[client_key].append(now)
                oldest_ts = self._requests[client_key][0] if self._requests[client_key] else now
        else:
            count = self._cleanup_window(client_key, now)
            oldest_ts = self._requests[client_key][0] if self._requests[client_key] else now

        if count >= limit:
            retry_after = int(self.window_seconds - (now - oldest_ts))
            return JSONResponse(
                status_code=HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "error": "rate_limit_exceeded",
                    "message": f"Rate limit: {limit} requests per {self.window_seconds}s",
                    "retry_after_seconds": max(retry_after, 1),
                    "bucket": "classify" if _is_classify_path(request.url.path) else "general",
                },
                headers={
                    "Retry-After": str(max(retry_after, 1)),
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0",
                },
            )

        if self._redis is None:
            self._requests[client_key].append(now)

        response = await call_next(request)

        remaining = max(limit - count - 1, 0)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)

        return response
