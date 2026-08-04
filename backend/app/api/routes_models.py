"""Model / ML stack status endpoints for dashboard + ops."""

from __future__ import annotations

from fastapi import APIRouter

from app.core.config import settings
from app.db.schemas import QualityGatePayload
from app.ml.model_registry import get_model_status
from app.ml.training_metrics import describe_training_metrics
from app.ml.weight_discovery import describe_weight_discovery

router = APIRouter(tags=["models"])


@router.get("/models/status")
def models_status() -> dict:
    """Full ML stack status (registry components + multi-view + discovery)."""
    status = get_model_status()
    repo_root = getattr(settings, "repo_root", None) or settings.base_dir.parent
    status["weight_discovery"] = describe_weight_discovery(
        configured=settings.multi_view_weights_path,
        repo_root=repo_root,
    )
    training = describe_training_metrics(repo_root=repo_root)
    status["training_metrics"] = training
    status["config"] = {
        "model_device": settings.model_device,
        "model_fallback_to_mock": settings.model_fallback_to_mock,
        "multi_view_weights_path": str(settings.multi_view_weights_path),
        "open_set_threshold": settings.model_open_set_threshold,
        "repo_root": str(repo_root),
        "base_dir": str(settings.base_dir),
    }
    # Aggregate honesty summary for the dashboard
    mv = status.get("multi_view_classifier") or {}
    any_real = False
    for key in ("detector", "visual_embedder", "image_text_embedder"):
        comp = status.get(key) or {}
        if isinstance(comp, dict) and comp.get("loaded"):
            any_real = True
    if isinstance(mv, dict) and mv.get("loaded"):
        any_real = True
    primary_m = (training.get("primary") or {}).get("metrics") or {}
    # Fail-closed product_unlock surface for ops dashboard (never True from metrics alone).
    # SSOT with operator package: evaluate_e20_local_artifacts (E20 metrics path +
    # pro_tester / safe_dp signals) — not training "primary" discovery alone.
    OPERATOR_METRICS_SSOT = "kaggle/kernel_output_v20/models/metrics.json"
    unlock_eval: dict = {
        "product_unlock": False,
        "unlock_eligible_advisory": False,
        "eligible_but_locked": False,
        "can_auto_unlock": False,
        "forage_permission": False,
        "consumption_permission": False,
        "policy": "orientation_only_never_consume",
        "residual_lock_reasons": [
            "policy_orientation_only_never_consume",
            "no_auto_unlock_from_metrics_alone",
        ],
    }
    try:
        import sys
        from pathlib import Path as _Path

        _repo = _Path(repo_root).resolve()
        if str(_repo) not in sys.path:
            sys.path.insert(0, str(_repo))
        from kaggle.ml_qa.gate_eval import evaluate_e20_local_artifacts

        unlock_eval = evaluate_e20_local_artifacts(_repo)
        # Metrics package is fail-closed; operator serve flag applied below.
        unlock_eval["can_auto_unlock"] = False
        unlock_eval["forage_permission"] = False
        unlock_eval["consumption_permission"] = False
    except Exception:  # noqa: BLE001 — status must never 500
        unlock_eval = {
            "product_unlock": False,
            "can_auto_unlock": False,
            "unlock_eligible_advisory": False,
            "eligible_but_locked": False,
            "forage_permission": False,
            "consumption_permission": False,
            "policy": "orientation_only_never_consume",
            "reasons": ["unlock_eval_unavailable"],
            "residual_lock_reasons": [
                "policy_orientation_only_never_consume",
                "no_auto_unlock_from_metrics_alone",
                "unlock_eval_unavailable",
            ],
            "operator_action": "unlock_eval_unavailable_fix_then_re_run",
            "operator_cycle_required": True,
            "checks": {},
            "checklist": [],
            "metrics_path": OPERATOR_METRICS_SSOT,
        }
    # Human operator serve flag (PRODUCT_UNLOCK) — never metrics-auto
    from app.core.product_unlock import apply_operator_serve_unlock

    unlock_eval = apply_operator_serve_unlock(unlock_eval)
    serve_unlocked = bool(unlock_eval.get("product_unlock"))
    open_set_summary: dict = {"product_unlock": False}
    try:
        from app.services.species_catalog import describe_active_open_set_thresholds

        open_set_summary = describe_active_open_set_thresholds()
    except Exception:  # noqa: BLE001
        open_set_summary = {"status": "unavailable", "product_unlock": False}
    # Prefer multi_view open_set block when already populated
    if isinstance(mv, dict) and isinstance(mv.get("open_set"), dict):
        open_set_summary = {**open_set_summary, **mv["open_set"], "product_unlock": False}

    status["summary"] = {
        "any_real_backend": any_real,
        "multi_view_loaded": bool(isinstance(mv, dict) and mv.get("loaded")),
        "multi_view_backend": mv.get("backend") if isinstance(mv, dict) else "unknown",
        "honesty": mv.get("honesty") if isinstance(mv, dict) else "unknown",
        "weights_discovered": bool(isinstance(mv, dict) and mv.get("weights_discovered")),
        "training_map_at_3": primary_m.get("test_map_at_3"),
        "training_num_classes": primary_m.get("num_classes"),
        "training_honesty": training.get("honesty"),
        "training_primary_run": (training.get("primary") or {}).get("run"),
        # Serve product_unlock (operator PRODUCT_UNLOCK only) vs advisory eligibility
        "product_unlock": serve_unlocked,
        "unlock_eligible_advisory": bool(unlock_eval.get("unlock_eligible_advisory")),
        "eligible_but_locked": bool(unlock_eval.get("eligible_but_locked")),
        # Absolute policy stamps — never true from metrics
        "forage_permission": False,
        "consumption_permission": False,
        "can_auto_unlock": False,
        "soft_gates_advisory_only": True,
        "metrics_authorize_forage": False,
        "operator_action": unlock_eval.get("operator_action"),
        "residual_lock_reasons": list(unlock_eval.get("residual_lock_reasons") or []),
        "serve_flag_requested": bool(unlock_eval.get("serve_flag_requested")),
        "open_set_status": open_set_summary.get("status"),
        "open_set_conf_thr": open_set_summary.get("active_conf_thr"),
        "open_set_margin_thr": open_set_summary.get("active_margin_thr"),
        "open_set_entropy_thr": open_set_summary.get("active_entropy_thr"),
        "open_set_holdout_reject_rate": open_set_summary.get("holdout_reject_rate"),
        "lookalike_mate_in_topk_rate": open_set_summary.get("lookalike_mate_in_topk_rate"),
    }
    status["open_set"] = open_set_summary
    # product_unlock_eval already merged via apply_operator_serve_unlock
    if isinstance(unlock_eval, dict):
        unlock_eval["can_auto_unlock"] = False
        unlock_eval["forage_permission"] = False
        unlock_eval["consumption_permission"] = False
        unlock_eval["soft_gates_advisory_only"] = True
        unlock_eval["metrics_authorize_forage"] = False
        unlock_eval.setdefault("policy", "orientation_only_never_consume")
    status["product_unlock_eval"] = unlock_eval
    # Static operator runbook pointers (docs + regenerate; never auto-unlock from metrics)
    status["operator_unlock_ops"] = {
        "product_unlock": serve_unlocked,
        "can_auto_unlock": False,
        "forage_permission": False,
        "consumption_permission": False,
        "soft_gates_advisory_only": True,
        "metrics_authorize_forage": False,
        "policy": "orientation_only_never_consume",
        "serve_flag_env": "PRODUCT_UNLOCK",
        "serve_flag_requested": bool(getattr(settings, "product_unlock", False)),
        "operator_runbook_path": "docs/OPERATOR_UNLOCK_RUNBOOK.md",
        "approval_log_path": "docs/OPERATOR_UNLOCK_APPROVAL.md",
        "checklist_json_path": "eval/reports/ml_experiments/operator_unlock_checklist.json",
        "checklist_md_path": "eval/reports/ml_experiments/operator_unlock_checklist.md",
        "regenerate_command": "python -m kaggle.ml_qa.gate_eval",
        # SSOT metrics for eligibility (same as gate_eval package / evaluate_e20_local_artifacts)
        "metrics_ssot_path": OPERATOR_METRICS_SSOT,
        "metrics_path_evaluated": unlock_eval.get("metrics_path") or OPERATOR_METRICS_SSOT,
        "metrics_note": (
            "Operator eligibility uses E20 local artifacts path + pro_tester/safe_dp "
            "(evaluate_e20_local_artifacts), not training primary discovery alone. "
            "unlock_eligible_advisory is NOT forage permission; soft MAP/deadly gates "
            "are advisory only and never authorize forage or consumption."
        ),
        "note": (
            "Human operator decision gate only. Metrics → unlock_eligible_advisory "
            "(advisory); PRODUCT_UNLOCK env may set serve product_unlock=true when "
            "eligible; never auto-flip from metrics alone; forage_permission and "
            "consumption_permission always false; soft gates never authorize forage. "
            "PRODUCT_UNLOCK does not launch E21/Kaggle."
        ),
    }
    # Live Identify reject rates from feedback JSONL (ops; empty log OK)
    try:
        import sys
        from pathlib import Path as _Path

        _repo = _Path(repo_root).resolve()
        if str(_repo) not in sys.path:
            sys.path.insert(0, str(_repo))
        from kaggle.ml_qa.live_reject_monitor import summarize_feedback_log

        live = summarize_feedback_log(repo=_repo)
        # Absolute policy on live ops block
        if isinstance(live, dict):
            live["product_unlock"] = False
            live.setdefault("policy", "orientation_only_never_consume")
        status["live_reject_monitor"] = live
        status["summary"]["live_reject_rate"] = live.get("reject_rate")
        status["summary"]["live_reject_n"] = live.get("n_entries")
        status["summary"]["live_reject_status"] = live.get("status")
        status["summary"]["live_reject_rate_7d"] = live.get("reject_rate_7d")
        status["summary"]["live_reject_n_7d"] = live.get("n_entries_7d")
        status["summary"]["live_reject_top_reason"] = live.get("top_reason")
        status["summary"]["live_reject_health_flags"] = list(
            live.get("health_flags") or []
        )
        status["summary"]["live_reject_traffic_depth"] = live.get("traffic_depth")
        status["summary"]["live_reject_n_real"] = live.get("n_real_mode")
        status["summary"]["live_reject_n_mock"] = live.get("n_mock_mode")
    except Exception:  # noqa: BLE001
        status["live_reject_monitor"] = {
            "status": "unavailable",
            "product_unlock": False,
            "policy": "orientation_only_never_consume",
            "health_flags": ["live_reject_unavailable"],
            "windows": {},
        }
    # ECE residual honesty (M2) — advisory only; never unlocks
    try:
        import sys
        from pathlib import Path as _Path

        _repo = _Path(repo_root).resolve()
        if str(_repo) not in sys.path:
            sys.path.insert(0, str(_repo))
        from kaggle.ml_qa.ece_honesty import build_ece_residual_report

        ece_res = build_ece_residual_report()
        if isinstance(ece_res, dict):
            ece_res["product_unlock"] = False
            ece_res["can_auto_unlock"] = False
            ece_res.setdefault("forage_permission", False)
            ece_res.setdefault("consumption_permission", False)
            ece_res.setdefault("policy", "orientation_only_never_consume")
        status["ece_residual"] = ece_res
        status["summary"]["ece"] = ece_res.get("test_ece")
        status["summary"]["ece_band"] = ece_res.get("band")
        status["summary"]["ece_status"] = ece_res.get("status")
    except Exception:  # noqa: BLE001
        status["ece_residual"] = {
            "status": "unavailable",
            "product_unlock": False,
            "can_auto_unlock": False,
            "forage_permission": False,
            "consumption_permission": False,
            "band": "unknown",
            "policy": "orientation_only_never_consume",
        }
        status["summary"]["ece_band"] = "unknown"
    # Optional E21 scale readiness (never launches kernel; never unlocks;
    # PRODUCT_UNLOCK serve flag must NOT flip e21_launched / kaggle_push)
    try:
        import sys
        from pathlib import Path as _Path

        _repo = _Path(repo_root).resolve()
        if str(_repo) not in sys.path:
            sys.path.insert(0, str(_repo))
        from scripts.e21_readiness import evaluate_e21_readiness

        e21 = evaluate_e21_readiness()
        if isinstance(e21, dict):
            e21["product_unlock"] = False
            e21["can_auto_unlock"] = False
            e21["forage_permission"] = False
            e21["consumption_permission"] = False
            e21["e21_launched"] = False
            e21["kaggle_push"] = False
            e21.setdefault("policy", "orientation_only_never_consume")
            # Explicit: serve product_unlock is orthogonal to E21 launch
            e21["serve_product_unlock_does_not_launch_e21"] = True
        status["e21_readiness"] = e21
        status["summary"]["e21_ready"] = bool(e21.get("ready_for_e21_schedule"))
        status["summary"]["e21_launched"] = False
        status["summary"]["e21_kaggle_push"] = False
        status["summary"]["e21_status"] = e21.get("status")
        status["summary"]["e21_operator_approved"] = bool(
            e21.get("operator_schedule_approved")
        )
    except Exception:  # noqa: BLE001
        status["e21_readiness"] = {
            "status": "unavailable",
            "product_unlock": False,
            "can_auto_unlock": False,
            "forage_permission": False,
            "consumption_permission": False,
            "e21_launched": False,
            "kaggle_push": False,
            "ready_for_e21_schedule": False,
            "operator_schedule_approved": False,
            "serve_product_unlock_does_not_launch_e21": True,
            "policy": "orientation_only_never_consume",
            "plan_doc": "docs/E21_SCALE_PLAN.md",
        }
        status["summary"]["e21_ready"] = False
        status["summary"]["e21_launched"] = False
        status["summary"]["e21_kaggle_push"] = False
        status["summary"]["e21_operator_approved"] = False

    # Re-assert policy on auxiliary blocks (never unlock from S9/ECE/E21 alone).
    # Serve product_unlock lives only on summary + product_unlock_eval + operator_unlock_ops.
    if isinstance(status.get("product_unlock_eval"), dict):
        status["product_unlock_eval"]["can_auto_unlock"] = False
        status["product_unlock_eval"]["forage_permission"] = False
        status["product_unlock_eval"]["consumption_permission"] = False
        status["product_unlock_eval"]["soft_gates_advisory_only"] = True
        status["product_unlock_eval"]["metrics_authorize_forage"] = False
        status["product_unlock_eval"]["product_unlock"] = serve_unlocked
    if isinstance(status.get("live_reject_monitor"), dict):
        # S9 monitor never grants unlock by itself
        status["live_reject_monitor"]["product_unlock"] = False
        status["live_reject_monitor"]["forage_permission"] = False
        status["live_reject_monitor"]["consumption_permission"] = False
    if isinstance(status.get("ece_residual"), dict):
        status["ece_residual"]["product_unlock"] = False
        status["ece_residual"]["can_auto_unlock"] = False
        status["ece_residual"]["forage_permission"] = False
        status["ece_residual"]["consumption_permission"] = False
    if isinstance(status.get("operator_unlock_ops"), dict):
        status["operator_unlock_ops"]["product_unlock"] = serve_unlocked
        status["operator_unlock_ops"]["can_auto_unlock"] = False
        status["operator_unlock_ops"]["forage_permission"] = False
        status["operator_unlock_ops"]["consumption_permission"] = False
        status["operator_unlock_ops"]["soft_gates_advisory_only"] = True
        status["operator_unlock_ops"]["metrics_authorize_forage"] = False
    if isinstance(status.get("e21_readiness"), dict):
        status["e21_readiness"]["product_unlock"] = False
        status["e21_readiness"]["can_auto_unlock"] = False
        status["e21_readiness"]["forage_permission"] = False
        status["e21_readiness"]["consumption_permission"] = False
        status["e21_readiness"]["e21_launched"] = False
        status["e21_readiness"]["kaggle_push"] = False
        status["e21_readiness"]["serve_product_unlock_does_not_launch_e21"] = True
    status["summary"]["product_unlock"] = serve_unlocked
    status["summary"]["forage_permission"] = False
    status["summary"]["consumption_permission"] = False
    status["summary"]["can_auto_unlock"] = False
    status["summary"]["soft_gates_advisory_only"] = True
    status["summary"]["metrics_authorize_forage"] = False
    status["summary"]["e21_launched"] = False
    status["summary"]["e21_kaggle_push"] = False
    # Multi-view product contracts + four-photo bench + paired inventory
    try:
        from app.ml.multiview_product import describe_multiview_product

        mv_prod = describe_multiview_product(repo_root)
        if isinstance(mv_prod, dict):
            # Multiview honesty block never claims unlock alone
            mv_prod["product_unlock"] = False
        status["multiview_product"] = mv_prod
        fh = (mv_prod or {}).get("field_holdout_m3") if isinstance(mv_prod, dict) else None
        if isinstance(fh, dict):
            status["summary"]["field_holdout_gates_pass"] = fh.get("gates_pass")
            status["summary"]["field_holdout_map3_4_minus_1"] = (
                (fh.get("headline") or {}).get("map3_4_minus_1")
            )
            status["summary"]["field_holdout_deadly_caveat"] = bool(
                fh.get("deadly_multiview_caveat")
            )
            status["summary"]["field_holdout_protocol"] = fh.get("protocol")
        bench = mv_prod.get("benchmark") or {}
        status["summary"]["multiview_map3_1"] = bench.get("map3_1")
        status["summary"]["multiview_map3_4"] = bench.get("map3_4")
        status["summary"]["multiview_torch_ok"] = bench.get("torch_ok")
        inv = mv_prod.get("paired_inventory") or {}
        status["summary"]["paired_loo_ready"] = inv.get("true_leave_one_photo_out")
    except Exception:  # noqa: BLE001
        status["multiview_product"] = {"product_unlock": False, "status": "unavailable"}
    return status



@router.get("/models/discovery")
def models_discovery() -> dict:
    """Lightweight weight discovery only (no heavy model init)."""
    repo_root = getattr(settings, "repo_root", None) or settings.base_dir.parent
    return describe_weight_discovery(
        configured=settings.multi_view_weights_path,
        repo_root=repo_root,
    )


@router.get("/models/training")
def models_training() -> dict:
    """On-disk training metrics + data-source registry (no GPU)."""
    repo_root = getattr(settings, "repo_root", None) or settings.base_dir.parent
    return describe_training_metrics(repo_root=repo_root)


@router.get("/models/data-sources")
def models_data_sources() -> dict:
    """Public registry of training sources (Spain/Soria + ML datasets).

    Also surfaces Index Fungorum nomenclature attribution (names only —
    never edibility; product_unlock false).
    """
    from app.services.index_fungorum import attribution_block

    repo_root = getattr(settings, "repo_root", None) or settings.base_dir.parent
    full = describe_training_metrics(repo_root=repo_root)
    return {
        "docs": full.get("docs"),
        "model_card": "docs/MODEL_CARD.md",
        "index_fungorum_doc": "docs/INDEX_FUNGORUM.md",
        "sources_registry": full.get("sources_registry"),
        "gbif_probe": full.get("gbif_probe_live_file"),
        "primary_metrics_summary": full.get("summary_line"),
        "honesty": full.get("honesty"),
        "nomenclature": {
            **attribution_block(),
            "role": "taxonomic_name_backbone_only",
            "used_for": [
                "scientific_name_resolve",
                "synonym_education",
                "if_record_links",
            ],
            "not_used_for": [
                "edibility",
                "training_image_labels",
                "product_ssot_auto_overwrite",
                "consumption_permission",
            ],
            "product_unlock": False,
            "policy": "nomenclature_only_never_consumption",
        },
        "product_unlock": False,
    }


@router.get("/models/quality-gate", response_model=QualityGatePayload)
def models_quality_gate() -> QualityGatePayload:
    """Dual-signal product quality gate for preflight / dashboard (D-B15).

    Stable ``QualityGatePayload``:
    - ``metrics_acceptable`` — raw MAP@3 / deadly recall vs thresholds (never
      forced by disable)
    - ``species_id_allowed`` — serve policy (respects ``block_enabled``)
    - ``reason_code`` — machine code: no_metrics | map_below | deadly_below |
      gates_passed | gate_disabled
    - ``verdict`` — tracks **metrics only** (ACCEPTABLE/UNACCEPTABLE)

    No GPU / weight load — metrics read is cached. Safe for Identify preflight
    polling.

    B-17 rate limits: this path is **rate-limit exempt** (cheap status). The
    Identify client polls on mount and every **60s** (``PREFLIGHT_POLL_MS``);
    multi-tab traffic must not compete with the general 60/min bucket. Other
    ``/models/*`` routes remain rate-limited.
    """
    from app.ml.quality_gate import quality_gate_payload

    return quality_gate_payload()


@router.get("/models/catalog-join")
def models_catalog_join() -> dict:
    """label2idx ↔ catalog_v2 join coverage for ML dashboard tile (B-43).

    Reads the committed join report from B-39
    (``data/species_catalog/species_index_join_report.json``). Primary field
    ``coverage_pct`` is % of model taxa present in the product catalog
    (allowlist). Incomplete coverage is **informational** (D-B25) — never a
    serve / quality-gate block. No GPU.
    """
    from app.ml.species_index_join import catalog_join_payload

    repo_root = getattr(settings, "repo_root", None) or settings.base_dir.parent
    return catalog_join_payload(repo_root=repo_root)


@router.get("/models/industrial-progress")
def models_industrial_progress() -> dict:
    """Plan-30d industrial_v1 progress JSON (read-only, no GPU)."""
    import json
    from pathlib import Path

    repo_root = Path(getattr(settings, "repo_root", None) or settings.base_dir.parent)
    progress_path = repo_root / "data" / "industrial_v1" / "PROGRESS.json"
    if not progress_path.is_file():
        return {
            "available": False,
            "path": str(progress_path),
            "hint": "Run scripts/build_industrial_dataset.py",
        }
    try:
        data = json.loads(progress_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return {"available": False, "error": str(exc)}
    from app.ml.quality_gate import quality_gate_payload

    data["available"] = True
    # Same dual-signal shape as GET /models/quality-gate
    data["quality_gate_live"] = quality_gate_payload().model_dump()
    data["policy"] = "orientation_only_never_consume"
    return data


@router.get("/models/experiments")
def models_experiments() -> dict:
    """Latest offline experiment battery report (if present on disk)."""
    import json
    from pathlib import Path

    repo_root = Path(getattr(settings, "repo_root", None) or settings.base_dir.parent)
    report_path = (
        repo_root / "eval" / "reports" / "ml_experiments" / "experiment_battery_report.json"
    )
    if not report_path.is_file():
        return {
            "available": False,
            "path": str(report_path),
            "hint": "python eval/scripts/run_ml_experiment_battery.py",
        }
    try:
        data = json.loads(report_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return {"available": False, "error": str(exc), "path": str(report_path)}
    return {
        "available": True,
        "path": str(report_path),
        "generated_at": data.get("generated_at"),
        "executive_summary": data.get("executive_summary"),
        "baseline": (data.get("experiments") or {}).get("baseline"),
        "recommended_gpu_matrix": (data.get("experiments") or {}).get("recommended_gpu_matrix"),
        "calibrated_thresholds": {
            "temperature": getattr(settings, "multiview_temperature_recommended", None),
            "open_set_conf": getattr(settings, "multiview_open_set_conf_thr", None),
            "open_set_margin": getattr(settings, "multiview_open_set_margin_thr", None),
        },
    }
