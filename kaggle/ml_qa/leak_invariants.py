"""Leak / split invariants for professional tester."""
from __future__ import annotations

from typing import Any, Iterable, Optional

import pandas as pd

from kaggle.near_dup import near_dup_keys_for_row, shared_near_dup_keys
from kaggle.split_export import (
    TEST_DOMAIN_DEFAULT,
    TRAIN_DOMAIN_DEFAULT,
    assert_obs_disjoint,
    source_holdout_split,
)


def obs_id_sets(
    train: pd.DataFrame, val: pd.DataFrame, test: pd.DataFrame, col: str = "observation_id"
) -> dict[str, set[str]]:
    def _s(df: pd.DataFrame) -> set[str]:
        if col not in df.columns or len(df) == 0:
            return set()
        return set(df[col].astype(str))

    return {"train": _s(train), "val": _s(val), "test": _s(test)}


def check_disjoint_obs(
    train: pd.DataFrame, val: pd.DataFrame, test: pd.DataFrame
) -> dict[str, Any]:
    sets = obs_id_sets(train, val, test)
    try:
        assert_obs_disjoint(sets["train"], sets["val"], sets["test"], hard_fail=True)
        ok = True
        err = None
    except AssertionError as e:
        ok = False
        err = str(e)
    return {
        "pass": ok,
        "error": err,
        "n_train": len(sets["train"]),
        "n_val": len(sets["val"]),
        "n_test": len(sets["test"]),
        "train_val": len(sets["train"] & sets["val"]),
        "train_test": len(sets["train"] & sets["test"]),
        "val_test": len(sets["val"] & sets["test"]),
    }


def check_source_domains(
    train: pd.DataFrame,
    test: pd.DataFrame,
    train_domain: Optional[Iterable[str]] = None,
    test_domain: Optional[Iterable[str]] = None,
) -> dict[str, Any]:
    td = set(train_domain or TRAIN_DOMAIN_DEFAULT)
    te = set(test_domain or TEST_DOMAIN_DEFAULT)
    tr_src = set(train["source_db"].astype(str)) if "source_db" in train.columns else set()
    te_src = set(test["source_db"].astype(str)) if "source_db" in test.columns else set()
    train_ok = tr_src.issubset(td) if tr_src else False
    test_ok = te_src.issubset(te) if te_src else False
    # train must not contain test-domain sources
    train_polluted = bool(tr_src & te)
    return {
        "pass": train_ok and test_ok and not train_polluted,
        "train_sources": sorted(tr_src),
        "test_sources": sorted(te_src),
        "train_polluted_with_test_domain": train_polluted,
        "train_ok": train_ok,
        "test_ok": test_ok,
    }


def check_residual_near_dup(
    train: pd.DataFrame,
    val: pd.DataFrame,
    test: pd.DataFrame,
    path_col: str = "image_path",
) -> dict[str, Any]:
    tv = []
    if path_col in train.columns:
        tv.extend(train[path_col].astype(str).tolist())
    if path_col in val.columns:
        tv.extend(val[path_col].astype(str).tolist())
    te = test[path_col].astype(str).tolist() if path_col in test.columns else []
    shared = shared_near_dup_keys(tv, te, use_filesize=False)
    return {
        "pass": len(shared) == 0,
        "n_shared_keys": len(shared),
        "sample_keys": sorted(shared)[:10],
    }


def run_source_holdout_selftest(
    df: pd.DataFrame, seed: int = 42, **kwargs: Any
) -> dict[str, Any]:
    """Build E20 split and return combined invariant results."""
    train, val, test, meta = source_holdout_split(df, seed=seed, **kwargs)
    out = {
        "protocol": meta.get("protocol"),
        "disjoint": check_disjoint_obs(train, val, test),
        "domains": check_source_domains(train, test),
        "near_dup": check_residual_near_dup(train, val, test),
        "meta": {k: v for k, v in meta.items() if k != "protocol"},
    }
    out["pass"] = (
        out["disjoint"]["pass"] and out["domains"]["pass"] and out["near_dup"]["pass"]
    )
    return out
