"""Smoke tests for four-photo multi-view benchmark helpers."""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "eval" / "scripts"))

from multiview_four_photo_benchmark import (  # noqa: E402
    CANONICAL_VIEWS,
    SIGNAL_BY_N,
    degrade,
    map_at_k,
    open_set_mask,
    product_contracts,
    topk_acc,
)


def test_canonical_four_slots():
    assert CANONICAL_VIEWS == ("gills", "front", "habitat", "detail")
    assert SIGNAL_BY_N[4] == 1.0
    assert SIGNAL_BY_N[2] > SIGNAL_BY_N[1]


def test_degrade_full_matches_temperature_one():
    rng = np.random.default_rng(0)
    p = rng.dirichlet(np.ones(10), size=20)
    p = p / p.sum(axis=1, keepdims=True)
    out = degrade(p, 1.0, rng=None)
    assert out.shape == p.shape
    assert np.allclose(out.sum(axis=1), 1.0, atol=1e-5)


def test_degrade_low_alpha_flattens_confidence():
    rng = np.random.default_rng(1)
    # Peak distributions
    p = np.eye(5)
    p = p + 0.01
    p = p / p.sum(axis=1, keepdims=True)
    full = degrade(p, 1.0, rng=None)
    weak = degrade(p, 0.38, rng=None)
    assert full.max(axis=1).mean() > weak.max(axis=1).mean()


def test_open_set_reject_high_thr():
    p = np.array([[0.5, 0.3, 0.2], [0.95, 0.03, 0.02]], dtype=np.float64)
    rej = open_set_mask(p, conf_thr=0.9, margin_thr=0.05, entropy_thr=None)
    assert rej[0]  # low conf
    assert not rej[1]


def test_product_contracts():
    c = product_contracts()
    assert c["full_packet"] == 4
    assert c["slots"][0]["view"] == "gills"
    assert c["slots"][0]["required"] is True


def test_map_metrics_smoke():
    probs = np.eye(4)
    labels = np.arange(4)
    assert topk_acc(probs, labels, 1) == 1.0
    assert map_at_k(probs, labels, 3) == 1.0


@pytest.mark.skipif(
    not (REPO / "kaggle/kernel_output_v20/models/test_predictions.npz").is_file(),
    reason="E20 artifacts not present",
)
def test_benchmark_script_exit_zero():
    import subprocess

    r = subprocess.run(
        [
            sys.executable,
            str(REPO / "eval/scripts/multiview_four_photo_benchmark.py"),
            "--skip-torch",
        ],
        cwd=str(REPO),
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert r.returncode == 0, r.stdout + r.stderr
