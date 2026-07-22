"""Discover multi-view checkpoint paths on disk (pure helpers, unit-tested).

Order of preference:
  1. Configured ``settings.multi_view_weights_path`` if the file exists
  2. Known in-repo Kaggle training outputs (best.pt / swa.pt)
  3. backend/app/ml/weights/*.pt
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

# Repo root: backend/app/ml/weight_discovery.py → parents[3] = repo root
_REPO_ROOT = Path(__file__).resolve().parents[3]
_BACKEND_ROOT = Path(__file__).resolve().parents[2]

# Relative candidates under the monorepo (never invent remote downloads).
_IN_REPO_CANDIDATES: tuple[str, ...] = (
    "kaggle/kernel_output_v9/models/best.pt",
    "kaggle/kernel_output_v9/models/swa.pt",
    "kaggle/kernel_output_v9/models/checkpoint_latest.pt",
    "backend/app/ml/weights/multiview_v1.pt",
    "backend/app/ml/weights/best.pt",
    "yolov8n.pt",  # detector only — not multi-view, listed for status discovery
)


def _normalize(path: Path | str | None) -> Path | None:
    if path is None:
        return None
    p = Path(path)
    try:
        return p.expanduser().resolve()
    except OSError:
        return p.expanduser()


def discover_multiview_weight_candidates(
    *,
    configured: Path | str | None = None,
    repo_root: Path | None = None,
) -> list[Path]:
    """Return existing multiview-ish .pt paths in discovery order (deduped)."""
    root = _normalize(repo_root) or _REPO_ROOT
    out: list[Path] = []
    seen: set[str] = set()

    def add(p: Path | None) -> None:
        if p is None:
            return
        key = str(p)
        if key in seen:
            return
        if p.is_file() and p.suffix.lower() in {".pt", ".pth", ".ckpt"}:
            # Exclude pure detector stub if name is yolov8n only when not multi-view
            name = p.name.lower()
            if name.startswith("yolo") and "multiview" not in name and "best" not in name:
                return
            if name in {"yolov8n.pt", "yolov8s.pt"}:
                return
            seen.add(key)
            out.append(p)

    add(_normalize(configured) if configured and Path(configured).exists() else None)

    for rel in _IN_REPO_CANDIDATES:
        add((root / rel).resolve() if (root / rel).exists() else None)

    weights_dir = (root / "backend" / "app" / "ml" / "weights").resolve()
    if weights_dir.is_dir():
        for p in sorted(weights_dir.glob("*.pt")):
            add(p.resolve())

    return out


def resolve_multiview_weights_path(
    *,
    configured: Path | str | None = None,
    repo_root: Path | None = None,
) -> Path | None:
    """First existing multi-view checkpoint, or None."""
    cands = discover_multiview_weight_candidates(
        configured=configured, repo_root=repo_root
    )
    return cands[0] if cands else None


def describe_weight_discovery(
    *,
    configured: Path | str | None = None,
    repo_root: Path | None = None,
) -> dict:
    """Status-friendly dict for dashboard / tests."""
    configured_p = _normalize(configured)
    found = discover_multiview_weight_candidates(
        configured=configured, repo_root=repo_root
    )
    resolved = found[0] if found else None
    return {
        "configured": str(configured_p) if configured_p else None,
        "configured_exists": bool(configured_p and configured_p.is_file()),
        "resolved": str(resolved) if resolved else None,
        "resolved_exists": bool(resolved and resolved.is_file()),
        "candidates": [str(p) for p in found],
        "candidate_count": len(found),
    }
