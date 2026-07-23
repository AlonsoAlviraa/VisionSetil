from collections.abc import Generator
import os

# Raise rate limits before importing the app so full-suite classify tests
# do not share a 20/min in-memory bucket and flake with 429s.
os.environ.setdefault("RATE_LIMIT_REQUESTS", "10000")
os.environ.setdefault("RATE_LIMIT_CLASSIFY_REQUESTS", "10000")
os.environ.setdefault("RATE_LIMIT_AUTH_REQUESTS", "10000")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.database import Base, get_db
from app.main import app
from app.middleware.rate_limit import RateLimitMiddleware


def _clear_rate_limit_buckets() -> None:
    """Reset in-memory rate-limit state between tests (shared process)."""
    # Walk middleware stack for RateLimitMiddleware instances
    stack = getattr(app, "middleware_stack", None) or getattr(app, "user_middleware", None)
    # Also scan app.router / ASGI wrappers
    seen: set[int] = set()

    def walk(obj) -> None:
        if obj is None or id(obj) in seen:
            return
        seen.add(id(obj))
        if isinstance(obj, RateLimitMiddleware):
            obj._requests.clear()
            return
        for attr in ("app", "cls", "kwargs"):
            child = getattr(obj, attr, None)
            if isinstance(child, dict):
                for v in child.values():
                    walk(v)
            else:
                walk(child)

    # FastAPI stores middleware as list of Middleware objects before build
    for m in getattr(app, "user_middleware", []) or []:
        walk(m)
    walk(getattr(app, "middleware_stack", None))


@pytest.fixture(autouse=True)
def _reset_rate_limits() -> Generator[None, None, None]:
    _clear_rate_limit_buckets()
    yield
    _clear_rate_limit_buckets()


@pytest.fixture()
def client(tmp_path) -> Generator[TestClient, None, None]:
    database_path = tmp_path / "test.db"
    engine = create_engine(
        f"sqlite:///{database_path}",
        connect_args={"check_same_thread": False},
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    def override_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
