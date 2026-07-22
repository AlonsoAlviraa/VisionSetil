#!/usr/bin/env python3
"""label2idx ↔ species_catalog_v2 join coverage report (B-39 / D-B25).

Compares model class names from the best available ``label2idx.json`` against
``species_catalog_v2`` scientific names and writes an informational JSON report
(coverage %, missing taxa, counts, timestamp).

Cadence (D-B25):
  - Nightly schedule (``.github/workflows/species-index-join-nightly.yml``)
  - On-demand: run this script locally or via workflow_dispatch
  - NOT required on every PR / not a PR CI gate (incomplete coverage is OK)

Usage:
  python scripts/build_species_index_join.py
  python scripts/build_species_index_join.py \\
      --label2idx kaggle/kernel_output_v9/models/label2idx.json
  python scripts/build_species_index_join.py \\
      --catalog data/species_catalog/species_catalog_v2.json \\
      --out data/species_catalog/species_index_join_report.json

Discovery (when --label2idx is omitted):
  1. Sibling ``label2idx.json`` next to configured multi-view weights path
  2. ``kaggle/kernel_output*/models/label2idx.json`` (prefer multi-view sibling,
     else largest class count, else newest mtime)

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

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CATALOG = ROOT / "data" / "species_catalog" / "species_catalog_v2.json"
DEFAULT_SYNONYMS = ROOT / "data" / "species_catalog" / "synonyms.yaml"
DEFAULT_OUT = ROOT / "data" / "species_catalog" / "species_index_join_report.json"
# Matches backend Settings.multi_view_weights_path default (config.py).
DEFAULT_MULTI_VIEW = (
    ROOT / "kaggle" / "kernel_output_v9" / "models" / "best.pt"
)


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
            # strip inline comments
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


def normalize_key(name: str, reverse: dict[str, str]) -> str:
    raw = (name or "").strip()
    if not raw:
        return ""
    preferred = reverse.get(raw.lower(), raw)
    return preferred.lower()


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
    return out


def discover_label2idx_candidates(
    root: Path,
    multi_view_path: Path | None,
) -> list[Path]:
    """Find on-disk label2idx.json under multi-view dir + kaggle kernel outputs."""
    found: list[Path] = []
    seen: set[str] = set()

    def add(p: Path | None) -> None:
        if p is None or not p.is_file():
            return
        try:
            key = str(p.resolve())
        except OSError:
            key = str(p)
        if key in seen:
            return
        seen.add(key)
        found.append(p)

    if multi_view_path is not None:
        add(multi_view_path.parent / "label2idx.json")

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


def pick_best_label2idx(
    candidates: list[Path],
    multi_view_path: Path | None,
) -> Path | None:
    """Prefer multi-view sibling; else largest class count; else newest mtime."""
    if not candidates:
        return None

    if multi_view_path is not None:
        sib = multi_view_path.parent / "label2idx.json"
        try:
            sib_key = str(sib.resolve()) if sib.is_file() else None
        except OSError:
            sib_key = str(sib) if sib.is_file() else None
        if sib_key:
            for c in candidates:
                try:
                    if str(c.resolve()) == sib_key:
                        return c
                except OSError:
                    if str(c) == sib_key:
                        return c

    def sort_key(p: Path) -> tuple[int, float]:
        try:
            mtime = p.stat().st_mtime
        except OSError:
            mtime = 0.0
        return (_label_count(p), mtime)

    return max(candidates, key=sort_key)


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
) -> dict:
    cat_keys: dict[str, str] = {}
    for n in catalog_names:
        k = normalize_key(n, reverse)
        if k and k not in cat_keys:
            cat_keys[k] = n

    model_labels = list((label2idx or {}).keys())
    model_keys: dict[str, str] = {}
    for n in model_labels:
        k = normalize_key(n, reverse)
        if k and k not in model_keys:
            model_keys[k] = n

    inter_keys = set(cat_keys) & set(model_keys)
    missing_in_catalog = sorted(
        model_keys[k] for k in set(model_keys) - set(cat_keys)
    )
    missing_in_model = sorted(
        cat_keys[k] for k in set(cat_keys) - set(model_keys)
    )

    catalog_count = len(cat_keys)
    model_count = len(model_keys)
    intersection = len(inter_keys)

    cov_model = (
        round(100.0 * intersection / model_count, 2) if model_count else 0.0
    )
    cov_catalog = (
        round(100.0 * intersection / catalog_count, 2) if catalog_count else 0.0
    )
    # Primary coverage: share of model taxa present in catalog (product-relevant).
    coverage_pct = cov_model

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "cadence": "nightly_and_on_demand",
        "cadence_note": (
            "D-B25: run nightly + on-demand; not required on every PR CI. "
            "Incomplete coverage is informational (exit 0)."
        ),
        "catalog_path": rel_posix(catalog_path),
        "catalog_version": catalog.get("catalog_version"),
        "catalog_count": catalog_count,
        "catalog_count_raw": catalog.get("count", catalog_count),
        "label2idx_path": rel_posix(label2idx_path),
        "label2idx_discovered": bool(label2idx_path and label2idx_path.is_file()),
        "multi_view_weights_path": rel_posix(multi_view_path),
        "candidates_considered": [rel_posix(p) for p in candidates],
        "model_count": model_count,
        "intersection_count": intersection,
        "coverage_pct": coverage_pct,
        "coverage_model_in_catalog_pct": cov_model,
        "coverage_catalog_in_model_pct": cov_catalog,
        "missing_in_catalog": missing_in_catalog,
        "missing_in_catalog_count": len(missing_in_catalog),
        "missing_in_model": missing_in_model,
        "missing_in_model_count": len(missing_in_model),
        "synonym_groups": len({k for k in reverse.values()}) if reverse else 0,
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
        help="Explicit label2idx.json (skips discovery when set and present)",
    )
    ap.add_argument(
        "--multi-view-weights",
        type=Path,
        default=DEFAULT_MULTI_VIEW,
        help=(
            "Configured multi-view weights path; sibling label2idx.json is "
            "preferred during discovery"
        ),
    )
    ap.add_argument(
        "--synonyms",
        type=Path,
        default=DEFAULT_SYNONYMS,
        help="Optional synonyms.yaml for alias normalization",
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
    catalog_path: Path = args.catalog
    out_path: Path = args.out
    multi_view_path: Path = args.multi_view_weights

    if not catalog_path.is_file():
        print(f"catalog missing: {catalog_path}", file=sys.stderr)
        return 1

    try:
        catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"catalog unreadable: {exc}", file=sys.stderr)
        return 1

    catalog_names = load_catalog_names(catalog)
    reverse = synonym_reverse(load_synonyms(args.synonyms))

    candidates = discover_label2idx_candidates(ROOT, multi_view_path)
    label2idx_path: Path | None = None
    label2idx: dict[str, int] | None = None

    if args.label2idx is not None:
        explicit = args.label2idx
        if not explicit.is_absolute():
            explicit = (Path.cwd() / explicit).resolve()
        if explicit.is_file():
            label2idx_path = explicit
            if explicit not in candidates and all(
                str(c.resolve()) != str(explicit.resolve())
                for c in candidates
                if c.exists()
            ):
                candidates = [explicit, *candidates]
        else:
            print(
                f"WARNING: --label2idx not found: {args.label2idx} "
                f"— falling back to discovery",
                file=sys.stderr,
            )

    if label2idx_path is None:
        label2idx_path = pick_best_label2idx(candidates, multi_view_path)

    if label2idx_path is not None and label2idx_path.is_file():
        try:
            label2idx = load_label2idx(label2idx_path)
        except (OSError, json.JSONDecodeError, ValueError) as exc:
            print(f"WARNING: label2idx unreadable ({exc})", file=sys.stderr)
            label2idx = {}
    else:
        print(
            "WARNING: no label2idx.json found under multi-view path or "
            "kaggle/kernel_output*/models/ — report will show model_count=0",
            file=sys.stderr,
        )
        label2idx_path = None
        label2idx = {}

    report = build_report(
        catalog_path=catalog_path,
        catalog=catalog,
        catalog_names=catalog_names,
        label2idx_path=label2idx_path,
        label2idx=label2idx,
        reverse=reverse,
        candidates=candidates,
        multi_view_path=multi_view_path,
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    # Compact stdout summary (full missing lists live in the JSON file).
    summary = {
        "timestamp": report["timestamp"],
        "catalog_count": report["catalog_count"],
        "model_count": report["model_count"],
        "intersection_count": report["intersection_count"],
        "coverage_pct": report["coverage_pct"],
        "coverage_model_in_catalog_pct": report["coverage_model_in_catalog_pct"],
        "coverage_catalog_in_model_pct": report["coverage_catalog_in_model_pct"],
        "missing_in_catalog_count": report["missing_in_catalog_count"],
        "missing_in_model_count": report["missing_in_model_count"],
        "label2idx_path": report["label2idx_path"],
        "out": rel_posix(out_path),
    }
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    # Informational even when coverage is incomplete.
    return 0


if __name__ == "__main__":
    sys.exit(main())
