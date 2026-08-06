"""Canonical API error body (audit residual: consistent error shapes).

Every JSON error from the API should look like::

    {
      "error": "snake_case_code",
      "message": "human-readable (locale of the server default)",
      "detail": optional extra (string | object | list),
      "status": HTTP status code
    }

HTTPException.detail may still be a plain string for FastAPI defaults; the
exception handler normalizes both shapes.
"""
from __future__ import annotations

from typing import Any

from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

try:
    from starlette.status import HTTP_422_UNPROCESSABLE_CONTENT as HTTP_422
except ImportError:  # pragma: no cover
    from starlette.status import HTTP_422_UNPROCESSABLE_ENTITY as HTTP_422
from starlette.status import HTTP_500_INTERNAL_SERVER_ERROR


def error_body(
    *,
    code: str,
    message: str,
    status: int,
    detail: Any = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "error": code,
        "message": message,
        "status": status,
    }
    if detail is not None:
        body["detail"] = detail
    if extra:
        body.update(extra)
    return body


def http_error(
    status: int,
    code: str,
    message: str,
    *,
    detail: Any = None,
    headers: dict[str, str] | None = None,
) -> HTTPException:
    """Raise-friendly HTTPException with structured detail dict."""
    return HTTPException(
        status_code=status,
        detail=error_body(code=code, message=message, status=status, detail=detail),
        headers=headers,
    )


def normalize_http_exception_detail(detail: Any, status: int) -> dict[str, Any]:
    """Map FastAPI HTTPException.detail (str | dict | list) → canonical body."""
    if isinstance(detail, dict) and "error" in detail and "message" in detail:
        body = dict(detail)
        body.setdefault("status", status)
        return body
    if isinstance(detail, dict):
        # Legacy { "msg": ... } or free-form
        msg = str(detail.get("message") or detail.get("msg") or detail.get("detail") or detail)
        code = str(detail.get("error") or detail.get("code") or _code_for_status(status))
        return error_body(code=code, message=msg, status=status, detail=detail)
    if isinstance(detail, list):
        return error_body(
            code="validation_error",
            message="Request validation failed",
            status=status,
            detail=detail,
        )
    return error_body(
        code=_code_for_status(status),
        message=str(detail) if detail is not None else _default_message(status),
        status=status,
    )


def _code_for_status(status: int) -> str:
    return {
        400: "bad_request",
        401: "unauthorized",
        403: "forbidden",
        404: "not_found",
        409: "conflict",
        415: "unsupported_media_type",
        422: "validation_error",
        429: "rate_limit_exceeded",
        500: "internal_error",
        503: "service_unavailable",
    }.get(status, "http_error")


def _default_message(status: int) -> str:
    return {
        400: "Bad request",
        401: "Unauthorized",
        403: "Forbidden",
        404: "Not found",
        409: "Conflict",
        422: "Validation error",
        429: "Too many requests",
        500: "Internal server error",
        503: "Service unavailable",
    }.get(status, "Error")


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    body = normalize_http_exception_detail(exc.detail, exc.status_code)
    return JSONResponse(status_code=exc.status_code, content=body, headers=exc.headers)


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    return JSONResponse(
        status_code=HTTP_422,
        content=error_body(
            code="validation_error",
            message="Request validation failed",
            status=HTTP_422,
            detail=exc.errors(),
        ),
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # Do not leak stack traces to clients
    import logging

    rid = getattr(request.state, "request_id", "-")
    logging.getLogger("visionsetil.errors").exception(
        "Unhandled error on %s %s (request_id=%s)",
        request.method,
        request.url.path,
        rid,
    )
    return JSONResponse(
        status_code=HTTP_500_INTERNAL_SERVER_ERROR,
        content=error_body(
            code="internal_error",
            message="Internal server error",
            status=HTTP_500_INTERNAL_SERVER_ERROR,
            extra={"request_id": rid},
        ),
    )
