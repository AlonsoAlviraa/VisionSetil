#!/usr/bin/env python3
"""Refresh ML operator handoff from SSOT metrics + anti-leak rails.

Reads measured E20 metrics only (never invents MAP/deadly/ECE/version).
Writes / refreshes:
  eval/reports/ml_experiments/E20_BASELINE_METRICS_TO_IMPROVE.json  (SSOT numbers)
  eval/reports/ml_experiments/loop_operator_handoff_latest.json
  eval/reports/ml_experiments/loop_operator_handoff_latest.md

Always product_unlock=false, can_auto_unlock=false, forage/consumption=false.
Dual ECE: primary = train-published when provenance is known; posthoc separate.

Exit semantics:
  Default exit 0 (report writer / non-gating). Rails fail-closed gate lives in
  scripts/verify_anti_leak_rails_for_train.py. Use --gate-on-rails to exit 1
  when can_stage_train_notebook is false.

Usage:
  python scripts/loop_ml_operator_handoff.py
  python scripts/loop_ml_operator_handoff.py --models-dir PATH
  python scripts/loop_ml_operator_handoff.py --skip-rails
  python scripts/loop_ml_operator_handoff.py --gate-on-rails
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.verify_anti_leak_rails_for_train import (  # noqa: E402
    OUT_JSON as RAILS_OUT,
    _repo_rel,
    evaluate_anti_leak_rails,
    resolve_models_dir,
    write_report as write_rails_report,
)

POLICY = "orientation_only_never_consume"
REPORT_DIR = ROOT / "eval" / "reports" / "ml_experiments"
SSOT_PATH = REPORT_DIR / "E20_BASELINE_METRICS_TO_IMPROVE.json"
HANDOFF_JSON = REPORT_DIR / "loop_operator_handoff_latest.json"
HANDOFF_MD = REPORT_DIR / "loop_operator_handoff_latest.md"

SOFT_MAP = 0.25
SOFT_DEADLY = 0.90

# Explicit metric flag: when true, bare test_ece is train-published primary
_ECE_TRAIN_PUB_FLAG = "ece_primary_is_train_published"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_json(path: Path) -> Any | None:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _f(v: Any) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _resolve_ece_primary(metrics: dict[str, Any]) -> dict[str, Any]:
    """Dual ECE honesty: only claim train_published with explicit provenance.

    Order:
      1) test_ece_train_published → primary train_published
      2) ece_primary_is_train_published flag + test_ece → train_published
      3) bare test_ece only → primary_value set but label test_ece_unspecified (GAP)
      4) none → primary null
    Posthoc is never used as primary.
    """
    ece_train_pub = _f(metrics.get("test_ece_train_published"))
    ece_raw = _f(metrics.get("test_ece"))
    ece_posthoc = _f(metrics.get("test_ece_posthoc"))
    flagged = bool(metrics.get(_ECE_TRAIN_PUB_FLAG))
    gaps: list[str] = []

    if ece_train_pub is not None:
        primary_value = ece_train_pub
        primary_label = "train_published"
        primary_source = "test_ece_train_published"
        claim_train_published = True
    elif flagged and ece_raw is not None:
        primary_value = ece_raw
        primary_label = "train_published"
        primary_source = "test_ece_flagged_train_published"
        claim_train_published = True
    elif ece_raw is not None:
        primary_value = ece_raw
        primary_label = "test_ece_unspecified"
        primary_source = "test_ece_fallback"
        claim_train_published = False
        gaps.append("ece_primary_provenance_unspecified")
    else:
        primary_value = None
        primary_label = "missing"
        primary_source = None
        claim_train_published = False
        gaps.append("ece_primary_missing")

    return {
        "primary": primary_label,
        "primary_value": primary_value,
        "primary_source": primary_source,
        "claim_train_published": claim_train_published,
        "test_ece": ece_raw,
        "test_ece_train_published": ece_train_pub,
        "posthoc_separate": True,
        "posthoc_value": ece_posthoc,
        "test_ece_posthoc": ece_posthoc,
        "gaps": gaps,
        "note": (
            "Primary ECE is train-published only when test_ece_train_published is set "
            f"or {_ECE_TRAIN_PUB_FLAG}=true. Bare test_ece is not asserted as train-published. "
            "Posthoc temperature search is lab-only and must not replace primary."
        ),
    }


def _measured_block(metrics: dict[str, Any], *, source_path: str) -> dict[str, Any]:
    """Build SSOT payload exclusively from a measured metrics blob (no invented fields)."""
    ece_info = _resolve_ece_primary(metrics)
    temp_train = _f(metrics.get("temperature_train"))
    if temp_train is None:
        # temperature alone is train-published scaler in E20 metrics when temperature_train absent
        temp_train = _f(metrics.get("temperature"))
        temp_train_source = "temperature" if temp_train is not None else None
    else:
        temp_train_source = "temperature_train"

    map3 = _f(metrics.get("test_map_at_3"))
    d1 = _f(metrics.get("safety_recall_deadly_at_1"))
    d3 = _f(metrics.get("safety_recall_deadly_at_3"))
    n_deadly = metrics.get("n_deadly_in_test")
    if n_deadly is None:
        n_deadly = metrics.get("n_deadly")
    if n_deadly is None:
        n_deadly = metrics.get("n_deadly_eval")

    soft_map_pass = map3 is not None and map3 >= SOFT_MAP
    soft_deadly_pass = d3 is not None and d3 >= SOFT_DEADLY
    dual_deadly = d1 is not None and d3 is not None

    version = metrics.get("version")  # no default invent
    eval_protocol = metrics.get("eval_protocol")  # no default invent

    ece_block = {
        "primary": ece_info["primary"],
        "primary_value": ece_info["primary_value"],
        "primary_source": ece_info["primary_source"],
        "claim_train_published": ece_info["claim_train_published"],
        "test_ece": ece_info["test_ece"],
        "test_ece_train_published": ece_info["test_ece_train_published"],
        "posthoc_separate": True,
        "posthoc_value": ece_info["posthoc_value"],
        "test_ece_posthoc": ece_info["test_ece_posthoc"],
        "temperature_train": temp_train,
        "temperature_train_source": temp_train_source,
        "temperature_posthoc": _f(metrics.get("temperature_posthoc")),
        "posthoc_finetune": metrics.get("posthoc_finetune"),
        "note": ece_info["note"],
    }

    return {
        "generated_at": _utc_now(),
        "metrics_label": "[MEASURED]",
        "source_metrics_path": _repo_rel(source_path) or source_path,
        "checkpoint": "kaggle/kernel_output_v20/models",
        "version": version,
        "eval_protocol": eval_protocol,
        "test_domain": metrics.get("test_domain"),
        "train_domain": metrics.get("train_domain"),
        "policy": POLICY,
        "product_unlock": False,
        "can_auto_unlock": False,
        "forage_permission": False,
        "consumption_permission": False,
        "lab_only": True,
        "ssot_field_gaps": list(ece_info["gaps"])
        + (["version_unknown"] if not version else [])
        + (["eval_protocol_unknown"] if not eval_protocol else []),
        "measured": {
            "test_map_at_3": map3,
            "test_map_at_3_ci_low": _f(metrics.get("test_map_at_3_ci_low")),
            "test_map_at_3_ci_high": _f(metrics.get("test_map_at_3_ci_high")),
            "safety_recall_deadly_at_1": d1,
            "safety_recall_deadly_at_3": d3,
            "n_deadly_in_test": n_deadly,
            "test_accuracy": _f(metrics.get("test_accuracy")),
            "test_f1_macro": _f(metrics.get("test_f1_macro")),
            "test_balanced_accuracy": _f(metrics.get("test_balanced_accuracy")),
            "num_classes": metrics.get("num_classes"),
            "num_train_obs": metrics.get("num_train_obs"),
            "num_val_obs": metrics.get("num_val_obs"),
            "num_test_obs": metrics.get("num_test_obs"),
            "primary_checkpoint": metrics.get("primary_checkpoint"),
            "honesty_dual_recompute_at": metrics.get("honesty_dual_recompute_at"),
        },
        "ece": ece_block,
        "soft_gates_advisory": {
            "soft_map_threshold": SOFT_MAP,
            "soft_deadly_at_3_threshold": SOFT_DEADLY,
            "soft_map_pass": soft_map_pass,
            "soft_deadly_at_3_pass": soft_deadly_pass,
            "dual_deadly_keys_present": dual_deadly,
            "note": "Advisory only — never unlock Identify from soft gates alone.",
        },
        "improve_targets": {
            "note": (
                "Targets are directional lab goals, not product unlock criteria. "
                "Do not treat gap closure as forage permission."
            ),
            "ece_primary_high_residual": bool(
                ece_info["primary_value"] is not None and ece_info["primary_value"] >= 0.12
            ),
            "deadly_at_1_room": bool(d1 is not None and d1 < 0.90),
            "map_at_3_room": bool(map3 is not None and map3 < 0.90),
            "lepiota_focus": "E20b Lepiota FT when rails green (operator/lab)",
        },
        "never_hardcode_in_pr_titles": True,
        "citation_rule": (
            "Copy full-precision [MEASURED] values from this JSON SSOT at run time; "
            "do not round in PR titles. MD handoff is display-only — cite JSON."
        ),
    }


def bootstrap_or_refresh_ssot(
    *,
    models_dir: Path | None,
    force_refresh: bool = True,
) -> tuple[dict[str, Any] | None, list[str]]:
    """Load SSOT; optionally refresh from measured metrics.json when available."""
    gaps: list[str] = []
    mdir = resolve_models_dir(models_dir)
    metrics_path = (mdir / "metrics.json") if mdir else None
    metrics = _load_json(metrics_path) if metrics_path else None

    existing = _load_json(SSOT_PATH)
    if isinstance(metrics, dict) and force_refresh:
        ssot = _measured_block(metrics, source_path=str(metrics_path))
        gaps.extend(ssot.get("ssot_field_gaps") or [])
        SSOT_PATH.parent.mkdir(parents=True, exist_ok=True)
        SSOT_PATH.write_text(
            json.dumps(ssot, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        return ssot, gaps

    if isinstance(existing, dict) and existing.get("measured"):
        gaps.extend(existing.get("ssot_field_gaps") or [])
        return existing, gaps

    if isinstance(metrics, dict):
        ssot = _measured_block(metrics, source_path=str(metrics_path))
        gaps.extend(ssot.get("ssot_field_gaps") or [])
        SSOT_PATH.parent.mkdir(parents=True, exist_ok=True)
        SSOT_PATH.write_text(
            json.dumps(ssot, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        return ssot, gaps

    # Last-resort: rehydrate only measured numeric fields from prior reports (no invented version)
    for fallback in (
        HANDOFF_JSON,
        REPORT_DIR / "operator_unlock_checklist.json",
        REPORT_DIR / "e20_ece_residual.json",
        REPORT_DIR / "e20_unlock_eval.json",
    ):
        blob = _load_json(fallback)
        if not isinstance(blob, dict):
            continue
        values = blob.get("values") if isinstance(blob.get("values"), dict) else {}
        honesty = blob.get("honesty") if isinstance(blob.get("honesty"), dict) else {}
        measured_src = blob.get("measured") if isinstance(blob.get("measured"), dict) else {}
        ece_blob = blob.get("ece") if isinstance(blob.get("ece"), dict) else {}

        # Only promote primary_value → train_published when blob claimed it
        train_pub: float | None = None
        if ece_blob.get("claim_train_published") or ece_blob.get("primary") == "train_published":
            train_pub = _f(ece_blob.get("primary_value") or ece_blob.get("test_ece_train_published"))
        if train_pub is None:
            train_pub = _f(measured_src.get("test_ece_train_published") or blob.get("test_ece_train_published"))

        candidate: dict[str, Any] = {
            "test_map_at_3": (
                measured_src.get("test_map_at_3")
                or values.get("test_map_at_3")
                or blob.get("test_map_at_3")
                or honesty.get("map_at_3")
            ),
            "safety_recall_deadly_at_1": (
                measured_src.get("safety_recall_deadly_at_1")
                or values.get("safety_recall_deadly_at_1")
                or honesty.get("deadly_at_1")
            ),
            "safety_recall_deadly_at_3": (
                measured_src.get("safety_recall_deadly_at_3")
                or values.get("safety_recall_deadly_at_3")
                or honesty.get("deadly_at_3")
                or blob.get("safety_recall_deadly_at_3")
            ),
            "n_deadly_in_test": (
                measured_src.get("n_deadly_in_test")
                or values.get("n_deadly_in_test")
                or honesty.get("n_deadly")
            ),
            "test_ece": blob.get("test_ece") or measured_src.get("test_ece") or ece_blob.get("test_ece"),
            "test_ece_posthoc": ece_blob.get("posthoc_value") or ece_blob.get("test_ece_posthoc"),
            "temperature": blob.get("temperature"),
            "temperature_train": ece_blob.get("temperature_train") or blob.get("temperature"),
            "temperature_posthoc": ece_blob.get("temperature_posthoc"),
            "test_domain": blob.get("test_domain") or measured_src.get("test_domain"),
            "train_domain": blob.get("train_domain") or measured_src.get("train_domain"),
            # Never invent version / protocol
            "version": values.get("version") or blob.get("version") or measured_src.get("version"),
            "eval_protocol": blob.get("eval_protocol") or measured_src.get("eval_protocol"),
        }
        if train_pub is not None:
            candidate["test_ece_train_published"] = train_pub
        if candidate["test_map_at_3"] is None and candidate["safety_recall_deadly_at_3"] is None:
            continue
        if not candidate.get("version"):
            gaps.append("version_unknown")
        if not candidate.get("eval_protocol"):
            gaps.append("eval_protocol_unknown")
        gaps.append(f"ssot_bootstrapped_from_fallback:{fallback.name}")
        ssot = _measured_block(candidate, source_path=str(fallback))
        ssot["bootstrap_gap"] = True
        ssot["bootstrap_source"] = _repo_rel(fallback) or str(fallback)
        gaps.extend(ssot.get("ssot_field_gaps") or [])
        SSOT_PATH.parent.mkdir(parents=True, exist_ok=True)
        SSOT_PATH.write_text(
            json.dumps(ssot, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        return ssot, gaps

    gaps.append("ssot_and_metrics_missing")
    return None, gaps


def _fmt_full(x: Any) -> str:
    """Full-precision measured value for MD — same encoding as JSON SSOT."""
    if x is None:
        return "n/a"
    if isinstance(x, bool):
        return "true" if x else "false"
    if isinstance(x, int) and not isinstance(x, bool):
        return str(x)
    if isinstance(x, float):
        # Match JSON.dump number encoding used in SSOT files
        return json.dumps(x)
    try:
        return json.dumps(float(x))
    except (TypeError, ValueError):
        return str(x)


def build_handoff(
    *,
    ssot: dict[str, Any] | None,
    rails: dict[str, Any],
    models_dir: Path | None,
    ssot_gaps: list[str],
) -> dict[str, Any]:
    measured = (ssot or {}).get("measured") if isinstance(ssot, dict) else {}
    ece = (ssot or {}).get("ece") if isinstance(ssot, dict) else {}
    soft = (ssot or {}).get("soft_gates_advisory") if isinstance(ssot, dict) else {}
    if not isinstance(measured, dict):
        measured = {}
    if not isinstance(ece, dict):
        ece = {}
    if not isinstance(soft, dict):
        soft = {}

    can_stage = bool(rails.get("can_stage_train_notebook") or rails.get("can_stage"))
    metrics_present = measured.get("test_map_at_3") is not None
    dual_deadly_ok = bool(soft.get("dual_deadly_keys_present"))
    soft_gates_ok = bool(soft.get("soft_map_pass") and soft.get("soft_deadly_at_3_pass"))

    gaps = list(ssot_gaps) + list(rails.get("gaps") or [])
    if not metrics_present:
        gaps.append("measured_metrics_absent")
    if ece.get("claim_train_published") is False and ece.get("primary_value") is not None:
        if "ece_primary_provenance_unspecified" not in gaps:
            gaps.append("ece_primary_provenance_unspecified")

    soft_note = (
        f"soft_gates_advisory dual_deadly={dual_deadly_ok} both_soft={soft_gates_ok} "
        "(never unlock)"
    )

    if can_stage and metrics_present:
        status = "ready_for_lab_loop"
        operator_action = (
            "Rails green + SSOT metrics present. Continue lab loop "
            "(E20b diagnose / E20c pull / friction iters). "
            "Stage notebook only via stage script; never auto push; never product_unlock. "
            f"({soft_note})"
        )
    elif can_stage:
        status = "rails_ok_metrics_gap"
        operator_action = (
            "Rails green but SSOT metrics incomplete — refresh metrics from E20 models "
            f"before citing numbers in PRs. ({soft_note})"
        )
    elif metrics_present:
        status = "metrics_ok_rails_blocked"
        operator_action = (
            rails.get("operator_action")
            or "Fix anti-leak rails / provide models dir before staging train notebook."
        ) + f" ({soft_note})"
    else:
        status = "blocked_gaps"
        operator_action = (
            "GAP: missing measured metrics and/or anti-leak artifacts. "
            "Provide kaggle/kernel_output_v20/models or VISIONSETIL_MODELS_DIR "
            "or --models-dir; still keep product_unlock=false. "
            f"({soft_note})"
        )

    unlock_pkg = _load_json(REPORT_DIR / "operator_unlock_checklist.json")
    unlock_eligible = None
    if isinstance(unlock_pkg, dict):
        unlock_eligible = unlock_pkg.get("unlock_eligible_advisory")

    # Prefer train_published label only when claimed
    ece_primary_label = ece.get("primary") or "missing"
    honesty_dual = (
        "train_published"
        if ece.get("claim_train_published")
        else ece_primary_label
    )

    handoff: dict[str, Any] = {
        "generated_at": _utc_now(),
        "policy": POLICY,
        "product_unlock": False,
        "can_auto_unlock": False,
        "forage_permission": False,
        "consumption_permission": False,
        "lab_only": True,
        "kaggle_push": False,
        "auto_kaggle_push": False,
        "status": status,
        "can_stage_train_notebook": can_stage,
        "can_stage": can_stage,
        "operator_action": operator_action,
        "metrics_label": "[MEASURED]",
        "ssot_path": _repo_rel(SSOT_PATH) or str(SSOT_PATH),
        "ssot_present": ssot is not None,
        "models_dir": _repo_rel(models_dir) if models_dir else rails.get("models_dir"),
        "models_dir_resolved": (
            str(models_dir.resolve())
            if models_dir
            else rails.get("models_dir_resolved")
        ),
        "measured": {
            "test_map_at_3": measured.get("test_map_at_3"),
            "safety_recall_deadly_at_1": measured.get("safety_recall_deadly_at_1"),
            "safety_recall_deadly_at_3": measured.get("safety_recall_deadly_at_3"),
            "n_deadly_in_test": measured.get("n_deadly_in_test"),
            "test_accuracy": measured.get("test_accuracy"),
            "num_classes": measured.get("num_classes"),
            "num_train_obs": measured.get("num_train_obs"),
            "num_test_obs": measured.get("num_test_obs"),
            "version": (ssot or {}).get("version"),
            "eval_protocol": (ssot or {}).get("eval_protocol"),
            "test_domain": (ssot or {}).get("test_domain"),
            "train_domain": (ssot or {}).get("train_domain"),
        },
        "ece": {
            "primary": ece_primary_label,
            "primary_value": ece.get("primary_value"),
            "primary_source": ece.get("primary_source"),
            "claim_train_published": ece.get("claim_train_published"),
            "posthoc_separate": True,
            "posthoc_value": ece.get("posthoc_value"),
            "temperature_train": ece.get("temperature_train"),
            "temperature_posthoc": ece.get("temperature_posthoc"),
            "note": ece.get("note"),
        },
        "soft_gates_advisory": soft,
        "rails": {
            "status": rails.get("status"),
            "can_stage_train_notebook": can_stage,
            "fail_reasons": rails.get("fail_reasons") or [],
            "gaps": rails.get("gaps") or [],
            "report_path": _repo_rel(RAILS_OUT) or str(RAILS_OUT),
        },
        "unlock_advisory": {
            "unlock_eligible_advisory": unlock_eligible,
            "product_unlock": False,
            "note": (
                "Advisory eligibility from operator package is never an auto unlock. "
                "Human operator cycle required; orientation only."
            ),
        },
        "pipeline_next": [
            "1) verify_anti_leak_rails_for_train.py (gating exit; this handoff is non-gating unless --gate-on-rails)",
            "2) E20b diagnose JSON always before any relaunch (≤1 auto if rails OK)",
            "3) E20c pull + post_train_suite + compare vs SSOT file",
            "4) Fresh loop_iter frictions (open-set / deadly@1 / hotspots / ECE dual)",
            "5) stage_train_notebook_if_rails_ok.py only if can_stage — no auto push",
        ],
        "never": [
            "auto product_unlock=true",
            "pick max(MAP) across kernels for serve gate",
            "contaminate GBIF ES holdout",
            "sell posthoc ECE as primary",
            "forage or consumption permission",
            "invent version/protocol/ECE provenance",
        ],
        "gaps": gaps,
        "honesty": {
            "metrics_from_ssot_only": True,
            "dual_ece_primary": honesty_dual,
            "open_set_honesty": True,
            "map_is_not_safety": True,
            "product_unlock_forced_false": True,
            "handoff_exit_non_gating_by_default": True,
            "rails_gate_script": "scripts/verify_anti_leak_rails_for_train.py",
        },
        "note": (
            "Operator handoff for VisionSetil ML lab loop. "
            "Metrics cited only from E20_BASELINE_METRICS_TO_IMPROVE.json [MEASURED] full precision. "
            "product_unlock remains false. Default exit 0 is report-only; use verify script or "
            "--gate-on-rails for fail-closed CI."
        ),
    }
    return handoff


def render_md(handoff: dict[str, Any]) -> str:
    m = handoff.get("measured") or {}
    e = handoff.get("ece") or {}
    r = handoff.get("rails") or {}
    soft = handoff.get("soft_gates_advisory") or {}
    primary_label = e.get("primary") or "missing"
    claim = e.get("claim_train_published")
    lines = [
        "# Loop operator handoff (latest)",
        "",
        f"**Generated:** `{handoff.get('generated_at')}`  ",
        f"**Status:** `{handoff.get('status')}`  ",
        f"**Policy:** `{handoff.get('policy')}`  ",
        f"**product_unlock:** `{handoff.get('product_unlock')}` (forced false)  ",
        f"**can_stage_train_notebook:** `{handoff.get('can_stage_train_notebook')}`  ",
        f"**Lab only:** `{handoff.get('lab_only')}` · **kaggle_push:** `{handoff.get('kaggle_push')}`",
        "",
        "> **Cite JSON SSOT only** for PR bodies (`E20_BASELINE_METRICS_TO_IMPROVE.json`).  ",
        "> MD table uses full-precision measured floats for display; do not invent or re-round.",
        "",
        f"> Handoff is **non-gating** by default (exit 0). Rails fail-closed: "
        f"`scripts/verify_anti_leak_rails_for_train.py` (or handoff `--gate-on-rails`).",
        "",
        "## Operator action",
        "",
        str(handoff.get("operator_action") or ""),
        "",
        "## Measured metrics (SSOT)",
        "",
        f"Source file: `{handoff.get('ssot_path')}`  ",
        f"Label: `{handoff.get('metrics_label')}` — full precision below; copy from JSON SSOT for PRs.",
        "",
        "| Metric | [MEASURED] |",
        "|--------|------------|",
        f"| MAP@3 | {_fmt_full(m.get('test_map_at_3'))} |",
        f"| deadly@1 | {_fmt_full(m.get('safety_recall_deadly_at_1'))} |",
        f"| deadly@3 | {_fmt_full(m.get('safety_recall_deadly_at_3'))} |",
        f"| n_deadly | {_fmt_full(m.get('n_deadly_in_test'))} |",
        f"| ECE primary ({primary_label}) | {_fmt_full(e.get('primary_value'))} |",
        f"| ECE posthoc (lab-only) | {_fmt_full(e.get('posthoc_value'))} |",
        f"| claim_train_published | `{claim}` |",
        f"| primary_source | `{e.get('primary_source')}` |",
        f"| version | `{m.get('version')}` |",
        f"| eval_protocol | `{m.get('eval_protocol')}` |",
        f"| test_domain | `{m.get('test_domain')}` |",
        "",
        "### Soft gates (advisory only)",
        "",
        f"- soft MAP@3 ≥ {SOFT_MAP}: `{soft.get('soft_map_pass')}`",
        f"- soft deadly@3 ≥ {SOFT_DEADLY}: `{soft.get('soft_deadly_at_3_pass')}`",
        f"- dual deadly keys: `{soft.get('dual_deadly_keys_present')}`",
        "",
        "> Soft gates never authorize product_unlock, forage, or consumption.",
        "",
        "## Dual ECE honesty",
        "",
        f"- **Primary label:** `{primary_label}` = `{_fmt_full(e.get('primary_value'))}` "
        f"(source=`{e.get('primary_source')}`, claim_train_published=`{claim}`)",
        f"- **Posthoc (separate, no serve):** `{_fmt_full(e.get('posthoc_value'))}`",
        f"- temperature_train: `{e.get('temperature_train')}` · temperature_posthoc: `{e.get('temperature_posthoc')}`",
        "",
        "## Anti-leak rails",
        "",
        f"- rails status: `{r.get('status')}`",
        f"- can_stage: `{r.get('can_stage_train_notebook')}`",
        f"- report: `{r.get('report_path')}`",
        f"- fail_reasons: `{', '.join(r.get('fail_reasons') or []) or 'none'}`",
        f"- gaps: `{', '.join(r.get('gaps') or []) or 'none'}`",
        "",
        "## Pipeline next",
        "",
    ]
    for step in handoff.get("pipeline_next") or []:
        lines.append(f"- {step}")
    lines.extend(
        [
            "",
            "## Never",
            "",
        ]
    )
    for n in handoff.get("never") or []:
        lines.append(f"- {n}")
    gaps = handoff.get("gaps") or []
    if gaps:
        lines.extend(["", "## GAPs", ""])
        for g in gaps:
            lines.append(f"- {g}")
    lines.extend(
        [
            "",
            "---",
            "",
            "_Orientation only · never consumption · product_unlock=false_",
            "",
        ]
    )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--models-dir", type=Path, default=None)
    ap.add_argument(
        "--skip-rails",
        action="store_true",
        help="Read existing anti_leak_rails_train_latest.json instead of re-running",
    )
    ap.add_argument(
        "--no-refresh-ssot",
        action="store_true",
        help="Do not overwrite SSOT when metrics.json is present (use existing SSOT if any)",
    )
    ap.add_argument(
        "--gate-on-rails",
        action="store_true",
        help=(
            "Optional fail-closed: exit 1 when can_stage_train_notebook is false. "
            "Default is non-gating exit 0 (report writer); prefer verify_anti_leak_rails_for_train.py for CI gates."
        ),
    )
    args = ap.parse_args(argv)

    mdir = resolve_models_dir(args.models_dir)

    if args.skip_rails:
        rails = _load_json(RAILS_OUT)
        if not isinstance(rails, dict):
            rails = evaluate_anti_leak_rails(models_dir=args.models_dir)
            write_rails_report(rails)
    else:
        rails = evaluate_anti_leak_rails(models_dir=args.models_dir)
        write_rails_report(rails)

    ssot, ssot_gaps = bootstrap_or_refresh_ssot(
        models_dir=args.models_dir,
        force_refresh=not args.no_refresh_ssot,
    )
    handoff = build_handoff(
        ssot=ssot,
        rails=rails,
        models_dir=mdir,
        ssot_gaps=ssot_gaps,
    )

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    HANDOFF_JSON.write_text(
        json.dumps(handoff, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    HANDOFF_MD.write_text(render_md(handoff), encoding="utf-8")

    print(f"Wrote {SSOT_PATH if ssot else '(SSOT missing)'}")
    print(f"Wrote {HANDOFF_JSON}")
    print(f"Wrote {HANDOFF_MD}")
    print(f"Wrote {RAILS_OUT}")
    print(
        f"status={handoff['status']} can_stage={handoff['can_stage_train_notebook']} "
        f"product_unlock={handoff['product_unlock']}"
    )
    if handoff.get("gaps"):
        print("gaps:", ", ".join(str(g) for g in handoff["gaps"]))
    print(
        "exit_policy=non_gating_default"
        + ("; --gate-on-rails active" if args.gate_on_rails else "; rails gate=verify_anti_leak_rails_for_train.py")
    )

    if args.gate_on_rails and not handoff["can_stage_train_notebook"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
