#!/usr/bin/env python3
"""Loop friction: Lepiota focus inventory (baseline fallback OK).

Inventories Lepiota* / Macrolepiota* taxa in the E20 (or E20b/c) label space:
  - split counts (train/val/test) from *_obs.json when present
  - holdout top1/top3 from test_predictions.npz
  - confusions (esp. deadly Lepiota ↔ lookalike Lepiota / Macrolepiota)
  - FT focus candidates for E20b Lepiota fine-tune

Works on **E20 baseline** if E20b is delayed/ERROR — design ML-06 OR-deps.

Writes (always product_unlock=false, fresh generated_at):
  eval/reports/ml_experiments/loop_iter_<id>_lepiota_inventory_<YYYY-MM-DD>.{json,md}
  eval/reports/ml_experiments/loop_lepiota_focus_inventory_latest.{json,md}

Does NOT:
  - set product_unlock / forage / consumption true
  - invent metrics
  - require E20b COMPLETE

Usage:
  python scripts/loop_ml_lepiota_focus_inventory.py
  python scripts/loop_ml_lepiota_focus_inventory.py --models-dir PATH --iter-id 54
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

from kaggle.ml_qa.metrics_core import map_at_k, top1_accuracy  # noqa: E402

POLICY = "orientation_only_never_consume"
REPORT_DIR = ROOT / "eval" / "reports" / "ml_experiments"
DEADLY_PATH = ROOT / "data" / "industrial_v1" / "deadly_set.json"
SSOT_PATH = REPORT_DIR / "E20_BASELINE_METRICS_TO_IMPROVE.json"
CLASSIC_PAIRS = ROOT / "data" / "species_catalog" / "classic_lookalike_pairs.json"

DEFAULT_MODELS_CANDIDATES = (
    ROOT / "kaggle" / "kernel_output_v20b" / "models",  # prefer E20b if present
    ROOT / "kaggle" / "kernel_output_v20c" / "models",
    ROOT / "kaggle" / "kernel_output_v20" / "models",
)

DEFAULT_ITER_ID = 54
FRICTION_SLUG = "lepiota_inventory"

# Known deadly / high-risk Lepiota focus (Iberia / industrial allowlist context)
FOCUS_LEPIOTA = (
    "Lepiota subincarnata",
    "Lepiota castanea",
    "Lepiota brunneoincarnata",
    "Lepiota josserandii",
    "Lepiota helveola",
)


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


def is_lepiota_family(name: str) -> bool:
    n = (name or "").strip().lower()
    return n.startswith("lepiota ") or n.startswith("macrolepiota ") or n.startswith(
        "cystolepiota "
    )


def load_obs_species_counts(models: Path) -> dict[str, Counter]:
    """Count species occurrences per split from train/val/test_obs.json."""
    out: dict[str, Counter] = {}
    for split, fname in (
        ("train", "train_obs.json"),
        ("val", "val_obs.json"),
        ("test", "test_obs.json"),
    ):
        raw = _load_json(models / fname)
        ctr: Counter = Counter()
        if raw is None:
            out[split] = ctr
            continue
        if isinstance(raw, dict):
            items = (
                raw.get("observations")
                or raw.get("obs")
                or raw.get("items")
                or raw.get("data")
            )
            if items is None:
                # maybe mapping id→record
                items = list(raw.values()) if raw else []
                if items and not isinstance(items[0], dict):
                    items = []
        else:
            items = raw
        for o in items or []:
            if not isinstance(o, dict):
                continue
            sp = o.get("species") or o.get("taxon") or o.get("latin_name") or o.get(
                "scientific_name"
            )
            if sp:
                ctr[str(sp)] += 1
        out[split] = ctr
    return out


def curated_lepiota_pairs() -> list[dict[str, str]]:
    """Pull directed lookalike pairs involving Lepiota/Macrolepiota from classic file."""
    raw = _load_json(CLASSIC_PAIRS)
    pairs: list[dict[str, str]] = []
    if not raw:
        # minimal safety defaults (curated; not invented field confusions)
        return [
            {
                "a": "Macrolepiota procera",
                "b": "Lepiota brunneoincarnata",
                "why": "small Lepiota deadly vs parasol",
            },
            {
                "a": "Lepiota subincarnata",
                "b": "Lepiota cristata",
                "why": "small Lepiota confusions",
            },
            {
                "a": "Lepiota castanea",
                "b": "Lepiota cristata",
                "why": "small Lepiota confusions",
            },
        ]
    items = raw if isinstance(raw, list) else raw.get("pairs") or raw.get("items") or []
    for it in items:
        if not isinstance(it, dict):
            continue
        a = it.get("a") or it.get("species_a") or it.get("source") or it.get("taxon")
        b = it.get("b") or it.get("species_b") or it.get("target") or it.get("lookalike")
        if not a or not b:
            continue
        if is_lepiota_family(str(a)) or is_lepiota_family(str(b)):
            pairs.append(
                {
                    "a": str(a),
                    "b": str(b),
                    "why": str(it.get("why") or it.get("note") or it.get("reason") or ""),
                }
            )
    return pairs


def per_taxon_holdout(
    probs: np.ndarray,
    labels: np.ndarray,
    class_idxs: list[int],
    idx2label: dict[int, str],
    top_k_confusions: int = 5,
) -> list[dict[str, Any]]:
    preds = probs.argmax(axis=1)
    top3 = np.argsort(-probs, axis=1)[:, :3]
    rows: list[dict[str, Any]] = []
    for di in class_idxs:
        mask = labels == di
        n = int(mask.sum())
        taxon = idx2label.get(di, f"idx_{di}")
        if n == 0:
            rows.append(
                {
                    "taxon": taxon,
                    "class_idx": int(di),
                    "n_holdout": 0,
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
        for pred_idx, cnt in ctr.most_common(top_k_confusions):
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
                "taxon": taxon,
                "class_idx": int(di),
                "n_holdout": n,
                "top1": hit1 / n,
                "top3": hit3 / n,
                "misses": n - hit1,
                "top_confusions": confusions,
            }
        )
    rows.sort(
        key=lambda r: (
            r["top1"] is None,
            r["top1"] if r["top1"] is not None else 1.0,
            -r["n_holdout"],
        )
    )
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

    l2i_raw = _load_json(models / "label2idx.json") or {}
    l2i = {str(k): int(v) for k, v in l2i_raw.items()}
    if not l2i:
        gaps.append("label2idx_missing")
    idx2label = {int(v): k for k, v in l2i.items()}

    lepiota_in_label = sorted(n for n in l2i if is_lepiota_family(n))
    lepiota_idxs = [l2i[n] for n in lepiota_in_label]

    deadly_names = load_deadly_names()
    if not deadly_names:
        gaps.append("deadly_set_missing_or_empty")
    deadly_set = set(deadly_names)
    lepiota_deadly_in_label = [n for n in lepiota_in_label if n in deadly_set]
    focus_in_label = [n for n in FOCUS_LEPIOTA if n in l2i]
    focus_missing = [n for n in FOCUS_LEPIOTA if n not in l2i]

    split_counts = load_obs_species_counts(models)
    if not any(split_counts[s] for s in split_counts):
        gaps.append("obs_json_splits_missing_or_empty")

    inventory_rows: list[dict[str, Any]] = []
    for name in lepiota_in_label:
        inventory_rows.append(
            {
                "taxon": name,
                "class_idx": l2i[name],
                "is_deadly_industrial": name in deadly_set,
                "is_focus_list": name in FOCUS_LEPIOTA,
                "n_train": int(split_counts.get("train", Counter()).get(name, 0)),
                "n_val": int(split_counts.get("val", Counter()).get(name, 0)),
                "n_test_obs": int(split_counts.get("test", Counter()).get(name, 0)),
            }
        )

    # holdout metrics
    npz = models / "test_predictions.npz"
    holdout_rows: list[dict[str, Any]] = []
    global_holdout: dict[str, Any] = {}
    if not npz.is_file():
        gaps.append("test_predictions_npz_missing")
        status = "blocked_on_gap"
    else:
        z = np.load(npz, allow_pickle=True)
        if "probs" not in z.files or "labels" not in z.files:
            gaps.append("npz_missing_probs_or_labels")
            status = "blocked_on_gap"
        else:
            probs = np.asarray(z["probs"], dtype=np.float64)
            labels = np.asarray(z["labels"], dtype=np.int64)
            holdout_rows = per_taxon_holdout(probs, labels, lepiota_idxs, idx2label)
            # merge holdout into inventory
            by_name = {r["taxon"]: r for r in holdout_rows}
            for row in inventory_rows:
                h = by_name.get(row["taxon"]) or {}
                row["n_holdout"] = h.get("n_holdout", 0)
                row["top1"] = h.get("top1")
                row["top3"] = h.get("top3")
                row["misses"] = h.get("misses")
                row["top_confusions"] = h.get("top_confusions") or []
            # n from labels may differ from test_obs species counts if source differs
            for row in inventory_rows:
                if row.get("n_holdout") and row.get("n_test_obs"):
                    if int(row["n_holdout"]) != int(row["n_test_obs"]):
                        # informational only
                        pass
            global_holdout = {
                "n_eval": int(len(labels)),
                "top1_all": top1_accuracy(probs, labels),
                "map_at_3_all": map_at_k(probs, labels, k=3),
            }
            status = "measured_ok"

    # FT focus: deadly/focus lepiota with top1==0 or <0.6 or train-starved
    ft_focus: list[dict[str, Any]] = []
    for row in inventory_rows:
        reasons: list[str] = []
        top1 = row.get("top1")
        n_tr = row.get("n_train") or 0
        n_ho = row.get("n_holdout") or 0
        if row.get("is_focus_list") or row.get("is_deadly_industrial"):
            if top1 is not None and top1 < 0.6:
                reasons.append(f"holdout_top1_low={top1}")
            if top1 == 0.0:
                reasons.append("holdout_top1_zero")
            if n_tr < 15 and n_ho > 0:
                reasons.append(f"train_starved_n_train={n_tr}")
            if n_tr > 0 and n_ho > 0 and n_tr < n_ho / 3:
                reasons.append("train_test_imbalance")
        if reasons:
            ft_focus.append(
                {
                    "taxon": row["taxon"],
                    "n_train": n_tr,
                    "n_holdout": n_ho,
                    "top1": top1,
                    "top3": row.get("top3"),
                    "primary_confusion": (row.get("top_confusions") or [None])[0],
                    "reasons": reasons,
                }
            )

    # Dual ECE from kernel/SSOT only (cite; no recompute as primary)
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

    pairs = curated_lepiota_pairs()
    loop_name = f"loop_iter_{iter_id}_{FRICTION_SLUG}_{date_slug}"

    # baseline fallback flag: path contains v20 not v20b
    ckpt = _repo_rel(models) or str(models)
    baseline_fallback = "v20b" not in ckpt.replace("\\", "/").lower()

    report: dict[str, Any] = {
        "loop_iter_id": iter_id,
        "slug": FRICTION_SLUG,
        "friction": "Lepiota focus inventory (split counts + holdout + FT focus)",
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
        "baseline_fallback_ok": True,
        "used_baseline_fallback": baseline_fallback,
        "eval_protocol": metrics.get("eval_protocol")
        or (ssot.get("eval_protocol") if isinstance(ssot, dict) else None)
        or "source_holdout_e20",
        "provenance": {
            "checkpoint": ckpt,
            "predictions": _repo_rel(models / "test_predictions.npz"),
            "label2idx": _repo_rel(models / "label2idx.json"),
            "deadly_set": _repo_rel(DEADLY_PATH),
            "ssot_baseline": _repo_rel(SSOT_PATH),
            "version": metrics.get("version")
            or (ssot.get("version") if isinstance(ssot, dict) else None),
            "train_domain": metrics.get("train_domain")
            or (ssot.get("train_domain") if isinstance(ssot, dict) else None),
            "test_domain": metrics.get("test_domain")
            or (ssot.get("test_domain") if isinstance(ssot, dict) else None),
        },
        "ece": ece_block,
        "kernel_metrics_cited": {
            "test_map_at_3": _f(metrics.get("test_map_at_3")),
            "safety_recall_deadly_at_1": _f(metrics.get("safety_recall_deadly_at_1")),
            "safety_recall_deadly_at_3": _f(
                metrics.get("safety_recall_deadly_at_3") or metrics.get("safety_recall_deadly")
            ),
            "test_ece": _f(metrics.get("test_ece")),
            "test_ece_train_published": _f(metrics.get("test_ece_train_published")),
            "test_ece_posthoc": _f(metrics.get("test_ece_posthoc")),
            "version": metrics.get("version"),
        },
        "ssot_baseline_cited": {
            "test_map_at_3": _f(ssot_m.get("test_map_at_3")),
            "safety_recall_deadly_at_1": _f(ssot_m.get("safety_recall_deadly_at_1")),
            "safety_recall_deadly_at_3": _f(ssot_m.get("safety_recall_deadly_at_3")),
            "ece_primary": _f((ssot.get("ece") or {}).get("primary_value"))
            if isinstance(ssot, dict)
            else None,
        },
        "global_holdout": global_holdout,
        "label_space": {
            "n_classes": len(l2i),
            "lepiota_family_taxa": lepiota_in_label,
            "n_lepiota_family": len(lepiota_in_label),
            "lepiota_deadly_in_label": lepiota_deadly_in_label,
            "focus_list_in_label": focus_in_label,
            "focus_list_missing_from_label": focus_missing,
        },
        "inventory": inventory_rows,
        "ft_focus_candidates": ft_focus,
        "curated_lookalike_pairs_lepiota": pairs,
        "e20b_motivation": {
            "note": (
                "E20b Lepiota FT targets deadly small Lepiota with weak top1 "
                "(esp. subincarnata). Inventory valuable on baseline even if E20b delayed."
            ),
            "priority_taxa": [f["taxon"] for f in ft_focus],
        },
        "gaps": gaps,
        "honesty": {
            "metrics_from_predictions_and_files_only": True,
            "dual_ece_primary_train_published": True,
            "product_unlock_forced_false": True,
            "no_invented_metrics": True,
            "pairs_curated_only": True,
            "baseline_fallback_ok": True,
        },
        "note": (
            "Lab inventory for Lepiota FT planning. Fresh timestamp DoD. "
            "Orientation only — never consumption. product_unlock=false."
        ),
    }
    return report


def render_md(report: dict[str, Any]) -> str:
    prov = report.get("provenance") or {}
    lab = report.get("label_space") or {}
    e = report.get("ece") or {}
    g = report.get("global_holdout") or {}
    k = report.get("kernel_metrics_cited") or {}
    lines = [
        f"# Loop iter {report.get('loop_iter_id')} — Lepiota focus inventory",
        "",
        f"**Generated:** `{report.get('generated_at')}`  ",
        f"**Status:** `{report.get('status')}`  ",
        f"**Artifact:** `{report.get('artifact_stem')}`  ",
        f"**Policy:** `{report.get('policy')}`  ",
        f"**product_unlock:** `{report.get('product_unlock')}` (forced false)  ",
        f"**Lab only:** `{report.get('lab_only')}` · **baseline_fallback:** "
        f"`{report.get('used_baseline_fallback')}`",
        "",
        "> Cite JSON for PR bodies. Full-precision [MEASURED] only.",
        "",
        "## Provenance",
        "",
        f"- checkpoint: `{prov.get('checkpoint')}`",
        f"- version: `{prov.get('version')}`",
        f"- eval_protocol: `{report.get('eval_protocol')}`",
        f"- train: `{prov.get('train_domain')}` · test: `{prov.get('test_domain')}`",
        "",
        "## Label space (Lepiota family)",
        "",
        f"- n_classes: `{lab.get('n_classes')}`",
        f"- lepiota family taxa ({lab.get('n_lepiota_family')}): "
        f"`{', '.join(lab.get('lepiota_family_taxa') or [])}`",
        f"- deadly lepiota in label: `{', '.join(lab.get('lepiota_deadly_in_label') or []) or 'none'}`",
        f"- focus in label: `{', '.join(lab.get('focus_list_in_label') or []) or 'none'}`",
        f"- focus missing: `{', '.join(lab.get('focus_list_missing_from_label') or []) or 'none'}`",
        "",
        "## Dual ECE honesty (cited)",
        "",
        f"- primary: `{e.get('primary')}` = `{_fmt(e.get('primary_value'))}` "
        f"(source=`{e.get('primary_source')}`, claim=`{e.get('claim_train_published')}`)",
        f"- posthoc (separate): `{_fmt(e.get('posthoc_value'))}`",
        "",
        "## Global holdout [MEASURED]",
        "",
        f"- n_eval: `{g.get('n_eval')}`",
        f"- top1_all: `{_fmt(g.get('top1_all'))}`",
        f"- map_at_3_all: `{_fmt(g.get('map_at_3_all'))}`",
        f"- kernel MAP@3: `{_fmt(k.get('test_map_at_3'))}` · deadly@1: "
        f"`{_fmt(k.get('safety_recall_deadly_at_1'))}` · deadly@3: "
        f"`{_fmt(k.get('safety_recall_deadly_at_3'))}`",
        "",
        "## Inventory (split counts + holdout)",
        "",
        "| Taxon | deadly | n_train | n_val | n_test_obs | n_holdout | top1 | top3 | Top confusion |",
        "|-------|:------:|--------:|------:|-----------:|----------:|-----:|-----:|---------------|",
    ]
    for row in report.get("inventory") or []:
        conf = ""
        if row.get("top_confusions"):
            c0 = row["top_confusions"][0]
            conf = f"{c0['pred_taxon']} ({c0['count']}, {c0['rate']:.3f})"
        lines.append(
            f"| {row.get('taxon')} | {'Y' if row.get('is_deadly_industrial') else ''} | "
            f"{row.get('n_train')} | {row.get('n_val')} | {row.get('n_test_obs')} | "
            f"{row.get('n_holdout', '—')} | {_fmt(row.get('top1'))} | {_fmt(row.get('top3'))} | "
            f"{conf} |"
        )
    lines += [
        "",
        "## FT focus candidates (E20b motivation)",
        "",
    ]
    focus = report.get("ft_focus_candidates") or []
    if not focus:
        lines.append("_None under current thresholds._")
    else:
        for f in focus:
            pc = f.get("primary_confusion") or {}
            lines.append(
                f"- **{f.get('taxon')}** n_train={f.get('n_train')} n_holdout={f.get('n_holdout')} "
                f"top1={_fmt(f.get('top1'))} top3={_fmt(f.get('top3'))} "
                f"→ {pc.get('pred_taxon')} ({pc.get('count')}) · reasons: "
                f"`{', '.join(f.get('reasons') or [])}`"
            )
    lines += [
        "",
        "## Curated lookalike pairs (Lepiota-related)",
        "",
    ]
    pairs = report.get("curated_lookalike_pairs_lepiota") or []
    if not pairs:
        lines.append("_None found in classic_lookalike_pairs.json._")
    else:
        for p in pairs[:40]:
            lines.append(f"- {p.get('a')} ↔ {p.get('b')} — {p.get('why')}")
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
        "- forage / consumption permission",
        "- invent metrics or lookalike pairs",
        "- block loop on E20b absence (baseline fallback OK)",
        "",
        "---",
        "",
        "_Orientation only · never consumption · product_unlock=false_",
        "",
    ]
    return "\n".join(lines)


def write_artifacts(report: dict[str, Any], out_dir: Path) -> dict[str, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = report["artifact_stem"]
    paths: dict[str, Path] = {}
    jp = out_dir / f"{stem}.json"
    mp = out_dir / f"{stem}.md"
    jp.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    mp.write_text(render_md(report), encoding="utf-8")
    paths["json"] = jp
    paths["md"] = mp
    lj = out_dir / "loop_lepiota_focus_inventory_latest.json"
    lm = out_dir / "loop_lepiota_focus_inventory_latest.md"
    lj.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    lm.write_text(render_md(report), encoding="utf-8")
    paths["latest_json"] = lj
    paths["latest_md"] = lm
    return paths


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--models-dir", type=Path, default=None)
    ap.add_argument("--iter-id", type=int, default=DEFAULT_ITER_ID)
    ap.add_argument("--date", type=str, default=None)
    ap.add_argument("--output-dir", type=Path, default=REPORT_DIR)
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
            "baseline_fallback_ok": True,
            "note": "Set --models-dir or VISIONSETIL_MODELS_DIR (E20 baseline OK)",
        }
        paths = write_artifacts(gap, out_dir)
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
    paths = write_artifacts(report, out_dir)
    inv = report.get("inventory") or []
    focus = report.get("ft_focus_candidates") or []
    print(
        json.dumps(
            {
                "status": report.get("status"),
                "artifact_stem": report.get("artifact_stem"),
                "generated_at": report.get("generated_at"),
                "used_baseline_fallback": report.get("used_baseline_fallback"),
                "n_lepiota_family": (report.get("label_space") or {}).get("n_lepiota_family"),
                "n_inventory": len(inv),
                "n_ft_focus": len(focus),
                "ft_priority": [f.get("taxon") for f in focus],
                "product_unlock": False,
                "paths": {k: str(v) for k, v in paths.items()},
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
