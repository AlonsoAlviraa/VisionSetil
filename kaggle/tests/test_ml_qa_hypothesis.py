"""Property-based tests — shrink toward minimal failures."""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

hypothesis = pytest.importorskip("hypothesis")
from hypothesis import given, settings, assume
from hypothesis import strategies as st

from kaggle.ml_qa.leak_invariants import check_disjoint_obs, run_source_holdout_selftest
from kaggle.ml_qa.metrics_core import deadly_gate_eval, deadly_recall_at_k, map_at_k


@given(
    n=st.integers(1, 40),
    c=st.integers(2, 12),
    data=st.data(),
)
@settings(max_examples=40, deadline=None)
def test_map_at_k_bounds(n, c, data):
    labels = np.array([data.draw(st.integers(0, c - 1)) for _ in range(n)])
    raw = np.array(
        [[data.draw(st.floats(0.01, 10.0, allow_nan=False, allow_infinity=False)) for _ in range(c)] for _ in range(n)]
    )
    probs = raw / raw.sum(axis=1, keepdims=True)
    m = map_at_k(probs, labels, k=min(3, c))
    assert 0.0 <= m <= 1.0


@given(n_deadly=st.integers(0, 5), thr=st.floats(0.1, 0.9))
@settings(max_examples=30, deadline=None)
def test_gate_never_vacuous_pass(n_deadly, thr):
    g = deadly_gate_eval(1.0, n_deadly=n_deadly, threshold=thr)
    if n_deadly == 0:
        assert g["pass"] is False
        assert g["status"] == "unevaluable"
    else:
        assert g["pass"] is True  # value 1.0


@given(seed=st.integers(0, 200))
@settings(max_examples=25, deadline=None)
def test_source_holdout_always_disjoint(seed):
    rows = []
    for i in range(30):
        rows.append(
            {
                "observation_id": f"ft_{i}",
                "species": f"S{i % 5}",
                "source_db": "fungitastic",
                "image_path": f"/ft/S{i%5}/a_{i}.jpg",
                "license_class": "cc_ok",
            }
        )
    for i in range(30):
        rows.append(
            {
                "observation_id": f"gb_{i}",
                "species": f"S{i % 5}",
                "source_db": "gbif_es",
                "image_path": f"/gb/S{i%5}/{2000000+i}.jpg",
                "license_class": "nc",
            }
        )
    df = pd.DataFrame(rows)
    out = run_source_holdout_selftest(df, seed=seed, val_size=0.2, min_per_class=2)
    assume(out.get("protocol") is not None)
    assert out["disjoint"]["pass"] is True
    assert out["domains"]["train_polluted_with_test_domain"] is False


@given(
    train_ids=st.lists(st.text(min_size=1, max_size=4, alphabet="abc"), min_size=1, max_size=8, unique=True),
    extra=st.booleans(),
)
@settings(max_examples=40, deadline=None)
def test_disjoint_checker_property(train_ids, extra):
    train = pd.DataFrame({"observation_id": train_ids})
    val = pd.DataFrame({"observation_id": [f"v{i}" for i in range(3)]})
    if extra and train_ids:
        test = pd.DataFrame({"observation_id": [train_ids[0], "tx"]})
        r = check_disjoint_obs(train, val, test)
        assert r["pass"] is False
    else:
        test = pd.DataFrame({"observation_id": [f"t{i}" for i in range(3)]})
        r = check_disjoint_obs(train, val, test)
        assert r["pass"] is True


@given(n=st.integers(1, 20), c=st.integers(2, 8))
@settings(max_examples=30, deadline=None)
def test_deadly_recall_bounds(n, c):
    labels = np.random.default_rng(0).integers(0, c, size=n)
    raw = np.random.default_rng(1).random((n, c)) + 0.01
    probs = raw / raw.sum(axis=1, keepdims=True)
    d3, nd = deadly_recall_at_k(probs, labels, set(range(c)), k=3)
    assert 0.0 <= d3 <= 1.0
    assert nd == n  # all classes "deadly"
