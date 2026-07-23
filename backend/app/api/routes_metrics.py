"""Prometheus metrics endpoint for application monitoring.

Exposes metrics at ``GET /metrics`` including:
    - HTTP request count, latency histogram
    - Classification request / rejection counts (via ``record_classification``)
    - Classify honesty mode counters (``classify_mode_total``)
    - Quality-gate block counters (``gate_blocked_total``)
    - Model backend status (real vs mock)
    - In-flight requests

Access control
--------------
``/metrics`` is an **admin-scoped** surface (S4 / ``security_scopes``):
when API key auth is enabled, callers need the ``admin`` scope
(e.g. ``API_KEYS=vs_key:default:admin``). Path rule is registered in
``app.core.security_scopes.PATH_SCOPE_RULES`` (``/metrics`` → ``admin``).
Not intended for the public FE client.

In-memory store is fine for single-process / local ops; for multi-replica
production prefer ``prometheus_client`` + a scrape agent.
"""

from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, Response

router = APIRouter(tags=["monitoring"])

# In-memory metrics store (for production, use prometheus_client)
_metrics: dict[str, dict | int] = {
    "http_requests_total": defaultdict(int),
    "http_request_duration_seconds_sum": defaultdict(float),
    "http_request_duration_seconds_count": defaultdict(int),
    "classification_requests_total": 0,
    "classification_rejections_total": 0,
    "classify_mode_total": defaultdict(int),  # mode → count
    "gate_blocked_total": defaultdict(int),  # reason_code → count
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
    """Record a classification request (wired from classify_simple map path)."""
    _metrics["classification_requests_total"] += 1
    if rejected:
        _metrics["classification_rejections_total"] += 1


def record_classify_mode(mode: str) -> None:
    """Increment ``classify_mode_total{mode=...}`` (real | mock | blocked)."""
    label = (mode or "unknown").strip().lower() or "unknown"
    _metrics["classify_mode_total"][label] += 1


def record_gate_blocked(reason_code: str) -> None:
    """Increment ``gate_blocked_total{reason_code=...}`` when gate denies species ID."""
    code = (reason_code or "unknown").strip() or "unknown"
    _metrics["gate_blocked_total"][code] += 1


def update_model_status(component: str, is_real: bool) -> None:
    """Update model backend status."""
    _metrics["model_backend_status"][component] = 1 if is_real else 0


def increment_in_flight(delta: int = 1) -> None:
    """Adjust the in-flight request counter."""
    _metrics["requests_in_flight"] = max(0, _metrics["requests_in_flight"] + delta)


def _escape_label(value: str) -> str:
    """Escape a Prometheus label value (minimal)."""
    return value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


@router.get(
    "/metrics",
    summary="Prometheus metrics (admin scope)",
    description=(
        "Prometheus text exposition format. "
        "**Admin scope required** when API key auth is enabled "
        "(`security_scopes`: `/metrics` → `admin`). Not used by the FE."
    ),
)
async def metrics() -> Response:
    """Prometheus-format metrics endpoint (admin-scoped when auth on)."""
    lines: list[str] = []

    # HTTP request metrics
    lines.append("# HELP http_requests_total Total HTTP requests")
    lines.append("# TYPE http_requests_total counter")
    for key, count in sorted(_metrics["http_requests_total"].items()):
        lines.append(f'http_requests_total{{endpoint="{_escape_label(str(key))}"}} {count}')

    lines.append("# HELP http_request_duration_seconds Request latency")
    lines.append("# TYPE http_request_duration_seconds summary")
    for key in _metrics["http_request_duration_seconds_sum"]:
        count = _metrics["http_request_duration_seconds_count"][key]
        total = _metrics["http_request_duration_seconds_sum"][key]
        avg = total / count if count > 0 else 0
        lines.append(
            f'http_request_duration_seconds{{endpoint="{_escape_label(str(key))}"}} {avg:.6f}'
        )

    # Classification metrics (record_classification from classify_simple)
    lines.append("# HELP classification_requests_total Total classification requests")
    lines.append("# TYPE classification_requests_total counter")
    lines.append(f'classification_requests_total {_metrics["classification_requests_total"]}')

    lines.append("# HELP classification_rejections_total Total classification rejections")
    lines.append("# TYPE classification_rejections_total counter")
    lines.append(
        f'classification_rejections_total {_metrics["classification_rejections_total"]}'
    )

    # Honesty mode counters (Phase B / B-51)
    lines.append(
        "# HELP classify_mode_total Classify honesty mode outcomes (real|mock|blocked)"
    )
    lines.append("# TYPE classify_mode_total counter")
    for mode, count in sorted(_metrics["classify_mode_total"].items()):
        lines.append(f'classify_mode_total{{mode="{_escape_label(str(mode))}"}} {count}')

    # Quality-gate block counters
    lines.append(
        "# HELP gate_blocked_total Quality-gate species-id blocks by reason_code"
    )
    lines.append("# TYPE gate_blocked_total counter")
    for code, count in sorted(_metrics["gate_blocked_total"].items()):
        lines.append(
            f'gate_blocked_total{{reason_code="{_escape_label(str(code))}"}} {count}'
        )

    # Model status
    lines.append("# HELP model_backend_status Model backend status (1=real, 0=mock)")
    lines.append("# TYPE model_backend_status gauge")
    for component, status in _metrics["model_backend_status"].items():
        lines.append(
            f'model_backend_status{{component="{_escape_label(str(component))}"}} {status}'
        )

    # In-flight requests
    lines.append("# HELP requests_in_flight Current in-flight requests")
    lines.append("# TYPE requests_in_flight gauge")
    lines.append(f'requests_in_flight {_metrics["requests_in_flight"]}')

    return Response(content="\n".join(lines) + "\n", media_type="text/plain")
