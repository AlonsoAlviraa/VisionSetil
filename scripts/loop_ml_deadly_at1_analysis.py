#!/usr/bin/env python3
"""Loop friction: deadly@1 dual analysis from E20 (or E20b/c) predictions.

Recomputes dual deadly@1 / deadly@3 from test_predictions.npz + industrial
deadly_set + label2idx. Per-taxon breakdown + top confusions for FT focus.

Fresh loop_iter artifact (never counts pre-plan historical iters):
  eval/reports/ml_experiments/loop_iter_<id>_deadly_at1_<YYYY-MM-DD>.{json,md}

Always product_unlock=false. Orientation only — never forage/consumption.
Uses [MEASURED] values only; does not invent metrics.

Models dir resolution:
  1. --models-dir
  2. in-repo kaggle/kernel_output_v20{c,b,}/models
  3. env VISIONSETIL_MODELS_DIR

Usage:
  python scripts/loop_ml_deadly_at1_analysis.py
  python scripts/loop_ml_deadly_at1_analysis.py --models-dir PATH
  python scripts/loop_ml_deadly_at1_analysis.py --iter-id 51
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from kaggle.ml_qa.metrics_core import (  # noqa: E402
    deadly_recall_at_k,
    deadly_top1,
    map_at_k,
    top1_accuracy,
)

POLICY = "orientation_only_never_consume"
REPORT_DIR = ROOT / "eval" / "reports" / "ml_experiments"
DEADLY_PATH = ROOT / "data" / "industrial_v1" / "deadly_set.json"
SSOT_PATH = REPORT_DIR / "E20_BASELINE_METRICS_TO_IMPROVE.json"

DEFAULT_MODELS_CANDIDATES = (
    ROOT / "kaggle" / "kernel_output_v20c" / "models",
    ROOT / "kaggle" / "kernel_output_v20b" / "models",
    ROOT / "kaggle" / "kernel_output_v20" / "models",
)

# Post-plan loop_iter ids start at 51 (anti-historical DoD)
DEFAULT_ITER_ID = 51


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
        if p.is_dir():
            return p
        if (p / "models").is_dir():
            return p / "models"
    return None


def load_deadly_names(path: Path = DEADLY_PATH) -> list[str]:
    data = _load_json(path)
    if data is None:
        return []
    if isinstance(data, list):
        names = data
    else:
        names = data.get("species") or data.get("latin_names") or []
    out: list[str] = []
    for x in names:
        if isinstance(x, dict):
            n = x.get("latin_name") or x.get("name") or x.get("scientific_name")
            if n:
                out.append(str(n))
        elif x:
            out.append(str(x))
    return out


def load_label2idx(models: Path) -> dict[str, int]:
    raw = _load_json(models / "label2idx.json") or {}
    return {str(k): int(v) for k, v in raw.items()}


def load_preds(models: Path) -> tuple[np.ndarray, np.ndarray] | None:
    npz = models / "test_predictions.npz"
    if not npz.is_file():
        return None
    z = np.load(npz, allow_pickle=True)
    if "probs" not in z.files or "labels" not in z.files:
        return None
    return np.asarray(z["probs"]), np.asarray(z["labels"])


def per_deadly_breakdown(
    probs: np.ndarray,
    labels: np.ndarray,
    deadly_idxs: set[int],
    idx2label: dict[int, str],
    top_confusions_k: int = 5,
) -> list[dict[str, Any]]:
    """Per deadly class: n, top1, top3, top wrong preds."""
    rows: list[dict[str, Any]] = []
    preds = probs.argmax(axis=1)
    top3 = np.argsort(-probs, axis=1)[:, :3]

    for di in sorted(deadly_idxs):
        mask = labels == di
        n = int(mask.sum())
        if n == 0:
            rows.append(
                {
                    "taxon": idx2label.get(di, f"idx_{di}"),
                    "class_idx": int(di),
                    "n": 0,
                    "top1": None,
                    "top3": None,
                    "misses": 0,
                    "top_confusions": [],
                }
            )
            continue
        hit1 = int((preds[mask] == di).sum())
        hit3 = int(sum(1 for i in np.where(mask)[0] if di in top3[i]))
        wrong = preds[mask]
        wrong = wrong[wrong != di]
        ctr = Counter(int(x) for x in wrong)
        confusions = []
        for pred_idx, cnt in ctr.most_common(top_confusions_k):
            confusions.append(
                {
                    "pred_taxon": idx2label.get(pred_idx, f"idx_{pred_idx}"),
                    "pred_idx": int(pred_idx),
                    "count": int(cnt),
                    "rate": round(cnt / n, 6),
                }
            )
        rows.append(
            {
                "taxon": idx2label.get(di, f"idx_{di}"),
                "class_idx": int(di),
                "n": n,
                "top1": hit1 / n,
                "top3": hit3 / n,
                "misses": n - hit1,
                "top_confusions": confusions,
            }
        )
    # worst top1 first (None last)
    rows.sort(key=lambda r: (r["top1"] is None, r["top1"] if r["top1"] is not None else 1.0, -r["n"]))
    return rows


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
    ssot_m = (ssot.get("measured") or {}) if isinstance(ssot, dict) else {}

    deadly_names = load_deadly_names()
    if not deadly_names:
        gaps.append("deadly_set_missing_or_empty")

    l2i = load_label2idx(models)
    if not l2i:
        gaps.append("label2idx_missing")

    idx2label = {int(v): k for k, v in l2i.items()}
    deadly_idxs = {int(l2i[n]) for n in deadly_names if n in l2i}
    deadly_not_in_label = [n for n in deadly_names if n not in l2i]
    if deadly_not_in_label:
        gaps.append(f"deadly_taxa_not_in_label_space:{len(deadly_not_in_label)}")

    preds = load_preds(models)
    recomputed: dict[str, Any] = {}
    by_taxon: list[dict[str, Any]] = []
    if preds is None:
        gaps.append("test_predictions_npz_missing")
        status = "blocked_on_gap"
    else:
        probs, labels = preds
        d1, n_d = deadly_top1(probs, labels, deadly_idxs)
        d3, _ = deadly_recall_at_k(probs, labels, deadly_idxs, k=3)
        recomputed = {
            "safety_recall_deadly_at_1": d1,
            "safety_recall_deadly_at_3": d3,
            "n_deadly": n_d,
            "map_at_3": map_at_k(probs, labels, k=3),
            "top1": top1_accuracy(probs, labels),
            "n_eval": int(len(labels)),
            "n_deadly_classes_in_label_space": len(deadly_idxs),
            "deadly_index_source": "industrial_v1/deadly_set.json+label2idx",
        }
        by_taxon = per_deadly_breakdown(probs, labels, deadly_idxs, idx2label)
        status = "measured_ok" if n_d > 0 else "unevaluable_zero_deadly"

    # Kernel metrics keys (cite, do not invent)
    kernel_dual = {
        "safety_recall_deadly_at_1": _f(metrics.get("safety_recall_deadly_at_1")),
        "safety_recall_deadly_at_3": _f(metrics.get("safety_recall_deadly_at_3")),
        "n_deadly_in_test": metrics.get("n_deadly_in_test") or metrics.get("n_deadly_eval"),
        "version": metrics.get("version"),
        "eval_protocol": metrics.get("eval_protocol"),
        "test_domain": metrics.get("test_domain"),
        "train_domain": metrics.get("train_domain"),
    }

    # Worst taxa for FT focus (top1 < 0.5 or top confusions with n>=10)
    ft_focus = [
        {
            "taxon": r["taxon"],
            "n": r["n"],
            "top1": r["top1"],
            "top3": r["top3"],
            "primary_confusion": (r["top_confusions"][0] if r["top_confusions"] else None),
        }
        for r in by_taxon
        if r["n"] and r["top1"] is not None and (r["top1"] < 0.5 or r["misses"] >= 10)
    ]

    # ECE dual honesty from kernel/SSOT only (no recompute as primary claim)
    ece_primary = _f(metrics.get("test_ece_train_published"))
    ece_raw = _f(metrics.get("test_ece"))
    ece_post = _f(metrics.get("test_ece_posthoc"))
    if ece_primary is not None:
        ece_block = {
            "primary": "train_published",
            "primary_value": ece_primary,
            "primary_source": "test_ece_train_published",
            "claim_train_published": True,
            "posthoc_separate": True,
            "posthoc_value": ece_post,
        }
    elif ece_raw is not None:
        ece_block = {
            "primary": "test_ece_unspecified",
            "primary_value": ece_raw,
            "primary_source": "test_ece",
            "claim_train_published": False,
            "posthoc_separate": True,
            "posthoc_value": ece_post,
        }
        gaps.append("ece_primary_provenance_unspecified")
    else:
        ece_block = {
            "primary": "missing",
            "primary_value": None,
            "primary_source": None,
            "claim_train_published": False,
            "posthoc_separate": True,
            "posthoc_value": ece_post,
        }

    loop_name = f"loop_iter_{iter_id}_deadly_at1_{date_slug}"

    report: dict[str, Any] = {
        "loop_iter_id": iter_id,
        "slug": "deadly_at1",
        "friction": "deadly@1 dual analysis + per-taxon confusions",
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
        "eval_protocol": kernel_dual.get("eval_protocol")
        or (ssot.get("eval_protocol") if isinstance(ssot, dict) else None)
        or "source_holdout_e20",
        "provenance": {
            "checkpoint": _repo_rel(models) or str(models),
            "predictions": _repo_rel(models / "test_predictions.npz"),
            "label2idx": _repo_rel(models / "label2idx.json"),
            "deadly_set": _repo_rel(DEADLY_PATH),
            "ssot_baseline": _repo_rel(SSOT_PATH),
            "version": kernel_dual.get("version")
            or (ssot.get("version") if isinstance(ssot, dict) else None),
            "train": kernel_dual.get("train_domain")
            or (ssot.get("train_domain") if isinstance(ssot, dict) else None),
            "test": kernel_dual.get("test_domain")
            or (ssot.get("test_domain") if isinstance(ssot, dict) else None),
        },
        "ece": ece_block,
        "kernel_metrics_cited": kernel_dual,
        "ssot_baseline_cited": {
            "safety_recall_deadly_at_1": _f(ssot_m.get("safety_recall_deadly_at_1")),
            "safety_recall_deadly_at_3": _f(ssot_m.get("safety_recall_deadly_at_3")),
            "n_deadly_in_test": ssot_m.get("n_deadly_in_test"),
            "test_map_at_3": _f(ssot_m.get("test_map_at_3")),
        },
        "recomputed_from_npz": recomputed,
        "dual_deadly": {
            "definition_at_1": "true deadly class is top-1 among deadly-labeled samples (diagnostic)",
            "definition_at_3": "true deadly class in top-3 among deadly-labeled samples (safety recall)",
            "at_1": recomputed.get("safety_recall_deadly_at_1"),
            "at_3": recomputed.get("safety_recall_deadly_at_3"),
            "n_deadly": recomputed.get("n_deadly"),
            "note": "deadly@1 is diagnostic only — product gate uses dual keys + open-set; never 100% claim",
        },
        "deadly_taxa_in_label_space": sorted(
            idx2label[i] for i in deadly_idxs if i in idx2label
        ),
        "deadly_taxa_not_in_label_space": deadly_not_in_label,
        "by_taxon": by_taxon,
        "ft_focus_candidates": ft_focus,
        "gaps": gaps,
        "honesty": {
            "metrics_from_predictions_and_files_only": True,
            "dual_deadly_keys": True,
            "map_is_not_safety": True,
            "product_unlock_forced_false": True,
            "no_invented_metrics": True,
        },
        "ux_data_only": True,
        "note": (
            "Lab friction report for deadly@1. Fresh timestamp DoD. "
            "Orientation only — never consumption permission. product_unlock=false."
        ),
    }
    return report


def render_md(report: dict[str, Any]) -> str:
    d = report.get("dual_deadly") or {}
    r = report.get("recomputed_from_npz") or {}
    k = report.get("kernel_metrics_cited") or {}
    s = report.get("ssot_baseline_cited") or {}
    e = report.get("ece") or {}
    prov = report.get("provenance") or {}
    lines = [
        f"# Loop iter {report.get('loop_iter_id')} — deadly@1 analysis",
        "",
        f"**Generated:** `{report.get('generated_at')}`  ",
        f"**Status:** `{report.get('status')}`  ",
        f"**Artifact:** `{report.get('artifact_stem')}`  ",
        f"**Policy:** `{report.get('policy')}`  ",
        f"**product_unlock:** `{report.get('product_unlock')}` (forced false)  ",
        f"**Lab only:** `{report.get('lab_only')}` · **kaggle_push:** `{report.get('kaggle_push')}`",
        "",
        "> Cite JSON SSOT / this loop_iter JSON for PR bodies. Full-precision [MEASURED] only.",
        "",
        "## Provenance",
        "",
        f"- checkpoint: `{prov.get('checkpoint')}`",
        f"- version: `{prov.get('version')}`",
        f"- eval_protocol: `{report.get('eval_protocol')}`",
        f"- train: `{prov.get('train')}` · test: `{prov.get('test')}`",
        f"- deadly_set: `{prov.get('deadly_set')}`",
        "",
        "## Dual deadly [MEASURED from npz]",
        "",
        "| Metric | Value |",
        "|--------|-------|",
        f"| deadly@1 | {_fmt(d.get('at_1'))} |",
        f"| deadly@3 | {_fmt(d.get('at_3'))} |",
        f"| n_deadly | {_fmt(d.get('n_deadly'))} |",
        f"| MAP@3 (recomputed) | {_fmt(r.get('map_at_3'))} |",
        f"| top1 (recomputed) | {_fmt(r.get('top1'))} |",
        "",
        f"Definition: {d.get('definition_at_1')}",
        "",
        f"Note: {d.get('note')}",
        "",
        "## Kernel metrics.json (cited)",
        "",
        f"- deadly@1: `{_fmt(k.get('safety_recall_deadly_at_1'))}`",
        f"- deadly@3: `{_fmt(k.get('safety_recall_deadly_at_3'))}`",
        f"- n_deadly: `{k.get('n_deadly_in_test')}`",
        "",
        "## E20 SSOT baseline (cited)",
        "",
        f"- deadly@1: `{_fmt(s.get('safety_recall_deadly_at_1'))}`",
        f"- deadly@3: `{_fmt(s.get('safety_recall_deadly_at_3'))}`",
        f"- MAP@3: `{_fmt(s.get('test_map_at_3'))}`",
        "",
        "## Dual ECE honesty",
        "",
        f"- primary: `{e.get('primary')}` = `{_fmt(e.get('primary_value'))}` "
        f"(source=`{e.get('primary_source')}`, claim=`{e.get('claim_train_published')}`)",
        f"- posthoc (separate): `{_fmt(e.get('posthoc_value'))}`",
        "",
        "## Per-taxon deadly breakdown (worst top1 first)",
        "",
        "| Taxon | n | top1 | top3 | Top confusion |",
        "|-------|--:|-----:|-----:|---------------|",
    ]
    for row in report.get("by_taxon") or []:
        conf = ""
        if row.get("top_confusions"):
            c0 = row["top_confusions"][0]
            conf = f"{c0['pred_taxon']} ({c0['count']}, {c0['rate']:.3f})"
        lines.append(
            f"| {row.get('taxon')} | {row.get('n')} | {_fmt(row.get('top1'))} | "
            f"{_fmt(row.get('top3'))} | {conf} |"
        )
    lines += [
        "",
        "## FT focus candidates (top1 < 0.5 or misses ≥ 10)",
        "",
    ]
    focus = report.get("ft_focus_candidates") or []
    if not focus:
        lines.append("_None under current thresholds._")
    else:
        for f in focus:
            pc = f.get("primary_confusion") or {}
            lines.append(
                f"- **{f.get('taxon')}** n={f.get('n')} top1={_fmt(f.get('top1'))} "
                f"top3={_fmt(f.get('top3'))} → confuses as "
                f"{pc.get('pred_taxon')} ({pc.get('count')})"
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
        "- claim deadly@1 = 100%",
        "- forage / consumption permission",
        "- invent metrics",
        "",
        "---",
        "",
        "_Orientation only · never consumption · product_unlock=false_",
        "",
    ]
    return "\n".join(lines)


def _fmt(v: Any) -> str:
    if v is None:
        return "null"
    if isinstance(v, float):
        return repr(v) if v == v else "null"  # NaN check
    return str(v)


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
    args = ap.parse_args()

    models = resolve_models_dir(args.models_dir)
    date_slug = args.date or _today()
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    if models is None:
        gap = {
            "loop_iter_id": args.iter_id,
            "slug": "deadly_at1",
            "generated_at": _utc_now(),
            "status": "blocked_on_gap",
            "gaps": ["models_dir_not_found"],
            "product_unlock": False,
            "can_auto_unlock": False,
            "forage_permission": False,
            "consumption_permission": False,
            "policy": POLICY,
            "metrics_label": "[MEASURED]",
            "note": "Set --models-dir or VISIONSETIL_MODELS_DIR to E20 models with test_predictions.npz",
        }
        stem = f"loop_iter_{args.iter_id}_deadly_at1_{date_slug}"
        jp = out_dir / f"{stem}.json"
        mp = out_dir / f"{stem}.md"
        jp.write_text(json.dumps(gap, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        mp.write_text(
            f"# Loop iter {args.iter_id} — deadly@1 analysis\n\n"
            f"**Status:** blocked_on_gap\n\nModels dir not found.\n",
            encoding="utf-8",
        )
        print(json.dumps({"status": "blocked_on_gap", "json": str(jp)}, indent=2))
        return 0

    report = build_report(models, iter_id=args.iter_id, date_slug=date_slug)
    stem = report["artifact_stem"]
    jp = out_dir / f"{stem}.json"
    mp = out_dir / f"{stem}.md"
    jp.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    mp.write_text(render_md(report), encoding="utf-8")

    # Convenience latest pointers (not a historical-only DoD substitute)
    latest_json = out_dir / "loop_deadly_at1_latest.json"
    latest_md = out_dir / "loop_deadly_at1_latest.md"
    latest_json.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    latest_md.write_text(render_md(report), encoding="utf-8")

    summary = {
        "status": report.get("status"),
        "json": _repo_rel(jp) or str(jp),
        "md": _repo_rel(mp) or str(mp),
        "deadly_at_1": (report.get("dual_deadly") or {}).get("at_1"),
        "deadly_at_3": (report.get("dual_deadly") or {}).get("at_3"),
        "n_deadly": (report.get("dual_deadly") or {}).get("n_deadly"),
        "ft_focus_n": len(report.get("ft_focus_candidates") or []),
        "product_unlock": False,
        "models": _repo_rel(models) or str(models),
    }
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
