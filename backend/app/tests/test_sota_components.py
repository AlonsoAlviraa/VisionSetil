"""Tests for SOTA upgrade components: foundation ensemble, taxonomy, dataset prep.

These tests are designed to run WITHOUT torch/GPU — they validate the data
structures, configuration validation, and pure-Python logic.
"""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

import pytest

# Ensure repo root (containing kaggle/ and scripts/) is importable.
# Test file lives at <repo_root>/backend/app/tests/test_sota_components.py,
# so repo root is 4 parents up.
REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))


# ---------------------------------------------------------------------------
# Foundation Ensemble tests
# ---------------------------------------------------------------------------
class TestFoundationConfig:
    """Test FoundationConfig validation (no torch needed)."""

    def test_default_config_is_valid(self):
        from kaggle.foundation_ensemble import FoundationConfig

        cfg = FoundationConfig()
        cfg.validate()  # should not raise
        assert cfg.total_dim == 768 + 768  # dinov2_base + beit_fungi

    def test_unknown_model_rejected(self):
        from kaggle.foundation_ensemble import FoundationConfig

        cfg = FoundationConfig(models=("nonexistent_model",))
        with pytest.raises(ValueError, match="Unknown foundation model"):
            cfg.validate()

    def test_total_dim_sums_correctly(self):
        from kaggle.foundation_ensemble import FoundationConfig

        cfg = FoundationConfig(models=("dinov2_small", "dinov2_base", "dinov2_large"))
        assert cfg.total_dim == 384 + 768 + 1024

    def test_all_registered_models_have_license(self):
        from kaggle.foundation_ensemble import FOUNDATION_MODELS

        for name, spec in FOUNDATION_MODELS.items():
            assert "license" in spec, f"{name} missing license"
            assert spec["license"] in ("Apache-2.0", "MIT"), f"{name} has incompatible license"
            assert "dim" in spec, f"{name} missing dim"


class TestPrototypeClassifier:
    """Test prototype classifier logic (no torch needed, uses numpy)."""

    def test_fit_and_predict(self):
        import numpy as np

        from kaggle.foundation_ensemble import PrototypeClassifier

        clf = PrototypeClassifier()
        # Create synthetic embeddings: 3 species, 5 samples each.
        embeddings = {
            "Species A": [np.random.randn(128).tolist() for _ in range(5)],
            "Species B": [np.random.randn(128).tolist() for _ in range(5)],
            "Species C": [np.random.randn(128).tolist() for _ in range(5)],
        }
        clf.fit(embeddings)
        assert clf.num_classes == 3

        # Predict with a vector similar to species A.
        query = embeddings["Species A"][0]
        results = clf.predict(query, top_k=3)
        assert len(results) == 3
        assert all(isinstance(r[0], str) for r in results)

    def test_open_set_detection(self):
        from kaggle.foundation_ensemble import PrototypeClassifier

        clf = PrototypeClassifier(open_set_threshold=0.8)
        assert clf.is_open_set(0.5) is True   # below threshold → reject
        assert clf.is_open_set(0.9) is False   # above threshold → accept

    def test_save_and_load(self, tmp_path):
        import numpy as np

        from kaggle.foundation_ensemble import PrototypeClassifier

        clf = PrototypeClassifier()
        embeddings = {
            "Test": [np.random.randn(64).tolist() for _ in range(3)],
        }
        clf.fit(embeddings)

        path = tmp_path / "prototypes.json"
        clf.save(path)
        assert path.exists()

        loaded = PrototypeClassifier.load(path)
        assert loaded.num_classes == 1
        assert "Test" in loaded.prototypes

    def test_empty_embeddings_handled(self):
        from kaggle.foundation_ensemble import PrototypeClassifier

        clf = PrototypeClassifier()
        clf.fit({})  # no species
        assert clf.num_classes == 0


class TestPerceptualHash:
    """Test dedup hash functions."""

    def test_compute_perceptual_hash(self, tmp_path):
        from PIL import Image

        from kaggle.foundation_ensemble import compute_perceptual_hash

        # Create a test image.
        img = Image.new("RGB", (64, 64), color=(128, 128, 128))
        img_path = tmp_path / "test.jpg"
        img.save(img_path)

        h = compute_perceptual_hash(img_path)
        assert isinstance(h, str)
        assert len(h) > 0

    def test_identical_images_same_hash(self, tmp_path):
        from PIL import Image

        from kaggle.foundation_ensemble import compute_perceptual_hash

        img = Image.new("RGB", (64, 64), color=(100, 150, 200))
        img.save(tmp_path / "a.jpg")
        img.save(tmp_path / "b.jpg")

        h1 = compute_perceptual_hash(tmp_path / "a.jpg")
        h2 = compute_perceptual_hash(tmp_path / "b.jpg")
        assert h1 == h2

    def test_file_md5(self, tmp_path):
        from kaggle.foundation_ensemble import file_md5

        p = tmp_path / "test.txt"
        p.write_text("hello world")
        h = file_md5(p)
        assert len(h) == 32  # MD5 hex length


# ---------------------------------------------------------------------------
# Taxonomy DB tests
# ---------------------------------------------------------------------------
class TestTaxonomyDB:
    """Test taxonomy builder safety logic."""

    def test_deadly_genus_flagged(self):
        from scripts.build_taxonomy_db import classify_toxicity

        toxicity, flags = classify_toxicity("Amanita muscaria", "Amanita")
        assert toxicity == "deadly"
        assert "deadly-genus" in flags

    def test_deadly_species_flagged(self):
        from scripts.build_taxonomy_db import classify_toxicity

        toxicity, flags = classify_toxicity("Amanita phalloides", "Amanita")
        assert toxicity == "deadly"
        assert "deadly-species" in flags

    def test_serious_species_flagged(self):
        from scripts.build_taxonomy_db import classify_toxicity

        toxicity, _ = classify_toxicity("Paxillus involutus", "Paxillus")
        assert toxicity == "serious"

    def test_toxic_genus_flagged(self):
        from scripts.build_taxonomy_db import classify_toxicity

        toxicity, flags = classify_toxicity("Inocybe rimosa", "Inocybe")
        assert toxicity == "toxic"
        assert "toxic-genus" in flags

    def test_unknown_species_never_edible(self):
        """Safety policy: unknown = unknown, never 'edible' or 'safe'."""
        from scripts.build_taxonomy_db import classify_toxicity

        toxicity, _ = classify_toxicity("Agaricus campestris", "Agaricus")
        assert toxicity == "unknown"  # NOT "edible" or "safe"

    def test_build_taxonomy_without_gbif(self):
        """Test taxonomy building offline (no GBIF API)."""
        from scripts.build_taxonomy_db import build_taxonomy

        species_list = ["Amanita phalloides", "Agaricus campestris", "Boletus edulis"]
        result = build_taxonomy(species_list, use_gbif=False)

        assert len(result) == 3
        assert result["Amanita phalloides"]["toxicity"] == "deadly"
        assert result["Agaricus campestris"]["toxicity"] == "unknown"
        assert all("genus" in v for v in result.values())

    def test_toxic_index_extraction(self):
        from scripts.build_taxonomy_db import build_taxonomy, build_toxic_index

        species_list = ["Amanita phalloides", "Inocybe rimosa", "Agaricus campestris"]
        taxonomy = build_taxonomy(species_list, use_gbif=False)
        toxic_idx = build_toxic_index(taxonomy)

        assert len(toxic_idx["deadly"]) >= 1
        assert len(toxic_idx["toxic"]) >= 1
        assert "Amanita phalloides" in [d["species"] for d in toxic_idx["deadly"]]


# ---------------------------------------------------------------------------
# Dataset preparation tests (anti-leak verification)
# ---------------------------------------------------------------------------
class TestDatasetPreparation:
    """Test multi-source dataset pipeline anti-leak guarantees."""

    def test_deduplicate_exact(self):
        from scripts.prepare_multi_source_dataset import ImageRecord, deduplicate

        records = [
            ImageRecord(
                source="fungiclef",
                observation_id="obs-001",
                image_path="a.jpg",
                species="Test",
                md5="abc123",
                phash="hash_a",
            ),
            ImageRecord(
                source="fungitastic",
                observation_id="obs-002",
                image_path="b.jpg",
                species="Test",
                md5="abc123",  # exact duplicate
                phash="hash_b",
            ),
        ]
        kept, report = deduplicate(records)
        assert len(kept) == 1
        assert report["removed_exact_md5"] == 1

    def test_deduplicate_keeps_multiview_same_obs(self):
        from scripts.prepare_multi_source_dataset import ImageRecord, deduplicate

        records = [
            ImageRecord(
                source="fungiclef",
                observation_id="obs-001",
                image_path="a.jpg",
                species="Test",
                md5="hash_a_md5",
                phash="same_hash",
            ),
            ImageRecord(
                source="fungiclef",
                observation_id="obs-001",  # same observation
                image_path="b.jpg",
                species="Test",
                md5="hash_b_md5",
                phash="same_hash",  # same phash but same obs = multi-view
            ),
        ]
        kept, report = deduplicate(records)
        assert len(kept) == 2  # both kept (same observation = multi-view)

    def test_anti_leak_split(self):
        """Verify no observation_id appears in multiple splits."""
        from scripts.prepare_multi_source_dataset import (
            ImageRecord,
            group_by_observation,
            stratified_group_split,
        )

        # Create 20 observations with 2 images each, 4 species.
        records = []
        for i in range(20):
            species = f"Species {i % 4}"
            genus = "Test"
            for j in range(2):
                records.append(
                    ImageRecord(
                        source="test",
                        observation_id=f"obs-{i:03d}",
                        image_path=f"img-{i}-{j}.jpg",
                        species=species,
                        genus=genus,
                    )
                )

        obs_groups = group_by_observation(records)
        train, val, test, report = stratified_group_split(obs_groups)

        # Check anti-leak.
        train_obs = {r.observation_id for r in train}
        val_obs = {r.observation_id for r in val}
        test_obs = {r.observation_id for r in test}

        assert not (train_obs & val_obs), "LEAK: train∩val"
        assert not (train_obs & test_obs), "LEAK: train∩test"
        assert not (val_obs & test_obs), "LEAK: val∩test"
        assert report["anti_leak_verified"] is True

    def test_rare_classes_to_train_only(self):
        """Classes with < min_class_count go to train only."""
        from scripts.prepare_multi_source_dataset import (
            ImageRecord,
            group_by_observation,
            stratified_group_split,
        )

        records = []
        # Common species (5 observations).
        for i in range(5):
            records.append(
                ImageRecord(
                    source="test",
                    observation_id=f"common-{i}",
                    image_path=f"c-{i}.jpg",
                    species="Common species",
                    genus="G1",
                )
            )
        # Rare species (1 observation — below min_class_count=3).
        records.append(
            ImageRecord(
                source="test",
                observation_id="rare-001",
                image_path="r-0.jpg",
                species="Rare species",
                genus="G2",
            )
        )

        obs_groups = group_by_observation(records)
        train, val, test, report = stratified_group_split(
            obs_groups, min_class_count=3
        )

        # Rare species should only be in train.
        rare_in_train = any(r.species == "Rare species" for r in train)
        rare_in_val = any(r.species == "Rare species" for r in val)
        rare_in_test = any(r.species == "Rare species" for r in test)

        assert rare_in_train, "Rare species should be in train"
        assert not rare_in_val, "Rare species should NOT be in val"
        assert not rare_in_test, "Rare species should NOT be in test"
        assert report["rare_species_count"] >= 1


# ---------------------------------------------------------------------------
# Multi-view model config tests (no torch forward pass needed)
# ---------------------------------------------------------------------------
class TestMultiViewConfigSOTA:
    """Test the SOTA-upgraded MultiViewConfig."""

    def test_foundation_ensemble_flag_exists(self):
        from kaggle.multi_view_model import MultiViewConfig

        cfg = MultiViewConfig(use_foundation_ensemble=True)
        assert cfg.use_foundation_ensemble is True
        assert "dinov2_base" in cfg.foundation_models

    def test_config_backward_compatible(self):
        from kaggle.multi_view_model import MultiViewConfig

        cfg = MultiViewConfig()
        assert cfg.use_foundation_ensemble is False  # default off for backward compat
        assert cfg.base_backbone == "convnextv2_base.fcmae_ft_in22k_in1k"

    def test_view_constants_unchanged(self):
        """Safety: ensure canonical view order is stable."""
        from kaggle.multi_view_model import VIEW_TYPES, VIEW_TO_IDX, NUM_VIEWS

        assert VIEW_TYPES == ("gills", "front", "habitat", "detail")
        assert NUM_VIEWS == 4
        assert VIEW_TO_IDX["gills"] == 0
        assert VIEW_TO_IDX["detail"] == 3

    def test_view_combo_index_bitmask(self):
        """Test view combo bitmask mapping."""
        import torch

        from kaggle.multi_view_model import view_combo_index

        # All 4 views present = 0b1111 = 15.
        all_views = torch.tensor([0, 1, 2, 3])
        assert view_combo_index(all_views) == 15

        # Only gills + front = 0b0011 = 3.
        gills_front = torch.tensor([0, 1])
        assert view_combo_index(gills_front) == 3

        # Unknown views ignored.
        with_unknown = torch.tensor([0, -1, 3])
        assert view_combo_index(with_unknown) == 0b1001  # gills + detail