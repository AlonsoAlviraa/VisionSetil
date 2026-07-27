"""Unit tests for fungi_csv_loader — small fixtures only (no full datasets)."""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from kaggle.fungi_csv_loader import (  # noqa: E402
    _resolve_manifest_path,
    dataset_kind,
    fair_cap_observations,
    find_metadata_csvs,
    is_valid_image_csv,
    load_all_datasets,
    load_from_folder_structure,
    load_from_jsonl_manifest,
    load_single_dataset,
    normalize_columns,
    normalize_species_name,
    pick_column,
    resolve_one_image_path,
)


def test_pick_column_case_insensitive():
    cols = ["ObservationID", "scientificName", "Filename"]
    assert pick_column(cols, ("observation_id", "observationid")) == "ObservationID"
    assert pick_column(cols, ("species", "scientificname")) == "scientificName"
    assert pick_column(cols, ("image_path", "filename")) == "Filename"


def test_normalize_species_strips_authority():
    assert normalize_species_name("Amanita phalloides (Vaill. ex Fr.) Link") == "Amanita phalloides"
    assert normalize_species_name("Boletus edulis") == "Boletus edulis"


def test_normalize_species_underscore_and_hyphen_folders():
    assert normalize_species_name("Amanita_phalloides") == "Amanita phalloides"
    assert normalize_species_name("Amanita-phalloides") == "Amanita phalloides"


def test_normalize_columns_prefers_species_over_taxonomic_class(tmp_path):
    """Darwin-Core: `class` is Agaricomycetes — must NOT become species label."""
    df = pd.DataFrame(
        {
            "class": ["Agaricomycetes", "Agaricomycetes"],
            "scientificName": [
                "Amanita phalloides (Vaill. ex Fr.) Link",
                "Galerina marginata (Batsch) Kühner",
            ],
            "species": ["Amanita phalloides", "Galerina marginata"],
            "filename": ["0-1.JPG", "0-2.JPG"],
            "observationID": [10, 20],
        }
    )
    out = normalize_columns(df)
    assert list(out["species"]) == ["Amanita phalloides", "Galerina marginata"]
    assert "image_path" in out.columns
    assert list(out["observation_id"]) == [10, 20]


def test_normalize_columns_scientific_name_when_no_species():
    df = pd.DataFrame(
        {
            "class": ["Agaricomycetes"],  # taxonomic rank — ignore for label
            "scientificName": ["Amanita muscaria (L.) Lam."],
            "filename": ["img001.jpg"],
            "observationID": [99],
        }
    )
    out = normalize_columns(df)
    assert out.loc[0, "species"] == "Amanita muscaria"
    assert out.loc[0, "image_path"] == "img001.jpg"


def test_taxonomic_class_only_does_not_become_species_label():
    """CSV with only Darwin-Core class + filename must not label Agaricomycetes."""
    df = pd.DataFrame(
        {
            "class": ["Agaricomycetes", "Agaricomycetes"],
            "filename": ["a.jpg", "b.jpg"],
            "observationID": [1, 2],
        }
    )
    out = normalize_columns(df)
    assert "Agaricomycetes" not in set(out["species"].astype(str))
    # Without binomial cols, species falls back to parent of image path → unknown-ish
    assert all(s in {"unknown", "unknown"} or " " not in str(s) or s == "unknown" for s in out["species"])


def test_normalize_df20_style_imageuniqueid():
    df = pd.DataFrame(
        {
            "ImageUniqueID": ["2237851963-0", "2237851963-1"],
            "scientificName": ["Amanita phalloides", "Amanita phalloides"],
            "observationID": [1, 1],
            "class_id": [42, 42],
        }
    )
    out = normalize_columns(df)
    assert "image_path" in out.columns
    assert out["species"].iloc[0] == "Amanita phalloides"


def test_is_valid_image_csv_rejects_climatic(tmp_path):
    p = tmp_path / "FungiTastic-Climatic-Timeseries.csv"
    pd.DataFrame({"a": [1], "b": [2]}).to_csv(p, index=False)
    assert is_valid_image_csv(p) is False


def test_is_valid_image_csv_accepts_fungitastic_style(tmp_path):
    p = tmp_path / "FungiTastic-ClosedSet-Val.csv"
    pd.DataFrame(
        {
            "species": ["Amanita muscaria"],
            "filename": ["0-1.JPG"],
            "observationID": [1],
            "class": ["Agaricomycetes"],
            "scientificName": ["Amanita muscaria (L.) Lam."],
        }
    ).to_csv(p, index=False)
    assert is_valid_image_csv(p) is True


def test_find_and_load_csv_fixture_drops_missing_images(tmp_path):
    meta = tmp_path / "metadata" / "FungiTastic"
    meta.mkdir(parents=True)
    img_dir = tmp_path / "images" / "FungiTastic-FewShot" / "val" / "500p"
    img_dir.mkdir(parents=True)
    img = img_dir / "0-42.JPG"
    img.write_bytes(b"\xff\xd8\xff\xd9")

    csv_path = meta / "FungiTastic-ClosedSet-Val.csv"
    pd.DataFrame(
        {
            "species": ["Amanita phalloides", "Boletus edulis"],
            "filename": ["0-42.JPG", "missing.JPG"],
            "observationID": [42, 99],
            "class": ["Agaricomycetes", "Agaricomycetes"],
            "scientificName": ["Amanita phalloides", "Boletus edulis"],
            "habitat": ["wood", "soil"],
        }
    ).to_csv(csv_path, index=False)

    found = find_metadata_csvs(tmp_path)
    assert any(p.name == "FungiTastic-ClosedSet-Val.csv" for p in found)

    df = load_single_dataset(tmp_path, "fungitastic")
    # missing.JPG dropped — only existing images count
    assert len(df) == 1
    assert df["source_db"].iloc[0] == "fungitastic"
    assert df["species"].str.lower().tolist() == ["amanita phalloides"]
    assert Path(df.loc[0, "image_path"]).exists()


def test_folder_structure_loader_groups_view_indices(tmp_path):
    sp = tmp_path / "merged_dataset" / "Amanita muscaria"
    sp.mkdir(parents=True)
    (sp / "Amanita muscaria_1.jpg").write_bytes(b"x")
    (sp / "Amanita muscaria_2.jpg").write_bytes(b"y")
    df = load_from_folder_structure(tmp_path, "mushroom1")
    assert len(df) == 2
    assert set(df["species"]) == {"Amanita muscaria"}
    assert df["source_db"].iloc[0] == "mushroom1"
    assert all(df["observation_id"].str.startswith("mushroom1_"))
    # Trailing _1/_2 should collapse to one observation for caps
    assert df["observation_id"].nunique() == 1


def test_folder_underscore_species_name(tmp_path):
    sp = tmp_path / "merged_dataset" / "Amanita_phalloides"
    sp.mkdir(parents=True)
    (sp / "img_1.jpg").write_bytes(b"x")
    df = load_from_folder_structure(tmp_path, "mushroom1")
    assert len(df) == 1
    assert df["species"].iloc[0] == "Amanita phalloides"


def test_dataset_kind_checkpoint_only(tmp_path):
    (tmp_path / "best_checkpoint.pth").write_bytes(b"00")
    (tmp_path / "checkpoint_epoch_1.pth").write_bytes(b"00")
    assert dataset_kind(tmp_path) == "checkpoint_only"


def test_dataset_kind_tfrecord_only(tmp_path):
    (tmp_path / "train_fungiclef.tfrec").write_bytes(b"00")
    assert dataset_kind(tmp_path) == "tfrecord_only"


def test_resolve_one_image_path_index(tmp_path):
    img = tmp_path / "images" / "x" / "0-1.JPG"
    img.parent.mkdir(parents=True)
    img.write_bytes(b"x")
    idx = {"0-1.jpg": str(img)}
    got = resolve_one_image_path("0-1.JPG", tmp_path, idx)
    assert Path(got).exists()


def test_resolve_one_image_path_windows_backslash(tmp_path):
    """Windows-style separators must resolve (chr(92) normalize, not broken '\\')."""
    img = tmp_path / "images" / "Amanita_phalloides" / "x.jpg"
    img.parent.mkdir(parents=True)
    img.write_bytes(b"x")
    raw = "images" + chr(92) + "Amanita_phalloides" + chr(92) + "x.jpg"
    got = resolve_one_image_path(raw, tmp_path)
    assert got
    assert Path(got).exists()
    assert Path(got).name == "x.jpg"


def test_resolve_manifest_path_windows_backslash(tmp_path):
    img = tmp_path / "images" / "Amanita_phalloides" / "x.jpg"
    img.parent.mkdir(parents=True)
    img.write_bytes(b"x")
    raw = "images" + chr(92) + "Amanita_phalloides" + chr(92) + "x.jpg"
    got = _resolve_manifest_path(raw, tmp_path)
    assert got
    assert Path(got).exists()


def test_load_skips_checkpoint_mount(tmp_path):
    (tmp_path / "model.pth").write_bytes(b"00")
    df = load_single_dataset(tmp_path, "fungiclef")
    assert len(df) == 0


def _make_folder_source(root: Path, name: str, species: str) -> Path:
    d = root / name / "merged_dataset" / species
    d.mkdir(parents=True)
    (d / f"{species}_1.jpg").write_bytes(b"img")
    (d / f"{species}_2.jpg").write_bytes(b"img")
    return root / name


def test_load_all_datasets_hard_fail_single_source(tmp_path):
    a = _make_folder_source(tmp_path, "src_a", "Amanita muscaria")
    with pytest.raises(RuntimeError, match="MULTI-SOURCE GATE"):
        load_all_datasets(
            {"a": a},
            min_sources=2,
            hard_fail_below_min=True,
        )


def test_load_all_datasets_two_sources_ok(tmp_path):
    a = _make_folder_source(tmp_path, "src_a", "Amanita muscaria")
    b = _make_folder_source(tmp_path, "src_b", "Boletus edulis")
    df = load_all_datasets(
        {"a": a, "b": b},
        min_sources=2,
        hard_fail_below_min=True,
    )
    assert len(df) >= 4
    assert set(df["source_db"]) == {"a", "b"}


def test_load_all_datasets_unresolved_csv_does_not_count(tmp_path):
    """CSV rows without existing files must not satisfy multi-source gate."""
    # Source A: real folder images
    a = _make_folder_source(tmp_path, "src_a", "Amanita muscaria")
    # Source B: CSV only, no images on disk
    b = tmp_path / "src_b"
    meta = b / "metadata" / "FungiTastic"
    meta.mkdir(parents=True)
    pd.DataFrame(
        {
            "species": ["Boletus edulis"] * 5,
            "filename": [f"ghost-{i}.JPG" for i in range(5)],
            "observationID": list(range(5)),
            "scientificName": ["Boletus edulis"] * 5,
        }
    ).to_csv(meta / "FungiTastic-ClosedSet-Val.csv", index=False)

    with pytest.raises(RuntimeError, match="MULTI-SOURCE GATE"):
        load_all_datasets(
            {"a": a, "b": b},
            min_sources=2,
            hard_fail_below_min=True,
        )


def test_fair_cap_preserves_secondary_source_under_global_cap():
    """
    Simulation of Issue 11: 250 dual-image FT obs + 40 single-image folder obs,
    cap=200. Naive sort-by-image-count keeps only FT; fair_cap keeps both sources.
    """
    rows = []
    for i in range(250):
        oid = f"ft_{i}"
        for v in (0, 1):
            rows.append(
                {
                    "species": "Amanita muscaria",
                    "observation_id": oid,
                    "source_db": "fungitastic",
                    "image_path": f"/fake/ft/{oid}_{v}.jpg",
                }
            )
    for i in range(40):
        oid = f"m1_{i}"
        rows.append(
            {
                "species": "Amanita muscaria",
                "observation_id": oid,
                "source_db": "mushroom1",
                "image_path": f"/fake/m1/{oid}.jpg",
            }
        )
    df = pd.DataFrame(rows)
    # Naive baseline: image-count sort would drop mushroom1
    naive_oids = sorted(
        df["observation_id"].unique(),
        key=lambda oid: (-len(df[df["observation_id"] == oid]), str(oid)),
    )[:200]
    naive = df[df["observation_id"].isin(naive_oids)]
    assert set(naive["source_db"]) == {"fungitastic"}

    capped = fair_cap_observations(df, max_obs=200, max_obs_deadly=400, deadly_force=set())
    assert set(capped["source_db"]) == {"fungitastic", "mushroom1"}
    assert capped[capped["source_db"] == "mushroom1"]["observation_id"].nunique() >= 1
    # Total obs still capped
    assert capped["observation_id"].nunique() <= 200


def test_jsonl_manifest_loader_gbif_layout(tmp_path):
    """GBIF Kaggle pack: images/<Species_safe>/ + obs_gbif_es.jsonl."""
    sp_dir = tmp_path / "images" / "Amanita_phalloides"
    sp_dir.mkdir(parents=True)
    img1 = sp_dir / "111_aaa.jpg"
    img2 = sp_dir / "111_bbb.jpg"
    img1.write_bytes(b"x")
    img2.write_bytes(b"y")
    # missing path should be dropped
    man = tmp_path / "obs_gbif_es.jsonl"
    rows = [
        {
            "observation_id": "gbif_111",
            "species": "Amanita phalloides",
            "image_paths": [
                "images/Amanita_phalloides/111_aaa.jpg",
                "images/Amanita_phalloides/111_bbb.jpg",
            ],
            "license_class": "cc_ok",
            "source": "gbif_es",
        },
        {
            "observation_id": "gbif_222",
            "species": "Amanita phalloides",
            "image_paths": ["images/Amanita_phalloides/missing.jpg"],
            "license_class": "nc",
            "source": "gbif_es",
        },
    ]
    man.write_text("\n".join(__import__("json").dumps(r) for r in rows) + "\n", encoding="utf-8")

    assert dataset_kind(tmp_path) == "jsonl_manifest"
    df = load_from_jsonl_manifest(tmp_path, "gbif_es")
    assert len(df) == 2
    assert set(df["species"]) == {"Amanita phalloides"}
    assert all(str(x).startswith("gbif_") for x in df["observation_id"])
    assert df["observation_id"].nunique() == 1
    assert (df["license_class"] == "cc_ok").all()
    assert df["source_db"].iloc[0] == "gbif_es"

    df2 = load_single_dataset(tmp_path, "gbif_es")
    assert len(df2) == 2


def test_jsonl_image_paths_windows_backslash(tmp_path):
    """JSONL image_paths with backslashes must still resolve on disk."""
    sp_dir = tmp_path / "images" / "Amanita_phalloides"
    sp_dir.mkdir(parents=True)
    (sp_dir / "win.jpg").write_bytes(b"x")
    man = tmp_path / "obs_gbif_es.jsonl"
    win_path = "images" + chr(92) + "Amanita_phalloides" + chr(92) + "win.jpg"
    row = {
        "observation_id": "gbif_win",
        "species": "Amanita phalloides",
        "image_paths": [win_path],
        "license_class": "cc_ok",
        "source": "gbif_es",
    }
    man.write_text(__import__("json").dumps(row) + "\n", encoding="utf-8")
    df = load_from_jsonl_manifest(tmp_path, "gbif_es")
    assert len(df) == 1
    assert Path(df.loc[0, "image_path"]).exists()
    assert Path(df.loc[0, "image_path"]).name == "win.jpg"


def test_loader_source_avoids_backslash_string_path_replace():
    """
    Static guard: path normalize must use chr(92), never '.replace(\"\\\\\", \"/\")'.
    Reintroducing the string-literal form breaks notebook JSON embedding (E18/E19).
    """
    loader_path = Path(__file__).resolve().parents[1] / "fungi_csv_loader.py"
    src = loader_path.read_text(encoding="utf-8")
    # File text of the landmine looks like: .replace("\\", "/") or .replace('\\', '/')
    assert '.replace("\\\\", "/")' not in src
    assert ".replace('\\\\', '/')" not in src
    assert '.replace("\\\\", \'/\')' not in src
    assert ".replace('\\\\', \"/\")" not in src
    # Three call sites: resolve_one_image_path, _resolve_manifest_path, JSONL loop
    assert src.count("replace(chr(92)") >= 3


def test_folder_underscore_under_images(tmp_path):
    sp = tmp_path / "images" / "Galerina_marginata"
    sp.mkdir(parents=True)
    (sp / "g1.jpg").write_bytes(b"x")
    df = load_from_folder_structure(tmp_path, "gbif_es")
    assert len(df) == 1
    assert df["species"].iloc[0] == "Galerina marginata"


def test_fair_cap_prefers_cc_ok():
    rows = []
    for i in range(30):
        rows.append(
            {
                "species": "Boletus edulis",
                "observation_id": f"nc_{i}",
                "source_db": "gbif_es",
                "image_path": f"/fake/nc_{i}.jpg",
                "license_class": "nc",
            }
        )
    for i in range(10):
        rows.append(
            {
                "species": "Boletus edulis",
                "observation_id": f"cc_{i}",
                "source_db": "gbif_es",
                "image_path": f"/fake/cc_{i}.jpg",
                "license_class": "cc_ok",
            }
        )
    df = pd.DataFrame(rows)
    capped = fair_cap_observations(
        df, max_obs=15, max_obs_deadly=15, deadly_force=set(), prefer_cc_ok=True
    )
    oids = set(capped["observation_id"])
    # All 10 cc_ok should be kept under cap 15
    assert all(f"cc_{i}" in oids for i in range(10))
    assert capped["observation_id"].nunique() <= 15
