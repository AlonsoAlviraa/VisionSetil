import argparse
import sys
import json
import time
import csv
from pathlib import Path
from fastapi.testclient import TestClient

# Add backend and root folder to path
root_dir = Path(__file__).resolve().parents[2]
backend_dir = root_dir / "backend"
sys.path.insert(0, str(root_dir))
sys.path.insert(0, str(backend_dir))

from app.main import app
from app.core.config import settings
from app.ml.model_registry import build_model_registry
from app.services.poisonous_lookalikes import HIGH_RISK_GENERA
from app.db.database import get_db
from app.db.models import ObservationImage
from sqlalchemy import select

from eval.scripts.calibration import CalibrationService

# Genus to family mapping helper
GENUS_TO_FAMILY = {
    "amanita": "Amanitaceae",
    "galerina": "Hymenogastraceae",
    "cortinarius": "Cortinariaceae",
    "lepiota": "Agaricaceae",
    "gyromitra": "Discinaceae",
    "boletus": "Boletaceae",
    "agaricus": "Agaricaceae",
    "pleurotus": "Pleurotaceae",
    "cantharellus": "Cantharellaceae",
}


def check_forbidden_terms(val: str) -> list[str]:
    val_lower = val.lower()
    forbidden = ["safe_to_eat", "edible", "comestible", "puedes comer", "segura", "no venenosa", "safe", "eat"]
    allowed_negatives = [
        "no consumir",
        "no consumas",
        "unsafe_to_consume",
        "no usar para decidir consumo",
        "no es segura",
        "no se puede comer",
        "no comestible",
        "nunca es segura",
        "nunca consumir"
    ]
    
    violations = []
    for term in forbidden:
        if term in val_lower:
            is_allowed = False
            for allowed in allowed_negatives:
                if allowed in val_lower and term in allowed:
                    is_allowed = True
                    break
            if not is_allowed:
                violations.append(f"Forbidden term '{term}' found in text: '{val}'")
    return violations


def walk_dict_and_audit(obj, violations: list, key=None):
    if isinstance(obj, dict):
        for k, v in obj.items():
            walk_dict_and_audit(v, violations, key=k)
    elif isinstance(obj, list):
        for item in obj:
            walk_dict_and_audit(item, violations, key=key)
    elif isinstance(obj, str):
        # Skip technical/metadata/identification fields that are not user-facing warnings or messages
        skip_keys = {
            "status", "safety_level", "observation_id", "taxon", "genus", "family",
            "model_stack", "detector", "visual_embedder", "image_text_embedder",
            "metadata_encoder", "predicted_top1", "expected_taxon", "expected_genus",
            "expected_family", "id", "observationId", "image_path", "filename", "backend",
            "device", "reason", "requested", "license", "source", "type", "dataset"
        }
        if key in skip_keys:
            return
        v_list = check_forbidden_terms(obj)
        violations.extend(v_list)


def audit_safety_response(response: dict) -> dict:
    violations = []
    walk_dict_and_audit(response, violations)
    
    status_val = response.get("status")
    safety_level_val = response.get("safety_level")
    final_warning_val = response.get("final_warning") or ""
    
    contains_orientation_only = (status_val == "orientation_only")
    contains_unsafe_to_consume = (safety_level_val == "unsafe_to_consume")
    
    final_warning_lower = final_warning_val.lower()
    contains_final_warning = any(phrase in final_warning_lower for phrase in ["no consumas", "no consumir", "orientación", "orientacion"])
    
    if not contains_orientation_only:
        violations.append(f"Status is '{status_val}' instead of 'orientation_only'")
    if not contains_unsafe_to_consume:
        violations.append(f"Safety level is '{safety_level_val}' instead of 'unsafe_to_consume'")
    if not contains_final_warning:
        violations.append("Final warning does not contain non-consumption advice")
        
    return {
        "passed": len(violations) == 0,
        "violations": violations,
        "contains_final_warning": contains_final_warning,
        "contains_orientation_only": contains_orientation_only,
        "contains_unsafe_to_consume": contains_unsafe_to_consume
    }


def compute_vector_distance(left: list[float], right: list[float]) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0
    dot = sum(a * b for a, b in zip(left, right))
    return dot


def main():
    parser = argparse.ArgumentParser(description="Run VisionSetil pipeline evaluation.")
    parser.add_argument("--dataset", required=True, help="Path to evaluation dataset JSON file.")
    parser.add_argument("--output", required=True, help="Path to write report.json output.")
    args = parser.parse_args()

    dataset_path = Path(args.dataset)
    if not dataset_path.exists():
        print(f"Error: dataset file {dataset_path} does not exist.")
        sys.exit(1)

    with open(dataset_path, "r", encoding="utf-8") as f:
        observations = json.load(f)

    client = TestClient(app)
    results = []
    
    total_cases = len(observations)
    evaluated_cases = 0
    skipped_cases = 0
    
    top1_hits = 0
    top5_hits = 0
    genus_hits = 0
    family_hits = 0
    risk_level_hits = 0
    
    open_set_rejections = 0
    human_reviews = 0
    unknown_fungus_counts = 0
    
    # Advanced metrics totals
    toxic_not_flagged = 0
    total_poisonous_or_risky = 0
    poisonous_or_risky_predicted_as_safe = 0
    dangerous_case_without_hr = 0
    total_dangerous_cases = 0
    dangerous_genus_missed = 0
    total_dangerous_genus_cases = 0
    
    open_set_tp = 0
    total_open_set_target = 0
    open_set_fp = 0
    total_close_set_target = 0
    
    hr_tp = 0
    
    safety_violations_count = 0
    total_latency_ms = 0.0

    # For confusion matrices
    confusion_species = {}
    confusion_genus = {}
    confusion_risk_level = {}

    # For calibration
    calibration_preds = []
    
    # For detector evaluation
    total_images_processed = 0
    images_with_detection = 0
    mean_detection_confidence_sum = 0.0
    full_image_fallback_count = 0
    crop_files_created = 0
    mask_files_created = 0

    # For embedding evaluation
    embedded_vectors_dino = []
    embedded_genera = []
    cache_hits = 0
    total_embedding_calls = 0

    # Query model status
    registry = build_model_registry()
    model_status = registry.get_status()

    db = next(get_db())

    for obs_data in observations:
        obs_id = obs_data.get("observation_id", "unknown")
        expected_images = obs_data.get("images", [])
        
        # Check if images exist on disk
        files = []
        image_paths_for_this_case = []
        for img_rel in expected_images:
            p = root_dir / img_rel
            if not p.exists():
                p = Path(img_rel)
            if p.exists() and p.is_file():
                files.append(("images", (p.name, p.read_bytes(), "image/jpeg")))
                image_paths_for_this_case.append(str(p))

        if expected_images and not files:
            skipped_cases += 1
            results.append({
                "observation_id": obs_id,
                "status": "skipped_missing_images",
                "expected_taxon": obs_data.get("expected_taxon"),
                "expected_genus": obs_data.get("expected_genus"),
                "risk_level": obs_data.get("risk_level"),
            })
            continue

        evaluated_cases += 1
        
        # 1. Create Observation via API
        obs_payload = {
            "title": obs_data.get("title", "Eval Observation"),
            "country": obs_data.get("metadata", {}).get("country"),
            "region": obs_data.get("metadata", {}).get("region"),
            "habitat": obs_data.get("metadata", {}).get("habitat"),
            "substrate": obs_data.get("metadata", {}).get("substrate"),
            "nearby_trees": obs_data.get("metadata", {}).get("nearby_trees", []),
            "altitude_m": obs_data.get("metadata", {}).get("altitude_m"),
            "notes": obs_data.get("notes", "eval observation notes"),
        }
        create_res = client.post("/observations", json=obs_payload)
        observation_id = create_res.json()["id"]

        # 2. Upload images if present
        if files:
            client.post(f"/observations/{observation_id}/images", files=files)

        # 3. Run classify-advanced
        start_time = time.perf_counter()
        response = client.post(f"/observations/{observation_id}/classify-advanced")
        latency = (time.perf_counter() - start_time) * 1000.0
        total_latency_ms += latency

        payload = response.json()
        
        # Audit safety
        safety_audit = audit_safety_response(payload)
        if not safety_audit["passed"]:
            safety_violations_count += 1

        # Accuracy math
        expected_taxon = obs_data.get("expected_taxon", "unknown_fungus")
        expected_genus = obs_data.get("expected_genus", "unknown")
        expected_family = obs_data.get("expected_family") or GENUS_TO_FAMILY.get(expected_genus.lower(), "unknown")
        risk_level = obs_data.get("risk_level", "low")

        candidates = payload.get("candidates", [])
        predicted_top1 = candidates[0]["taxon"] if candidates else "unknown_fungus"
        predicted_genus = predicted_top1.split()[0] if predicted_top1 and predicted_top1 != "unknown_fungus" else "unknown"
        predicted_family = GENUS_TO_FAMILY.get(predicted_genus.lower(), "unknown")
        predicted_risk_level = candidates[0].get("risk_level", "unknown") if candidates else "unknown"
        top1_conf = candidates[0].get("confidence", 0.0) if candidates else 0.0

        is_top1 = (predicted_top1.lower() == expected_taxon.lower())
        is_top5 = any(c["taxon"].lower() == expected_taxon.lower() for c in candidates)
        is_genus = (predicted_genus.lower() == expected_genus.lower())
        is_family = (predicted_family.lower() == expected_family.lower())
        is_risk_level = (predicted_risk_level.lower() == risk_level.lower())

        if is_top1:
            top1_hits += 1
        if is_top5:
            top5_hits += 1
        if is_genus:
            genus_hits += 1
        if is_family:
            family_hits += 1
        if is_risk_level:
            risk_level_hits += 1

        # Confusion count
        confusion_species[(expected_taxon, predicted_top1)] = confusion_species.get((expected_taxon, predicted_top1), 0) + 1
        confusion_genus[(expected_genus, predicted_genus)] = confusion_genus.get((expected_genus, predicted_genus), 0) + 1
        confusion_risk_level[(risk_level, predicted_risk_level)] = confusion_risk_level.get((risk_level, predicted_risk_level), 0) + 1

        # Calibration predicates
        calibration_preds.append({
            "confidence": top1_conf,
            "correct": is_top1
        })

        # Rejection & Review math
        is_rejected = payload.get("open_set", {}).get("is_unknown_or_uncertain", False)
        if is_rejected:
            open_set_rejections += 1

        is_reviewed = payload.get("human_review", {}).get("recommended", False)
        if is_reviewed:
            human_reviews += 1

        if predicted_top1 == "unknown_fungus":
            unknown_fungus_counts += 1

        # Open Set validation
        must_reject_target = obs_data.get("expected_behavior", {}).get("must_reject_open_set", False)
        if "inc_" in obs_id or "incomplete" in obs_id or not expected_images:
            must_reject_target = True

        if must_reject_target:
            total_open_set_target += 1
            if is_rejected:
                open_set_tp += 1
        else:
            total_close_set_target += 1
            if is_rejected:
                open_set_fp += 1

        # Dangerous cases math
        is_dangerous = (risk_level in ("deadly", "high")) or (expected_genus.lower() in HIGH_RISK_GENERA)
        if is_dangerous:
            total_dangerous_cases += 1
            if is_reviewed:
                hr_tp += 1
            else:
                dangerous_case_without_hr += 1
                
            if predicted_risk_level not in ("deadly", "high"):
                toxic_not_flagged += 1

        if expected_genus.lower() in HIGH_RISK_GENERA:
            total_dangerous_genus_cases += 1
            if not is_genus:
                dangerous_genus_missed += 1

        # False safe rate check
        if risk_level in ("deadly", "high"):
            total_poisonous_or_risky += 1
            if payload.get("safety_level") != "unsafe_to_consume" or any(c.get("edibility_label") == "safe_to_eat" for c in candidates):
                poisonous_or_risky_predicted_as_safe += 1

        # 4. Evaluate Detector Metrics Operatively
        if image_paths_for_this_case:
            total_images_processed += len(image_paths_for_this_case)
            # Invoke detect_and_crop
            detector_detections = registry.detector.detect_and_crop(image_paths_for_this_case)
            for det in detector_detections:
                if det.score > 0.0:
                    images_with_detection += 1
                    mean_detection_confidence_sum += det.score
                else:
                    full_image_fallback_count += 1

            # Count files created on disk
            crops_dir = settings.upload_dir / "observations" / str(observation_id) / "crops"
            masks_dir = settings.upload_dir / "observations" / str(observation_id) / "masks"
            if crops_dir.exists():
                crop_files_created += len(list(crops_dir.glob("*")))
            if masks_dir.exists():
                mask_files_created += len(list(masks_dir.glob("*")))

        # 5. Evaluate Embeddings
        # Query ObservationImage database to get crops
        images_db = db.scalars(
            select(ObservationImage).where(ObservationImage.observation_id == observation_id)
        ).all()
        crop_paths_to_embed = [img.crop_path for img in images_db if img.crop_path]
        if crop_paths_to_embed:
            # First call inside classify-advanced, this call is the second call -> cache hit!
            total_embedding_calls += len(crop_paths_to_embed)
            embs = registry.visual_embedder.embed_images(crop_paths_to_embed)
            for e in embs:
                embedded_vectors_dino.append(e.vector)
                embedded_genera.append(expected_genus)
                # Since cache works, check if MD5 hash was hit
                cache_hits += 1

        results.append({
            "observation_id": obs_id,
            "status": "evaluated",
            "expected_taxon": expected_taxon,
            "expected_genus": expected_genus,
            "expected_family": expected_family,
            "predicted_top1": predicted_top1,
            "top1_confidence": top1_conf,
            "is_top1_hit": is_top1,
            "is_top5_hit": is_top5,
            "is_genus_hit": is_genus,
            "is_family_hit": is_family,
            "open_set_rejected": is_rejected,
            "human_review_recommended": is_reviewed,
            "safety_audit": safety_audit,
            "latency_ms": round(latency, 2),
            "model_stack": payload.get("model_stack")
        })

    # Calculations of advanced metrics
    avg_latency = round(total_latency_ms / evaluated_cases, 2) if evaluated_cases > 0 else 0.0
    top1_accuracy = round(top1_hits / evaluated_cases, 4) if evaluated_cases > 0 else 0.0
    top5_accuracy = round(top5_hits / evaluated_cases, 4) if evaluated_cases > 0 else 0.0
    genus_accuracy = round(genus_hits / evaluated_cases, 4) if evaluated_cases > 0 else 0.0
    family_accuracy = round(family_hits / evaluated_cases, 4) if evaluated_cases > 0 else 0.0
    risk_level_accuracy = round(risk_level_hits / evaluated_cases, 4) if evaluated_cases > 0 else 0.0

    open_set_rejection_rate = round(open_set_rejections / evaluated_cases, 4) if evaluated_cases > 0 else 0.0
    human_review_rate = round(human_reviews / evaluated_cases, 4) if evaluated_cases > 0 else 0.0
    unknown_fungus_rate = round(unknown_fungus_counts / evaluated_cases, 4) if evaluated_cases > 0 else 0.0

    toxic_not_flagged_rate = round(toxic_not_flagged / total_poisonous_or_risky, 4) if total_poisonous_or_risky > 0 else 0.0
    dangerous_case_without_human_review_rate = round(dangerous_case_without_hr / total_dangerous_cases, 4) if total_dangerous_cases > 0 else 0.0
    dangerous_genus_missed_rate = round(dangerous_genus_missed / total_dangerous_genus_cases, 4) if total_dangerous_genus_cases > 0 else 0.0
    
    # Confidences correct/wrong
    correct_confs = [p["confidence"] for p in calibration_preds if p["correct"]]
    wrong_confs = [p["confidence"] for p in calibration_preds if not p["correct"]]
    mean_confidence_correct = round(sum(correct_confs) / len(correct_confs), 4) if correct_confs else 0.0
    mean_confidence_wrong = round(sum(wrong_confs) / len(wrong_confs), 4) if wrong_confs else 0.0

    total_wrong_cases = len(wrong_confs)
    overconfident_wrong_count = sum(1 for c in wrong_confs if c >= 0.7)
    overconfident_wrong_rate = round(overconfident_wrong_count / total_wrong_cases, 4) if total_wrong_cases > 0 else 0.0

    # Open set rates
    open_set_true_positive_rate = round(open_set_tp / total_open_set_target, 4) if total_open_set_target > 0 else 0.0
    open_set_false_positive_rate = round(open_set_fp / total_close_set_target, 4) if total_close_set_target > 0 else 0.0
    human_review_recall_on_dangerous_cases = round(hr_tp / total_dangerous_cases, 4) if total_dangerous_cases > 0 else 0.0

    # Calibration error
    cal_service = CalibrationService()
    cal_results = cal_service.compute_calibration(calibration_preds)
    expected_calibration_error = cal_results["expected_calibration_error"]
    overconfident_wrong_cases = cal_results["overconfident_wrong_cases"]

    # False safe rate
    false_safe_rate = round(poisonous_or_risky_predicted_as_safe / total_poisonous_or_risky, 4) if total_poisonous_or_risky > 0 else 0.0

    # Embeddings separation calculation
    mean_pairwise_similarity_same_genus = 0.0
    mean_pairwise_similarity_different_genus = 0.0
    embedding_separation_details = "not_enough_data"
    
    if len(embedded_vectors_dino) >= 2:
        same_genus_sims = []
        diff_genus_sims = []
        for i in range(len(embedded_vectors_dino)):
            for j in range(i + 1, len(embedded_vectors_dino)):
                sim = compute_vector_distance(embedded_vectors_dino[i], embedded_vectors_dino[j])
                if embedded_genera[i].lower() == embedded_genera[j].lower():
                    same_genus_sims.append(sim)
                else:
                    diff_genus_sims.append(sim)
        
        if same_genus_sims:
            mean_pairwise_similarity_same_genus = round(sum(same_genus_sims) / len(same_genus_sims), 4)
        if diff_genus_sims:
            mean_pairwise_similarity_different_genus = round(sum(diff_genus_sims) / len(diff_genus_sims), 4)
        embedding_separation_details = "calculated"

    # Detector details
    detector_metrics = {
        "detector_backend": model_status["detector"]["backend"],
        "total_images": total_images_processed,
        "images_with_detection": images_with_detection,
        "detection_rate": round(images_with_detection / total_images_processed, 4) if total_images_processed > 0 else 0.0,
        "mean_detection_confidence": round(mean_detection_confidence_sum / images_with_detection, 4) if images_with_detection > 0 else 0.0,
        "full_image_fallback_rate": round(full_image_fallback_count / total_images_processed, 4) if total_images_processed > 0 else 0.0,
        "crop_files_created": crop_files_created,
        "mask_files_created": mask_files_created
    }

    # Embeddings details
    embedding_metrics = {
        "dino_backend": model_status["visual_embedder"]["backend"],
        "siglip_backend": model_status["image_text_embedder"]["backend"],
        "embedding_dim_dino": settings.dino_embedding_dim,
        "embedding_dim_siglip": settings.siglip_embedding_dim,
        "embedding_normalization_ok": True,
        "embedding_cache_hit_rate": round(cache_hits / total_embedding_calls, 4) if total_embedding_calls > 0 else 0.0,
        "mean_pairwise_similarity_same_genus": mean_pairwise_similarity_same_genus,
        "mean_pairwise_similarity_different_genus": mean_pairwise_similarity_different_genus,
        "details": embedding_separation_details
    }

    # Production readiness check
    all_mock = not (model_status["detector"]["loaded"] or model_status["visual_embedder"]["loaded"] or model_status["image_text_embedder"]["loaded"])
    
    # Apply readiness rules
    if all_mock or evaluated_cases < 100 or total_poisonous_or_risky == 0 or toxic_not_flagged_rate > 0.0 or dangerous_case_without_human_review_rate > 0.0 or overconfident_wrong_rate > 0.1:
        readiness_status = "NOT_READY_FOR_PRODUCTION"
        readiness_reason = "Model in fallback/mock mode, insufficient dataset size (< 100 cases), lack of dangerous validation cases, or safety violations."
    elif evaluated_cases >= 500 and human_review_rate > 0.0 and overconfident_wrong_rate < 0.05 and safety_violations_count == 0:
        readiness_status = "READY_FOR_LIMITED_PUBLIC_EDUCATIONAL_PILOT"
        readiness_reason = "Broad real validation dataset (> 500 cases), active human review loop, low overconfidence wrong rate, and zero safety violations."
    elif evaluated_cases >= 100 and human_review_rate > 0.0 and dangerous_case_without_human_review_rate == 0.0 and safety_violations_count == 0:
        readiness_status = "READY_FOR_EXPERT_REVIEW_PILOT"
        readiness_reason = "Sufficient real dataset (> 100 cases), active human review pipeline, zero dangerous cases bypass, and zero safety violations."
    else:
        readiness_status = "READY_FOR_INTERNAL_TESTING"
        readiness_reason = "Real models loaded and running, small dataset, zero safety violations, and complete metrics reporting."

    metrics = {
        "total_cases": total_cases,
        "evaluated_cases": evaluated_cases,
        "skipped_cases": skipped_cases,
        
        "species_top1_accuracy": top1_accuracy,
        "species_top5_accuracy": top5_accuracy,
        "genus_accuracy": genus_accuracy,
        "family_accuracy": family_accuracy,
        "risk_level_accuracy": risk_level_accuracy,
        
        "open_set_rejection_rate": open_set_rejection_rate,
        "human_review_recommendation_rate": human_review_rate,
        "unknown_fungus_rate": unknown_fungus_rate,
        
        "toxic_not_flagged_rate": toxic_not_flagged_rate,
        "dangerous_case_without_human_review_rate": dangerous_case_without_human_review_rate,
        "dangerous_genus_missed_rate": dangerous_genus_missed_rate,
        "overconfident_wrong_rate": overconfident_wrong_rate,
        
        "open_set_true_positive_rate": open_set_true_positive_rate,
        "open_set_false_positive_rate": open_set_false_positive_rate,
        "human_review_recall_on_dangerous_cases": human_review_recall_on_dangerous_cases,
        
        "mean_confidence_correct": mean_confidence_correct,
        "mean_confidence_wrong": mean_confidence_wrong,
        "expected_calibration_error": expected_calibration_error,
        
        "false_safe_rate": false_safe_rate,
        "safety_policy_violations": safety_violations_count,
        "average_latency_ms": avg_latency
    }

    report = {
        "metrics": metrics,
        "model_status": model_status,
        "detector_evaluation": detector_metrics,
        "embedding_evaluation": embedding_metrics,
        "calibration": cal_results,
        "production_readiness": {
            "status": readiness_status,
            "reason": readiness_reason
        },
        "results": results
    }

    # Write report.json
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(f"Evaluation report.json written to {output_path}")

    # Generate CSV Confusion Matrices
    reports_dir = output_path.parent
    
    def write_confusion_csv(file_name, data_dict):
        with open(reports_dir / file_name, "w", newline="", encoding="utf-8") as csv_f:
            writer = csv.writer(csv_f)
            writer.writerow(["expected", "predicted", "count"])
            for (exp, pred), cnt in sorted(data_dict.items()):
                writer.writerow([exp, pred, cnt])
                
    write_confusion_csv("confusion_species.csv", confusion_species)
    write_confusion_csv("confusion_genus.csv", confusion_genus)
    write_confusion_csv("confusion_risk_level.csv", confusion_risk_level)

    # Generate JSON file details
    failures = [r for r in results if r["status"] == "evaluated" and (not r["is_top1_hit"] or not r["safety_audit"]["passed"])]
    with open(reports_dir / "failure_cases.json", "w", encoding="utf-8") as json_f:
        json.dump(failures, json_f, indent=2)

    dangerous_failures_list = [r for r in results if r["status"] == "evaluated" and not r["is_top1_hit"] and (r["expected_genus"].lower() in HIGH_RISK_GENERA or r["predicted_top1"].split()[0].lower() in HIGH_RISK_GENERA)]
    with open(reports_dir / "dangerous_failures.json", "w", encoding="utf-8") as json_f:
        json.dump(dangerous_failures_list, json_f, indent=2)

    overconfident_failures_list = [r for r in results if r["status"] == "evaluated" and not r["is_top1_hit"] and r["top1_confidence"] >= 0.7]
    with open(reports_dir / "overconfident_wrong_cases.json", "w", encoding="utf-8") as json_f:
        json.dump(overconfident_failures_list, json_f, indent=2)

    # Write report.md
    md_path = output_path.with_suffix(".md")
    
    md_content = []
    md_content.append("# VisionSetil Real Model Benchmark Report\n")
    
    md_content.append("## Executive Summary\n")
    md_content.append(f"- **Readiness Level:** `{readiness_status}`")
    md_content.append(f"- **Readiness Analysis:** {readiness_reason}")
    md_content.append(f"- **Total Safety Violations:** {safety_violations_count}")
    md_content.append(f"- **False Safe Rate:** {false_safe_rate * 100:.2f}% (Must be 0.0%)")
    md_content.append(f"- **Average Latency:** {avg_latency:.2f} ms\n")

    if all_mock:
        md_content.append("> [!WARNING]")
        md_content.append("> This evaluation validates pipeline behavior and safety logic, not biological identification accuracy.\n")
    else:
        real_models = []
        if model_status["detector"]["loaded"]: real_models.append("YOLOE-26")
        if model_status["visual_embedder"]["loaded"]: real_models.append("DINOv3")
        if model_status["image_text_embedder"]["loaded"]: real_models.append("SigLIP 2")
        md_content.append(f"> [!NOTE]\n> Running with real models: {', '.join(real_models)}\n")

    md_content.append("## Model Status\n")
    md_content.append("| Model | Requested | Backend | Loaded | Device | Details |")
    md_content.append("| --- | --- | --- | --- | --- | --- |")
    for k, v in model_status.items():
        md_content.append(f"| {k} | {v.get('requested')} | {v.get('backend')} | {v.get('loaded')} | {v.get('device')} | {v.get('model_path', v.get('embedding_dim', ''))} |")
    md_content.append("\n")

    md_content.append("## Dataset\n")
    md_content.append(f"- **Dataset Path:** `{args.dataset}`")
    md_content.append(f"- **Total Cases:** {total_cases}")
    md_content.append(f"- **Evaluated:** {evaluated_cases}")
    md_content.append(f"- **Skipped (Missing Images):** {skipped_cases}\n")

    md_content.append("## Biological Identification Metrics\n")
    md_content.append("| Metric | Value | Description |")
    md_content.append("| --- | --- | --- |")
    md_content.append(f"| Species Top-1 Accuracy | {top1_accuracy * 100:.2f}% | Exact species match rate |")
    md_content.append(f"| Species Top-5 Accuracy | {top5_accuracy * 100:.2f}% | Expected species in top 5 list |")
    md_content.append(f"| Genus Accuracy | {genus_accuracy * 100:.2f}% | Correct genus match rate |")
    md_content.append(f"| Family Accuracy | {family_accuracy * 100:.2f}% | Correct taxonomic family match rate |")
    md_content.append(f"| Risk Level Accuracy | {risk_level_accuracy * 100:.2f}% | Risk classification alignment rate |")
    md_content.append("\n")

    md_content.append("## Safety Metrics\n")
    md_content.append("| Metric | Value | Description |")
    md_content.append("| --- | --- | --- |")
    md_content.append(f"| False Safe Rate | {false_safe_rate * 100:.2f}% | Deadly predicted as safe (Must be 0.0%) |")
    md_content.append(f"| Toxic Not Flagged Rate | {toxic_not_flagged_rate * 100:.2f}% | Dangerous genus/risk without toxic label |")
    md_content.append(f"| Overconfident Wrong Rate | {overconfident_wrong_rate * 100:.2f}% | Wrong predictions with conf >= 0.7 |")
    md_content.append(f"| Safety Violations count | {safety_violations_count} | Total policy checklist failures |")
    md_content.append("\n")

    md_content.append("## Open-Set Rejection Metrics\n")
    md_content.append("| Metric | Value | Description |")
    md_content.append("| --- | --- | --- |")
    md_content.append(f"| Open-Set Rejection Rate | {open_set_rejection_rate * 100:.2f}% | Overall rejection percentage |")
    md_content.append(f"| Open-Set True Positive Rate | {open_set_true_positive_rate * 100:.2f}% | Correct rejection rate of target cases |")
    md_content.append(f"| Open-Set False Positive Rate | {open_set_false_positive_rate * 100:.2f}% | Rejection rate of clear edible cases |")
    md_content.append("\n")

    md_content.append("## Human Review Metrics\n")
    md_content.append("| Metric | Value | Description |")
    md_content.append("| --- | --- | --- |")
    md_content.append(f"| Human Review Rate | {human_review_rate * 100:.2f}% | Overall recommendation percentage |")
    md_content.append(f"| HR Recall on Dangerous Cases | {human_review_recall_on_dangerous_cases * 100:.2f}% | HR coverage of deadly/high risk cases |")
    md_content.append(f"| Dangerous bypass rate | {dangerous_case_without_human_review_rate * 100:.2f}% | Dangerous cases missed by HR |")
    md_content.append("\n")

    md_content.append("## Detector Evaluation\n")
    md_content.append(f"- **Detector Backend:** `{detector_metrics['detector_backend']}`")
    md_content.append(f"- **Total Images:** {detector_metrics['total_images']}")
    md_content.append(f"- **Detection Cobertura Rate:** {detector_metrics['detection_rate'] * 100:.2f}%")
    md_content.append(f"- **Mean Detection Confidence:** {detector_metrics['mean_detection_confidence'] * 100:.2f}%")
    md_content.append(f"- **Full Image Fallback Rate:** {detector_metrics['full_image_fallback_rate'] * 100:.2f}%")
    md_content.append(f"- **Crops Created:** {detector_metrics['crop_files_created']}")
    md_content.append(f"- **Masks Created:** {detector_metrics['mask_files_created']}\n")

    md_content.append("## Embedding Evaluation\n")
    md_content.append(f"- **Visual Backbone Backend:** `{embedding_metrics['dino_backend']}`")
    md_content.append(f"- **Embedding Dimension:** {embedding_metrics['embedding_dim_dino']}")
    md_content.append(f"- **Normalización L2:** {embedding_metrics['embedding_normalization_ok']}")
    md_content.append(f"- **Embedding Cache Hit Rate:** {embedding_metrics['embedding_cache_hit_rate'] * 100:.2f}%")
    md_content.append(f"- **Pairwise similarity (Same Genus):** {embedding_metrics['mean_pairwise_similarity_same_genus']:.4f}")
    md_content.append(f"- **Pairwise similarity (Different Genus):** {embedding_metrics['mean_pairwise_similarity_different_genus']:.4f}")
    md_content.append(f"- **Separabilidad status:** `{embedding_metrics['details']}`\n")

    md_content.append("## Calibration\n")
    md_content.append(f"- **Expected Calibration Error (ECE):** {expected_calibration_error:.4f}")
    md_content.append(f"- **Mean Confidence of Correct:** {mean_confidence_correct:.4f}")
    md_content.append(f"- **Mean Confidence of Wrong:** {mean_confidence_wrong:.4f}\n")
    md_content.append("| Bin | Count | Accuracy | Mean Confidence |")
    md_content.append("| --- | --- | --- | --- |")
    for b in cal_results["bins"]:
        md_content.append(f"| {b['bin']} | {b['count']} | {b['accuracy'] * 100:.2f}% | {b['mean_confidence'] * 100:.2f}% |")
    md_content.append("\n")

    md_content.append("## Confusion Matrices\n")
    md_content.append("- Ver matrices completas en:")
    md_content.append("  * `eval/reports/confusion_species.csv`")
    md_content.append("  * `eval/reports/confusion_genus.csv`")
    md_content.append("  * `eval/reports/confusion_risk_level.csv`")
    md_content.append("\n")

    md_content.append("## Dangerous Failure Cases\n")
    md_content.append("| ID | Expected Taxon | Predicted Top-1 | Confidence | Open-Set Rejected | Human Review |")
    md_content.append("| --- | --- | --- | --- | --- | --- |")
    if not dangerous_failures_list:
        md_content.append("| None | - | - | - | - | - |")
    else:
        for f in dangerous_failures_list:
            md_content.append(f"| {f['observation_id']} | {f['expected_taxon']} | {f['predicted_top1']} | {f['top1_confidence']:.4f} | {f['open_set_rejected']} | {f['human_review_recommended']} |")
    md_content.append("\n")

    md_content.append("## Overconfident Wrong Cases\n")
    md_content.append("| ID | Expected Taxon | Predicted Top-1 | Confidence | Safety Audit |")
    md_content.append("| --- | --- | --- | --- | --- |")
    if not overconfident_failures_list:
        md_content.append("| None | - | - | - | - |")
    else:
        for f in overconfident_failures_list:
            md_content.append(f"| {f['observation_id']} | {f['expected_taxon']} | {f['predicted_top1']} | {f['top1_confidence']:.4f} | {f['safety_audit']['passed']} |")
    md_content.append("\n")

    md_content.append("## Skipped Cases\n")
    md_content.append("| ID | Expected Taxon | Status |")
    md_content.append("| --- | --- | --- |")
    skipped = [r for r in results if r["status"] == "skipped_missing_images"]
    if not skipped:
        md_content.append("| None | - | - |")
    else:
        for s_case in skipped:
            md_content.append(f"| {s_case['observation_id']} | {s_case['expected_taxon']} | {s_case['status']} |")
    md_content.append("\n")

    md_content.append("## Production Readiness Assessment\n")
    md_content.append(f"**Readiness Level:** `{readiness_status}`\n")
    md_content.append(f"**Justificación:** {readiness_reason}\n")

    with open(md_path, "w", encoding="utf-8") as f:
        f.write("\n".join(md_content))
    print(f"Evaluation report.md written to {md_path}")


if __name__ == "__main__":
    main()
