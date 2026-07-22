#!/usr/bin/env python3
"""label2idx ↔ species_catalog_v2 join coverage report (B-39 / D-B25).

Compares model class names from the best available ``label2idx.json`` against
``species_catalog_v2`` scientific names and writes an informational JSON report
(coverage %, missing taxa, counts, timestamp).

Cadence (D-B25):
  - Nightly schedule (``.github/workflows/species-index-join-nightly.yml``)
  - On-demand: run this script locally or via workflow_dispatch
  - NOT required on every PR / not a PR CI gate (incomplete coverage is OK)
  - Nightly artifact is the operational truth; committed JSON is a baseline snapshot

Synonym policy (join only):
  - Catalog taxa are NEVER collapsed (each scientific_name is a distinct key).
  - Model labels map via synonyms.yaml only when the alias is absent from the
    catalog (true historical aliases). Confusable pairs that both appear in the
    catalog (e.g. Lactarius deliciosus / L. sanguifluus) stay separate.

Usage:
  python scripts/build_species_index_join.py
  python scripts/build_species_index_join.py \\
      --label2idx kaggle/kernel_output_v9/models/label2idx.json
  python scripts/build_species_index_join.py \\
      --catalog data/species_catalog/species_catalog_v2.json \\
      --out data/species_catalog/species_index_join_report.json

Discovery (when --label2idx is omitted), first *readable* wins:
  1. Sibling label2idx of configured multi-view weights path
  2. Sibling of runtime-resolved multi-view checkpoint (weight_discovery)
  3. ``kaggle/kernel_output*/models/label2idx.json`` by largest class count,
     then newest mtime

Exit codes:
  0  report written (coverage may be incomplete — informational only)
  1  catalog missing/unreadable (cannot produce a meaningful report)
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CATALOG = ROOT / "data" / "species_catalog" / "species_catalog_v2.json"
DEFAULT_SYNONYMS = ROOT / "data" / "species_catalog" / "synonyms.yaml"
DEFAULT_OUT = ROOT / "data" / "species_catalog" / "species_index_join_report.json"
# Matches backend Settings.multi_view_weights_path default (config.py).
DEFAULT_MULTI_VIEW = (
    ROOT / "kaggle" / "kernel_output_v9" / "models" / "best.pt"
)

SelectionReason = str  # explicit | multi_view_configured_sibling | multi_view_resolved_sibling | max_class_count | none


def load_synonyms(path: Path) -> dict[str, list[str]]:
    """Minimal YAML subset parser for synonyms.yaml (no PyYAML required)."""
    if not path.exists():
        return {}
    text = path.read_text(encoding="utf-8")
    mapping: dict[str, list[str]] = {}
    current: str | None = None
    for line in text.splitlines():
        if not line.strip() or line.strip().startswith("#"):
            continue
        if re.match(r"^[A-Z]", line) and line.rstrip().endswith(":"):
            current = line.strip().rstrip(":")
            mapping[current] = []
        elif current and line.strip().startswith("-"):
            val = line.strip()[1:].strip()
            val = val.split("#", 1)[0].strip()
            if val:
                mapping[current].append(val)
    return mapping


def synonym_reverse(syn: dict[str, list[str]]) -> dict[str, str]:
    """Map any alias (lower) → preferred scientific name."""
    reverse: dict[str, str] = {}
    for preferred, alts in syn.items():
        reverse[preferred.lower()] = preferred
        for a in alts:
            reverse[a.lower()] = preferred
    return reverse


def safe_model_synonym_map(
    reverse: dict[str, str],
    catalog_lower: set[str],
) -> tuple[dict[str, str], list[dict[str, str]]]:
    """Alias→preferred for model labels only when alias is not a catalog taxon.

    Returns (safe_map, skipped_collisions) where collisions are aliases that
    appear as first-class catalog scientific names and must not be collapsed.
    """
    safe: dict[str, str] = {}
    skipped: list[dict[str, str]] = []
    for alias_lower, preferred in reverse.items():
        pref_lower = preferred.strip().lower()
        if not alias_lower or alias_lower == pref_lower:
            continue
        if alias_lower in catalog_lower:
            skipped.append(
                {
                    "alias": alias_lower,
                    "preferred": preferred,
                    "reason": "alias_is_catalog_taxon",
                }
            )
            continue
        safe[alias_lower] = preferred
    return safe, skipped


def load_catalog_names(catalog: dict) -> list[str]:
    names: list[str] = []
    for sp in catalog.get("species") or []:
        sn = (sp.get("scientific_name") or "").strip()
        if sn:
            names.append(sn)
    return names


def load_label2idx(path: Path) -> dict[str, int]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError(f"label2idx must be an object: {path}")
    out: dict[str, int] = {}
    for k, v in raw.items():
        try:
            out[str(k)] = int(v)
        except (TypeError, ValueError):
            continue
    if not out:
        raise ValueError(f"label2idx has no usable class entries: {path}")
    return out


def path_key(p: Path) -> str:
    try:
        return str(p.resolve())
    except OSError:
        return str(p)


def discover_label2idx_candidates(
    root: Path,
    multi_view_path: Path | None,
    resolved_weights: Path | None = None,
) -> list[Path]:
    """Find on-disk label2idx.json under multi-view dirs + kaggle kernel outputs."""
    found: list[Path] = []
    seen: set[str] = set()

    def add(p: Path | None) -> None:
        if p is None or not p.is_file():
            return
        key = path_key(p)
        if key in seen:
            return
        seen.add(key)
        found.append(p)

    if multi_view_path is not None:
        add(multi_view_path.parent / "label2idx.json")
    if resolved_weights is not None:
        add(resolved_weights.parent / "label2idx.json")

    kaggle = root / "kaggle"
    if kaggle.is_dir():
        for p in sorted(kaggle.glob("kernel_output*/models/label2idx.json")):
            add(p)

    return found


def _label_count(path: Path) -> int:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return len(data) if isinstance(data, dict) else -1
    except (OSError, json.JSONDecodeError, TypeError):
        return -1


def resolve_runtime_weights(
    configured: Path | None,
    root: Path,
) -> Path | None:
    """Best-effort sibling of app.ml.weight_discovery (optional import)."""
    try:
        backend = root / "backend"
        backend_s = str(backend)
        if backend_s not in sys.path:
            sys.path.insert(0, backend_s)
        from app.ml.weight_discovery import (  # type: ignore
            resolve_multiview_weights_path,
        )

        return resolve_multiview_weights_path(
            configured=configured, repo_root=root
        )
    except Exception:
        if configured is not None and configured.is_file():
            return configured
        return None


def rank_label2idx_candidates(
    candidates: list[Path],
    *,
    multi_view_path: Path | None,
    resolved_weights: Path | None,
    explicit: Path | None = None,
) -> list[tuple[Path, SelectionReason]]:
    """Ordered (path, reason) list; first readable usable file wins at load time."""
    ordered: list[tuple[Path, SelectionReason]] = []
    seen: set[str] = set()

    def push(p: Path | None, reason: SelectionReason) -> None:
        if p is None or not p.is_file():
            return
        key = path_key(p)
        if key in seen:
            return
        seen.add(key)
        ordered.append((p, reason))

    push(explicit, "explicit")

    if multi_view_path is not None:
        push(multi_view_path.parent / "label2idx.json", "multi_view_configured_sibling")

    if resolved_weights is not None:
        push(resolved_weights.parent / "label2idx.json", "multi_view_resolved_sibling")

    rest = [c for c in candidates if path_key(c) not in seen]

    def sort_key(p: Path) -> tuple[int, float]:
        try:
            mtime = p.stat().st_mtime
        except OSError:
            mtime = 0.0
        return (_label_count(p), mtime)

    for p in sorted(rest, key=sort_key, reverse=True):
        push(p, "max_class_count")

    return ordered


def pick_and_load_label2idx(
    ranked: list[tuple[Path, SelectionReason]],
) -> tuple[Path | None, dict[str, int], SelectionReason, str | None, list[str]]:
    """Try ranked candidates until one loads with usable classes."""
    load_errors: list[str] = []
    for path, reason in ranked:
        try:
            data = load_label2idx(path)
            return path, data, reason, None, load_errors
        except (OSError, json.JSONDecodeError, ValueError, TypeError) as exc:
            load_errors.append(f"{path}: {exc}")
            continue
    return None, {}, "none", (
        load_errors[-1] if load_errors else "no_candidates"
    ), load_errors


def rel_posix(path: Path | None, root: Path = ROOT) -> str | None:
    """Repo-relative POSIX path when under root; else absolute POSIX."""
    if path is None:
        return None
    try:
        resolved = path.resolve()
        root_r = root.resolve()
        return resolved.relative_to(root_r).as_posix()
    except (OSError, ValueError):
        try:
            return path.as_posix()
        except Exception:
            return str(path)


def resolve_cli_path(path: Path | None, root: Path = ROOT) -> Path | None:
    """Resolve relative CLI paths: cwd first, then monorepo ROOT."""
    if path is None:
        return None
    if path.is_absolute():
        return path
    cwd_candidate = Path.cwd() / path
    if cwd_candidate.exists():
        try:
            return cwd_candidate.resolve()
        except OSError:
            return cwd_candidate
    root_candidate = root / path
    try:
        return root_candidate.resolve()
    except OSError:
        return root_candidate


def join_taxa(
    catalog_names: list[str],
    model_labels: list[str],
    reverse: dict[str, str],
) -> dict[str, Any]:
    """Build join sets without collapsing distinct catalog taxa."""
    cat_keys: dict[str, str] = {}
    for n in catalog_names:
        k = n.strip().lower()
        if k and k not in cat_keys:
            cat_keys[k] = n.strip()

    catalog_lower = set(cat_keys.keys())
    safe_map, skipped = safe_model_synonym_map(reverse, catalog_lower)

    model_keys: dict[str, str] = {}
    synonyms_applied: list[dict[str, str]] = []
    for n in model_labels:
        raw = (n or "").strip()
        if not raw:
            continue
        lower = raw.lower()
        if lower in catalog_lower:
            join_key = lower
        elif lower in safe_map:
            preferred = safe_map[lower]
            join_key = preferred.strip().lower()
            synonyms_applied.append({"from": raw, "to": preferred})
        else:
            join_key = lower
        if join_key not in model_keys:
            model_keys[join_key] = raw

    inter_keys = set(cat_keys) & set(model_keys)
    missing_in_catalog = sorted(
        model_keys[k] for k in set(model_keys) - set(cat_keys)
    )
    missing_in_model = sorted(
        cat_keys[k] for k in set(cat_keys) - set(model_keys)
    )

    return {
        "cat_keys": cat_keys,
        "model_keys": model_keys,
        "intersection_count": len(inter_keys),
        "missing_in_catalog": missing_in_catalog,
        "missing_in_model": missing_in_model,
        "synonyms_applied": synonyms_applied,
        "synonym_collisions_skipped": skipped,
    }


def build_report(
    *,
    catalog_path: Path,
    catalog: dict,
    catalog_names: list[str],
    label2idx_path: Path | None,
    label2idx: dict[str, int] | None,
    reverse: dict[str, str],
    candidates: list[Path],
    multi_view_path: Path,
    resolved_weights: Path | None,
    selection_reason: SelectionReason,
    label2idx_load_error: str | None,
    load_errors: list[str] | None = None,
) -> dict:
    model_labels = list((label2idx or {}).keys())
    model_count_raw = len(model_labels)
    joined = join_taxa(catalog_names, model_labels, reverse)

    catalog_count = len(joined["cat_keys"])
    model_count = len(joined["model_keys"])
    intersection = joined["intersection_count"]

    cov_model = (
        round(100.0 * intersection / model_count, 2) if model_count else 0.0
    )
    cov_catalog = (
        round(100.0 * intersection / catalog_count, 2) if catalog_count else 0.0
    )
    # Primary coverage: share of model taxa present in catalog (product-relevant).
    coverage_pct = cov_model

    synonym_groups = len({v for v in reverse.values()}) if reverse else 0

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "cadence": "nightly_and_on_demand",
        "cadence_note": (
            "D-B25: run nightly + on-demand; not required on every PR CI. "
            "Incomplete coverage is informational (exit 0). "
            "Nightly workflow artifact is operational truth; committed JSON is a baseline snapshot."
        ),
        "catalog_path": rel_posix(catalog_path),
        "catalog_version": catalog.get("catalog_version"),
        "catalog_count": catalog_count,
        "catalog_count_raw": catalog.get("count", len(catalog_names)),
        "label2idx_path": rel_posix(label2idx_path),
        "label2idx_discovered": bool(
            label2idx_path and label2idx_path.is_file() and model_count_raw > 0
        ),
        "label2idx_load_error": label2idx_load_error,
        "label2idx_load_errors": load_errors or [],
        "selection_reason": selection_reason,
        "selection_policy": (
            "configured multi-view sibling labels (product default), not necessarily "
            "the largest tracked label2idx; falls back to resolved-weights sibling then max classes"
        ),
        "multi_view_weights_path": rel_posix(multi_view_path),
        "multi_view_weights_exists": bool(
            multi_view_path is not None and multi_view_path.is_file()
        ),
        "multi_view_weights_resolved": rel_posix(resolved_weights),
        "candidates_considered": [rel_posix(p) for p in candidates],
        "model_count": model_count,
        "model_count_raw": model_count_raw,
        "intersection_count": intersection,
        "coverage_pct": coverage_pct,
        "coverage_model_in_catalog_pct": cov_model,
        "coverage_catalog_in_model_pct": cov_catalog,
        "missing_in_catalog": joined["missing_in_catalog"],
        "missing_in_catalog_count": len(joined["missing_in_catalog"]),
        "missing_in_model": joined["missing_in_model"],
        "missing_in_model_count": len(joined["missing_in_model"]),
        "synonym_groups": synonym_groups,
        "synonyms_applied": joined["synonyms_applied"],
        "synonyms_applied_count": len(joined["synonyms_applied"]),
        "synonym_collisions_skipped": joined["synonym_collisions_skipped"],
        "synonym_policy": (
            "catalog taxa never collapsed; model aliases map only when alias "
            "is absent from catalog scientific_names"
        ),
    }


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    ap = argparse.ArgumentParser(
        description=(
            "label2idx ↔ catalog_v2 join coverage report "
            "(nightly + on-demand; not per-PR CI)"
        )
    )
    ap.add_argument(
        "--catalog",
        type=Path,
        default=DEFAULT_CATALOG,
        help="Path to species_catalog_v2.json",
    )
    ap.add_argument(
        "--label2idx",
        type=Path,
        default=None,
        help="Explicit label2idx.json (preferred when set and readable)",
    )
    ap.add_argument(
        "--multi-view-weights",
        type=Path,
        default=DEFAULT_MULTI_VIEW,
        help=(
            "Configured multi-view weights path; sibling label2idx.json is "
            "preferred during discovery (product-default labels)"
        ),
    )
    ap.add_argument(
        "--synonyms",
        type=Path,
        default=DEFAULT_SYNONYMS,
        help="Optional synonyms.yaml for model-side alias normalization",
    )
    ap.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_OUT,
        help="Output JSON report path",
    )
    return ap.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    catalog_path = resolve_cli_path(args.catalog) or args.catalog
    out_path = resolve_cli_path(args.out) or args.out
    multi_view_path = resolve_cli_path(args.multi_view_weights) or args.multi_view_weights
    synonyms_path = resolve_cli_path(args.synonyms) or args.synonyms
    explicit_l2i = resolve_cli_path(args.label2idx) if args.label2idx else None

    if not catalog_path.is_file():
        print(f"catalog missing: {catalog_path}", file=sys.stderr)
        return 1

    try:
        catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"catalog unreadable: {exc}", file=sys.stderr)
        return 1

    catalog_names = load_catalog_names(catalog)
    reverse = synonym_reverse(load_synonyms(synonyms_path))

    resolved_weights = resolve_runtime_weights(multi_view_path, ROOT)
    candidates = discover_label2idx_candidates(
        ROOT, multi_view_path, resolved_weights
    )

    if explicit_l2i is not None and not explicit_l2i.is_file():
        print(
            f"WARNING: --label2idx not found: {args.label2idx} "
            f"— falling back to discovery",
            file=sys.stderr,
        )
        explicit_l2i = None
    elif explicit_l2i is not None:
        if all(path_key(c) != path_key(explicit_l2i) for c in candidates):
            candidates = [explicit_l2i, *candidates]

    ranked = rank_label2idx_candidates(
        candidates,
        multi_view_path=multi_view_path,
        resolved_weights=resolved_weights,
        explicit=explicit_l2i,
    )
    label2idx_path, label2idx, selection_reason, load_error, load_errors = (
        pick_and_load_label2idx(ranked)
    )

    if label2idx_path is None:
        print(
            "WARNING: no readable label2idx.json under multi-view path or "
            "kaggle/kernel_output*/models/ — report will show model_count=0",
            file=sys.stderr,
        )
        for err in load_errors:
            print(f"  skipped: {err}", file=sys.stderr)

    report = build_report(
        catalog_path=catalog_path,
        catalog=catalog,
        catalog_names=catalog_names,
        label2idx_path=label2idx_path,
        label2idx=label2idx,
        reverse=reverse,
        candidates=candidates,
        multi_view_path=multi_view_path,
        resolved_weights=resolved_weights,
        selection_reason=selection_reason,
        label2idx_load_error=load_error,
        load_errors=load_errors,
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    summary = {
        "timestamp": report["timestamp"],
        "catalog_count": report["catalog_count"],
        "model_count": report["model_count"],
        "model_count_raw": report["model_count_raw"],
        "intersection_count": report["intersection_count"],
        "coverage_pct": report["coverage_pct"],
        "coverage_model_in_catalog_pct": report["coverage_model_in_catalog_pct"],
        "coverage_catalog_in_model_pct": report["coverage_catalog_in_model_pct"],
        "missing_in_catalog_count": report["missing_in_catalog_count"],
        "missing_in_model_count": report["missing_in_model_count"],
        "selection_reason": report["selection_reason"],
        "label2idx_path": report["label2idx_path"],
        "out": rel_posix(out_path),
    }
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
