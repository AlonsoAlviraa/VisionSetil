"""Catalog ↔ model (label2idx) join coverage for ML dashboard (B-43 / B-39).

Reads the committed baseline report produced by
``scripts/build_species_index_join.py`` (nightly + on-demand, D-B25).
No GPU; no live recompute — dashboard is informational.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

# Relative to monorepo root (same default as scripts/build_species_index_join.py).
DEFAULT_REPORT_REL = Path("data/species_catalog/species_index_join_report.json")

# Primary coverage is share of model taxa present in catalog (product-relevant).
# Soft bands for dashboard tone only — never a serve block.
ALIGN_PCT = 80.0
WARN_PCT = 50.0


def _repo_root(explicit: Path | str | None = None) -> Path:
    if explicit is not None:
        return Path(explicit).resolve()
    # backend/app/ml/species_index_join.py → parents[3] = monorepo root
    return Path(__file__).resolve().parents[3]


def report_path(repo_root: Path | str | None = None) -> Path:
    return _repo_root(repo_root) / DEFAULT_REPORT_REL


def load_join_report(
    repo_root: Path | str | None = None,
    *,
    path: Path | str | None = None,
) -> dict[str, Any] | None:
    """Load species_index_join_report.json; return None if missing/unreadable."""
    p = Path(path) if path is not None else report_path(repo_root)
    if not p.is_file():
        return None
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def _as_float(v: Any) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _as_int(v: Any) -> int | None:
    if v is None:
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def overlap_verdict(coverage_pct: float | None) -> str:
    """Dashboard-only band: ALIGNED / PARTIAL / MISMATCH / UNKNOWN."""
    if coverage_pct is None:
        return "UNKNOWN"
    if coverage_pct >= ALIGN_PCT:
        return "ALIGNED"
    if coverage_pct >= WARN_PCT:
        return "PARTIAL"
    return "MISMATCH"


def catalog_join_payload(
    repo_root: Path | str | None = None,
    *,
    path: Path | str | None = None,
) -> dict[str, Any]:
    """Compact payload for GET /models/catalog-join (B-43 tile).

    Primary metric: ``coverage_pct`` = % of model (label2idx) taxa found in
    catalog_v2 (allowlist). Incomplete coverage is informational, not a gate.
    """
    root = _repo_root(repo_root)
    p = Path(path) if path is not None else report_path(root)
    rel = DEFAULT_REPORT_REL.as_posix()
    try:
        resolved = p.resolve()
        try:
            rel = resolved.relative_to(root.resolve()).as_posix()
        except ValueError:
            rel = resolved.as_posix()
    except OSError:
        pass

    raw = load_join_report(root, path=p)
    if raw is None:
        return {
            "available": False,
            "report_path": rel,
            "hint": (
                "Run python scripts/build_species_index_join.py "
                "(nightly + on-demand; D-B25 — not a PR CI gate)"
            ),
            "coverage_pct": None,
            "coverage_model_in_catalog_pct": None,
            "coverage_catalog_in_model_pct": None,
            "intersection_count": None,
            "model_count": None,
            "catalog_count": None,
            "missing_in_catalog_count": None,
            "missing_in_model_count": None,
            "label2idx_path": None,
            "label2idx_discovered": False,
            "catalog_path": None,
            "catalog_version": None,
            "timestamp": None,
            "cadence": None,
            "selection_reason": None,
            "overlap_verdict": "UNKNOWN",
            "mismatch": None,
        }

    coverage = _as_float(raw.get("coverage_pct"))
    if coverage is None:
        coverage = _as_float(raw.get("coverage_model_in_catalog_pct"))
    cov_model = _as_float(raw.get("coverage_model_in_catalog_pct"))
    if cov_model is None:
        cov_model = coverage
    cov_catalog = _as_float(raw.get("coverage_catalog_in_model_pct"))

    missing_cat = _as_int(raw.get("missing_in_catalog_count"))
    if missing_cat is None and isinstance(raw.get("missing_in_catalog"), list):
        missing_cat = len(raw["missing_in_catalog"])
    missing_mod = _as_int(raw.get("missing_in_model_count"))
    if missing_mod is None and isinstance(raw.get("missing_in_model"), list):
        missing_mod = len(raw["missing_in_model"])

    verdict = overlap_verdict(coverage)
    # True when model/catalog join is incomplete (informational mismatch flag).
    mismatch: bool | None
    if coverage is None:
        mismatch = None
    else:
        mismatch = coverage < ALIGN_PCT

    return {
        "available": True,
        "report_path": rel,
        "hint": None,
        "coverage_pct": coverage,
        "coverage_model_in_catalog_pct": cov_model,
        "coverage_catalog_in_model_pct": cov_catalog,
        "intersection_count": _as_int(raw.get("intersection_count")),
        "model_count": _as_int(raw.get("model_count")),
        "catalog_count": _as_int(raw.get("catalog_count")),
        "missing_in_catalog_count": missing_cat,
        "missing_in_model_count": missing_mod,
        "label2idx_path": raw.get("label2idx_path"),
        "label2idx_discovered": bool(raw.get("label2idx_discovered")),
        "catalog_path": raw.get("catalog_path"),
        "catalog_version": raw.get("catalog_version"),
        "timestamp": raw.get("timestamp"),
        "cadence": raw.get("cadence"),
        "selection_reason": raw.get("selection_reason"),
        "overlap_verdict": verdict,
        "mismatch": mismatch,
        "align_pct_threshold": ALIGN_PCT,
        "warn_pct_threshold": WARN_PCT,
        "cadence_note": raw.get("cadence_note"),
        "synonyms_applied_count": _as_int(raw.get("synonyms_applied_count")),
    }
