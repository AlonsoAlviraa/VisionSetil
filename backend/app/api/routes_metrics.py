"""Prometheus metrics endpoint for application monitoring.

Exposes metrics at /metrics including:
    - HTTP request count, latency histogram
    - Classification request count
    - Model backend status (real vs mock)
    - Open-set rejections
    - In-flight requests
"""

from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, Response

router = APIRouter(tags=["monitoring"])

# In-memory metrics store (for production, use prometheus_client)
_metrics: dict[str, dict] = {
    "http_requests_total": defaultdict(int),
    "http_request_duration_seconds_sum": defaultdict(float),
    "http_request_duration_seconds_count": defaultdict(int),
    "classification_requests_total": 0,
    "classification_rejections_total": 0,
    "model_backend_status": {},
    "requests_in_flight": 0,
}


def record_request(method: str, path: str, status: int, duration: float) -> None:
    """Record an HTTP request in metrics."""
    key = f"{method} {path} {status}"
    _metrics["http_requests_total"][key] += 1
    _metrics["http_request_duration_seconds_sum"][key] += duration
    _metrics["http_request_duration_seconds_count"][key] += 1


def record_classification(rejected: bool = False) -> None:
    """Record a classification request."""
    _metrics["classification_requests_total"] += 1
    if rejected:
        _metrics["classification_rejections_total"] += 1


def update_model_status(component: str, is_real: bool) -> None:
    """Update model backend status."""
    _metrics["model_backend_status"][component] = 1 if is_real else 0


def increment_in_flight(delta: int = 1) -> None:
    """Adjust the in-flight request counter."""
    _metrics["requests_in_flight"] = max(0, _metrics["requests_in_flight"] + delta)


@router.get("/metrics")
async def metrics() -> Response:
    """Prometheus-format metrics endpoint."""
    lines: list[str] = []

    # HTTP request metrics
    lines.append("# HELP http_requests_total Total HTTP requests")
    lines.append("# TYPE http_requests_total counter")
    for key, count in sorted(_metrics["http_requests_total"].items()):
        lines.append(f'http_requests_total{{endpoint="{key}"}} {count}')

    lines.append("# HELP http_request_duration_seconds Request latency")
    lines.append("# TYPE http_request_duration_seconds summary")
    for key in _metrics["http_request_duration_seconds_sum"]:
        count = _metrics["http_request_duration_seconds_count"][key]
        total = _metrics["http_request_duration_seconds_sum"][key]
        avg = total / count if count > 0 else 0
        lines.append(f'http_request_duration_seconds{{endpoint="{key}"}} {avg:.6f}')

    # Classification metrics
    lines.append("# HELP classification_requests_total Total classification requests")
    lines.append("# TYPE classification_requests_total counter")
    lines.append(f'classification_requests_total {_metrics["classification_requests_total"]}')

    lines.append("# HELP classification_rejections_total Total open-set rejections")
    lines.append("# TYPE classification_rejections_total counter")
    lines.append(f'classification_rejections_total {_metrics["classification_rejections_total"]}')

    # Model status
    lines.append("# HELP model_backend_status Model backend status (1=real, 0=mock)")
    lines.append("# TYPE model_backend_status gauge")
    for component, status in _metrics["model_backend_status"].items():
        lines.append(f'model_backend_status{{component="{component}"}} {status}')

    # In-flight requests
    lines.append("# HELP requests_in_flight Current in-flight requests")
    lines.append("# TYPE requests_in_flight gauge")
    lines.append(f'requests_in_flight {_metrics["requests_in_flight"]}')

    return Response(content="\n".join(lines) + "\n", media_type="text/plain")
