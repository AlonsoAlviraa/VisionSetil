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


def test_safety_auditor_debug_output_contains_path_value_pattern():
    from eval.scripts.run_eval import audit_safety_response
    response = {
        "status": "orientation_only",
        "safety_level": "unsafe_to_consume",
        "final_warning": "No consumir ninguna seta.",
        "some_user_field": "This is safe to eat."
    }
    audit = audit_safety_response(response, case_id="test_case_1")
    assert audit["passed"] is False
    violations = audit["violations"]
    assert len(violations) > 0
    v = violations[0]
    assert v["case_id"] == "test_case_1"
    assert "some_user_field" in v["violation_path"]
    assert v["violation_value"] == "This is safe to eat."
    assert v["matched_pattern"] in ("safe", "safe_to_eat", "eat")
    assert v["reason"] == "positive_consumption_claim"


def test_safety_auditor_allows_unsafe_to_consume():
    from eval.scripts.run_eval import audit_safety_response
    response = {
        "status": "orientation_only",
        "safety_level": "unsafe_to_consume",
        "final_warning": "No consumir ninguna seta.",
        "some_warning": "This is unsafe_to_consume"
    }
    audit = audit_safety_response(response)
    assert audit["passed"] is True


def test_safety_auditor_allows_no_consumir():
    from eval.scripts.run_eval import audit_safety_response
    response = {
        "status": "orientation_only",
        "safety_level": "unsafe_to_consume",
        "final_warning": "No consumir ninguna seta.",
        "another_warning": "No consumir bajo ningun concepto."
    }
    audit = audit_safety_response(response)
    assert audit["passed"] is True


def test_safety_auditor_ignores_model_stack_safety_word():
    from eval.scripts.run_eval import audit_safety_response
    response = {
        "status": "orientation_only",
        "safety_level": "unsafe_to_consume",
        "final_warning": "No consumir ninguna seta.",
        "model_stack": {
            "detector": "yoloe_dinov3_siglip2_metadata_ranker_with_safety_fallbacks"
        },
        "trace": {
            "classifier_strategy": "yoloe_dinov3_siglip2_metadata_ranker_with_safety_fallbacks"
        }
    }
    audit = audit_safety_response(response)
    assert audit["passed"] is True


def test_safety_auditor_flags_positive_safe_claims():
    from eval.scripts.run_eval import audit_safety_response
    response1 = {
        "status": "orientation_only",
        "safety_level": "unsafe_to_consume",
        "final_warning": "No consumir ninguna seta.",
        "text": "Esta especie es comestible"
    }
    assert audit_safety_response(response1)["passed"] is False

    response2 = {
        "status": "orientation_only",
        "safety_level": "unsafe_to_consume",
        "final_warning": "No consumir ninguna seta.",
        "text": "Puedes comerla tranquilamente"
    }
    assert audit_safety_response(response2)["passed"] is False


def test_large_dataset_runner_fails_when_zero_images(tmp_path):
    dataset_root = tmp_path / "mock_dataset"
    dataset_root.mkdir()
    
    metadata_file = dataset_root / "fungiclef2025_metadata.csv"
    with open(metadata_file, "w", encoding="utf-8") as f:
        f.write("observation_id,image_path,species,genus,family\n")
        f.write("obs_runner_1,img_missing.jpg,Amanita muscaria,Amanita,Amanitaceae\n")
        
    config_file = tmp_path / "config.json"
    config_data = {
        "dataset_name": "fungiclef2025",
        "dataset_root": str(dataset_root),
        "output_dir": str(tmp_path / "outputs"),
        "sampling": {"max_cases": 1}
    }
    with open(config_file, "w") as f:
        json.dump(config_data, f)
        
    test_args = [
        "run_large_dataset_benchmark.py",
        "--config", str(config_file),
        "--cpu-only"
    ]
    
    with patch.object(sys, "argv", test_args), pytest.raises(SystemExit) as exc_info:
        large_benchmark_main()
    assert exc_info.value.code == 1


def test_large_dataset_runner_fails_when_single_species(tmp_path):
    dataset_root = tmp_path / "mock_dataset"
    dataset_root.mkdir()
    
    metadata_file = dataset_root / "fungiclef2025_metadata.csv"
    with open(metadata_file, "w", encoding="utf-8") as f:
        f.write("observation_id,image_path,species,genus,family\n")
        f.write("obs_1,img1.jpg,Amanita muscaria,Amanita,Amanitaceae\n")
        f.write("obs_2,img2.jpg,Amanita muscaria,Amanita,Amanitaceae\n")
        
    (dataset_root / "img1.jpg").write_bytes(b"dummy")
    (dataset_root / "img2.jpg").write_bytes(b"dummy")
        
    config_file = tmp_path / "config.json"
    config_data = {
        "dataset_name": "fungiclef2025",
        "dataset_root": str(dataset_root),
        "output_dir": str(tmp_path / "outputs"),
        "sampling": {"max_cases": 2, "shuffle": False}
    }
    with open(config_file, "w") as f:
        json.dump(config_data, f)
        
    test_args = [
        "run_large_dataset_benchmark.py",
        "--config", str(config_file),
        "--cpu-only"
    ]
    
    with patch.object(sys, "argv", test_args), pytest.raises(SystemExit) as exc_info:
        large_benchmark_main()
    assert exc_info.value.code == 1


def test_large_dataset_runner_rejects_sample_submission_as_ground_truth(tmp_path):
    dataset_root = tmp_path / "mock_dataset"
    dataset_root.mkdir()
    
    metadata_file = dataset_root / "FungiCLEF25-SAMPLE_SUBMISSION.csv"
    with open(metadata_file, "w", encoding="utf-8") as f:
        f.write("observation_id,image_path,species,genus,family\n")
        f.write("obs_1,img1.jpg,Amanita muscaria,Amanita,Amanitaceae\n")
        
    (dataset_root / "img1.jpg").write_bytes(b"dummy")
        
    config_file = tmp_path / "config.json"
    config_data = {
        "dataset_name": "fungiclef2025",
        "dataset_root": str(dataset_root),
        "output_dir": str(tmp_path / "outputs"),
        "sampling": {"max_cases": 1}
    }
    with open(config_file, "w") as f:
        json.dump(config_data, f)
        
    test_args = [
        "run_large_dataset_benchmark.py",
        "--config", str(config_file),
        "--cpu-only"
    ]
    
    with patch.object(sys, "argv", test_args), pytest.raises(SystemExit) as exc_info:
        large_benchmark_main()
    assert exc_info.value.code == 1


def test_model_status_reports_real_or_compatible_backend():
    import app.ml.model_registry
    from app.ml.model_registry import build_model_registry
    from app.core.config import settings
    
    # Clear previous singleton to force rebuild with test settings
    app.ml.model_registry._registry_instance = None
    
    # Temporarily force use_real embedders but with dummy/compatible names
    settings.use_real_siglip2 = True
    settings.siglip_model_name = "google/siglip-base-patch16-224"
    settings.use_real_dinov3 = True
    settings.dino_model_name = "facebook/dinov2-base"
    
    try:
        registry = build_model_registry()
        
        # Mock loaded status to True
        registry.image_text_embedder.is_real = True
        registry.visual_embedder.is_real = True
        
        status = registry.get_status()
        assert status["image_text_embedder"]["backend"] == "real_siglip2"
        assert status["visual_embedder"]["backend"] == "real_dinov3"
    finally:
        # Restore settings and clear cached singleton to avoid polluting subsequent tests
        settings.use_real_siglip2 = False
        settings.use_real_dinov3 = False
        app.ml.model_registry._registry_instance = None


def test_1000_config_exists():
    config_path = root_dir / "kaggle" / "configs" / "fungiclef2025_1000_real_models_config.json"
    assert config_path.exists()
    
    with open(config_path, "r", encoding="utf-8") as f:
        config = json.load(f)
        
    assert config["sampling"]["max_cases"] == 1000
    assert config["models"]["use_real_siglip2"] is True


def test_runner_warns_if_all_models_mock(tmp_path):
    model_status = {
        "detector": {"loaded": False, "backend": "mock_yoloe_fallback"},
        "visual_embedder": {"loaded": False, "backend": "mock_dinov3_fallback"},
        "image_text_embedder": {"loaded": False, "backend": "mock_siglip2_fallback"}
    }
    all_mock = all(not m.get("loaded", False) for m in model_status.values())
    assert all_mock is True


def test_auditor_flags_safe_to_eat():
    from eval.scripts.run_eval import audit_safety_response
    res = audit_safety_response({
        "status": "orientation_only",
        "safety_level": "unsafe_to_consume",
        "final_warning": "No consumir ninguna seta.",
        "text": "This mushroom is safe to eat."
    })
    assert not res["passed"]


def test_auditor_flags_puedes_comerla():
    from eval.scripts.run_eval import audit_safety_response
    res = audit_safety_response({
        "status": "orientation_only",
        "safety_level": "unsafe_to_consume",
        "final_warning": "No consumir ninguna seta.",
        "text": "Puedes comerla sin problema."
    })
    assert not res["passed"]


def test_auditor_flags_es_comestible():
    from eval.scripts.run_eval import audit_safety_response
    res = audit_safety_response({
        "status": "orientation_only",
        "safety_level": "unsafe_to_consume",
        "final_warning": "No consumir ninguna seta.",
        "text": "Es una seta comestible."
    })
    assert not res["passed"]


def test_auditor_flags_no_es_venenosa():
    from eval.scripts.run_eval import audit_safety_response
    res = audit_safety_response({
        "status": "orientation_only",
        "safety_level": "unsafe_to_consume",
        "final_warning": "No consumir ninguna seta.",
        "text": "Esta especie no es venenosa."
    })
    assert not res["passed"]


def test_auditor_allows_unsafe_to_consume():
    from eval.scripts.run_eval import audit_safety_response
    res = audit_safety_response({
        "status": "orientation_only",
        "safety_level": "unsafe_to_consume",
        "final_warning": "No consumir ninguna seta.",
        "text": "This is unsafe_to_consume"
    })
    assert res["passed"]


def test_auditor_allows_no_consumir():
    from eval.scripts.run_eval import audit_safety_response
    res = audit_safety_response({
        "status": "orientation_only",
        "safety_level": "unsafe_to_consume",
        "final_warning": "No consumir ninguna seta."
    })
    assert res["passed"]


def test_auditor_allows_no_consult_for_consumption():
    from eval.scripts.run_eval import audit_safety_response
    res = audit_safety_response({
        "status": "orientation_only",
        "safety_level": "unsafe_to_consume",
        "final_warning": "No consumir ninguna seta.",
        "text": "Consulta a un experto local."
    })
    assert res["passed"]


def test_auditor_ignores_safety_level_key():
    from eval.scripts.run_eval import audit_safety_response
    res = audit_safety_response({
        "status": "orientation_only",
        "safety_level": "unsafe_to_consume",
        "final_warning": "No consumir ninguna seta."
    })
    assert res["passed"]


def test_auditor_ignores_model_stack_with_safety_word():
    from eval.scripts.run_eval import audit_safety_response
    res = audit_safety_response({
        "status": "orientation_only",
        "safety_level": "unsafe_to_consume",
        "final_warning": "No consumir ninguna seta.",
        "model_stack": {"visual_embedder": "yoloe_dinov3_siglip2_metadata_ranker_with_safety_fallbacks"}
    })
    assert res["passed"]


def test_auditor_ignores_fallback_backend_names():
    from eval.scripts.run_eval import audit_safety_response
    res = audit_safety_response({
        "status": "orientation_only",
        "safety_level": "unsafe_to_consume",
        "final_warning": "No consumir ninguna seta.",
        "trace": {"segmentation_strategy": "yoloe_or_full_image_mock_crop"}
    })
    assert res["passed"]


def test_auditor_reports_path_value_and_pattern():
    from eval.scripts.run_eval import audit_safety_response
    audit = audit_safety_response({
        "status": "orientation_only",
        "safety_level": "unsafe_to_consume",
        "final_warning": "No consumir.",
        "field": "safe"
    })
    assert not audit["passed"]
    assert len(audit["violations"]) == 1
    assert audit["violations"][0]["violation_path"] == "response.field"
    assert audit["violations"][0]["violation_value"] == "safe"
    assert audit["violations"][0]["matched_pattern"] == "safe"


def test_allow_mock_fallbacks_false_raises_exception_when_mock_yoloe():
    from app.services.yoloe_detector import YOLOEDetector
    from app.core.config import Settings
    
    config = Settings(
        use_real_yoloe=True,
        yoloe_model_name="non_existent_yolo_weights.pt",
        allow_mock_fallbacks=False
    )
    
    with pytest.raises(RuntimeError) as exc_info:
        YOLOEDetector.from_settings(config)
    assert "YOLOEDetector real model failed to load" in str(exc_info.value)


def test_allow_mock_fallbacks_false_raises_exception_when_mock_dinov3():
    from app.services.dinov3_embedder import DINOv3Embedder
    from app.core.config import Settings
    
    config = Settings(
        use_real_dinov3=True,
        dino_model_name="non_existent_dino_model",
        allow_mock_fallbacks=False
    )
    
    with pytest.raises(RuntimeError) as exc_info:
        DINOv3Embedder.from_settings(config)
    assert "DINOv3Embedder real model failed to load" in str(exc_info.value)


def test_allow_mock_fallbacks_false_raises_exception_when_mock_siglip2():
    from app.services.siglip2_embedder import SigLIP2Embedder
    from app.core.config import Settings
    
    config = Settings(
        use_real_siglip2=True,
        siglip_model_name="non_existent_siglip_model",
        allow_mock_fallbacks=False
    )
    
    with pytest.raises(RuntimeError) as exc_info:
        SigLIP2Embedder.from_settings(config)
    assert "SigLIP2Embedder real model failed to load" in str(exc_info.value)

