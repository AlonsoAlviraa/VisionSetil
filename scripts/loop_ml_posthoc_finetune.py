#!/usr/bin/env python3
"""Loop friction: posthoc temperature / ECE search — dual honesty (lab only).

PRIMARY ECE = train-published (metrics.test_ece_train_published or test_ece).
POSTHOC     = lab sidecar from scalar T grid on holdout logits — NEVER replaces primary
              in serve / model card / unlock gates.

E20 train-published test_ece is naive mean(|max_p − correct|). Posthoc T* search
historically minimized 15-bin reliability ECE (different definition). This script
reports BOTH definitions so naive cannot be laundered as "fixed" by binned posthoc.

Writes (always product_unlock=false, fresh generated_at):
  eval/reports/ml_experiments/loop_iter_<id>_ece_posthoc_<YYYY-MM-DD>.{json,md}
  eval/reports/ml_experiments/loop_posthoc_finetune_latest.{json,md}
  eval/reports/ml_experiments/open_set_thresholds_posthoc.json  (lab sidecar thr only)

Does NOT (default):
  - rewrite eval/reports/open_set_thresholds.json (serve thr)
  - overwrite metrics.json temperature / test_ece primary fields
  - set product_unlock / forage / consumption

Models resolution:
  1. --models-dir
  2. in-repo kaggle/kernel_output_v20{c,b,}/models
  3. env VISIONSETIL_MODELS_DIR

Usage:
  python scripts/loop_ml_posthoc_finetune.py
  python scripts/loop_ml_posthoc_finetune.py --models-dir PATH --iter-id 53
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

from kaggle.ml_qa.metrics_core import ece_binned, ece_naive  # noqa: E402

POLICY = "orientation_only_never_consume"
REPORT_DIR = ROOT / "eval" / "reports" / "ml_experiments"
SSOT_PATH = REPORT_DIR / "E20_BASELINE_METRICS_TO_IMPROVE.json"

DEFAULT_MODELS_CANDIDATES = (
    ROOT / "kaggle" / "kernel_output_v20c" / "models",
    ROOT / "kaggle" / "kernel_output_v20b" / "models",
    ROOT / "kaggle" / "kernel_output_v20" / "models",
)

# Post-plan loop_iter ids: PR-15/16 used 51/52 → this PR starts 53
DEFAULT_ITER_ID = 53
FRICTION_SLUG = "ece_posthoc"
N_BINS = 15


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _repo_rel(path: Path | str | None) -> str | None:
    if path is None:
        return None
    p = Path(path)
    try:
        return p.resolve().relative_to(ROOT.resolve()).as_posix()
    except (ValueError, OSError):
        return str(p)


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


def _fmt(v: Any) -> str:
    if v is None:
        return "null"
    if isinstance(v, float):
        return repr(v) if v == v else "null"
    return str(v)


def resolve_models_dir(explicit: Path | None = None) -> Path | None:
    if explicit is not None:
        p = Path(explicit)
        if p.is_dir() and (p / "test_predictions.npz").is_file():
            return p
        if (p / "models").is_dir() and (p / "models" / "test_predictions.npz").is_file():
            return p / "models"
        if p.is_dir():
            return p
        return None
    for c in DEFAULT_MODELS_CANDIDATES:
        if c.is_dir() and (c / "test_predictions.npz").is_file():
            return c
    env = (os.environ.get("VISIONSETIL_MODELS_DIR") or "").strip()
    if env:
        p = Path(env)
        if p.is_dir() and (p / "test_predictions.npz").is_file():
            return p
        if (p / "models").is_dir() and (p / "models" / "test_predictions.npz").is_file():
            return p / "models"
    return None


def softmax_t(logits: np.ndarray, t: float) -> np.ndarray:
    z = np.asarray(logits, dtype=np.float64) / float(t)
    z = z - z.max(axis=1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=1, keepdims=True)


def shannon_entropy(probs: np.ndarray) -> np.ndarray:
    p = np.clip(np.asarray(probs, dtype=np.float64), 1e-12, 1.0)
    return -np.sum(p * np.log(p), axis=1)


def open_set_stats(
    probs: np.ndarray,
    labels: np.ndarray,
    conf_thr: float,
    mar_thr: float,
    ent_thr: float,
) -> dict[str, Any]:
    order = np.argsort(-probs, axis=1)
    p1 = probs[np.arange(len(probs)), order[:, 0]]
    p2 = probs[np.arange(len(probs)), order[:, 1]]
    margin = p1 - p2
    ent = shannon_entropy(probs)
    rej = (p1 < conf_thr) | (margin < mar_thr) | (ent > ent_thr)
    keep = ~rej
    n = int(len(labels))
    n_keep = int(keep.sum())
    top1 = probs.argmax(axis=1)
    correct = top1 == labels
    acc_keep = float(correct[keep].mean()) if n_keep else None
    return {
        "reject_rate": float(rej.mean()) if n else None,
        "acc_keep": acc_keep,
        "top1_all": float(correct.mean()) if n else None,
        "n": n,
        "n_keep": n_keep,
    }


def recommend_open_set(probs: np.ndarray, labels: np.ndarray) -> dict[str, Any]:
    """Simple thr search: prefer conf in [0.7,0.95], margin floor 0.05, H≈0.15–2.0."""
    order = np.argsort(-probs, axis=1)
    p1 = probs[np.arange(len(probs)), order[:, 0]]
    p2 = probs[np.arange(len(probs)), order[:, 1]]
    margin = p1 - p2
    ent = shannon_entropy(probs)
    correct = probs.argmax(axis=1) == labels
    best: dict[str, Any] | None = None
    for conf in np.arange(0.70, 0.96, 0.02):
        for mar in (0.05, 0.08, 0.10):
            for h in (0.15, 0.5, 1.0, 1.5, 2.0):
                rej = (p1 < conf) | (margin < mar) | (ent > h)
                keep = ~rej
                n_keep = int(keep.sum())
                if n_keep < max(50, int(0.3 * len(labels))):
                    continue
                acc_k = float(correct[keep].mean())
                rej_r = float(rej.mean())
                # prefer higher acc_keep, moderate reject ~0.15–0.30
                score = acc_k - 0.15 * abs(rej_r - 0.22)
                cand = {
                    "conf_thr": float(conf),
                    "margin_thr": float(mar),
                    "entropy_thr": float(h),
                    "reject_rate": rej_r,
                    "acc_keep": acc_k,
                    "score": score,
                }
                if best is None or score > best["score"]:
                    best = cand
    if best is None:
        return {
            "conf_thr": 0.92,
            "margin_thr": 0.05,
            "entropy_thr": 0.15,
            "reject_rate": None,
            "acc_keep": None,
            "score": None,
        }
    return best


def build_t_grid() -> np.ndarray:
    return np.concatenate(
        [
            np.arange(1.0, 2.0, 0.1),
            np.arange(2.0, 3.5, 0.05),
            np.array([3.5, 3.75, 4.0]),
        ]
    )


def temperature_grid(
    logits: np.ndarray,
    labels: np.ndarray,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for t in build_t_grid():
        t = float(t)
        p = softmax_t(logits, t)
        conf = p.max(axis=1)
        pred = p.argmax(axis=1)
        correct = pred == labels
        rows.append(
            {
                "T": t,
                "ece_naive": ece_naive(p, labels),
                "ece_binned_15": ece_binned(p, labels, n_bins=N_BINS),
                "top1": float(correct.mean()),
                "mean_conf": float(conf.mean()),
            }
        )
    return rows


def resolve_primary_ece(metrics: dict[str, Any]) -> dict[str, Any]:
    """Dual ECE honesty: only claim train_published with explicit provenance."""
    ece_train_pub = _f(metrics.get("test_ece_train_published"))
    ece_raw = _f(metrics.get("test_ece"))
    flagged = bool(metrics.get("ece_primary_is_train_published"))
    gaps: list[str] = []

    if ece_train_pub is not None:
        primary_value = ece_train_pub
        primary_label = "train_published"
        primary_source = "test_ece_train_published"
        claim = True
    elif flagged and ece_raw is not None:
        primary_value = ece_raw
        primary_label = "train_published"
        primary_source = "test_ece_flagged_train_published"
        claim = True
    elif ece_raw is not None:
        primary_value = ece_raw
        primary_label = "test_ece_unspecified"
        primary_source = "test_ece_fallback"
        claim = False
        gaps.append("ece_primary_provenance_unspecified")
    else:
        primary_value = None
        primary_label = "missing"
        primary_source = None
        claim = False
        gaps.append("ece_primary_missing")

    t_train = _f(metrics.get("temperature_train"))
    if t_train is None:
        t_train = _f(metrics.get("temperature"))

    return {
        "primary": primary_label,
        "primary_value": primary_value,
        "primary_source": primary_source,
        "claim_train_published": claim,
        "definition_primary": "naive_mean_abs_maxprob_minus_correct (as published test_ece)",
        "temperature_train": t_train,
        "gaps": gaps,
    }


def build_report(
    models: Path,
    *,
    iter_id: int,
    date_slug: str,
) -> dict[str, Any]:
    gaps: list[str] = []
    generated_at = _utc_now()
    metrics = _load_json(models / "metrics.json") or {}
    ssot = _load_json(SSOT_PATH) or {}

    primary = resolve_primary_ece(metrics)
    gaps.extend(primary.pop("gaps", []))

    npz_path = models / "test_predictions.npz"
    if not npz_path.is_file():
        gaps.append("test_predictions_npz_missing")
        status = "blocked_on_gap"
        rows: list[dict[str, Any]] = []
        best_binned = None
        best_naive = None
        t_star = None
        at_train: dict[str, Any] = {}
        at_star: dict[str, Any] = {}
        os_rec: dict[str, Any] = {}
        os_stats: dict[str, Any] = {}
        top1_star = None
    else:
        z = np.load(npz_path, allow_pickle=True)
        if "logits" not in z.files or "labels" not in z.files:
            gaps.append("npz_missing_logits_or_labels")
            status = "blocked_on_gap"
            rows = []
            best_binned = best_naive = t_star = None
            at_train = at_star = os_rec = os_stats = {}
            top1_star = None
        else:
            logits = np.asarray(z["logits"], dtype=np.float64)
            labels = np.asarray(z["labels"], dtype=np.int64)
            # also report stored probs ECE (often already at train T)
            if "probs" in z.files:
                probs_stored = np.asarray(z["probs"], dtype=np.float64)
                stored_ece = {
                    "ece_naive": ece_naive(probs_stored, labels),
                    "ece_binned_15": ece_binned(probs_stored, labels, n_bins=N_BINS),
                    "top1": float((probs_stored.argmax(1) == labels).mean()),
                }
            else:
                stored_ece = {}

            rows = temperature_grid(logits, labels)
            # T* historically minimized binned ECE (lab only)
            best_binned = min(rows, key=lambda r: r["ece_binned_15"])
            best_naive = min(rows, key=lambda r: r["ece_naive"])
            t_star = float(best_binned["T"])
            t_train = primary.get("temperature_train") or 1.0

            p_train = softmax_t(logits, float(t_train))
            p_star = softmax_t(logits, t_star)
            at_train = {
                "T": float(t_train),
                "ece_naive": ece_naive(p_train, labels),
                "ece_binned_15": ece_binned(p_train, labels, n_bins=N_BINS),
                "top1": float((p_train.argmax(1) == labels).mean()),
                "mean_conf": float(p_train.max(1).mean()),
            }
            at_star = {
                "T": t_star,
                "ece_naive": ece_naive(p_star, labels),
                "ece_binned_15": ece_binned(p_star, labels, n_bins=N_BINS),
                "top1": float((p_star.argmax(1) == labels).mean()),
                "mean_conf": float(p_star.max(1).mean()),
            }
            top1_star = at_star["top1"]
            os_rec = recommend_open_set(p_star, labels)
            os_stats = open_set_stats(
                p_star,
                labels,
                float(os_rec["conf_thr"]),
                float(os_rec["margin_thr"]),
                float(os_rec["entropy_thr"]),
            )
            status = "measured_ok"

            # honesty: if naive worsens at binned T*, flag it
            if (
                at_train.get("ece_naive") is not None
                and at_star.get("ece_naive") is not None
                and at_star["ece_naive"] > at_train["ece_naive"] + 1e-9
            ):
                gaps.append("posthoc_T_star_worsens_naive_ece_vs_train_T")

    loop_name = f"loop_iter_{iter_id}_{FRICTION_SLUG}_{date_slug}"
    t_train_pub = primary.get("temperature_train")
    ece_pub = primary.get("primary_value")
    ece_post_binned = (best_binned or {}).get("ece_binned_15")
    ece_post_naive = (at_star or {}).get("ece_naive")

    # Band on PRIMARY only (serve guidance)
    band_primary = "unknown"
    if ece_pub is not None:
        if ece_pub < 0.05:
            band_primary = "good"
        elif ece_pub < 0.12:
            band_primary = "moderate"
        else:
            band_primary = "high"

    grid_best_5 = sorted(rows, key=lambda r: r["ece_binned_15"])[:5] if rows else []

    report: dict[str, Any] = {
        "loop_iter_id": iter_id,
        "slug": FRICTION_SLUG,
        "friction": "ECE dual honesty + posthoc temperature grid (lab-only sidecar)",
        "artifact_stem": loop_name,
        "generated_at": generated_at,
        "metrics_label": "[MEASURED]",
        "status": status,
        "product_unlock": False,
        "can_auto_unlock": False,
        "forage_permission": False,
        "consumption_permission": False,
        "policy": POLICY,
        "lab_only": True,
        "kaggle_push": False,
        "eval_protocol": metrics.get("eval_protocol")
        or (ssot.get("eval_protocol") if isinstance(ssot, dict) else None)
        or "source_holdout_e20",
        "provenance": {
            "checkpoint": _repo_rel(models) or str(models),
            "predictions": _repo_rel(models / "test_predictions.npz"),
            "metrics": _repo_rel(models / "metrics.json"),
            "ssot_baseline": _repo_rel(SSOT_PATH),
            "version": metrics.get("version")
            or (ssot.get("version") if isinstance(ssot, dict) else None),
            "train_domain": metrics.get("train_domain")
            or (ssot.get("train_domain") if isinstance(ssot, dict) else None),
            "test_domain": metrics.get("test_domain")
            or (ssot.get("test_domain") if isinstance(ssot, dict) else None),
        },
        "dual_ece": {
            "primary": primary.get("primary"),
            "primary_value": ece_pub,
            "primary_source": primary.get("primary_source"),
            "claim_train_published": primary.get("claim_train_published"),
            "definition_primary": primary.get("definition_primary"),
            "band_primary": band_primary,
            "temperature_train": t_train_pub,
            "posthoc_separate": True,
            "posthoc_lab_only": True,
            "posthoc_must_not_replace_primary": True,
            "posthoc_T_star": t_star,
            "posthoc_objective": "min 15-bin reliability ECE on same holdout logits (optimistic)",
            "posthoc_ece_binned_15": ece_post_binned,
            "posthoc_ece_naive_at_T_star": ece_post_naive,
            "definition_posthoc_objective": "ece_binned_15",
            "note": (
                "Primary ECE is train-published only. Posthoc T* search is lab-only and "
                "must not replace primary in serve or unlock gates. Binned ECE improvement "
                "does not imply naive ECE improvement."
            ),
        },
        "recomputed": {
            "at_train_T": at_train,
            "at_posthoc_T_star": at_star,
            "stored_probs_ece": stored_ece if status == "measured_ok" else {},
            "top1_unchanged": (
                abs(float(at_train.get("top1") or 0) - float(at_star.get("top1") or 0)) < 1e-12
                if at_train and at_star
                else None
            ),
        },
        "temperature": {
            "train_published": t_train_pub,
            "posthoc_best_binned": t_star,
            "posthoc_best_naive_T": (best_naive or {}).get("T"),
            "posthoc_best_naive_ece": (best_naive or {}).get("ece_naive"),
        },
        "open_set_lab_sidecar": {
            **os_rec,
            **{f"stats_{k}": v for k, v in os_stats.items()},
            "note": "Lab thr fit on softmax(logits/T*); NOT auto-served",
        },
        "grid_best_5_by_binned_ece": grid_best_5,
        "kernel_metrics_cited": {
            "test_ece": _f(metrics.get("test_ece")),
            "test_ece_train_published": _f(metrics.get("test_ece_train_published")),
            "test_ece_posthoc": _f(metrics.get("test_ece_posthoc")),
            "temperature": _f(metrics.get("temperature")),
            "temperature_train": _f(metrics.get("temperature_train")),
            "temperature_posthoc": _f(metrics.get("temperature_posthoc")),
            "test_map_at_3": _f(metrics.get("test_map_at_3")),
            "safety_recall_deadly_at_3": _f(
                metrics.get("safety_recall_deadly_at_3") or metrics.get("safety_recall_deadly")
            ),
            "version": metrics.get("version"),
            "posthoc_finetune_prior": metrics.get("posthoc_finetune"),
        },
        "guidance": {
            "show_confidence": band_primary == "good",
            "deemphasize_confidence": band_primary != "good",
            "prefer_open_set_abstain": True,
            "summary_es": (
                f"ECE primary (train-published)={_fmt(ece_pub)} banda={band_primary}. "
                f"Posthoc lab T*={_fmt(t_star)} ece_binned={_fmt(ece_post_binned)} "
                f"(naive@T*={_fmt(ece_post_naive)}). Nunca permiso de consumo."
            ),
            "summary_en": (
                f"Primary ECE (train-published)={_fmt(ece_pub)} band={band_primary}. "
                f"Posthoc lab T*={_fmt(t_star)} binned_ece={_fmt(ece_post_binned)} "
                f"(naive@T*={_fmt(ece_post_naive)}). Never consumption permission."
            ),
        },
        "residual_actions": [
            "Keep product_unlock=false (orientation only).",
            "Cite primary ECE only for serve / model card / quality-gate advisory.",
            "Never sell posthoc binned ECE as primary confidence reliability.",
            "Prefer open-set reject / needs_review over forced top-1 when ECE residual high.",
            "Optional human-reviewed temp scaler rewrite — not this script default.",
        ],
        "gaps": gaps,
        "honesty": {
            "metrics_from_predictions_and_files_only": True,
            "dual_ece_channels": True,
            "primary_is_train_published_when_provenanced": bool(
                primary.get("claim_train_published")
            ),
            "posthoc_not_primary": True,
            "product_unlock_forced_false": True,
            "no_invented_metrics": True,
            "definitions_labeled": True,
        },
        "artifacts": {
            "report_json": f"{loop_name}.json",
            "report_md": f"{loop_name}.md",
            "latest_json": "loop_posthoc_finetune_latest.json",
            "latest_md": "loop_posthoc_finetune_latest.md",
            "open_set_posthoc_sidecar": "open_set_thresholds_posthoc.json",
        },
        "note": (
            "Lab posthoc T + open-set thr fit only. MAP@3/deadly ranking unchanged under "
            "scalar T. Never forage. product_unlock=false."
        ),
    }
    # silence unused if blocked early
    _ = top1_star
    return report


def build_open_set_posthoc_payload(report: dict[str, Any]) -> dict[str, Any]:
    dual = report.get("dual_ece") or {}
    os_lab = report.get("open_set_lab_sidecar") or {}
    rec = report.get("recomputed") or {}
    at_star = rec.get("at_posthoc_T_star") or {}
    at_train = rec.get("at_train_T") or {}
    return {
        "calibrated_threshold": os_lab.get("conf_thr"),
        "calibrated_margin": os_lab.get("margin_thr"),
        "calibrated_entropy": os_lab.get("entropy_thr"),
        "status": "calibrated_e20_posthoc_finetune",
        "lab_only": True,
        "holdout_fit": True,
        "calibration_set": "e20_gbif_test_posthoc",
        "source_experiment": (report.get("provenance") or {}).get("version"),
        "protocol": report.get("eval_protocol"),
        "temperature_posthoc": dual.get("posthoc_T_star"),
        "temperature_train_published": dual.get("temperature_train"),
        "predictions_dir": (report.get("provenance") or {}).get("checkpoint"),
        "holdout_stats": {
            "reject_rate": os_lab.get("stats_reject_rate"),
            "acc_keep": os_lab.get("stats_acc_keep"),
            "n": os_lab.get("stats_n"),
            "top1_accuracy_all": os_lab.get("stats_top1_all"),
            "entropy_thr": os_lab.get("entropy_thr"),
            "ece_binned_at_posthoc_T": dual.get("posthoc_ece_binned_15"),
            "ece_naive_at_posthoc_T": dual.get("posthoc_ece_naive_at_T_star"),
            "ece_naive_at_train_T": at_train.get("ece_naive"),
            "ece_binned_at_train_T": at_train.get("ece_binned_15"),
            "ece_primary_train_published": dual.get("primary_value"),
        },
        "product_unlock": False,
        "can_auto_unlock": False,
        "forage_permission": False,
        "consumption_permission": False,
        "policy": POLICY,
        "generated": report.get("generated_at"),
        "note": (
            f"LAB-ONLY post-hoc: T={dual.get('posthoc_T_star')} "
            f"(train T={dual.get('temperature_train')}). "
            f"Primary ECE train-published={dual.get('primary_value')}; "
            f"posthoc binned={dual.get('posthoc_ece_binned_15')} "
            f"naive@T*={dual.get('posthoc_ece_naive_at_T_star')}. "
            "Not independent field calibration. Never consumption permission."
        ),
        "top1_at_posthoc_T": at_star.get("top1"),
    }


def render_md(report: dict[str, Any]) -> str:
    d = report.get("dual_ece") or {}
    t = report.get("temperature") or {}
    r = report.get("recomputed") or {}
    at_tr = r.get("at_train_T") or {}
    at_st = r.get("at_posthoc_T_star") or {}
    k = report.get("kernel_metrics_cited") or {}
    os_lab = report.get("open_set_lab_sidecar") or {}
    prov = report.get("provenance") or {}
    lines = [
        f"# Loop iter {report.get('loop_iter_id')} — ECE dual honesty (posthoc lab)",
        "",
        f"**Generated:** `{report.get('generated_at')}`  ",
        f"**Status:** `{report.get('status')}`  ",
        f"**Artifact:** `{report.get('artifact_stem')}`  ",
        f"**Policy:** `{report.get('policy')}`  ",
        f"**product_unlock:** `{report.get('product_unlock')}` (forced false)  ",
        f"**Lab only:** `{report.get('lab_only')}` · **kaggle_push:** `{report.get('kaggle_push')}`",
        "",
        "> Cite JSON for PR bodies. Full-precision [MEASURED] only. "
        "Primary ECE ≠ posthoc.",
        "",
        "## Provenance",
        "",
        f"- checkpoint: `{prov.get('checkpoint')}`",
        f"- version: `{prov.get('version')}`",
        f"- eval_protocol: `{report.get('eval_protocol')}`",
        f"- train: `{prov.get('train_domain')}` · test: `{prov.get('test_domain')}`",
        "",
        "## Dual ECE honesty",
        "",
        "| Channel | Value | Definition / notes |",
        "|---------|------:|--------------------|",
        f"| **PRIMARY train-published** | {_fmt(d.get('primary_value'))} | "
        f"`{d.get('primary_source')}` · claim=`{d.get('claim_train_published')}` · "
        f"band=`{d.get('band_primary')}` |",
        f"| Primary definition | — | {d.get('definition_primary')} |",
        f"| temperature_train | {_fmt(d.get('temperature_train'))} | metrics train-published T |",
        f"| POSTHOC T* (lab) | {_fmt(d.get('posthoc_T_star'))} | min 15-bin ECE on holdout |",
        f"| posthoc ece_binned_15 @T* | {_fmt(d.get('posthoc_ece_binned_15'))} | objective only |",
        f"| posthoc ece_naive @T* | {_fmt(d.get('posthoc_ece_naive_at_T_star'))} | "
        "often **worse** than primary naive |",
        "",
        f"Note: {d.get('note')}",
        "",
        "## Recomputed at train T vs posthoc T*",
        "",
        "| | T | ece_naive | ece_binned_15 | top1 | mean_conf |",
        "|-|--:|----------:|--------------:|-----:|----------:|",
        f"| train | {_fmt(at_tr.get('T'))} | {_fmt(at_tr.get('ece_naive'))} | "
        f"{_fmt(at_tr.get('ece_binned_15'))} | {_fmt(at_tr.get('top1'))} | "
        f"{_fmt(at_tr.get('mean_conf'))} |",
        f"| posthoc T* | {_fmt(at_st.get('T'))} | {_fmt(at_st.get('ece_naive'))} | "
        f"{_fmt(at_st.get('ece_binned_15'))} | {_fmt(at_st.get('top1'))} | "
        f"{_fmt(at_st.get('mean_conf'))} |",
        "",
        f"top1_unchanged under scalar T: `{r.get('top1_unchanged')}`",
        "",
        "## Kernel metrics.json (cited)",
        "",
        f"- test_ece: `{_fmt(k.get('test_ece'))}`",
        f"- test_ece_train_published: `{_fmt(k.get('test_ece_train_published'))}`",
        f"- test_ece_posthoc (prior sidecar): `{_fmt(k.get('test_ece_posthoc'))}`",
        f"- temperature / train / posthoc: `{_fmt(k.get('temperature'))}` / "
        f"`{_fmt(k.get('temperature_train'))}` / `{_fmt(k.get('temperature_posthoc'))}`",
        f"- MAP@3: `{_fmt(k.get('test_map_at_3'))}` · deadly@3: "
        f"`{_fmt(k.get('safety_recall_deadly_at_3'))}`",
        "",
        "## Open-set lab sidecar (NOT serve)",
        "",
        f"- conf={_fmt(os_lab.get('conf_thr'))} margin={_fmt(os_lab.get('margin_thr'))} "
        f"entropy={_fmt(os_lab.get('entropy_thr'))}",
        f"- reject_rate={_fmt(os_lab.get('stats_reject_rate'))} "
        f"acc_keep={_fmt(os_lab.get('stats_acc_keep'))}",
        "",
        "## Grid best 5 by binned ECE",
        "",
        "| T | ece_binned_15 | ece_naive | top1 |",
        "|--:|--------------:|----------:|-----:|",
    ]
    for row in report.get("grid_best_5_by_binned_ece") or []:
        lines.append(
            f"| {_fmt(row.get('T'))} | {_fmt(row.get('ece_binned_15'))} | "
            f"{_fmt(row.get('ece_naive'))} | {_fmt(row.get('top1'))} |"
        )
    gaps = report.get("gaps") or []
    lines += [
        "",
        "## Gaps",
        "",
        f"`{', '.join(gaps) if gaps else 'none'}`",
        "",
        "## Never",
        "",
        "- product_unlock=true",
        "- sell posthoc ECE as primary",
        "- auto-rewrite serve open_set_thresholds.json",
        "- forage / consumption permission",
        "- invent metrics",
        "",
        "---",
        "",
        "_Orientation only · never consumption · product_unlock=false_",
        "",
    ]
    return "\n".join(lines)


def write_artifacts(
    report: dict[str, Any],
    out_dir: Path,
    *,
    write_open_set_sidecar: bool = True,
) -> dict[str, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = report["artifact_stem"]
    paths: dict[str, Path] = {}

    jp = out_dir / f"{stem}.json"
    mp = out_dir / f"{stem}.md"
    jp.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    mp.write_text(render_md(report), encoding="utf-8")
    paths["json"] = jp
    paths["md"] = mp

    latest_j = out_dir / "loop_posthoc_finetune_latest.json"
    latest_m = out_dir / "loop_posthoc_finetune_latest.md"
    latest_j.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    latest_m.write_text(render_md(report), encoding="utf-8")
    paths["latest_json"] = latest_j
    paths["latest_md"] = latest_m

    if write_open_set_sidecar and report.get("status") == "measured_ok":
        osp = out_dir / "open_set_thresholds_posthoc.json"
        payload = build_open_set_posthoc_payload(report)
        osp.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        paths["open_set_posthoc"] = osp

    return paths


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--models-dir", type=Path, default=None)
    ap.add_argument("--iter-id", type=int, default=DEFAULT_ITER_ID)
    ap.add_argument("--date", type=str, default=None, help="YYYY-MM-DD (default: UTC today)")
    ap.add_argument(
        "--output-dir",
        type=Path,
        default=REPORT_DIR,
        help="Report directory (default: eval/reports/ml_experiments)",
    )
    ap.add_argument(
        "--no-open-set-sidecar",
        action="store_true",
        help="Skip writing open_set_thresholds_posthoc.json",
    )
    args = ap.parse_args()

    models = resolve_models_dir(args.models_dir)
    date_slug = args.date or _today()
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    if models is None:
        gap = {
            "loop_iter_id": args.iter_id,
            "slug": FRICTION_SLUG,
            "artifact_stem": f"loop_iter_{args.iter_id}_{FRICTION_SLUG}_{date_slug}",
            "generated_at": _utc_now(),
            "status": "blocked_on_gap",
            "gaps": ["models_dir_not_found"],
            "product_unlock": False,
            "can_auto_unlock": False,
            "forage_permission": False,
            "consumption_permission": False,
            "policy": POLICY,
            "metrics_label": "[MEASURED]",
            "dual_ece": {
                "primary": "missing",
                "primary_value": None,
                "posthoc_separate": True,
                "posthoc_must_not_replace_primary": True,
            },
            "note": "Set --models-dir or VISIONSETIL_MODELS_DIR to E20 models with logits npz",
        }
        paths = write_artifacts(gap, out_dir, write_open_set_sidecar=False)
        print(
            json.dumps(
                {
                    "status": gap["status"],
                    "product_unlock": False,
                    "paths": {k: str(v) for k, v in paths.items()},
                },
                indent=2,
            )
        )
        return 0

    report = build_report(models, iter_id=args.iter_id, date_slug=date_slug)
    paths = write_artifacts(
        report,
        out_dir,
        write_open_set_sidecar=not args.no_open_set_sidecar,
    )
    dual = report.get("dual_ece") or {}
    print(
        json.dumps(
            {
                "status": report.get("status"),
                "artifact_stem": report.get("artifact_stem"),
                "generated_at": report.get("generated_at"),
                "primary_ece": dual.get("primary_value"),
                "primary_label": dual.get("primary"),
                "claim_train_published": dual.get("claim_train_published"),
                "posthoc_T_star": dual.get("posthoc_T_star"),
                "posthoc_ece_binned_15": dual.get("posthoc_ece_binned_15"),
                "posthoc_ece_naive_at_T_star": dual.get("posthoc_ece_naive_at_T_star"),
                "product_unlock": False,
                "paths": {k: str(v) for k, v in paths.items()},
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
