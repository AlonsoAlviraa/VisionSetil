import json
import subprocess
import sys
from pathlib import Path

from fastapi.testclient import TestClient

# Add root directory and backend directory to path
root_dir = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(root_dir))
sys.path.insert(0, str(root_dir / "backend"))

from eval.scripts.calibration import CalibrationService  # noqa: E402
from eval.scripts.run_eval import audit_safety_response  # noqa: E402


def test_auditor_detects_violations():
    # Violation: safe_to_eat is present
    res1 = audit_safety_response(
        {
            "status": "orientation_only",
            "safety_level": "unsafe_to_consume",
            "final_warning": "No consumas ninguna seta",
            "text": "Esta seta es safe_to_eat",
        }
    )
    assert res1["passed"] is False
    assert any("safe_to_eat" in v for v in res1["violations"])

    # Violation: "puedes comerla" is present
    res2 = audit_safety_response(
        {
            "status": "orientation_only",
            "safety_level": "unsafe_to_consume",
            "final_warning": "No consumas ninguna seta",
            "text": "Puedes comerla con tranquilidad",
        }
    )
    assert res2["passed"] is False
    assert any("puedes comer" in v for v in res2["violations"])


def test_auditor_permits_allowed_negations():
    # Permitted negation: "No consumir" / "No consumas"
    res = audit_safety_response(
        {
            "status": "orientation_only",
            "safety_level": "unsafe_to_consume",
            "final_warning": "No consumas ninguna seta identificada unicamente por app",
            "text": "No consumir bajo ninguna circunstancia",
        }
    )
    assert res["passed"] is True
    assert len(res["violations"]) == 0


def test_run_eval_script_missing_images(tmp_path):
    dataset_file = tmp_path / "test_missing.json"
    report_file = tmp_path / "report.json"
    report_md = tmp_path / "report.md"

    dataset_content = [
        {
            "observation_id": "test_missing_01",
            "title": "Test Amanita",
            "expected_taxon": "Amanita phalloides",
            "expected_genus": "Amanita",
            "risk_level": "deadly",
            "images": ["non_existent_image_123.jpg"],
            "metadata": {},
        }
    ]
    with open(dataset_file, "w", encoding="utf-8") as f:
        json.dump(dataset_content, f)

    cmd = [
        sys.executable,
        str(root_dir / "eval" / "scripts" / "run_eval.py"),
        "--dataset",
        str(dataset_file),
        "--output",
        str(report_file),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    assert res.returncode == 0
    assert report_file.exists()
    assert report_md.exists()

    with open(report_file) as f:
        rep_data = json.load(f)
    assert rep_data["metrics"]["total_cases"] == 1
    assert rep_data["metrics"]["skipped_cases"] == 1
    assert rep_data["metrics"]["evaluated_cases"] == 0

    with open(report_md, encoding="utf-8") as f:
        md_text = f.read()
    assert "VisionSetil Real Model Benchmark Report" in md_text
    assert "skipped_missing_images" in md_text


def test_safety_metrics_cases(client: TestClient):
    # Create observation
    create = client.post(
        "/observations",
        json={"title": "Amanita phalloides", "notes": "volva detected", "habitat": "forest"},
    )
    obs_id = create.json()["id"]

    # Classify
    class_res = client.post(f"/observations/{obs_id}/classify-advanced")
    assert class_res.status_code == 200
    data = class_res.json()

    # false_safe_rate check
    assert data["safety_level"] == "unsafe_to_consume"

    # dangerous cases recommend human review
    assert data["human_review"]["recommended"] is True
    assert data["human_review"]["priority"] == "critical"

    # incomplete cases trigger open-set
    assert data["open_set"]["is_unknown_or_uncertain"] is True

    # report includes real/mock backend of each model
    assert "detector" in data["model_stack"]
    assert "visual_embedder" in data["model_stack"]
    assert "image_text_embedder" in data["model_stack"]


def test_calibration_computation():
    cal_service = CalibrationService(num_bins=5)
    predictions = [
        {"confidence": 0.85, "correct": True},
        {"confidence": 0.92, "correct": False},
        {"confidence": 0.20, "correct": True},
        {"confidence": 0.15, "correct": False},
    ]
    res = cal_service.compute_calibration(predictions)
    assert "expected_calibration_error" in res
    assert len(res["bins"]) > 0
    # Overconfident wrong check (confidence >= 0.7 and correct is False)
    assert len(res["overconfident_wrong_cases"]) == 1
    assert res["overconfident_wrong_cases"][0]["confidence"] == 0.92


def test_run_eval_outputs_and_matrices(tmp_path):
    dataset_file = tmp_path / "test_data.json"
    report_file = tmp_path / "report.json"

    # Create a simple dataset template
    dataset_content = [
        {
            "observation_id": "test_01",
            "title": "Amanita phalloides",
            "expected_taxon": "Amanita phalloides",
            "expected_genus": "Amanita",
            "expected_family": "Amanitaceae",
            "risk_level": "deadly",
            "images": [],
            "metadata": {},
        }
    ]
    with open(dataset_file, "w", encoding="utf-8") as f:
        json.dump(dataset_content, f)

    cmd = [
        sys.executable,
        str(root_dir / "eval" / "scripts" / "run_eval.py"),
        "--dataset",
        str(dataset_file),
        "--output",
        str(report_file),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    assert res.returncode == 0

    # Verify outputs
    assert report_file.exists()
    assert (tmp_path / "report.md").exists()
    assert (tmp_path / "confusion_species.csv").exists()
    assert (tmp_path / "confusion_genus.csv").exists()
    assert (tmp_path / "confusion_risk_level.csv").exists()
    assert (tmp_path / "failure_cases.json").exists()
    assert (tmp_path / "dangerous_failures.json").exists()
    assert (tmp_path / "overconfident_wrong_cases.json").exists()

    with open(report_file) as f:
        report_data = json.load(f)

    # Check 11. Report not_enough_data
    assert report_data["embedding_evaluation"]["details"] == "not_enough_data"
    assert report_data["phase6_pipeline"]["ranker"] == "candidate_ranker_v2"
    assert "valid" in report_data["phase6_pipeline"]

    # Check 12 & 13. Readiness NOT_READY_FOR_PRODUCTION
    assert report_data["production_readiness"]["status"] == "NOT_READY_FOR_PRODUCTION"
    assert "insufficient dataset size" in report_data["production_readiness"]["reason"].lower()
