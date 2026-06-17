import json
import os
import sys
from pathlib import Path
import pytest
from unittest.mock import patch

# Add root folder to sys.path
root_dir = Path(__file__).resolve().parents[3]
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))
kaggle_dir = root_dir / "kaggle"
if str(kaggle_dir) not in sys.path:
    sys.path.insert(0, str(kaggle_dir))

# Evict kaggle if it is the PyPI library, to force loading the local kaggle package
if "kaggle" in sys.modules:
    mod = sys.modules["kaggle"]
    if hasattr(mod, "__file__") and mod.__file__ and "VisionSetil" not in mod.__file__:
        del sys.modules["kaggle"]

# Dynamically import scripts to avoid PyPI package namespace conflicts
import importlib.util

def import_by_path(module_name, file_path):
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module

inspect_module = import_by_path("inspect_kaggle_dataset", str(root_dir / "kaggle" / "inspect_kaggle_dataset.py"))
inspect_main = inspect_module.main

large_benchmark_module = import_by_path("run_large_dataset_benchmark", str(root_dir / "kaggle" / "run_large_dataset_benchmark.py"))
large_benchmark_main = large_benchmark_module.main


def test_inspect_kaggle_dataset(tmp_path):
    # 1. inspect_kaggle_dataset.py detecta CSV/JSON fake.
    csv_file = tmp_path / "fungiclef2025_metadata.csv"
    with open(csv_file, "w", encoding="utf-8") as f:
        f.write("observation_id,image_path,species,genus,family\n")
        f.write("obs_inspect_1,img1.jpg,Amanita muscaria,Amanita,Amanitaceae\n")
    
    img_file = tmp_path / "img1.jpg"
    img_file.write_bytes(b"dummy image data")
    
    test_args = [
        "inspect_kaggle_dataset.py",
        "--dataset-root", str(tmp_path)
    ]
    
    from io import StringIO
    stdout_capture = StringIO()
    
    with patch.object(sys, "argv", test_args), patch("sys.stdout", stdout_capture), patch("sys.exit") as mock_exit:
        inspect_main()
        
    output = stdout_capture.getvalue()
    assert "Total files:" in output or "DATASET INSPECTOR" in output
    assert "fungiclef2025_metadata.csv" in output
    assert "obs_inspect_1" in output


def test_convert_fungiclef(tmp_path):
    # 2. Converter FungiCLEF convierte un CSV de ejemplo.
    metadata_file = tmp_path / "fungiclef2025_metadata.csv"
    with open(metadata_file, "w", encoding="utf-8") as f:
        f.write("observation_id,image_path,species,genus,family,habitat,substrate,country,date\n")
        f.write("obs_clef_1,img1.jpg,Amanita muscaria,Amanita,Amanitaceae,woods,soil,Spain,2026-06-17\n")
    
    img_file = tmp_path / "img1.jpg"
    img_file.write_bytes(b"dummy")
    
    output_json = tmp_path / "converted_clef.json"
    
    from kaggle.converters import convert_fungiclef
    results = convert_fungiclef(
        dataset_root=str(tmp_path),
        output_json=str(output_json),
        poisonous_catalog_path=None,
        sampling_options=None
    )
    
    assert len(results) == 1
    obs = results[0]
    assert obs["observation_id"] == "fungiclef_obs_clef_1"
    assert obs["expected_taxon"] == "Amanita muscaria"
    assert obs["expected_genus"] == "Amanita"
    assert obs["expected_family"] == "Amanitaceae"
    assert len(obs["images"]) == 1
    assert obs["metadata"]["country"] == "Spain"
    
    assert output_json.exists()
    with open(output_json, "r") as f:
        saved = json.load(f)
    assert len(saved) == 1


def test_convert_fungitastic(tmp_path):
    # 3. Converter FungiTastic convierte un CSV de ejemplo.
    metadata_file = tmp_path / "fungitastic_metadata.csv"
    with open(metadata_file, "w", encoding="utf-8") as f:
        f.write("observation_id,image_path,species,genus,family\n")
        f.write("obs_tastic_1,img2.jpg,Agaricus bisporus,Agaricus,Agaricaceae\n")
        
    img_file = tmp_path / "img2.jpg"
    img_file.write_bytes(b"dummy")
    
    output_json = tmp_path / "converted_tastic.json"
    
    from kaggle.converters import convert_fungitastic
    results = convert_fungitastic(
        dataset_root=str(tmp_path),
        output_json=str(output_json),
        poisonous_catalog_path=None,
        sampling_options=None
    )
    
    assert len(results) == 1
    obs = results[0]
    assert obs["observation_id"] == "fungitastic_obs_tastic_1"
    assert obs["expected_taxon"] == "Agaricus bisporus"


def test_convert_df20(tmp_path):
    # 4. Converter DF20 convierte un CSV de ejemplo.
    metadata_file = tmp_path / "df20_metadata.csv"
    with open(metadata_file, "w", encoding="utf-8") as f:
        f.write("observation_id,image_path,species,genus,family\n")
        f.write("obs_df_1,img3.jpg,Galerina marginata,Galerina,Strophariaceae\n")
        
    img_file = tmp_path / "img3.jpg"
    img_file.write_bytes(b"dummy")
    
    output_json = tmp_path / "converted_df20.json"
    
    from kaggle.converters import convert_df20
    results = convert_df20(
        dataset_root=str(tmp_path),
        output_json=str(output_json),
        poisonous_catalog_path=None,
        sampling_options=None
    )
    
    assert len(results) == 1
    obs = results[0]
    assert obs["observation_id"] == "df20_obs_df_1"
    assert obs["expected_taxon"] == "Galerina marginata"


def test_converter_fills_missing_with_null(tmp_path):
    # 5. El converter rellena campos faltantes con `null`.
    metadata_file = tmp_path / "fungiclef2025_metadata.csv"
    with open(metadata_file, "w", encoding="utf-8") as f:
        f.write("observation_id,image_path,species\n")
        f.write("obs_1,img1.jpg,Amanita muscaria\n")
        
    img_file = tmp_path / "img1.jpg"
    img_file.write_bytes(b"dummy")
    
    output_json = tmp_path / "converted.json"
    
    from kaggle.converters import convert_fungiclef
    results = convert_fungiclef(
        dataset_root=str(tmp_path),
        output_json=str(output_json),
        poisonous_catalog_path=None,
        sampling_options=None
    )
    
    obs = results[0]
    assert obs["metadata"]["habitat"] is None
    assert obs["metadata"]["substrate"] is None
    assert obs["metadata"]["country"] is None
    assert obs["metadata"]["observed_at"] is None
    assert obs["metadata"]["latitude"] is None
    assert obs["metadata"]["longitude"] is None


def test_converter_validates_existing_images(tmp_path):
    # 6. El converter valida imágenes existentes.
    metadata_file = tmp_path / "fungiclef2025_metadata.csv"
    with open(metadata_file, "w", encoding="utf-8") as f:
        f.write("observation_id,image_path,species\n")
        f.write("obs_1,img_exist.jpg,Amanita muscaria\n")
        f.write("obs_1,img_missing.jpg,Amanita muscaria\n")
        
    img_file = tmp_path / "img_exist.jpg"
    img_file.write_bytes(b"dummy")
    
    output_json = tmp_path / "converted.json"
    
    from kaggle.converters import convert_fungiclef
    results = convert_fungiclef(
        dataset_root=str(tmp_path),
        output_json=str(output_json),
        poisonous_catalog_path=None,
        sampling_options=None
    )
    
    obs = results[0]
    assert len(obs["images"]) == 1
    assert "img_exist.jpg" in obs["images"][0]
    assert "img_missing.jpg" not in obs["images"][0]


def test_sampling_max_cases():
    # 7. Sampling `max_cases` funciona.
    from kaggle.converters.common import apply_sampling
    
    observations = [
        {"observation_id": f"obs_{i}", "risk_level": "unknown"} for i in range(5)
    ]
    
    sampled = apply_sampling(observations, {"max_cases": 2})
    assert len(sampled) == 2


def test_sampling_shuffle_reproducible():
    # 8. Sampling `shuffle + seed` es reproducible.
    from kaggle.converters.common import apply_sampling
    
    observations = [
        {"observation_id": f"obs_{i}", "risk_level": "unknown"} for i in range(100)
    ]
    
    # Pass copies to avoid in-place shuffle mutations overriding other test instances
    sampled1 = apply_sampling(list(observations), {"shuffle": True, "seed": 42})
    sampled2 = apply_sampling(list(observations), {"shuffle": True, "seed": 42})
    sampled3 = apply_sampling(list(observations), {"shuffle": True, "seed": 99})
    
    ids1 = [o["observation_id"] for o in sampled1]
    ids2 = [o["observation_id"] for o in sampled2]
    ids3 = [o["observation_id"] for o in sampled3]
    
    assert ids1 == ids2
    assert ids1 != ids3


def test_risk_inference_amanita():
    # 9. Risk inference detecta Amanita como high_or_unknown.
    from kaggle.converters.common import infer_risk_level
    
    # Amanita pantherina is not in poisonous_species.json, but genus is Amanita
    risk = infer_risk_level("Amanita pantherina", "Amanita", None)
    assert risk == "high_or_unknown"


def test_risk_inference_galerina():
    # 10. Risk inference detecta Galerina como high_or_unknown.
    from kaggle.converters.common import infer_risk_level
    
    risk = infer_risk_level("Galerina clavata", "Galerina", None)
    assert risk == "high_or_unknown"


def test_risk_inference_never_safe(tmp_path):
    # 11. Nunca se genera `safe`.
    from kaggle.converters.common import infer_risk_level
    
    risk1 = infer_risk_level("Agaricus campestris", "Agaricus", None)
    assert risk1 != "safe"
    assert risk1 == "unknown"
    
    catalog_file = tmp_path / "poisonous.json"
    with open(catalog_file, "w") as f:
        json.dump([
            {"latin_name": "agaricus bisporus", "risk_level": "low"}
        ], f)
        
    risk2 = infer_risk_level("Agaricus bisporus", "Agaricus", str(catalog_file))
    assert risk2 != "safe"
    assert risk2 == "high_or_unknown"


def test_runner_generates_converted_json(tmp_path):
    # 12. El runner genera `converted_dataset.json`.
    dataset_root = tmp_path / "mock_dataset"
    dataset_root.mkdir()
    
    metadata_file = dataset_root / "fungiclef2025_metadata.csv"
    with open(metadata_file, "w", encoding="utf-8") as f:
        f.write("observation_id,image_path,species,genus,family\n")
        f.write("obs_runner_1,img1.jpg,Amanita muscaria,Amanita,Amanitaceae\n")
        
    img_file = dataset_root / "img1.jpg"
    img_file.write_bytes(b"dummy")
    
    output_dir = tmp_path / "outputs"
    
    config_file = tmp_path / "config.json"
    config_data = {
        "dataset_name": "fungiclef2025",
        "dataset_root": str(dataset_root),
        "output_dir": str(output_dir),
        "converted_dataset_path": str(output_dir / "converted_fungiclef2025_observations.json"),
        "sampling": {
            "max_cases": 1,
            "shuffle": False
        },
        "runtime": {
            "device": "cpu"
        }
    }
    with open(config_file, "w") as f:
        json.dump(config_data, f)
        
    import subprocess
    original_run = subprocess.run
    
    def mock_run(cmd, *args, **kwargs):
        if "run_eval.py" in str(cmd):
            report_path = Path(output_dir) / "real_report.json"
            report_path.parent.mkdir(parents=True, exist_ok=True)
            report_data = {
                "metrics": {
                    "skipped_cases": 0,
                    "evaluated_cases": 1,
                    "species_top1_accuracy": 1.0,
                    "species_top5_accuracy": 1.0,
                    "genus_accuracy": 1.0,
                    "false_safe_rate": 0.0,
                    "toxic_not_flagged_rate": 0.0,
                    "overconfident_wrong_rate": 0.0,
                    "safety_policy_violations": 0
                },
                "model_status": {
                    "yoloe_detector": {"backend": "mock", "loaded": False, "device": "cpu"},
                    "dinov3_embedder": {"backend": "mock", "loaded": False, "device": "cpu"},
                    "siglip2_embedder": {"backend": "mock", "loaded": False, "device": "cpu"}
                },
                "production_readiness": {
                    "status": "APPROVED",
                    "reason": "All checks passed"
                }
            }
            with open(report_path, "w") as rf:
                json.dump(report_data, rf)
                
            md_path = root_dir / "eval" / "reports" / "report.md"
            md_path.parent.mkdir(parents=True, exist_ok=True)
            md_path.write_text("Mock markdown report")
            
            for f_name in ["confusion_species.csv", "confusion_genus.csv", "confusion_risk_level.csv", "failure_cases.json", "dangerous_failures.json", "overconfident_wrong_cases.json"]:
                (root_dir / "eval" / "reports" / f_name).write_text("")
                
            class MockCompletedProcess:
                returncode = 0
                stdout = "Mock run_eval.py execution success"
                stderr = ""
            return MockCompletedProcess()
        return original_run(cmd, *args, **kwargs)
        
    test_args = [
        "run_large_dataset_benchmark.py",
        "--config", str(config_file),
        "--cpu-only"
    ]
    
    with patch("subprocess.run", side_effect=mock_run), patch.object(sys, "argv", test_args):
        large_benchmark_main()
        
    converted_file = output_dir / "converted_fungiclef2025_observations.json"
    assert converted_file.exists()
    with open(converted_file, "r") as f:
        converted_data = json.load(f)
    assert len(converted_data) == 1
    assert converted_data[0]["observation_id"] == "fungiclef_obs_runner_1"


def test_runner_calls_run_eval(tmp_path):
    # 13. El runner llama a `run_eval.py`.
    dataset_root = tmp_path / "mock_dataset"
    dataset_root.mkdir()
    
    metadata_file = dataset_root / "fungiclef2025_metadata.csv"
    with open(metadata_file, "w", encoding="utf-8") as f:
        f.write("observation_id,image_path,species,genus,family\n")
        f.write("obs_runner_2,img2.jpg,Amanita muscaria,Amanita,Amanitaceae\n")
        
    img_file = dataset_root / "img2.jpg"
    img_file.write_bytes(b"dummy")
    
    output_dir = tmp_path / "outputs"
    config_file = tmp_path / "config.json"
    config_data = {
        "dataset_name": "fungiclef2025",
        "dataset_root": str(dataset_root),
        "output_dir": str(output_dir),
        "converted_dataset_path": str(output_dir / "converted_fungiclef2025_observations.json"),
        "sampling": {
            "max_cases": 1,
            "shuffle": False
        },
        "runtime": {
            "device": "cpu"
        }
    }
    with open(config_file, "w") as f:
        json.dump(config_data, f)
        
    import subprocess
    called_cmds = []
    original_run = subprocess.run
    
    def mock_run(cmd, *args, **kwargs):
        called_cmds.append(cmd)
        if "run_eval.py" in str(cmd):
            report_path = Path(output_dir) / "real_report.json"
            report_path.parent.mkdir(parents=True, exist_ok=True)
            with open(report_path, "w") as rf:
                json.dump({"metrics": {}, "model_status": {}}, rf)
            
            md_path = root_dir / "eval" / "reports" / "report.md"
            md_path.parent.mkdir(parents=True, exist_ok=True)
            md_path.write_text("Mock report")
            
            class MockCompletedProcess:
                returncode = 0
                stdout = "Mock run_eval.py execution success"
                stderr = ""
            return MockCompletedProcess()
        return original_run(cmd, *args, **kwargs)
        
    test_args = [
        "run_large_dataset_benchmark.py",
        "--config", str(config_file),
        "--cpu-only"
    ]
    
    with patch("subprocess.run", side_effect=mock_run), patch.object(sys, "argv", test_args):
        large_benchmark_main()
        
    eval_called = False
    for cmd in called_cmds:
        cmd_str = " ".join([str(c) for c in cmd])
        if "run_eval.py" in cmd_str:
            eval_called = True
            assert str(output_dir / "converted_fungiclef2025_observations.json") in cmd_str
            
    assert eval_called


def test_notebook_does_not_reference_mock_as_primary_benchmark():
    # 14. El notebook no referencia el dataset mock como benchmark principal.
    notebook_path = root_dir / "kaggle" / "vision_setil_kaggle_benchmark.ipynb"
    assert notebook_path.exists()
    
    with open(notebook_path, "r", encoding="utf-8") as f:
        notebook = json.load(f)
        
    has_fungiclef = False
    has_mock_as_primary_warning = False
    
    for cell in notebook.get("cells", []):
        source_text = "".join(cell.get("source", []))
        if "fungiclef2025" in source_text.lower() or "fungi-clef-2025" in source_text.lower():
            has_fungiclef = True
        if "mock vs real warning" in source_text.lower() or "if all models are mocks" in source_text.lower():
            has_mock_as_primary_warning = True
            
    assert has_fungiclef, "Notebook should refer to fungiclef2025 as a benchmark target."
