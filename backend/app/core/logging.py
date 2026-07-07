"""Structured logging for VisionSetil.

Supports two formats via ``LOG_FORMAT``:

* ``text`` (default): human-readable, for local/dev.
* ``json``: single-line JSON objects, for production/ELK/Loki.

A correlation id can be attached per-request via ``request.state.request_id``
(see ``main.RequestIDMiddleware``) using :func:`bind_request_id`.
"""

from __future__ import annotations

import json
import logging
from contextvars import ContextVar
from typing import Any

_request_id_ctx: ContextVar[str | None] = ContextVar("request_id", default=None)


def bind_request_id(request_id: str | None) -> None:
    """Attach (or clear) the current request id so log records include it."""
    _request_id_ctx.set(request_id)


def get_request_id() -> str | None:
    return _request_id_ctx.get()


class _CorrelationFilter(logging.Filter):
    """Inject ``request_id`` into every record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = _request_id_ctx.get() or "-"
        return True


class _JsonFormatter(logging.Formatter):
    """Minimal dependency-free JSON log formatter."""

    _RESERVED = {
        "name",
        "msg",
        "args",
        "levelname",
        "levelno",
        "pathname",
        "filename",
        "module",
        "exc_info",
        "exc_text",
        "stack_info",
        "lineno",
        "funcName",
        "created",
        "msecs",
        "relativeCreated",
        "thread",
        "threadName",
        "processName",
        "process",
        "message",
        "asctime",
        "request_id",
    }

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
        }
        for key, value in record.__dict__.items():
            if key not in self._RESERVED and not key.startswith("_"):
                payload[key] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str, ensure_ascii=False)


def configure_logging(level: str = "INFO", fmt: str = "text") -> None:
    """Configure root logging with the requested level and format.

    Idempotent: re-applying replaces handlers instead of duplicating them.
    """
    root = logging.getLogger()
    for handler in list(root.handlers):
        root.removeHandler(handler)

    handler = logging.StreamHandler()
    if fmt.lower() == "json":
        handler.setFormatter(_JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)-7s %(name)s [%(request_id)s] %(message)s")
        )
    handler.addFilter(_CorrelationFilter())

    root.setLevel(level.upper())
    root.addHandler(handler)


def get_logger(name: str) -> logging.Logger:
    """Return a logger; ensures correlation filter is attached."""
    logger = logging.getLogger(name)
    if not any(isinstance(h, logging.StreamHandler) for h in logging.getLogger().handlers):
        configure_logging()
    return logger
