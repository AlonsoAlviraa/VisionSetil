#!/usr/bin/env python3
"""ML loop friction: open-set serve audit (fresh loop_iter artifact).

Audits the *currently served* open-set thresholds (eval/reports/open_set_thresholds.json
+ backend mirror) against holdout softmax from a models dir with test_predictions.npz.

Preference order (when --models-dir not set):
  1) kaggle/kernel_output_v20c/models  (E20c — preferred after ML-03)
  2) kaggle/kernel_output_v20b/models
  3) kaggle/kernel_output_v20/models   (E20 baseline fallback)
  4) env VISIONSETIL_MODELS_DIR

Writes (always product_unlock=false, fresh generated_at):
  eval/reports/ml_experiments/loop_iter_<id>_open_set_serve_audit_<YYYY-MM-DD>.json
  eval/reports/ml_experiments/loop_iter_<id>_open_set_serve_audit_<YYYY-MM-DD>.md
  eval/reports/ml_experiments/loop_open_set_serve_audit_latest.json
  eval/reports/ml_experiments/loop_open_set_serve_audit_latest.md

Does NOT:
  - set product_unlock / can_auto_unlock / forage / consumption true
  - rewrite open_set_thresholds.json (audit only; calibration is separate S8 path)
  - invent MAP/deadly/ECE; measured blocks only from files present
  - count pre-plan historical loop_iter files (this run always stamps a new generated_at)

Usage:
  python scripts/loop_ml_open_set_serve_audit.py
  python scripts/loop_ml_open_set_serve_audit.py --models-dir kaggle/kernel_output_v20c/models
  python scripts/loop_ml_open_set_serve_audit.py --iter-id 51
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from kaggle.ml_qa.open_set_holdout import (  # noqa: E402
    _eval_gate,
    _load_deadly_idxs,
    _shannon_entropy,
    analyze_open_set_holdout,
    resolve_predictions_dir,
)
from scripts.verify_anti_leak_rails_for_train import _repo_rel  # noqa: E402

POLICY = "orientation_only_never_consume"
REPORT_DIR = ROOT / "eval" / "reports" / "ml_experiments"
SERVE_THR_CANDIDATES = (
    ROOT / "eval" / "reports" / "open_set_thresholds.json",
    ROOT / "backend" / "eval" / "reports" / "open_set_thresholds.json",
)
# Prefer E20c then E20b then E20 baseline (design §4.8)
DEFAULT_MODELS_CANDIDATES = (
    ROOT / "kaggle" / "kernel_output_v20c" / "models",
    ROOT / "kaggle" / "kernel_output_v20b" / "models",
    ROOT / "kaggle" / "kernel_output_v20" / "models",
)
# Post-design loop iters start at 51+ (design DoD anti-histórico)
DEFAULT_ITER_ID = 51
FRICTION_SLUG = "open_set_serve_audit"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _utc_date() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


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


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )


def _models_rel(models_dir: Path) -> str:
    """Repo-relative POSIX path without resolving junctions outside the worktree."""
    p = Path(models_dir)
    try:
        if not p.is_absolute():
            return p.as_posix()
        return p.relative_to(ROOT).as_posix()
    except ValueError:
        rel = _repo_rel(p)
        return rel if rel else str(p)


def resolve_models_dir(explicit: Path | None) -> Path | None:
    """Prefer E20c preds → E20b → E20; env VISIONSETIL_MODELS_DIR last. No hardcoded user paths."""
    if explicit is not None:
        p = Path(explicit)
        if p.is_dir() and (p / "test_predictions.npz").is_file():
            return p
        if (p / "models").is_dir() and (p / "models" / "test_predictions.npz").is_file():
            return p / "models"
        return None
    for c in DEFAULT_MODELS_CANDIDATES:
        if c.is_dir() and (c / "test_predictions.npz").is_file():
            return c
    env = os.getenv("VISIONSETIL_MODELS_DIR")
    if env:
        p = Path(env)
        if p.is_dir() and (p / "test_predictions.npz").is_file():
            return p
        if (p / "models").is_dir() and (p / "models" / "test_predictions.npz").is_file():
            return p / "models"
    # Last resort: open_set_holdout resolver (highest v* with preds)
    return resolve_predictions_dir(ROOT, None)


def load_serve_thresholds() -> dict[str, Any]:
    """Load active serve thresholds file (audit of what Identify would use)."""
    for path in SERVE_THR_CANDIDATES:
        blob = _load_json(path)
        if isinstance(blob, dict):
            return {
                "path": _repo_rel(path) or str(path),
                "path_resolved": str(path.resolve()),
                "blob": blob,
            }
    return {
        "path": None,
        "path_resolved": None,
        "blob": {
            "calibrated_threshold": 0.55,
            "calibrated_margin": 0.15,
            "calibrated_entropy": None,
            "status": "settings_fallback_no_file",
            "product_unlock": False,
        },
        "gap": "open_set_thresholds_file_missing",
    }


def _gate_from_npz(
    models_dir: Path,
    conf_thr: float,
    mar_thr: float,
    entropy_thr: float | None,
) -> dict[str, Any]:
    z = np.load(models_dir / "test_predictions.npz", allow_pickle=True)
    probs = np.asarray(z["probs"], dtype=np.float64)
    labels = np.asarray(z["labels"]).astype(int)
    n, _ = probs.shape
    order = np.argsort(-probs, axis=1)
    top1 = order[:, 0]
    top2 = order[:, 1]
    top3 = order[:, :3]
    p1 = probs[np.arange(n), top1]
    p2 = probs[np.arange(n), top2]
    margin = p1 - p2
    entropy = _shannon_entropy(probs)
    correct = top1 == labels
    deadly_idxs = _load_deadly_idxs(models_dir, ROOT)
    is_deadly = (
        np.isin(labels, list(deadly_idxs)) if deadly_idxs else np.zeros(n, dtype=bool)
    )
    d_hit3 = np.array(
        [int(labels[i]) in set(top3[i].tolist()) for i in range(n)], dtype=bool
    )
    return _eval_gate(
        p1,
        margin,
        correct,
        is_deadly,
        d_hit3,
        conf_thr,
        mar_thr,
        entropy=entropy if entropy_thr is not None else None,
        entropy_thr=entropy_thr,
    )


def _resolve_ece_from_metrics(metrics: dict[str, Any] | None) -> dict[str, Any]:
    if not metrics:
        return {
            "primary": "missing",
            "primary_value": None,
            "primary_source": None,
            "claim_train_published": False,
            "test_ece": None,
            "test_ece_train_published": None,
            "posthoc_separate": True,
            "posthoc_value": None,
            "test_ece_posthoc": None,
            "note": "No metrics.json alongside predictions; ECE omitted (not invented).",
        }
    ece_train = _f(metrics.get("test_ece_train_published"))
    ece_raw = _f(metrics.get("test_ece"))
    ece_post = _f(metrics.get("test_ece_posthoc"))
    flagged = bool(metrics.get("ece_primary_is_train_published"))
    if ece_train is not None:
        return {
            "primary": "train_published",
            "primary_value": ece_train,
            "primary_source": "test_ece_train_published",
            "claim_train_published": True,
            "test_ece": ece_raw,
            "test_ece_train_published": ece_train,
            "posthoc_separate": True,
            "posthoc_value": ece_post,
            "test_ece_posthoc": ece_post,
            "note": "Primary ECE is train-published from metrics.json key.",
        }
    if flagged and ece_raw is not None:
        return {
            "primary": "train_published",
            "primary_value": ece_raw,
            "primary_source": "test_ece_flagged_train_published",
            "claim_train_published": True,
            "test_ece": ece_raw,
            "test_ece_train_published": None,
            "posthoc_separate": True,
            "posthoc_value": ece_post,
            "test_ece_posthoc": ece_post,
            "note": "Primary ECE claimed train-published via ece_primary_is_train_published flag.",
        }
    if ece_raw is not None:
        # Kernel train metrics often only have bare test_ece; treat as train-published
        # when no posthoc key is present (same honesty as post_train_suite kernel path).
        has_posthoc = ece_post is not None
        if not has_posthoc:
            return {
                "primary": "train_published",
                "primary_value": ece_raw,
                "primary_source": "kernel_metrics_test_ece_as_train_published",
                "claim_train_published": True,
                "test_ece": ece_raw,
                "test_ece_train_published": None,
                "posthoc_separate": True,
                "posthoc_value": None,
                "test_ece_posthoc": None,
                "note": (
                    "Bare test_ece from kernel metrics treated as train-published "
                    "(no posthoc key present). test_ece_train_published not synthesized."
                ),
            }
        return {
            "primary": "test_ece_unspecified",
            "primary_value": ece_raw,
            "primary_source": "test_ece_fallback",
            "claim_train_published": False,
            "test_ece": ece_raw,
            "test_ece_train_published": None,
            "posthoc_separate": True,
            "posthoc_value": ece_post,
            "test_ece_posthoc": ece_post,
            "note": "Bare test_ece with posthoc present — primary provenance unspecified.",
        }
    return {
        "primary": "missing",
        "primary_value": None,
        "primary_source": None,
        "claim_train_published": False,
        "test_ece": None,
        "test_ece_train_published": None,
        "posthoc_separate": True,
        "posthoc_value": ece_post,
        "test_ece_posthoc": ece_post,
        "note": "ECE missing from metrics.json.",
    }


def _checkpoint_label(models_dir: Path) -> str:
    name = models_dir.parent.name if models_dir.name == "models" else models_dir.name
    if "v20c" in name:
        return "e20c"
    if "v20b" in name:
        return "e20b"
    if "v20" in name:
        return "e20"
    return name


def run_audit(
    *,
    models_dir: Path,
    iter_id: int,
    date_stamp: str | None = None,
) -> dict[str, Any]:
    generated_at = _utc_now()
    date_stamp = date_stamp or _utc_date()
    gaps: list[str] = []
    frictions: list[str] = []

    serve = load_serve_thresholds()
    serve_blob = serve.get("blob") or {}
    if serve.get("gap"):
        gaps.append(str(serve["gap"]))

    conf = _f(serve_blob.get("calibrated_threshold"))
    mar = _f(serve_blob.get("calibrated_margin"))
    eth = _f(serve_blob.get("calibrated_entropy"))
    serve_status = str(serve_blob.get("status") or "unknown")
    calibrated = serve_status.startswith("calibrated")

    if conf is None:
        gaps.append("serve_conf_thr_missing")
        conf = 0.55
    if mar is None:
        gaps.append("serve_margin_thr_missing")
        mar = 0.0

    # Product floor honesty: margin 0 never catches near-ties
    if mar is not None and mar < 0.05:
        frictions.append("serve_margin_below_product_floor_0.05")

    serve_gate = _gate_from_npz(
        models_dir,
        float(conf),
        float(mar),
        float(eth) if eth is not None and eth > 0 else None,
    )

    # Full holdout analysis (recommended thr + conf stats) — reuses S8 logic
    analysis = analyze_open_set_holdout(ROOT, models_dir=models_dir)
    if not analysis.get("ok"):
        gaps.append(f"holdout_analysis_{analysis.get('reason', 'failed')}")

    recommended = analysis.get("recommended") or {}
    multiview_legacy = analysis.get("current_multiview_thr") or {}
    generic_legacy = analysis.get("current_generic_thr") or {}

    # Friction signals (lab only)
    serve_rej = _f(serve_gate.get("reject_rate")) or 0.0
    if serve_rej < 0.01:
        frictions.append("serve_reject_rate_near_zero")
    if (multiview_legacy.get("reject_rate") or 0.0) < 0.01:
        frictions.append("legacy_multiview_thr_rejects_near_zero")
    if calibrated and serve_rej < 0.05:
        frictions.append("calibrated_serve_still_low_reject")

    rec_conf = _f(recommended.get("conf_thr"))
    rec_mar = _f(recommended.get("margin_thr"))
    rec_eth = _f(recommended.get("entropy_thr"))
    if rec_conf is not None and abs(float(conf) - rec_conf) > 0.02:
        frictions.append("serve_conf_differs_from_recommended_grid")
    if rec_mar is not None and abs(float(mar) - rec_mar) > 0.02:
        frictions.append("serve_margin_differs_from_recommended_grid")

    deadly_rej = _f(serve_gate.get("deadly_reject_rate"))
    if deadly_rej is not None and deadly_rej > 0.10:
        frictions.append(f"serve_deadly_reject_rate_high:{deadly_rej:.4f}")

    mate = analysis.get("lookalike_mate_rates") or {}
    mate_rate = _f(mate.get("lookalike_mate_in_topk_rate"))
    if mate_rate is not None and mate_rate > 0.20:
        frictions.append(f"high_mate_in_topk:{mate_rate:.4f}")

    metrics = _load_json(models_dir / "metrics.json")
    if not isinstance(metrics, dict):
        metrics = {}
        gaps.append("metrics_json_missing")
    ece = _resolve_ece_from_metrics(metrics if metrics else None)

    version = metrics.get("version") or analysis.get("version")
    eval_protocol = metrics.get("eval_protocol") or analysis.get("protocol")
    checkpoint = _checkpoint_label(models_dir)

    # Status: audit_ok if we measured serve thr on holdout; gaps are soft
    if analysis.get("ok") and serve_gate.get("n"):
        status = "audit_ok_with_gaps" if (gaps or frictions) else "audit_ok"
        audit_ok = True
    else:
        status = "audit_incomplete"
        audit_ok = False

    measured_block = {
        "test_map_at_3": _f(metrics.get("test_map_at_3")),
        "safety_recall_deadly_at_1": _f(metrics.get("safety_recall_deadly_at_1")),
        "safety_recall_deadly_at_3": _f(
            metrics.get("safety_recall_deadly_at_3")
            or metrics.get("safety_recall_deadly")
        ),
        "n_deadly_in_test": metrics.get("n_deadly_in_test"),
        "test_accuracy": _f(metrics.get("test_accuracy")),
        "holdout_top1_accuracy": analysis.get("top1_accuracy"),
        "holdout_n": analysis.get("n") or serve_gate.get("n"),
    }

    serve_audit = {
        "thresholds_path": serve.get("path"),
        "thresholds_status": serve_status,
        "calibrated": calibrated,
        "active_conf_thr": float(conf),
        "active_margin_thr": float(mar),
        "active_entropy_thr": float(eth) if eth is not None else None,
        "source_experiment": serve_blob.get("source_experiment"),
        "protocol_on_file": serve_blob.get("protocol"),
        "holdout_under_serve_thr": serve_gate,
        "holdout_stats_on_file": serve_blob.get("holdout_stats"),
        "product_unlock_on_file": bool(serve_blob.get("product_unlock", False)),
    }

    comparison = {
        "serve_vs_recommended": {
            "serve_conf": float(conf),
            "serve_margin": float(mar),
            "serve_entropy": float(eth) if eth is not None else None,
            "recommended_conf": rec_conf,
            "recommended_margin": rec_mar,
            "recommended_entropy": rec_eth,
            "serve_reject_rate": serve_rej,
            "recommended_reject_rate": _f(recommended.get("reject_rate")),
            "serve_acc_keep": _f(serve_gate.get("acc_keep")),
            "recommended_acc_keep": _f(recommended.get("acc_keep")),
            "serve_deadly_reject_rate": deadly_rej,
            "recommended_deadly_reject_rate": _f(recommended.get("deadly_reject_rate")),
            "serve_deadly_at3_among_kept": _f(serve_gate.get("deadly_at3_among_kept")),
            "recommended_deadly_at3_among_kept": _f(
                recommended.get("deadly_at3_among_kept")
            ),
        },
        "legacy_multiview_0_10_0_0": multiview_legacy,
        "legacy_generic_0_48_0_10": generic_legacy,
        "note": (
            "Serve thr audited on current predictions holdout. "
            "Recommended grid is orientation-only recompute (does not auto-write serve file). "
            "Legacy multiview 0.10/0.0 typically rejects ~0% on overconfident softmax."
        ),
    }

    operator_action = (
        "Open-set serve audit complete. product_unlock remains false. "
        "Do not hide reject UX. Continue loop frictions (deadly@1 / lookalike hotspots / ECE dual). "
        "Do not auto-rewrite thresholds from this audit alone — operator reviews frictions first."
    )
    if "serve_reject_rate_near_zero" in frictions:
        operator_action += (
            " FRICTION: serve reject rate near zero — check calibrated thr load path "
            "and MultiView open-set path."
        )
    if not calibrated:
        operator_action += (
            " GAP: serve thresholds not calibrated_* — Identify may use settings fallback."
        )
    if checkpoint == "e20":
        operator_action += " Checkpoint: E20 baseline (E20c/E20b preds unavailable or not preferred)."
    elif checkpoint == "e20c":
        operator_action += " Checkpoint: E20c (preferred)."

    stem = f"loop_iter_{iter_id}_{FRICTION_SLUG}_{date_stamp}"
    out_json = REPORT_DIR / f"{stem}.json"
    out_md = REPORT_DIR / f"{stem}.md"
    latest_json = REPORT_DIR / "loop_open_set_serve_audit_latest.json"
    latest_md = REPORT_DIR / "loop_open_set_serve_audit_latest.md"

    report: dict[str, Any] = {
        "generated_at": generated_at,
        "loop_iter_id": iter_id,
        "friction": FRICTION_SLUG,
        "friction_title": "open-set serve audit",
        "artifact_stem": stem,
        "status": status,
        "audit_ok": audit_ok,
        "policy": POLICY,
        "product_unlock": False,
        "can_auto_unlock": False,
        "forage_permission": False,
        "consumption_permission": False,
        "lab_only": True,
        "metrics_label": "[MEASURED]",
        "eval_protocol": eval_protocol or f"source_holdout_{checkpoint}",
        "version": version,
        "checkpoint": checkpoint,
        "models_dir": _models_rel(models_dir),
        "models_dir_resolved": str(models_dir.resolve()),
        "source_metrics_path": f"{_models_rel(models_dir)}/metrics.json",
        "test_domain": metrics.get("test_domain"),
        "train_domain": metrics.get("train_domain"),
        "provenance": {
            "checkpoint": checkpoint,
            "models_dir": _models_rel(models_dir),
            "train": metrics.get("train_domain"),
            "test": metrics.get("test_domain") or "gbif_es_holdout",
            "serve_thresholds_path": serve.get("path"),
            "predictions": "test_predictions.npz",
        },
        "measured": measured_block,
        "ece": ece,
        "serve_audit": serve_audit,
        "comparison": comparison,
        "recommended_recompute": {
            "conf_thr": rec_conf,
            "margin_thr": rec_mar,
            "entropy_thr": rec_eth,
            "reject_rate": _f(recommended.get("reject_rate")),
            "acc_keep": _f(recommended.get("acc_keep")),
            "deadly_reject_rate": _f(recommended.get("deadly_reject_rate")),
            "deadly_at3_among_kept": _f(recommended.get("deadly_at3_among_kept")),
            "score": recommended.get("score"),
            "note": recommended.get("note"),
            "writes_serve_file": False,
        },
        "lookalike_mate_rates": mate,
        "conf_stats": analysis.get("conf_stats"),
        "margin_stats": analysis.get("margin_stats"),
        "entropy_stats": analysis.get("entropy_stats"),
        "frictions": frictions,
        "gaps": gaps,
        "operator_action": operator_action,
        "honesty": {
            "metrics_from_ssot_files_only": True,
            "dual_ece_primary": (
                "train_published" if ece.get("claim_train_published") else ece.get("primary")
            ),
            "posthoc_never_primary": True,
            "product_unlock_forced_false": True,
            "no_invented_metrics": True,
            "map_is_not_safety": True,
            "open_set_honesty": True,
            "fresh_generated_at": True,
            "does_not_count_historical_iters_only": True,
            "does_not_auto_write_serve_thresholds": True,
            "reject_ux_must_remain_visible": True,
        },
        "never": [
            "auto product_unlock=true",
            "hide open-set reject in product chrome",
            "forage or consumption permission",
            "invent MAP/deadly/ECE/version",
            "count pre-plan historical loop_iter without re-run",
            "pick max(MAP) across kernels for serve gate",
        ],
        "citation_rule": (
            "Copy full-precision [MEASURED] values from this JSON at run time; "
            "do not round in PR titles. MD is display-only."
        ),
        "artifact_paths": {
            "json": _repo_rel(out_json),
            "md": _repo_rel(out_md),
            "latest_json": _repo_rel(latest_json),
            "latest_md": _repo_rel(latest_md),
        },
        "note": (
            "Orientation only. One ML-loop friction unit with fresh generated_at. "
            "Audit of serve open-set thresholds on holdout — not a product unlock."
        ),
    }

    # Force honesty rails
    report["product_unlock"] = False
    report["can_auto_unlock"] = False
    report["forage_permission"] = False
    report["consumption_permission"] = False

    md = _render_md(report)
    _write_json(out_json, report)
    out_md.write_text(md, encoding="utf-8")
    _write_json(latest_json, report)
    latest_md.write_text(md, encoding="utf-8")
    report["_written"] = {
        "json": str(out_json),
        "md": str(out_md),
        "latest_json": str(latest_json),
        "latest_md": str(latest_md),
    }
    return report


def _render_md(r: dict[str, Any]) -> str:
    sa = r.get("serve_audit") or {}
    gate = sa.get("holdout_under_serve_thr") or {}
    cmp_ = (r.get("comparison") or {}).get("serve_vs_recommended") or {}
    m = r.get("measured") or {}
    ece = r.get("ece") or {}
    lines = [
        f"# Loop iter {r.get('loop_iter_id')} — open-set serve audit",
        "",
        f"**generated_at:** `{r.get('generated_at')}`  ",
        f"**status:** `{r.get('status')}`  ",
        f"**checkpoint:** `{r.get('checkpoint')}`  ",
        f"**eval_protocol:** `{r.get('eval_protocol')}`  ",
        f"**metrics_label:** {r.get('metrics_label')}  ",
        f"**product_unlock:** `{r.get('product_unlock')}` (forced false)  ",
        f"**policy:** `{r.get('policy')}`",
        "",
        "## Serve thresholds (active file)",
        "",
        f"| Field | Value |",
        f"|-------|------:|",
        f"| path | `{sa.get('thresholds_path')}` |",
        f"| status | `{sa.get('thresholds_status')}` |",
        f"| conf thr | {sa.get('active_conf_thr')} |",
        f"| margin thr | {sa.get('active_margin_thr')} |",
        f"| entropy thr | {sa.get('active_entropy_thr')} |",
        f"| calibrated | {sa.get('calibrated')} |",
        "",
        "## Holdout under serve thr [MEASURED]",
        "",
        f"| Metric | Value |",
        f"|--------|------:|",
        f"| n | {gate.get('n')} |",
        f"| reject_rate | {gate.get('reject_rate')} |",
        f"| acc_keep | {gate.get('acc_keep')} |",
        f"| deadly_reject_rate | {gate.get('deadly_reject_rate')} |",
        f"| deadly_at3_among_kept | {gate.get('deadly_at3_among_kept')} |",
        f"| wrong_kept | {gate.get('wrong_kept')} |",
        f"| correct_rejected | {gate.get('correct_rejected')} |",
        "",
        "## Serve vs recommended grid (orientation recompute)",
        "",
        f"| | serve | recommended |",
        f"|--|------:|------------:|",
        f"| conf | {cmp_.get('serve_conf')} | {cmp_.get('recommended_conf')} |",
        f"| margin | {cmp_.get('serve_margin')} | {cmp_.get('recommended_margin')} |",
        f"| entropy | {cmp_.get('serve_entropy')} | {cmp_.get('recommended_entropy')} |",
        f"| reject_rate | {cmp_.get('serve_reject_rate')} | {cmp_.get('recommended_reject_rate')} |",
        f"| acc_keep | {cmp_.get('serve_acc_keep')} | {cmp_.get('recommended_acc_keep')} |",
        f"| deadly_reject | {cmp_.get('serve_deadly_reject_rate')} | {cmp_.get('recommended_deadly_reject_rate')} |",
        "",
        "## Checkpoint metrics [MEASURED]",
        "",
        f"| Metric | Value |",
        f"|--------|------:|",
        f"| MAP@3 | {m.get('test_map_at_3')} |",
        f"| deadly@1 | {m.get('safety_recall_deadly_at_1')} |",
        f"| deadly@3 | {m.get('safety_recall_deadly_at_3')} |",
        f"| accuracy | {m.get('test_accuracy')} |",
        f"| ECE primary ({ece.get('primary')}) | {ece.get('primary_value')} |",
        f"| ECE posthoc (separate) | {ece.get('posthoc_value')} |",
        "",
        "## Frictions / gaps",
        "",
        f"- frictions: `{r.get('frictions')}`",
        f"- gaps: `{r.get('gaps')}`",
        "",
        "## Operator action",
        "",
        str(r.get("operator_action") or ""),
        "",
        "## Honesty",
        "",
        "- product_unlock / can_auto_unlock / forage / consumption = **false**",
        "- fresh `generated_at` — does not rely on historical loop_iter alone",
        "- does **not** auto-write serve thresholds",
        "- open-set reject UX must remain visible (no product chrome hide)",
        "",
    ]
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="ML loop open-set serve audit (fresh loop_iter)")
    parser.add_argument(
        "--models-dir",
        type=Path,
        default=None,
        help="Models dir with test_predictions.npz (prefer E20c; fallback E20)",
    )
    parser.add_argument(
        "--iter-id",
        type=int,
        default=DEFAULT_ITER_ID,
        help=f"Loop iter id (default {DEFAULT_ITER_ID}; design prefers 51+)",
    )
    parser.add_argument(
        "--date",
        type=str,
        default=None,
        help="Override date stamp YYYY-MM-DD (default UTC today)",
    )
    args = parser.parse_args(argv)

    models = resolve_models_dir(args.models_dir)
    if models is None:
        print(
            json.dumps(
                {
                    "status": "audit_incomplete",
                    "reason": "no_predictions",
                    "product_unlock": False,
                    "hint": (
                        "Provide --models-dir pointing at kernel models with "
                        "test_predictions.npz (E20c preferred, else E20)."
                    ),
                },
                indent=2,
            )
        )
        return 1

    report = run_audit(models_dir=models, iter_id=int(args.iter_id), date_stamp=args.date)
    summary = {
        "status": report.get("status"),
        "audit_ok": report.get("audit_ok"),
        "generated_at": report.get("generated_at"),
        "loop_iter_id": report.get("loop_iter_id"),
        "checkpoint": report.get("checkpoint"),
        "artifact_stem": report.get("artifact_stem"),
        "product_unlock": report.get("product_unlock"),
        "serve_reject_rate": (report.get("serve_audit") or {})
        .get("holdout_under_serve_thr", {})
        .get("reject_rate"),
        "frictions": report.get("frictions"),
        "gaps": report.get("gaps"),
        "written": report.get("_written"),
    }
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0 if report.get("audit_ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
