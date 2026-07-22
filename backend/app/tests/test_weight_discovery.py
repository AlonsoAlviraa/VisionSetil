"""Unit tests for multiview weight discovery + status honesty (no GPU required)."""

from __future__ import annotations

from pathlib import Path

from app.ml.weight_discovery import (
    describe_weight_discovery,
    discover_multiview_weight_candidates,
    resolve_multiview_weights_path,
)


def test_discover_finds_in_repo_kaggle_best_when_present():
    root = Path(__file__).resolve().parents[3]
    cands = discover_multiview_weight_candidates(repo_root=root)
    # Repo may or may not ship large .pt in CI clones — if present, must be first-class
    best = root / "kaggle" / "kernel_output_v9" / "models" / "best.pt"
    if best.is_file():
        resolved = resolve_multiview_weights_path(repo_root=root)
        assert resolved is not None
        assert resolved.is_file()
        assert resolved.suffix == ".pt"
        assert any("best.pt" in str(p) or "swa.pt" in str(p) for p in cands)
    else:
        # Still must return a list and not invent paths
        assert isinstance(cands, list)
        for p in cands:
            assert p.is_file()


def test_describe_weight_discovery_shape():
    root = Path(__file__).resolve().parents[3]
    info = describe_weight_discovery(
        configured=root / "backend" / "app" / "ml" / "weights" / "missing.pt",
        repo_root=root,
    )
    assert "configured" in info
    assert "resolved" in info
    assert "candidates" in info
    assert info["configured_exists"] is False
    assert isinstance(info["candidate_count"], int)


def test_resolve_prefers_existing_configured_over_missing():
    root = Path(__file__).resolve().parents[3]
    missing = root / "backend" / "app" / "ml" / "weights" / "does_not_exist.pt"
    resolved = resolve_multiview_weights_path(configured=missing, repo_root=root)
    # Should still find in-repo candidate if any, else None
    if resolved is not None:
        assert resolved.is_file()
