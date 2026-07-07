import json
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

# Add root folder to sys.path
root_dir = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(root_dir))

# Dynamically import prepare_kaggle_dataset and run_kaggle_benchmark to avoid namespace conflict with installed 'kaggle' library
import importlib.util  # noqa: E402


def import_by_path(module_name, file_path):
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


prepare_module = import_by_path(
    "prepare_kaggle_dataset", str(root_dir / "kaggle" / "prepare_kaggle_dataset.py")
)
prepare_main = prepare_module.main

benchmark_module = import_by_path(
    "run_kaggle_benchmark", str(root_dir / "kaggle" / "run_kaggle_benchmark.py")
)
benchmark_main = benchmark_module.main


@pytest.fixture
def temp_dataset(tmp_path):
    # Create mock labels and images
    labels_file = tmp_path / "labels.json"
    images_dir = tmp_path / "images"
    images_dir.mkdir()

    # Create mock images
    (images_dir / "img1.jpg").write_bytes(b"dummy")
    (images_dir / "img2.jpg").write_bytes(b"dummy")

    dataset_content = [
        {
            "observation_id": "test_obs_1",
            "title": "Amanita muscaria",
            "expected_taxon": "Amanita muscaria",
            "expected_genus": "Amanita",
            "risk_level": "high",
            "images": [str(images_dir / "img1.jpg")],
            "metadata": {},
        },
        {
            "observation_id": "test_obs_2",
            "title": "Agaricus bisporus",
            "expected_taxon": "Agaricus bisporus",
            "expected_genus": "Agaricus",
            "risk_level": "low",
            "images": [str(images_dir / "img2.jpg")],
            "metadata": {},
        },
    ]
    with open(labels_file, "w", encoding="utf-8") as f:
        json.dump(dataset_content, f)

    return labels_file, images_dir


def test_prepare_dataset_export(tmp_path, temp_dataset):
    labels_file, images_dir = temp_dataset
    output_dir = tmp_path / "export"

    test_args = [
        "prepare_kaggle_dataset.py",
        "--labels",
        str(labels_file),
        "--images-root",
        str(images_dir),
        "--output-dir",
        str(output_dir),
    ]

    with patch.object(sys, "argv", test_args):
        prepare_main()

    assert (output_dir / "real_observations.json").exists()
    assert (output_dir / "images" / "img1.jpg").exists()
    assert (output_dir / "images" / "img2.jpg").exists()
    assert (output_dir / "README.md").exists()

    with open(output_dir / "real_observations.json", encoding="utf-8") as f:
        exported = json.load(f)
    assert exported[0]["images"] == ["images/img1.jpg"]
    assert exported[1]["images"] == ["images/img2.jpg"]


def test_run_kaggle_benchmark_config_and_pipeline(tmp_path, temp_dataset):
    labels_file, images_dir = temp_dataset
    output_dir = tmp_path / "outputs"
    config_file = tmp_path / "config.json"

    config_data = {
        "dataset_path": str(labels_file),
        "images_root": str(images_dir),
        "output_dir": str(output_dir),
        "mode": "full_pipeline",
        "runtime": {"max_cases": None},
    }
    with open(config_file, "w") as f:
        json.dump(config_data, f)

    test_args = ["run_kaggle_benchmark.py", "--config", str(config_file), "--cpu-only"]

    with patch.object(sys, "argv", test_args):
        benchmark_main()

    # Check outputs generated
    assert (output_dir / "model_status.json").exists()
    assert (output_dir / "kaggle_run_summary.md").exists()
    assert (output_dir / "real_report.json").exists()

    with open(output_dir / "model_status.json") as f:
        status = json.load(f)
    assert status["environment"] == "local_emulated"
    assert status["device"] == "cpu"


def test_run_kaggle_benchmark_max_cases(tmp_path, temp_dataset):
    labels_file, images_dir = temp_dataset
    output_dir = tmp_path / "outputs"
    config_file = tmp_path / "config.json"

    config_data = {
        "dataset_path": str(labels_file),
        "images_root": str(images_dir),
        "output_dir": str(output_dir),
        "mode": "full_pipeline",
        "runtime": {"max_cases": None},
    }
    with open(config_file, "w") as f:
        json.dump(config_data, f)

    test_args = [
        "run_kaggle_benchmark.py",
        "--config",
        str(config_file),
        "--max-cases",
        "1",
        "--cpu-only",
    ]

    with patch.object(sys, "argv", test_args):
        benchmark_main()

    with open(output_dir / "real_report.json") as f:
        rep = json.load(f)
    # The evaluation output should only evaluate 1 case
    assert rep["metrics"]["total_cases"] == 1


def test_run_kaggle_benchmark_shuffle_seed(tmp_path, temp_dataset):
    labels_file, images_dir = temp_dataset
    output_dir = tmp_path / "outputs"
    config_file = tmp_path / "config.json"

    config_data = {
        "dataset_path": str(labels_file),
        "images_root": str(images_dir),
        "output_dir": str(output_dir),
        "mode": "full_pipeline",
        "runtime": {"max_cases": None},
    }
    with open(config_file, "w") as f:
        json.dump(config_data, f)

    # Run twice with same shuffle seed and verify they produce identical reports
    test_args1 = [
        "run_kaggle_benchmark.py",
        "--config",
        str(config_file),
        "--shuffle",
        "--seed",
        "123",
        "--cpu-only",
    ]
    with patch.object(sys, "argv", test_args1):
        benchmark_main()

    with open(output_dir / "real_report.json") as f:
        rep1 = json.load(f)

    # Cleanup outputs folder to run again
    for f in output_dir.glob("*"):
        f.unlink()

    test_args2 = [
        "run_kaggle_benchmark.py",
        "--config",
        str(config_file),
        "--shuffle",
        "--seed",
        "123",
        "--cpu-only",
    ]
    with patch.object(sys, "argv", test_args2):
        benchmark_main()

    with open(output_dir / "real_report.json") as f:
        rep2 = json.load(f)

    assert rep1["metrics"]["total_cases"] == rep2["metrics"]["total_cases"]


def test_run_kaggle_benchmark_missing_images_no_break(tmp_path):
    labels_file = tmp_path / "labels.json"
    images_dir = tmp_path / "images"
    images_dir.mkdir()

    # img1 is missing
    dataset_content = [
        {
            "observation_id": "test_missing",
            "title": "Amanita muscaria",
            "expected_taxon": "Amanita muscaria",
            "expected_genus": "Amanita",
            "risk_level": "high",
            "images": ["non_existent_img.jpg"],
            "metadata": {},
        }
    ]
    with open(labels_file, "w", encoding="utf-8") as f:
        json.dump(dataset_content, f)

    output_dir = tmp_path / "outputs"
    config_file = tmp_path / "config.json"

    config_data = {
        "dataset_path": str(labels_file),
        "images_root": str(images_dir),
        "output_dir": str(output_dir),
        "mode": "full_pipeline",
        "runtime": {"max_cases": None},
    }
    with open(config_file, "w") as f:
        json.dump(config_data, f)

    test_args = ["run_kaggle_benchmark.py", "--config", str(config_file), "--cpu-only"]

    # Should not throw exception, case will be skipped by eval engine because no image is found
    with patch.object(sys, "argv", test_args):
        benchmark_main()

    assert (output_dir / "real_report.json").exists()
    with open(output_dir / "real_report.json") as f:
        rep = json.load(f)
    assert rep["metrics"]["skipped_cases"] == 1
    assert rep["metrics"]["evaluated_cases"] == 0


def test_run_kaggle_benchmark_staged_modes(tmp_path, temp_dataset):
    labels_file, images_dir = temp_dataset
    output_dir = tmp_path / "outputs"
    config_file = tmp_path / "config.json"

    config_data = {
        "dataset_path": str(labels_file),
        "images_root": str(images_dir),
        "output_dir": str(output_dir),
        "mode": "detection_only",
        "runtime": {"max_cases": None},
    }
    with open(config_file, "w") as f:
        json.dump(config_data, f)

    # Check detection only mode
    test_args = [
        "run_kaggle_benchmark.py",
        "--config",
        str(config_file),
        "--mode",
        "detection_only",
        "--cpu-only",
    ]
    with patch.object(sys, "argv", test_args):
        benchmark_main()
    assert (output_dir / "crops_metadata.json").exists()

    # Check dino embeddings only mode
    test_args = [
        "run_kaggle_benchmark.py",
        "--config",
        str(config_file),
        "--mode",
        "dino_embeddings_only",
        "--cpu-only",
    ]
    with patch.object(sys, "argv", test_args):
        benchmark_main()
    assert (output_dir / "embeddings_dino.json").exists()

    # Check siglip embeddings only mode
    test_args = [
        "run_kaggle_benchmark.py",
        "--config",
        str(config_file),
        "--mode",
        "siglip_embeddings_only",
        "--cpu-only",
    ]
    with patch.object(sys, "argv", test_args):
        benchmark_main()
    assert (output_dir / "embeddings_siglip.json").exists()
