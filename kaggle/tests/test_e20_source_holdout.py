"""E20 source-holdout / near-dup / deadly@3 / path-normalize tests."""
from __future__ import annotations

import ast
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from kaggle.near_dup import (  # noqa: E402
    media_id_key,
    near_dup_collapse,
    shared_near_dup_keys,
    stem_key,
)
from kaggle.split_export import (  # noqa: E402
    assert_obs_disjoint,
    deadly_gate_eval,
    deadly_recall_at_k,
    deadly_top1_from_preds,
    drop_test_rows_sharing_near_dup_keys,
    export_split_artifacts,
    source_holdout_split,
)


def test_stem_and_media_key_chr92_safe():
    # Windows-style path with backslash char (via chr, not source "\\")
    path = "data" + chr(92) + "foo" + chr(92) + "1453223341_c927f91984.jpg"
    assert stem_key(path) == "1453223341_c927f91984"
    assert media_id_key("1453223341_c927f91984.jpg") == "1453223341"
    assert media_id_key("abc.jpg") is None


def test_near_dup_collapse_prefers_train_source():
    rows = [
        {
            "observation_id": "ft_1",
            "species": "Amanita phalloides",
            "image_path": "/kaggle/input/ft/1453223341_aa.jpg",
            "source_db": "fungitastic",
            "license_class": "unknown",
        },
        {
            "observation_id": "gbif_1",
            "species": "Amanita phalloides",
            "image_path": "/kaggle/input/gbif/1453223341_bb.jpg",
            "source_db": "gbif_es",
            "license_class": "cc_ok",
        },
        {
            "observation_id": "gbif_2",
            "species": "Boletus edulis",
            "image_path": "/kaggle/input/gbif/9999999999_xx.jpg",
            "source_db": "gbif_es",
            "license_class": "nc",
        },
    ]
    df = pd.DataFrame(rows)
    out, stats = near_dup_collapse(df, train_sources={"fungitastic"}, use_filesize=False)
    assert stats["n_in"] == 3
    # media id 1453223341 links the first two → collapse to one
    assert stats["n_collapsed"] >= 1
    assert len(out) == 2
    # Remaining should keep unique gbif_2 + one of the media-linked pair
    oids = set(out["observation_id"])
    assert "gbif_2" in oids
    # Prefer cc_ok over train when licenses differ: gbif row has cc_ok
    # Priority: cc_ok first → gbif_1 wins over ft_1
    assert "gbif_1" in oids or "ft_1" in oids
    assert len(oids & {"gbif_1", "ft_1"}) == 1


def test_near_dup_collapse_prefers_cc_ok():
    rows = [
        {
            "observation_id": "a",
            "species": "X",
            "image_path": "/tmp/same_stem.jpg",
            "source_db": "fungitastic",
            "license_class": "nc",
        },
        {
            "observation_id": "b",
            "species": "X",
            "image_path": "/tmp2/same_stem.png",
            "source_db": "fungitastic",
            "license_class": "cc_ok",
        },
    ]
    df = pd.DataFrame(rows)
    out, stats = near_dup_collapse(df, train_sources={"fungitastic"}, use_filesize=False)
    assert len(out) == 1
    assert out.iloc[0]["license_class"] == "cc_ok"
    assert stats["n_collapsed"] == 1


def test_source_holdout_disjoint_and_domains():
    rows = []
    for o in range(20):
        rows.append(
            {
                "observation_id": f"ft_{o}",
                "species": "Amanita phalloides" if o < 10 else "Boletus edulis",
                "genus": "Amanita" if o < 10 else "Boletus",
                "image_path": f"/tmp/ft_{o}.jpg",
                "source_db": "fungitastic",
                "license_class": "unknown",
            }
        )
    for o in range(15):
        rows.append(
            {
                "observation_id": f"gbif_{o}",
                "species": "Amanita phalloides" if o < 8 else "Boletus edulis",
                "genus": "Amanita" if o < 8 else "Boletus",
                "image_path": f"/tmp/gbif_{o}.jpg",
                "source_db": "gbif_es",
                "license_class": "cc_ok",
            }
        )
    df = pd.DataFrame(rows)
    train, val, test, meta = source_holdout_split(df, seed=42, val_size=0.2, min_per_class=2)
    assert meta["pass"] is True
    assert meta["protocol"] == "source_holdout_e20"
    assert set(train["source_db"].unique()) == {"fungitastic"}
    assert set(val["source_db"].unique()) == {"fungitastic"}
    assert set(test["source_db"].unique()) == {"gbif_es"}
    ids_t = set(train["observation_id"].astype(str))
    ids_v = set(val["observation_id"].astype(str))
    ids_te = set(test["observation_id"].astype(str))
    assert assert_obs_disjoint(ids_t, ids_v, ids_te)["pass"]
    # no shared near-dup keys across train and test in this synthetic set
    shared = shared_near_dup_keys(
        train["image_path"].tolist() + val["image_path"].tolist(),
        test["image_path"].tolist(),
        use_filesize=False,
    )
    assert len(shared) == 0


def test_source_holdout_fails_without_gbif():
    rows = [
        {
            "observation_id": f"ft_{o}",
            "species": "Amanita phalloides",
            "image_path": f"/tmp/ft_{o}.jpg",
            "source_db": "fungitastic",
        }
        for o in range(10)
    ]
    df = pd.DataFrame(rows)
    with pytest.raises(RuntimeError, match="test core"):
        source_holdout_split(df, seed=0)


def test_export_split_artifacts_and_assert(tmp_path):
    train = pd.DataFrame(
        [
            {
                "observation_id": "t1",
                "species": "Amanita phalloides",
                "image_path": "/a.jpg",
                "source_db": "fungitastic",
                "license_class": "unknown",
            }
        ]
    )
    val = pd.DataFrame(
        [
            {
                "observation_id": "v1",
                "species": "Amanita phalloides",
                "image_path": "/b.jpg",
                "source_db": "fungitastic",
            }
        ]
    )
    test = pd.DataFrame(
        [
            {
                "observation_id": "te1",
                "species": "Amanita phalloides",
                "image_path": "/c.jpg",
                "source_db": "gbif_es",
                "license_class": "cc_ok",
            }
        ]
    )
    man = export_split_artifacts(train, val, test, tmp_path, split_meta={"protocol": "source_holdout_e20"})
    assert man["pass"]
    assert (tmp_path / "train_obs.json").is_file()
    assert (tmp_path / "val_obs.json").is_file()
    assert (tmp_path / "test_obs.json").is_file()
    assert (tmp_path / "split_manifest.json").is_file()
    tr = json.loads((tmp_path / "train_obs.json").read_text(encoding="utf-8"))
    assert tr[0]["observation_id"] == "t1"
    assert "image_paths" in tr[0]


def test_export_fails_on_overlap(tmp_path):
    train = pd.DataFrame(
        [{"observation_id": "same", "species": "X", "image_path": "/a.jpg", "source_db": "fungitastic"}]
    )
    val = pd.DataFrame(
        [{"observation_id": "v", "species": "X", "image_path": "/b.jpg", "source_db": "fungitastic"}]
    )
    test = pd.DataFrame(
        [{"observation_id": "same", "species": "X", "image_path": "/c.jpg", "source_db": "gbif_es"}]
    )
    with pytest.raises(AssertionError, match="LEAK"):
        export_split_artifacts(train, val, test, tmp_path)


def test_deadly_recall_at_3_not_top1():
    # deadly class 0: sample0 rank1, sample1 rank3 hit, sample2 safe
    probs = np.array(
        [
            [0.8, 0.1, 0.05, 0.05],  # top1=0 hit@1 and @3
            [0.25, 0.4, 0.3, 0.05],  # top3=1,2,0 — true 0 hit@3 miss@1
            [0.1, 0.1, 0.7, 0.1],  # safe
        ],
        dtype=np.float32,
    )
    labels = np.array([0, 0, 2], dtype=np.int64)
    deadly = {0}
    d3, n = deadly_recall_at_k(probs, labels, deadly, k=3)
    assert n == 2
    assert abs(d3 - 1.0) < 1e-6  # both deadly in top-3
    d1, n1 = deadly_top1_from_preds(probs.argmax(1), labels, deadly)
    assert n1 == 2
    assert abs(d1 - 0.5) < 1e-6  # only first is top-1


def test_no_replace_backslash_landmine_in_e20_helpers():
    """Helpers must not use .replace('\\\\', '/') form that breaks in ipynb JSON."""
    for rel in ("kaggle/near_dup.py", "kaggle/split_export.py", "kaggle/fungi_csv_loader.py"):
        text = (ROOT / rel).read_text(encoding="utf-8")
        # Forbidden patterns that become SyntaxError when JSON-embedded
        assert ".replace('\\\\', '/')" not in text
        assert '.replace("\\\\", "/")' not in text
        # near_dup must use chr(92)
        if "near_dup" in rel:
            assert "chr(92)" in text
        # fungi_csv_loader already uses chr(92)
        if "fungi_csv_loader" in rel:
            assert "chr(92)" in text
        ast.parse(text)


def test_near_dup_module_ast_parses():
    for rel in ("kaggle/near_dup.py", "kaggle/split_export.py"):
        ast.parse((ROOT / rel).read_text(encoding="utf-8"))


def test_deadly_gate_fail_closed_when_n_deadly_zero():
    """Vacuous 1.0 must NOT pass expand gate when n_deadly==0."""
    g = deadly_gate_eval(1.0, n_deadly=0, threshold=0.50)
    assert g["pass"] is False
    assert g["status"] == "unevaluable"
    assert g["value"] is None
    g_ok = deadly_gate_eval(0.55, n_deadly=10, threshold=0.50)
    assert g_ok["pass"] is True
    g_fail = deadly_gate_eval(0.40, n_deadly=10, threshold=0.50)
    assert g_fail["pass"] is False
    assert g_fail["status"] == "ok"


def test_cross_domain_oid_hard_fails():
    rows = []
    for o in range(12):
        rows.append(
            {
                "observation_id": f"shared_{o}" if o < 2 else f"ft_{o}",
                "species": "Amanita phalloides" if o < 6 else "Boletus edulis",
                "image_path": f"/tmp/ft_{o}.jpg",
                "source_db": "fungitastic",
            }
        )
    for o in range(10):
        rows.append(
            {
                "observation_id": f"shared_{o}" if o < 2 else f"gbif_{o}",
                "species": "Amanita phalloides" if o < 5 else "Boletus edulis",
                "image_path": f"/tmp/gbif_{o}.jpg",
                "source_db": "gbif_es",
            }
        )
    df = pd.DataFrame(rows)
    with pytest.raises(AssertionError, match="observation_ids in both"):
        source_holdout_split(df, seed=0, hard_fail_cross_domain_oids=True)


def test_drop_residual_near_dup_test_rows():
    train = pd.DataFrame(
        [
            {
                "observation_id": "t1",
                "species": "X",
                "image_path": "/tv/same_stem.jpg",
                "source_db": "fungitastic",
            }
        ]
    )
    val = pd.DataFrame(
        [
            {
                "observation_id": "v1",
                "species": "X",
                "image_path": "/tv/other.jpg",
                "source_db": "fungitastic",
            }
        ]
    )
    test = pd.DataFrame(
        [
            {
                "observation_id": "te1",
                "species": "X",
                "image_path": "/te/same_stem.png",
                "source_db": "gbif_es",
            },
            {
                "observation_id": "te2",
                "species": "X",
                "image_path": "/te/clean_only.jpg",
                "source_db": "gbif_es",
            },
        ]
    )
    out, stats = drop_test_rows_sharing_near_dup_keys(train, val, test, hard_fail=False)
    assert stats["n_shared_keys"] >= 1
    assert stats["n_dropped_rows"] == 1
    assert set(out["observation_id"]) == {"te2"}
    with pytest.raises(AssertionError, match="near-dup keys"):
        drop_test_rows_sharing_near_dup_keys(train, val, test, hard_fail=True)


def test_model_state_unwrap_helper_logic():
    """Simulate DataParallel-like .module attribute without torch GPU."""

    class Inner:
        def state_dict(self):
            return {"w": 1}

        def load_state_dict(self, sd):
            self._loaded = sd

    class FakeDP:
        def __init__(self):
            self.module = Inner()

        def state_dict(self):
            return {"module.w": 1}

        def load_state_dict(self, sd):
            self._loaded = sd

    def _unwrap(m):
        return m.module if hasattr(m, "module") and not isinstance(m, Inner) else m

    def _model_state(m):
        return _unwrap(m).state_dict()

    m = FakeDP()
    assert _model_state(m) == {"w": 1}
    assert "module.w" not in _model_state(m)


def test_e20_notebook_guards():
    """Lightweight guards on generated notebook (rebuild if missing)."""
    nb_path = ROOT / "kaggle" / "visionsetil_exp_v20_source_holdout.ipynb"
    if not nb_path.is_file():
        pytest.skip("notebook not built")
    raw = nb_path.read_text(encoding="utf-8")
    assert "replace(chr(92)" in raw
    assert ".replace('\\\\', '/')" not in raw
    assert 'replace("\\\\", "/")' not in raw
    assert "DataParallel" in raw
    assert "safety_recall_deadly_at_3" in raw
    assert "train_obs.json" in raw
    assert "best_deadly.pt" in raw
    assert "_model_state(model)" in raw
    assert "'_model_state' in dir()" not in raw
    assert "deadly_gate_status" in raw or "unevaluable" in raw
    assert "fail-closed" in raw.lower() or "UNEVALUABLE" in raw or "unevaluable" in raw
    # n_deadly==0 must not assign vacuous 1.0
    assert "Safety recall = 1.0 (vacuous)" not in raw
    nb = json.loads(raw)
    for i, cell in enumerate(nb.get("cells", [])):
        if cell.get("cell_type") != "code":
            continue
        src = cell.get("source", [])
        src = "".join(src) if isinstance(src, list) else str(src)
        ast.parse(src)
