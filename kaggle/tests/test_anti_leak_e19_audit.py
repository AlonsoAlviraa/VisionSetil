"""Pure-function tests for E19 leak audit helpers."""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from scripts.audit_e19_leak import (  # noqa: E402
    anti_leak_split_obs,
    check_obs_disjoint,
    deadly_recall_at_k,
    deadly_top1_from_preds,
    ece_naive,
    map_at_k,
    media_id_key,
    stem_key,
    topk_hit,
)


def test_stem_and_media_key():
    assert stem_key(r"data\foo\1453223341_c927f91984.jpg") == "1453223341_c927f91984"
    assert media_id_key("1453223341_c927f91984.jpg") == "1453223341"
    assert media_id_key("abc.jpg") is None


def test_map_at_k_perfect():
    probs = np.eye(4, dtype=np.float32)
    labels = np.arange(4)
    assert map_at_k(probs, labels, 3) == 1.0
    assert topk_hit(probs, labels, 1) == 1.0


def test_map_at_k_rank2_is_half():
    """True class always rank-2 → MAP@3 = 0.5."""
    n, c = 6, 5
    probs = np.zeros((n, c), dtype=np.float32)
    labels = np.zeros(n, dtype=np.int64)
    for i in range(n):
        true = i % c
        labels[i] = true
        wrong = (true + 1) % c
        probs[i, wrong] = 0.9
        probs[i, true] = 0.5
        # rest lower
    assert abs(map_at_k(probs, labels, 3) - 0.5) < 1e-6


def test_deadly_recall_at_k_hit_and_miss():
    # 2 deadly samples (class 0), 1 safe (class 2)
    # sample0: deadly true rank1; sample1: deadly true rank3; sample2: safe
    probs = np.array(
        [
            [0.8, 0.1, 0.05, 0.05],  # top1 = 0 deadly hit@1 and @3
            [0.1, 0.4, 0.3, 0.2],  # top3 = 1,2,3 — true 0 miss
            [0.1, 0.1, 0.7, 0.1],  # safe class 2
        ],
        dtype=np.float32,
    )
    labels = np.array([0, 0, 2], dtype=np.int64)
    deadly = {0}
    d3, n = deadly_recall_at_k(probs, labels, deadly, k=3)
    assert n == 2
    assert abs(d3 - 0.5) < 1e-6  # 1 of 2
    d1, n1 = deadly_top1_from_preds(probs.argmax(1), labels, deadly)
    assert n1 == 2
    assert abs(d1 - 0.5) < 1e-6


def test_ece_naive_perfect():
    probs = np.eye(3, dtype=np.float32)
    labels = np.arange(3)
    assert ece_naive(probs, labels) == 0.0


def test_anti_leak_split_disjoint():
    rows = []
    for sp_i, sp in enumerate(["Amanita phalloides", "Boletus edulis", "Laccaria laccata"]):
        for o in range(20):
            oid = f"gbif_{sp_i}_{o}"
            for im in range(2):
                rows.append(
                    {
                        "observation_id": oid,
                        "species": sp,
                        "genus": sp.split()[0],
                        "image_path": f"/tmp/{oid}_{im}.jpg",
                        "source_db": "gbif_es",
                    }
                )
    df = pd.DataFrame(rows)
    train, val, test, meta = anti_leak_split_obs(df, seed=42)
    assert meta["pass"] is True
    assert meta["leaks"] == {"train_val": 0, "train_test": 0, "val_test": 0}
    ids_t = set(train["observation_id"])
    ids_v = set(val["observation_id"])
    ids_te = set(test["observation_id"])
    assert check_obs_disjoint(ids_t, ids_v, ids_te)["pass"]
    assert len(ids_t) + len(ids_v) + len(ids_te) == (
        meta["n_train_obs"] + meta["n_val_obs"] + meta["n_test_obs"]
    )


def test_anti_leak_multi_image_same_obs_stay_together():
    """All images of one observation_id must land in the same split."""
    rows = []
    for o in range(30):
        oid = f"gbif_x_{o}"
        sp = "Amanita phalloides" if o < 15 else "Boletus edulis"
        for im in range(5):  # multi-image obs
            rows.append(
                {
                    "observation_id": oid,
                    "species": sp,
                    "genus": sp.split()[0],
                    "image_path": f"/tmp/{oid}_{im}.jpg",
                    "source_db": "gbif_es",
                }
            )
    df = pd.DataFrame(rows)
    train, val, test, meta = anti_leak_split_obs(df, seed=0)
    assert meta["pass"]
    for split_df in (train, val, test):
        for oid, g in split_df.groupby("observation_id"):
            # entire obs group is in this split (no partial)
            assert len(g) == 5, f"obs {oid} split across? n={len(g)}"
    # no image-level obs id in two splits
    assert check_obs_disjoint(
        set(train["observation_id"]),
        set(val["observation_id"]),
        set(test["observation_id"]),
    )["pass"]
