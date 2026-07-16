"""Rate limiting middleware using sliding window algorithm.

Protects all API endpoints from abuse. Limits are configurable via
environment variables:
    - RATE_LIMIT_REQUESTS: max requests per window (default 60)
    - RATE_LIMIT_WINDOW_SECONDS: window size in seconds (default 60)
    - REDIS_URL: if set, uses Redis for distributed rate limiting (Sprint N+2 GW-1)
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


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Sliding-window rate limiter keyed by client IP.

    Uses Redis when ``REDIS_URL`` is set (distributed rate limiting across
    multiple workers). Falls back to in-memory in development.

    Redis implementation uses sorted sets:
        redis.zadd(key, {timestamp: timestamp})
        redis.zremrangebyscore(key, 0, timestamp - window)
        count = redis.zcard(key)
    """

    def __init__(
        self,
        app,
        max_requests: int = 60,
        window_seconds: int = 60,
        exempt_paths: set[str] | None = None,
        redis_url: str | None = None,
    ):
        super().__init__(app)
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.exempt_paths = exempt_paths or {"/health", "/readyz", "/docs", "/openapi.json"}
        self._requests: dict[str, list[float]] = defaultdict(list)
        self._redis = None

        # Attempt Redis connection (Sprint N+2 GW-1).
        redis_url = redis_url or os.getenv("REDIS_URL", "")
        if redis_url:
            try:
                import redis  # type: ignore

                self._redis = redis.from_url(
                    redis_url, decode_responses=True,
                    socket_connect_timeout=2, socket_timeout=2,
                )
                self._redis.ping()
                logger.info("RateLimitMiddleware: using Redis at %s", redis_url)
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "RateLimitMiddleware: Redis unavailable (%s) — using in-memory", exc
                )
                self._redis = None

    def _get_client_key(self, request: Request) -> str:
        """Extract client identifier (IP or API key if present)."""
        # Use forwarded IP if behind proxy, otherwise direct connection
        forwarded = request.headers.get("X-Forwarded-For", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    def _is_exempt(self, path: str) -> bool:
        """Check if path is exempt from rate limiting."""
        return any(path == exempt or path.startswith(exempt + "/") for exempt in self.exempt_paths)

    def _cleanup_window(self, key: str, now: float) -> int:
        """Remove expired timestamps and return current count."""
        cutoff = now - self.window_seconds
        # Filter timestamps within the window
        self._requests[key] = [ts for ts in self._requests[key] if ts > cutoff]
        return len(self._requests[key])

    def _redis_check_and_record(self, key: str, now: float) -> tuple[int, float]:
        """Check and record a request using Redis sorted sets.

        Returns ``(count, oldest_timestamp_in_window)``.
        """
        redis_key = f"ratelimit:{key}"
        pipe = self._redis.pipeline()
        # Remove old entries outside the window.
        pipe.zremrangebyscore(redis_key, 0, now - self.window_seconds)
        # Count current entries.
        pipe.zcard(redis_key)
        # Add current timestamp (unique member using now + random suffix).
        member = f"{now}:{time.time_ns()}"
        pipe.zadd(redis_key, {member: now})
        # Set expiry on the key.
        pipe.expire(redis_key, self.window_seconds + 1)
        results = pipe.execute()
        count = results[1]
        # Fetch oldest in window for retry-after calculation.
        oldest = self._redis.zrange(redis_key, 0, 0, withscores=True)
        oldest_ts = oldest[0][1] if oldest else now
        return count, oldest_ts

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        if self._is_exempt(request.url.path):
            return await call_next(request)

        client_key = self._get_client_key(request)
        now = time.time()

        # Use Redis if available, otherwise in-memory.
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

        if count >= self.max_requests:
            retry_after = int(self.window_seconds - (now - oldest_ts))
            return JSONResponse(
                status_code=HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "error": "rate_limit_exceeded",
                    "message": f"Rate limit: {self.max_requests} requests per {self.window_seconds}s",
                    "retry_after_seconds": max(retry_after, 1),
                },
                headers={
                    "Retry-After": str(max(retry_after, 1)),
                    "X-RateLimit-Limit": str(self.max_requests),
                    "X-RateLimit-Remaining": "0",
                },
            )

        # Record this request (in-memory path only; Redis already recorded above).
        if self._redis is None:
            self._requests[client_key].append(now)

        response = await call_next(request)

        remaining = max(self.max_requests - count - 1, 0)
        response.headers["X-RateLimit-Limit"] = str(self.max_requests)
        response.headers["X-RateLimit-Remaining"] = str(remaining)

        return response
