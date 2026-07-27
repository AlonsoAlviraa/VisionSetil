"""
Source-holdout split + persistent split artifacts (E20).

Protocol:
  - Train (+ val): FungiTastic / non-GBIF train domain only
  - Test: GBIF ES only (primary honest metrics)
  - Disjoint observation_ids; fail hard on any overlap
  - Optional near-dup key isolation across train↔test

Orientation only — never consumption permission.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Optional

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

LogFn = Callable[[str], None]

TRAIN_DOMAIN_DEFAULT = frozenset(
    {
        "fungitastic",
        "mushroom1",
        "combined_mushrooms",
        "mush215",
        "fungiclef",
        "df20",
    }
)
TEST_DOMAIN_DEFAULT = frozenset({"gbif_es", "gbif"})


def deadly_recall_at_k(
    probs: np.ndarray,
    labels: np.ndarray,
    deadly_idxs: set[int],
    k: int = 3,
) -> tuple[float, int]:
    """True deadly class in top-k among deadly-labeled samples."""
    top = np.argsort(-probs, axis=1)[:, :k]
    mask = np.array([int(y) in deadly_idxs for y in labels], dtype=bool)
    n = int(mask.sum())
    if n == 0:
        return 0.0, 0
    hits = sum(1 for i in range(len(labels)) if mask[i] and labels[i] in top[i])
    return float(hits / n), n


def deadly_top1_from_preds(
    preds: np.ndarray,
    labels: np.ndarray,
    deadly_idxs: set[int],
) -> tuple[float, int]:
    """Top-1 accuracy among deadly-labeled samples (diagnostic only)."""
    mask = np.array([int(y) in deadly_idxs for y in labels], dtype=bool)
    n = int(mask.sum())
    if n == 0:
        return 0.0, 0
    return float((preds[mask] == labels[mask]).mean()), n


def deadly_gate_eval(
    safety_recall_deadly_at_3: float,
    n_deadly: int,
    threshold: float = 0.50,
) -> dict[str, Any]:
    """Fail-closed expand deadly gate: unevaluable when n_deadly==0.

    Vacuous 1.0 must never pass. When n_deadly==0, pass=False and
    status='unevaluable' regardless of the numeric recall field.
    """
    n = int(n_deadly)
    if n <= 0:
        return {
            "pass": False,
            "status": "unevaluable",
            "n_deadly": 0,
            "threshold": float(threshold),
            "value": None,
            "reason": "deadly gate unevaluable: 0 deadly samples in test",
        }
    val = float(safety_recall_deadly_at_3)
    return {
        "pass": val >= float(threshold),
        "status": "ok",
        "n_deadly": n,
        "threshold": float(threshold),
        "value": val,
        "reason": None,
    }


def drop_test_rows_sharing_near_dup_keys(
    train_df: pd.DataFrame,
    val_df: pd.DataFrame,
    test_df: pd.DataFrame,
    path_col: str = "image_path",
    hard_fail: bool = False,
    log: Optional[LogFn] = None,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Remove (or hard-fail on) test rows whose near-dup keys intersect train/val.

    Uses stem/media only (no filesize) for residual post-split hygiene.
    Notebook embed: near_dup helpers live in same cell; package import for tests.
    """
    try:
        from kaggle.near_dup import near_dup_keys_for_row as _nk
        from kaggle.near_dup import shared_near_dup_keys as _sk
    except ImportError:
        _nk = globals().get("near_dup_keys_for_row")
        _sk = globals().get("shared_near_dup_keys")
        if _nk is None or _sk is None:
            raise RuntimeError("near_dup helpers unavailable for residual key scrub")

    _log = log or (lambda m: None)
    if len(test_df) == 0:
        return test_df, {"n_shared_keys": 0, "n_dropped_rows": 0, "hard_fail": hard_fail}

    tv_paths = []
    if len(train_df) and path_col in train_df.columns:
        tv_paths.extend(train_df[path_col].astype(str).tolist())
    if len(val_df) and path_col in val_df.columns:
        tv_paths.extend(val_df[path_col].astype(str).tolist())
    te_paths = test_df[path_col].astype(str).tolist() if path_col in test_df.columns else []

    shared = _sk(tv_paths, te_paths, use_filesize=False)
    if not shared:
        return test_df.reset_index(drop=True), {
            "n_shared_keys": 0,
            "n_dropped_rows": 0,
            "hard_fail": hard_fail,
            "pass": True,
        }

    if hard_fail:
        raise AssertionError(
            f"LEAK: {len(shared)} near-dup keys still shared train/val↔test after collapse"
        )

    # Drop any test row whose keys intersect shared set
    keep_mask = []
    for p in te_paths:
        keys = _nk(p, use_filesize=False)
        keep_mask.append(len(keys & shared) == 0)
    before = len(test_df)
    out = test_df.loc[keep_mask].reset_index(drop=True)
    dropped = before - len(out)
    _log(f"  Dropped {dropped} test rows sharing near-dup keys with train/val ({len(shared)} keys)")
    if len(out) == 0:
        raise RuntimeError("SOURCE HOLDOUT GATE: test emptied after near-dup residual drop")
    return out, {
        "n_shared_keys": len(shared),
        "n_dropped_rows": dropped,
        "hard_fail": hard_fail,
        "pass": True,
        "action": "drop_contaminated_test_rows",
    }


def assert_obs_disjoint(
    train_ids: set[str],
    val_ids: set[str],
    test_ids: set[str],
    hard_fail: bool = True,
) -> dict[str, Any]:
    """Assert train∩val∩test observation_ids are pairwise empty."""
    leaks = {
        "train_val": len(train_ids & val_ids),
        "train_test": len(train_ids & test_ids),
        "val_test": len(val_ids & test_ids),
    }
    ok = all(v == 0 for v in leaks.values())
    result = {"leaks": leaks, "pass": ok}
    if hard_fail and not ok:
        raise AssertionError(f"LEAK: observation_id overlap {leaks}")
    return result


def _obs_level_split(
    image_df: pd.DataFrame,
    val_size: float = 0.15,
    seed: int = 42,
    min_per_class: int = 2,
    log: Optional[LogFn] = None,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Split image-level df into train/val by observation_id (stratified when possible)."""
    if len(image_df) == 0:
        empty = image_df.iloc[0:0].copy()
        return empty, empty

    agg: dict[str, str] = {"species": "first"}
    if "genus" in image_df.columns:
        agg["genus"] = "first"
    if "source_db" in image_df.columns:
        agg["source_db"] = "first"
    obs_df = image_df.groupby("observation_id").agg(agg).reset_index()

    counts = obs_df["species"].value_counts()
    valid = counts[counts >= min_per_class].index
    dropped = counts[counts < min_per_class]
    if log is not None and len(dropped):
        log(f"  train-domain min_per_class={min_per_class}: drop {len(dropped)} sparse spp")
    obs_df = obs_df[obs_df["species"].isin(valid)].copy()
    if len(obs_df) == 0:
        empty = image_df.iloc[0:0].copy()
        return empty, empty

    species_final = obs_df["species"].value_counts()
    large = species_final[species_final >= 4].index
    small = species_final[(species_final >= min_per_class) & (species_final < 4)].index
    obs_large = obs_df[obs_df["species"].isin(large)].copy()
    obs_small = obs_df[obs_df["species"].isin(small)].copy()

    train_parts: list[pd.DataFrame] = []
    val_parts: list[pd.DataFrame] = []

    if len(obs_large) > 0:
        try:
            tr, va = train_test_split(
                obs_large,
                test_size=val_size,
                random_state=seed,
                stratify=obs_large["species"],
            )
        except ValueError:
            tr, va = train_test_split(obs_large, test_size=val_size, random_state=seed)
        train_parts.append(tr)
        val_parts.append(va)

    if len(obs_small) > 0:
        if len(obs_small) >= 2 and val_size > 0:
            tr, va = train_test_split(obs_small, test_size=val_size, random_state=seed)
            train_parts.append(tr)
            val_parts.append(va)
        else:
            train_parts.append(obs_small)

    train_obs = pd.concat(train_parts, ignore_index=True) if train_parts else pd.DataFrame()
    val_obs = pd.concat(val_parts, ignore_index=True) if val_parts else pd.DataFrame()
    train_ids = set(train_obs["observation_id"].astype(str)) if len(train_obs) else set()
    val_ids = set(val_obs["observation_id"].astype(str)) if len(val_obs) else set()

    train_df = image_df[image_df["observation_id"].astype(str).isin(train_ids)].reset_index(drop=True)
    val_df = image_df[image_df["observation_id"].astype(str).isin(val_ids)].reset_index(drop=True)
    return train_df, val_df


def source_holdout_split(
    df: pd.DataFrame,
    train_sources: Optional[set[str]] = None,
    test_sources: Optional[set[str]] = None,
    val_size: float = 0.15,
    seed: int = 42,
    min_per_class: int = 2,
    require_train_core: str = "fungitastic",
    require_test_core: str = "gbif_es",
    hard_fail_cross_domain_oids: bool = True,
    log: Optional[LogFn] = None,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, dict[str, Any]]:
    """
    E20 core: train/val from FT (non-GBIF) domain; test = GBIF ES only.

    Does NOT mix FT+GBIF into a random test (that inflated E19).
    Cross-domain observation_id overlap hard-fails by default (honesty).
    """
    train_sources = set(train_sources or TRAIN_DOMAIN_DEFAULT)
    test_sources = set(test_sources or TEST_DOMAIN_DEFAULT)
    _log = log or (lambda m: None)

    if df is None or len(df) == 0:
        raise RuntimeError("source_holdout_split: empty dataframe")
    if "source_db" not in df.columns:
        raise RuntimeError("source_holdout_split: source_db column required")
    if "observation_id" not in df.columns:
        raise RuntimeError("source_holdout_split: observation_id column required")

    src_counts = df["source_db"].astype(str).value_counts().to_dict()
    _log(f"Source hold-out inputs: {src_counts}")

    train_domain = df[df["source_db"].astype(str).isin(train_sources)].copy()
    test_df = df[df["source_db"].astype(str).isin(test_sources)].copy()

    if require_train_core and require_train_core not in set(train_domain["source_db"].astype(str)):
        raise RuntimeError(
            f"SOURCE HOLDOUT GATE: train core '{require_train_core}' missing; "
            f"train_domain sources={train_domain['source_db'].value_counts().to_dict() if len(train_domain) else {}}"
        )
    if require_test_core and require_test_core not in set(test_df["source_db"].astype(str)):
        # allow 'gbif' alias
        present_test = set(test_df["source_db"].astype(str)) if len(test_df) else set()
        if not present_test & test_sources:
            raise RuntimeError(
                f"SOURCE HOLDOUT GATE: test core '{require_test_core}' missing; "
                f"test sources={test_df['source_db'].value_counts().to_dict() if len(test_df) else {}}"
            )

    if len(train_domain) == 0:
        raise RuntimeError("SOURCE HOLDOUT GATE: empty train domain")
    if len(test_df) == 0:
        raise RuntimeError("SOURCE HOLDOUT GATE: empty GBIF test domain")

    # Same observation_id in train-domain AND test-domain is a data/id bug
    train_oids = set(train_domain["observation_id"].astype(str))
    test_oids = set(test_df["observation_id"].astype(str))
    cross = train_oids & test_oids
    if cross:
        msg = (
            f"SOURCE HOLDOUT LEAK: {len(cross)} observation_ids in both train-domain and test-domain "
            f"(examples={sorted(cross)[:5]})"
        )
        if hard_fail_cross_domain_oids:
            raise AssertionError(msg)
        _log(f"  WARNING (soft): {msg} — dropping from test")
        test_df = test_df[~test_df["observation_id"].astype(str).isin(cross)].copy()
        if len(test_df) == 0:
            raise RuntimeError("SOURCE HOLDOUT GATE: test emptied after cross-oid drop")

    train_df, val_df = _obs_level_split(
        train_domain,
        val_size=val_size,
        seed=seed,
        min_per_class=min_per_class,
        log=log,
    )
    if len(train_df) == 0:
        raise RuntimeError("SOURCE HOLDOUT GATE: empty train after val split")

    train_ids = set(train_df["observation_id"].astype(str))
    val_ids = set(val_df["observation_id"].astype(str))
    test_ids = set(test_df["observation_id"].astype(str))
    leak_info = assert_obs_disjoint(train_ids, val_ids, test_ids, hard_fail=True)

    meta: dict[str, Any] = {
        "protocol": "source_holdout_e20",
        "train_sources": sorted(train_sources),
        "test_sources": sorted(test_sources),
        "n_train_obs": len(train_ids),
        "n_val_obs": len(val_ids),
        "n_test_obs": len(test_ids),
        "n_train_imgs": len(train_df),
        "n_val_imgs": len(val_df),
        "n_test_imgs": len(test_df),
        "train_source_counts": train_df["source_db"].value_counts().to_dict() if len(train_df) else {},
        "val_source_counts": val_df["source_db"].value_counts().to_dict() if len(val_df) else {},
        "test_source_counts": test_df["source_db"].value_counts().to_dict() if len(test_df) else {},
        "leaks": leak_info["leaks"],
        "pass": leak_info["pass"],
        "cross_domain_oids": len(cross),
        "hard_fail_cross_domain_oids": hard_fail_cross_domain_oids,
        "val_domain": "train_domain_holdout",
        "test_domain": "gbif_es_only",
        "primary_metrics": "test_gbif",
        "orientation_only": True,
        "seed": seed,
        "val_size": val_size,
    }
    _log(
        f"Source hold-out split: train={len(train_ids)} obs ({len(train_df)} imgs) | "
        f"val={len(val_ids)} obs ({len(val_df)} imgs) | "
        f"test={len(test_ids)} obs ({len(test_df)} imgs) [GBIF pure]"
    )
    _log(f"  train sources: {meta['train_source_counts']}")
    _log(f"  test sources:  {meta['test_source_counts']}")
    return (
        train_df.reset_index(drop=True),
        val_df.reset_index(drop=True),
        test_df.reset_index(drop=True),
        meta,
    )


def _obs_export_records(image_df: pd.DataFrame) -> list[dict[str, Any]]:
    """One record per observation_id for audit artifacts."""
    records = []
    if len(image_df) == 0:
        return records
    cols = image_df.columns
    for oid, group in image_df.groupby("observation_id"):
        paths = group["image_path"].astype(str).tolist() if "image_path" in cols else []
        rec: dict[str, Any] = {
            "observation_id": str(oid),
            "species": str(group["species"].iloc[0]) if "species" in cols else "unknown",
            "source_db": str(group["source_db"].iloc[0]) if "source_db" in cols else "unknown",
            "image_paths": paths,
            "n_images": len(paths),
        }
        if "license_class" in cols:
            rec["license_class"] = str(group["license_class"].iloc[0])
        if "genus" in cols:
            rec["genus"] = str(group["genus"].iloc[0])
        records.append(rec)
    records.sort(key=lambda r: r["observation_id"])
    return records


def export_split_artifacts(
    train_df: pd.DataFrame,
    val_df: pd.DataFrame,
    test_df: pd.DataFrame,
    out_dir: Path | str,
    split_meta: Optional[dict[str, Any]] = None,
    near_dup_stats: Optional[dict[str, Any]] = None,
    hard_fail: bool = True,
) -> dict[str, Any]:
    """
    Persist train_obs.json, val_obs.json, test_obs.json, split_manifest.json.

    Asserts train∩val∩test observation_ids empty before write.
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    train_ids = set(train_df["observation_id"].astype(str)) if len(train_df) else set()
    val_ids = set(val_df["observation_id"].astype(str)) if len(val_df) else set()
    test_ids = set(test_df["observation_id"].astype(str)) if len(test_df) else set()
    leak_info = assert_obs_disjoint(train_ids, val_ids, test_ids, hard_fail=hard_fail)

    train_recs = _obs_export_records(train_df)
    val_recs = _obs_export_records(val_df)
    test_recs = _obs_export_records(test_df)

    nl = chr(10)
    (out_dir / "train_obs.json").write_text(
        json.dumps(train_recs, indent=2, ensure_ascii=False) + nl, encoding="utf-8"
    )
    (out_dir / "val_obs.json").write_text(
        json.dumps(val_recs, indent=2, ensure_ascii=False) + nl, encoding="utf-8"
    )
    (out_dir / "test_obs.json").write_text(
        json.dumps(test_recs, indent=2, ensure_ascii=False) + nl, encoding="utf-8"
    )

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "protocol": (split_meta or {}).get("protocol", "source_holdout_e20"),
        "n_train_obs": len(train_recs),
        "n_val_obs": len(val_recs),
        "n_test_obs": len(test_recs),
        "n_train_imgs": len(train_df),
        "n_val_imgs": len(val_df),
        "n_test_imgs": len(test_df),
        "leaks": leak_info["leaks"],
        "pass": leak_info["pass"],
        "split_meta": split_meta or {},
        "near_dup_stats": near_dup_stats or {},
        "label_sources": {
            "fungitastic": "FT metadata CSVs (species / scientificName)",
            "gbif_es": "GBIF species field in obs_gbif_es.jsonl",
        },
        "orientation_only": True,
        "policy": "never_consumption_permission",
        "files": ["train_obs.json", "val_obs.json", "test_obs.json", "split_manifest.json"],
    }
    (out_dir / "split_manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + nl, encoding="utf-8"
    )
    return manifest
