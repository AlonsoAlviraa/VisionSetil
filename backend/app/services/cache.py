"""Redis-backed caching layer for inference results (Sprint N+4 — SC-2).

Caches classification results by image perceptual hash to avoid recomputing
identical observations. Falls back to an in-memory LRU cache when Redis is
unavailable (development mode).

Hard rules compliance:
* Cache TTL is configurable via settings.
* Cache is bypassed for safety-critical paths (the safety layer always runs).
* No mocks: when Redis is configured but unreachable, we log a warning and
  fall back to in-memory — we never silently return stale safety data.
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from collections import OrderedDict
from dataclasses import asdict, dataclass, field
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)


@dataclass
class CacheStats:
    """Observable cache metrics for monitoring."""

    hits: int = 0
    misses: int = 0
    sets: int = 0
    errors: int = 0
    backend: str = "memory"
    last_error: str = ""

    @property
    def hit_rate(self) -> float:
        total = self.hits + self.misses
        return self.hits / total if total > 0 else 0.0


class InferenceCache:
    """Cache for classification results keyed by perceptual hash of images.

    Uses Redis in production (when ``settings.redis_url`` is set), falling
    back to an in-memory LRU in development.

    Usage::

        from app.services.cache import get_inference_cache

        cache = get_inference_cache()
        key = cache.make_key(image_hashes, metadata_hash)

        cached = cache.get(key)
        if cached:
            return cached

        result = expensive_pipeline(...)
        cache.set(key, result, ttl=300)
    """

    def __init__(
        self,
        redis_url: str | None = None,
        max_memory_items: int = 512,
        default_ttl: int = 300,
    ) -> None:
        self.redis_url = redis_url or getattr(settings, "redis_url", None)
        self.default_ttl = default_ttl
        self.max_memory_items = max_memory_items
        self._memory_cache: OrderedDict[str, tuple[float, Any]] = OrderedDict()
        self._redis = None
        self.stats = CacheStats()

        self._connect_redis()

    def _connect_redis(self) -> None:
        """Attempt to connect to Redis. Fall back to memory on failure."""
        if not self.redis_url:
            logger.info("InferenceCache: no redis_url — using in-memory LRU")
            self.stats.backend = "memory"
            return

        try:
            import redis  # type: ignore

            self._redis = redis.from_url(
                self.redis_url,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
            )
            self._redis.ping()
            self.stats.backend = "redis"
            logger.info("InferenceCache: connected to Redis at %s", self.redis_url)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "InferenceCache: Redis connection failed (%s) — falling back to memory", exc
            )
            self._redis = None
            self.stats.backend = "memory_fallback"
            self.stats.last_error = str(exc)

    # ------------------------------------------------------------------ #
    # Key generation
    # ------------------------------------------------------------------ #
    @staticmethod
    def make_key(image_hashes: list[str], metadata_hash: str = "") -> str:
        """Build a deterministic cache key from image + metadata hashes.

        Parameters
        ----------
        image_hashes
            List of perceptual hashes (one per image).
        metadata_hash
            Hash of the observation metadata (habitat, substrate, etc.).
        """
        combined = "|".join(sorted(image_hashes)) + "|" + metadata_hash
        full_hash = hashlib.sha256(combined.encode()).hexdigest()
        return f"cls:{full_hash[:32]}"

    @staticmethod
    def compute_metadata_hash(metadata: dict[str, Any]) -> str:
        """Hash observation metadata into a short deterministic string."""
        relevant = {
            k: metadata.get(k)
            for k in ("habitat", "substrate", "smell", "country", "region")
            if metadata.get(k) is not None
        }
        raw = json.dumps(relevant, sort_keys=True, default=str)
        return hashlib.md5(raw.encode()).hexdigest()[:12]  # noqa: S324

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #
    def get(self, key: str) -> dict[str, Any] | None:
        """Retrieve a cached result. Returns ``None`` on miss."""
        try:
            if self._redis is not None:
                raw = self._redis.get(key)
                if raw:
                    self.stats.hits += 1
                    return json.loads(raw)
            else:
                # In-memory LRU.
                entry = self._memory_cache.get(key)
                if entry:
                    expires_at, value = entry
                    if time.time() < expires_at:
                        self._memory_cache.move_to_end(key)
                        self.stats.hits += 1
                        return value
                    del self._memory_cache[key]

            self.stats.misses += 1
            return None
        except Exception as exc:  # noqa: BLE001
            self.stats.errors += 1
            self.stats.last_error = str(exc)
            logger.warning("InferenceCache.get error: %s", exc)
            return None

    def set(  # noqa: A003
        self,
        key: str,
        value: dict[str, Any],
        ttl: int | None = None,
    ) -> bool:
        """Store a result in cache. Returns ``True`` on success."""
        ttl = ttl or self.default_ttl
        try:
            if self._redis is not None:
                self._redis.setex(key, ttl, json.dumps(value, default=str))
            else:
                # Evict oldest if at capacity.
                while len(self._memory_cache) >= self.max_memory_items:
                    self._memory_cache.popitem(last=False)
                self._memory_cache[key] = (time.time() + ttl, value)

            self.stats.sets += 1
            return True
        except Exception as exc:  # noqa: BLE001
            self.stats.errors += 1
            self.stats.last_error = str(exc)
            logger.warning("InferenceCache.set error: %s", exc)
            return False

    def invalidate(self, key: str) -> bool:
        """Remove a specific key from cache."""
        try:
            if self._redis is not None:
                self._redis.delete(key)
            else:
                self._memory_cache.pop(key, None)
            return True
        except Exception as exc:  # noqa: BLE001
            logger.warning("InferenceCache.invalidate error: %s", exc)
            return False

    def clear_all(self) -> int:
        """Clear the entire cache. Returns number of items removed."""
        count = 0
        try:
            if self._redis is not None:
                # Only clear keys with our prefix.
                for key in self._redis.scan_iter("cls:*"):
                    self._redis.delete(key)
                    count += 1
            else:
                count = len(self._memory_cache)
                self._memory_cache.clear()
        except Exception as exc:  # noqa: BLE001
            logger.warning("InferenceCache.clear_all error: %s", exc)
        return count

    def get_stats(self) -> dict[str, Any]:
        """Return cache statistics for monitoring dashboards."""
        return {
            **asdict(self.stats),
            "hit_rate": round(self.stats.hit_rate, 4),
            "memory_items": len(self._memory_cache),
            "redis_connected": self._redis is not None,
        }

    @property
    def is_redis(self) -> bool:
        return self._redis is not None


# --------------------------------------------------------------------------- #
# Lazy singleton
# --------------------------------------------------------------------------- #
_cache_instance: InferenceCache | None = None


def get_inference_cache() -> InferenceCache:
    global _cache_instance
    if _cache_instance is None:
        _cache_instance = InferenceCache()
    return _cache_instance


def reset_inference_cache() -> None:
    global _cache_instance
    _cache_instance = None
