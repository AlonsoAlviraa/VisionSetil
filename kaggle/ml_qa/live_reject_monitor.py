"""Live Identify reject-rate monitor from feedback JSONL (orientation only).

Reads ``data/feedback/classification_log.jsonl`` (or FEEDBACK_LOG_PATH) and
summarizes accepted vs rejected rates + rejection reason histogram.

Empty / missing log → SKIP (not FAIL). Never unlocks product.

Polished ops: time windows (24h / 7d / 30d), advisory health flags,
regenerable report under eval/reports/ml_experiments/.
"""
from __future__ import annotations

import json
import os
import re
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
POLICY = "orientation_only_never_consume"

# Advisory only — never fail product_unlock or block Identify.
HIGH_REJECT_RATE_ADVISORY = 0.85
SPARSE_SAMPLE_N = 5
# Diagnostic priority slots (gills/front/detail) — educational honesty only.
DIAG_PRIORITY_VIEWS: frozenset[str] = frozenset({"gills", "front", "detail"})

WINDOW_SPECS: tuple[tuple[str, timedelta | None], ...] = (
    ("24h", timedelta(hours=24)),
    ("7d", timedelta(days=7)),
    ("30d", timedelta(days=30)),
    ("all", None),
)


def resolve_feedback_log(repo: Path | None = None) -> Path:
    env = os.getenv("FEEDBACK_LOG_PATH")
    if env:
        return Path(env)
    repo = Path(repo or ROOT)
    return repo / "data" / "feedback" / "classification_log.jsonl"


def _extract_decision(entry: dict[str, Any]) -> str:
    dec = str(entry.get("decision") or entry.get("verdict") or "").strip().lower()
    return dec


def _extract_reject_reason(entry: dict[str, Any]) -> str:
    for key in (
        "rejection_reason",
        "open_set_reason",
        "reason_code",
        "reject_reason",
    ):
        val = entry.get(key)
        if val is not None and str(val).strip():
            return str(val).strip()
    meta = entry.get("metadata") if isinstance(entry.get("metadata"), dict) else {}
    for key in ("rejection_reason", "open_set_reason", "reason_code"):
        val = meta.get(key) if meta else None
        if val is not None and str(val).strip():
            return str(val).strip()
    return "unknown"


def _parse_ts(raw: Any) -> datetime | None:
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    # Normalize Z and fractional seconds lightly
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    # time.strftime without tz from feedback_logger: "2026-07-27T22:45:24"
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        m = re.match(r"^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})", s)
        if not m:
            return None
        try:
            dt = datetime.fromisoformat(m.group(1).replace(" ", "T"))
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _extract_view_coverage(entry: dict[str, Any]) -> list[str]:
    """Pull view labels from metadata.view_coverage / view_types / top-level."""
    raw: Any = entry.get("view_coverage") or entry.get("view_types")
    meta = entry.get("metadata") if isinstance(entry.get("metadata"), dict) else {}
    if raw is None and meta:
        raw = meta.get("view_coverage") or meta.get("view_types")
    if raw is None:
        return []
    if isinstance(raw, str):
        parts = [p.strip().lower() for p in raw.split(",") if p.strip()]
        return parts
    if isinstance(raw, (list, tuple)):
        return [str(v).strip().lower() for v in raw if str(v).strip()]
    return []


def _multiview_stats(entries: list[dict[str, Any]]) -> dict[str, Any]:
    """Advisory multiview honesty from logged view coverage (never unlocks)."""
    n = len(entries)
    n_with = 0
    n_multi = 0  # ≥2 labeled views
    n_diag_any = 0  # any of gills/front/detail
    n_diag_full = 0  # all three priority slots
    n_single_no_diag = 0
    for e in entries:
        views = _extract_view_coverage(e)
        if not views:
            continue
        n_with += 1
        uniq = set(views)
        if len(uniq) >= 2:
            n_multi += 1
        diag = uniq & DIAG_PRIORITY_VIEWS
        if diag:
            n_diag_any += 1
        if DIAG_PRIORITY_VIEWS.issubset(uniq):
            n_diag_full += 1
        if len(uniq) == 1 and not diag:
            n_single_no_diag += 1
    return {
        "n_with_view_labels": n_with,
        "n_multiview_ge2": n_multi,
        "n_diag_any": n_diag_any,
        "n_diag_full_gills_front_detail": n_diag_full,
        "n_single_non_diag": n_single_no_diag,
        "view_label_rate": float(n_with / n) if n else None,
        "multiview_ge2_rate": float(n_multi / n) if n else None,
        "diag_full_rate": float(n_diag_full / n) if n else None,
        "priority_views": sorted(DIAG_PRIORITY_VIEWS),
        "note": (
            "Advisory only: multi-photo without gills/front/detail is not deadly-safe. "
            "Never forage/consumption permission."
        ),
    }


def _extract_mode(entry: dict[str, Any]) -> str:
    """Stack honesty mode from entry or metadata (real|mock|blocked|unknown).

    Prefers top-level ``mode`` (v1.9.9 S9 log shape) then metadata.
    """
    for key in ("mode", "classify_mode", "honesty_mode"):
        raw = entry.get(key)
        if raw is not None and str(raw).strip():
            m = str(raw).strip().lower()
            if m in ("real", "mock", "blocked"):
                return m
    meta = entry.get("metadata") if isinstance(entry.get("metadata"), dict) else {}
    for key in ("mode", "classify_mode", "honesty_mode"):
        raw = meta.get(key) if meta else None
        if raw is not None and str(raw).strip():
            m = str(raw).strip().lower()
            if m in ("real", "mock", "blocked"):
                return m
    return "unknown"


def _mode_histogram(entries: list[dict[str, Any]]) -> dict[str, int]:
    c: Counter[str] = Counter()
    for e in entries:
        c[_extract_mode(e)] += 1
    return dict(c.most_common(10))


def classify_traffic_depth(n_entries: int, n_with_view_labels: int = 0) -> str:
    """Advisory traffic depth for ops (never unlocks).

    empty | sparse | thin | moderate | rich
    """
    n = int(n_entries or 0)
    if n <= 0:
        return "empty"
    if n < SPARSE_SAMPLE_N:
        return "sparse"
    if n < 25:
        return "thin"
    if n < 100:
        return "moderate" if n_with_view_labels >= 5 else "thin"
    return "rich" if n_with_view_labels >= 20 else "moderate"


def _bucket_stats(entries: list[dict[str, Any]]) -> dict[str, Any]:
    n_acc = 0
    n_rej = 0
    n_other = 0
    reasons: Counter[str] = Counter()
    decisions: Counter[str] = Counter()
    for e in entries:
        dec = _extract_decision(e)
        decisions[dec or "unset"] += 1
        if dec == "rejected":
            n_rej += 1
            reasons[_extract_reject_reason(e)] += 1
        elif dec in ("accepted", "abstain", "needs_review", "review"):
            n_acc += 1
        else:
            n_other += 1
            n_acc += 1
    total = n_acc + n_rej
    reason_hist = dict(reasons.most_common(40))
    mv = _multiview_stats(entries)
    modes = _mode_histogram(entries)
    n_entries = len(entries)
    traffic_depth = classify_traffic_depth(
        n_entries, int(mv.get("n_with_view_labels") or 0)
    )
    return {
        "n_entries": n_entries,
        "n_accepted": n_acc,
        "n_rejected": n_rej,
        "n_other": n_other,
        "reject_rate": float(n_rej / total) if total else None,
        "reasons": reason_hist,
        "reason_histogram": reason_hist,
        "decisions": dict(decisions.most_common(20)),
        "top_reason": next(iter(reason_hist), None),
        "multiview": mv,
        "modes": modes,
        "n_real_mode": int(modes.get("real") or 0),
        "n_mock_mode": int(modes.get("mock") or 0),
        "n_blocked_mode": int(modes.get("blocked") or 0),
        "traffic_depth": traffic_depth,
        "traffic_note": (
            "Advisory traffic depth for S9 ops. empty/sparse → grow Identify traffic. "
            "Never product_unlock. Orientation only — never forage/consumption."
        ),
    }


def _health_flags(stats: dict[str, Any], *, status: str) -> list[str]:
    flags: list[str] = []
    if status in ("no_log", "empty"):
        flags.append("no_traffic_yet")
        return flags
    n = int(stats.get("n_entries") or 0)
    if 0 < n < SPARSE_SAMPLE_N:
        flags.append("sparse_sample")
    depth = str(stats.get("traffic_depth") or classify_traffic_depth(n))
    if depth in ("sparse", "thin"):
        flags.append(f"traffic_depth_{depth}")
    rate = stats.get("reject_rate")
    if rate is not None and float(rate) >= HIGH_REJECT_RATE_ADVISORY:
        flags.append("high_reject_rate_advisory")
    n_rej = int(stats.get("n_rejected") or 0)
    reasons = stats.get("reasons") or {}
    if n_rej > 0 and not reasons:
        flags.append("reject_reasons_missing")
    if n_rej > 0 and reasons.get("unknown", 0) == n_rej:
        flags.append("all_rejects_unknown_reason")
    mv = stats.get("multiview") if isinstance(stats.get("multiview"), dict) else {}
    n_with = int(mv.get("n_with_view_labels") or 0)
    if n >= SPARSE_SAMPLE_N and n_with == 0:
        flags.append("no_view_labels_in_log")
    elif n_with > 0:
        diag_full = int(mv.get("n_diag_full_gills_front_detail") or 0)
        multi = int(mv.get("n_multiview_ge2") or 0)
        if multi > 0 and diag_full == 0:
            flags.append("multiview_without_full_diag_slots")
    # Prefer real-mode traffic for honesty; mock-only is advisory
    n_real = int(stats.get("n_real_mode") or 0)
    n_mock = int(stats.get("n_mock_mode") or 0)
    if n >= SPARSE_SAMPLE_N and n_real == 0 and n_mock > 0:
        flags.append("mock_only_traffic")
    return flags


def summarize_feedback_log(
    log_path: Path | None = None,
    *,
    repo: Path | None = None,
    max_lines: int = 50_000,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Summarize Identify feedback JSONL with optional time windows.

    Status:
      - no_log: path missing
      - empty: file exists but zero parseable entries
      - ok: n_entries > 0
      - read_error: I/O failure
    Always product_unlock=False.
    """
    path = Path(log_path) if log_path else resolve_feedback_log(repo)
    now_utc = now or datetime.now(timezone.utc)
    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=timezone.utc)

    out: dict[str, Any] = {
        "product_unlock": False,
        "policy": POLICY,
        "generated": now_utc.isoformat(),
        "log_path": str(path),
        "exists": path.is_file(),
        "n_entries": 0,
        "n_accepted": 0,
        "n_rejected": 0,
        "reject_rate": None,
        "reasons": {},
        "reason_histogram": {},
        "decisions": {},
        "windows": {},
        "health_flags": [],
        "note": (
            "Live ops monitor; empty/missing log is SKIP not fail. "
            "Windows/health_flags are advisory only. Never unlocks."
        ),
    }
    if not path.is_file():
        out["status"] = "no_log"
        out["health_flags"] = _health_flags(out, status="no_log")
        out["product_unlock"] = False
        return out

    entries: list[dict[str, Any]] = []
    n_parse_errors = 0
    try:
        with path.open(encoding="utf-8") as f:
            for i, line in enumerate(f):
                if i >= max_lines:
                    break
                line = line.strip()
                if not line:
                    continue
                try:
                    e = json.loads(line)
                except json.JSONDecodeError:
                    n_parse_errors += 1
                    continue
                if not isinstance(e, dict):
                    n_parse_errors += 1
                    continue
                entries.append(e)
    except OSError as exc:
        out["status"] = "read_error"
        out["error"] = str(exc)
        out["product_unlock"] = False
        out["health_flags"] = ["feedback_log_read_error"]
        return out

    if not entries:
        out.update(
            {
                "status": "empty",
                "n_entries": 0,
                "n_accepted": 0,
                "n_rejected": 0,
                "reject_rate": None,
                "reasons": {},
                "reason_histogram": {},
                "decisions": {},
                "windows": {},
                "n_parse_errors": n_parse_errors,
            }
        )
        out["health_flags"] = _health_flags(out, status="empty")
        out["product_unlock"] = False
        return out

    all_stats = _bucket_stats(entries)
    windows: dict[str, Any] = {}
    for name, delta in WINDOW_SPECS:
        if delta is None:
            windows[name] = {**all_stats, "window": name}
            continue
        cutoff = now_utc - delta
        in_win: list[dict[str, Any]] = []
        for e in entries:
            ts = _parse_ts(e.get("timestamp"))
            if ts is None:
                # Unparseable timestamps counted only in "all"
                continue
            if ts >= cutoff:
                in_win.append(e)
        win_stats = _bucket_stats(in_win)
        windows[name] = {**win_stats, "window": name}

    n_with_ts = sum(1 for e in entries if _parse_ts(e.get("timestamp")) is not None)
    out.update(
        {
            "status": "ok",
            **all_stats,
            "windows": windows,
            "n_parse_errors": n_parse_errors,
            "n_with_timestamp": n_with_ts,
            "n_without_timestamp": len(entries) - n_with_ts,
            "high_reject_rate_threshold": HIGH_REJECT_RATE_ADVISORY,
            "sparse_sample_threshold": SPARSE_SAMPLE_N,
            # Top-level alias for dashboard glance
            "multiview": all_stats.get("multiview") or _multiview_stats(entries),
        }
    )
    out["health_flags"] = _health_flags(all_stats, status="ok")
    if n_with_ts == 0:
        out["health_flags"] = list(out["health_flags"]) + ["no_parseable_timestamps"]
    # Prefer 7d window top for ops glance when populated
    win7 = windows.get("7d") or {}
    out["reject_rate_7d"] = win7.get("reject_rate")
    out["n_entries_7d"] = win7.get("n_entries")
    out["top_reason"] = all_stats.get("top_reason")
    out["modes"] = all_stats.get("modes") or {}
    out["n_real_mode"] = all_stats.get("n_real_mode")
    out["n_mock_mode"] = all_stats.get("n_mock_mode")
    out["n_blocked_mode"] = all_stats.get("n_blocked_mode")
    out["traffic_depth"] = all_stats.get("traffic_depth")
    out["traffic_note"] = all_stats.get("traffic_note")
    out["product_unlock"] = False
    return out


def run_live_reject_suite(
    repo: Path | None = None,
    *,
    log_path: Path | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Professional-tester style suite (advisory PASS/SKIP).

    - missing log → SKIP (no traffic yet)
    - empty log → SKIP
    - populated → PASS (ops monitor health; never unlocks)
    - read_error → FAIL
    """
    repo = Path(repo or ROOT)
    metrics = summarize_feedback_log(log_path=log_path, repo=repo, now=now)
    st = metrics.get("status")
    if st in ("no_log", "empty"):
        status = "SKIP"
    elif st == "ok":
        status = "PASS"
    elif st == "read_error":
        status = "FAIL"
    else:
        status = "FAIL"

    n = int(metrics.get("n_entries") or 0)
    reasons = metrics.get("reasons") or {}
    detail = {
        "status": st,
        "n_entries": n,
        "n_rejected": metrics.get("n_rejected"),
        "reject_rate": metrics.get("reject_rate"),
        "reject_rate_7d": metrics.get("reject_rate_7d"),
        "n_entries_7d": metrics.get("n_entries_7d"),
        "reasons": reasons,
        "reason_histogram": metrics.get("reason_histogram") or reasons,
        "top_reason": metrics.get("top_reason"),
        "health_flags": metrics.get("health_flags") or [],
        "multiview": metrics.get("multiview") or {},
        "modes": metrics.get("modes") or {},
        "traffic_depth": metrics.get("traffic_depth"),
        "n_real_mode": metrics.get("n_real_mode"),
        "n_mock_mode": metrics.get("n_mock_mode"),
        "windows": {
            k: {
                "n_entries": (v or {}).get("n_entries"),
                "reject_rate": (v or {}).get("reject_rate"),
                "top_reason": (v or {}).get("top_reason"),
            }
            for k, v in (metrics.get("windows") or {}).items()
        },
        "log_path": metrics.get("log_path"),
        "product_unlock": False,
    }
    flags: list[str] = list(metrics.get("health_flags") or [])
    if st == "read_error":
        flags.append("feedback_log_read_error")
    if st == "ok" and int(metrics.get("n_rejected") or 0) > 0 and not reasons:
        flags.append("reject_reasons_missing")

    return {
        "name": "S9 live Identify reject monitor",
        "status": status,
        "detail": json.dumps(detail, ensure_ascii=False),
        "flags": flags,
        "metrics": metrics,
        "product_unlock": False,
        "policy": POLICY,
    }


def write_s9_report(
    repo: Path | None = None,
    *,
    log_path: Path | None = None,
    out_dir: Path | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Write s9_live_reject_latest.json under eval/reports/ml_experiments."""
    repo = Path(repo or ROOT)
    suite = run_live_reject_suite(repo, log_path=log_path, now=now)
    dest = Path(out_dir) if out_dir else (repo / "eval" / "reports" / "ml_experiments")
    dest.mkdir(parents=True, exist_ok=True)
    path = dest / "s9_live_reject_latest.json"
    blob = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "policy": POLICY,
        "product_unlock": False,
        "suite_status": suite.get("status"),
        "flags": suite.get("flags"),
        "metrics": suite.get("metrics"),
        "note": "Advisory live reject monitor only — never unlocks Identify.",
    }
    path.write_text(json.dumps(blob, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    blob["artifact"] = str(path)
    return blob


if __name__ == "__main__":
    import sys

    repo = ROOT
    lp: Path | None = None
    write = "--write" in sys.argv
    args = [a for a in sys.argv[1:] if a != "--write"]
    if args:
        lp = Path(args[0])
    if write:
        print(json.dumps(write_s9_report(repo, log_path=lp), indent=2, ensure_ascii=False))
    else:
        print(json.dumps(run_live_reject_suite(repo, log_path=lp), indent=2, ensure_ascii=False))
