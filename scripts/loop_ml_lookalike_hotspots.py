#!/usr/bin/env python3
"""Loop friction: lookalike confusion hotspots from curated pairs + predictions.

Never invents lookalike pairs. Reads:
  - data/species_catalog/species_catalog_v2.json lookalikes
  - data/species_catalog/classic_lookalike_pairs.json
  - optional data/industrial_v1/hard_negative_pairs_e20.json lineage

Among samples of taxon A, measures mate B in top-k (confusion signal).
Ranks hotspots for FT / hard-neg / education UX data only.

Fresh loop_iter artifact:
  eval/reports/ml_experiments/loop_iter_<id>_lookalike_hotspots_<YYYY-MM-DD>.{json,md}

Always product_unlock=false. Orientation only — never forage/consumption.

Models dir resolution:
  1. --models-dir
  2. in-repo kaggle/kernel_output_v20{c,b,}/models
  3. env VISIONSETIL_MODELS_DIR

Usage:
  python scripts/loop_ml_lookalike_hotspots.py
  python scripts/loop_ml_lookalike_hotspots.py --models-dir PATH --k 3
  python scripts/loop_ml_lookalike_hotspots.py --iter-id 52
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

POLICY = "orientation_only_never_consume"
REPORT_DIR = ROOT / "eval" / "reports" / "ml_experiments"
V2 = ROOT / "data" / "species_catalog" / "species_catalog_v2.json"
CLASSIC = ROOT / "data" / "species_catalog" / "classic_lookalike_pairs.json"
HARD_NEG = ROOT / "data" / "industrial_v1" / "hard_negative_pairs_e20.json"
DEADLY_PATH = ROOT / "data" / "industrial_v1" / "deadly_set.json"
SSOT_PATH = REPORT_DIR / "E20_BASELINE_METRICS_TO_IMPROVE.json"

DEFAULT_MODELS_CANDIDATES = (
    ROOT / "kaggle" / "kernel_output_v20c" / "models",
    ROOT / "kaggle" / "kernel_output_v20b" / "models",
    ROOT / "kaggle" / "kernel_output_v20" / "models",
)

DEFAULT_ITER_ID = 52
MIN_N_HOTSPOT = 10
MIN_MATE_RATE_HOTSPOT = 0.05


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


def load_deadly_names() -> set[str]:
    data = _load_json(DEADLY_PATH)
    if data is None:
        return set()
    names = data if isinstance(data, list) else data.get("species") or data.get("latin_names") or []
    out: set[str] = set()
    for x in names:
        if isinstance(x, dict):
            n = x.get("latin_name") or x.get("name") or x.get("scientific_name")
            if n:
                out.add(str(n))
        elif x:
            out.add(str(x))
    return out


def load_curated_pairs() -> tuple[list[tuple[str, str, str]], dict[str, int]]:
    """Return directed pairs (a, b, source) + source counts. Never invents pairs."""
    pairs: list[tuple[str, str, str]] = []
    sources: dict[str, int] = {"catalog_v2": 0, "classic": 0}

    v2 = _load_json(V2)
    if isinstance(v2, dict):
        for rec in v2.get("species") or []:
            a = str(rec.get("scientific_name") or rec.get("latin_name") or "").strip()
            if not a:
                continue
            for lk in rec.get("lookalikes") or []:
                if isinstance(lk, dict):
                    b = str(
                        lk.get("scientific_name")
                        or lk.get("latin_name")
                        or lk.get("name")
                        or ""
                    ).strip()
                else:
                    b = str(lk or "").strip()
                if a and b and a != b:
                    pairs.append((a, b, "catalog_v2"))
                    sources["catalog_v2"] += 1

    classic = _load_json(CLASSIC)
    if isinstance(classic, dict):
        for p in classic.get("pairs") or []:
            taxa = p.get("taxa") or []
            if len(taxa) >= 2:
                a, b = str(taxa[0]).strip(), str(taxa[1]).strip()
                if a and b and a != b:
                    # both directions for education surfaces
                    pairs.append((a, b, "classic"))
                    pairs.append((b, a, "classic"))
                    sources["classic"] += 2

    # Dedupe directed edges keeping first source tag
    seen: set[tuple[str, str]] = set()
    uniq: list[tuple[str, str, str]] = []
    for a, b, src in pairs:
        key = (a, b)
        if key in seen:
            continue
        seen.add(key)
        uniq.append((a, b, src))
    return uniq, sources


def load_hard_neg_lineage() -> dict[str, Any] | None:
    data = _load_json(HARD_NEG)
    if not isinstance(data, dict):
        return None
    return {
        "path": _repo_rel(HARD_NEG),
        "schema_version": data.get("schema_version"),
        "updated": data.get("updated"),
        "boost": data.get("boost"),
        "source_loop_iters": data.get("source_loop_iters"),
        "n_pairs": len(data.get("pairs") or []),
        "pair_ids": [p.get("id") for p in (data.get("pairs") or []) if isinstance(p, dict)],
        "policy": data.get("policy"),
        "product_unlock": False,
    }


def evaluate_pairs(
    probs: np.ndarray,
    labels: np.ndarray,
    label2idx: dict[str, int],
    pairs: list[tuple[str, str, str]],
    k: int,
    deadly: set[str],
) -> dict[str, Any]:
    top_k = int(k)
    by_pair: list[dict[str, Any]] = []
    mate_in_topk = 0
    true_in_topk = 0
    n_eval = 0
    n_pairs_in_space = 0

    for a, b, src in pairs:
        if a not in label2idx:
            continue
        a_idx = label2idx[a]
        mask = labels == a_idx
        if not mask.any():
            continue
        n_pairs_in_space += 1
        b_idx = label2idx.get(b)
        n_a = 0
        mate_hits = 0
        true_hits = 0
        for i in np.where(mask)[0]:
            n_a += 1
            n_eval += 1
            order = np.argsort(-probs[i])[:top_k]
            if a_idx in order:
                true_hits += 1
                true_in_topk += 1
            if b_idx is not None and b_idx in order:
                mate_hits += 1
                mate_in_topk += 1
        mate_rate = mate_hits / n_a if n_a else None
        true_rate = true_hits / n_a if n_a else None
        involves_deadly = a in deadly or b in deadly
        by_pair.append(
            {
                "a": a,
                "b": b,
                "source": src,
                "n": n_a,
                "mate_in_topk": mate_hits,
                "true_in_topk": true_hits,
                "mate_in_topk_rate": mate_rate,
                "true_in_topk_rate": true_rate,
                "mate_in_label_space": b_idx is not None,
                "involves_deadly": involves_deadly,
                "hotspot_score": (mate_rate or 0.0) * n_a if n_a else 0.0,
            }
        )

    # Rank hotspots: high mate confusion * sample support
    by_pair.sort(
        key=lambda r: (
            -(r.get("hotspot_score") or 0.0),
            -(r.get("mate_in_topk_rate") or 0.0),
            -(r.get("n") or 0),
        )
    )

    hotspots = [
        r
        for r in by_pair
        if (r.get("n") or 0) >= MIN_N_HOTSPOT
        and (r.get("mate_in_topk_rate") or 0.0) >= MIN_MATE_RATE_HOTSPOT
        and r.get("mate_in_label_space")
    ]

    deadly_hotspots = [r for r in hotspots if r.get("involves_deadly")]

    return {
        "k": top_k,
        "n_directed_pairs_curated": len(pairs),
        "n_pairs_with_eval_samples": n_pairs_in_space,
        "n_eval_samples": n_eval,
        "true_in_topk_rate": (true_in_topk / n_eval) if n_eval else None,
        "lookalike_mate_in_topk_rate": (mate_in_topk / n_eval) if n_eval else None,
        "note": (
            "mate_in_topk is a confusion signal (not accuracy). "
            "Curated pairs only — never invented. Useful for hard-neg mining + education UX."
        ),
        "by_pair": by_pair,
        "hotspots": hotspots,
        "deadly_hotspots": deadly_hotspots,
        "hotspot_thresholds": {
            "min_n": MIN_N_HOTSPOT,
            "min_mate_in_topk_rate": MIN_MATE_RATE_HOTSPOT,
        },
    }


def suggest_hard_neg_from_hotspots(
    hotspots: list[dict[str, Any]],
    existing: dict[str, Any] | None,
    top_n: int = 8,
) -> list[dict[str, Any]]:
    """UX/lab data: proposed hard-neg pairs from measured hotspots (not auto-applied)."""
    suggestions: list[dict[str, Any]] = []
    existing_ids = set((existing or {}).get("pair_ids") or [])
    seen_undirected: set[frozenset[str]] = set()

    for h in hotspots[: top_n * 2]:
        a, b = h.get("a"), h.get("b")
        if not a or not b:
            continue
        edge = frozenset({a, b})
        if edge in seen_undirected:
            continue
        seen_undirected.add(edge)
        slug = f"{a.split()[-1].lower()}-{b.split()[-1].lower()}"
        suggestions.append(
            {
                "id": slug,
                "taxa": [a, b],
                "why": (
                    f"Measured hotspot: n={h.get('n')} mate@{h.get('source', 'pair')} "
                    f"rate={h.get('mate_in_topk_rate')}; involves_deadly={h.get('involves_deadly')}"
                ),
                "priority": 1 if h.get("involves_deadly") else 2,
                "mate_in_topk_rate": h.get("mate_in_topk_rate"),
                "n": h.get("n"),
                "already_in_hard_neg_lineage": slug in existing_ids
                or any(
                    set(p) == set([a, b])
                    for p in []  # id match only; taxa checked loosely below
                ),
                "lab_only": True,
                "auto_applied": False,
            }
        )
        if len(suggestions) >= top_n:
            break

    # Mark overlap with hard_neg taxa pairs if file present
    hn = _load_json(HARD_NEG)
    if isinstance(hn, dict):
        hn_edges = []
        for p in hn.get("pairs") or []:
            taxa = p.get("taxa") or []
            if len(taxa) >= 2:
                hn_edges.append(frozenset({str(taxa[0]), str(taxa[1])}))
        for s in suggestions:
            s["already_in_hard_neg_lineage"] = frozenset(s["taxa"]) in hn_edges

    return suggestions


def build_report(
    models: Path,
    *,
    iter_id: int,
    date_slug: str,
    k: int,
) -> dict[str, Any]:
    gaps: list[str] = []
    generated_at = _utc_now()
    metrics = _load_json(models / "metrics.json") or {}
    ssot = _load_json(SSOT_PATH) or {}

    pairs, pair_sources = load_curated_pairs()
    if not pairs:
        gaps.append("no_curated_lookalike_pairs")

    l2i_raw = _load_json(models / "label2idx.json") or {}
    label2idx = {str(k): int(v) for k, v in l2i_raw.items()}
    if not label2idx:
        gaps.append("label2idx_missing")

    npz_path = models / "test_predictions.npz"
    if not npz_path.is_file():
        gaps.append("test_predictions_npz_missing")
        eval_block: dict[str, Any] = {}
        status = "blocked_on_gap"
    else:
        z = np.load(npz_path, allow_pickle=True)
        probs, labels = np.asarray(z["probs"]), np.asarray(z["labels"])
        deadly = load_deadly_names()
        eval_block = evaluate_pairs(probs, labels, label2idx, pairs, k=k, deadly=deadly)
        status = "measured_ok" if eval_block.get("n_eval_samples") else "unevaluable_no_pair_samples"

    hard_neg = load_hard_neg_lineage()
    if hard_neg is None:
        gaps.append("hard_negative_pairs_e20_missing")

    suggestions = suggest_hard_neg_from_hotspots(
        eval_block.get("hotspots") or [], hard_neg
    )

    # ECE dual from kernel only
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
    else:
        ece_block = {
            "primary": "missing",
            "primary_value": None,
            "primary_source": None,
            "claim_train_published": False,
            "posthoc_separate": True,
            "posthoc_value": ece_post,
        }

    loop_name = f"loop_iter_{iter_id}_lookalike_hotspots_{date_slug}"
    top_hotspots = (eval_block.get("hotspots") or [])[:15]
    top_deadly = (eval_block.get("deadly_hotspots") or [])[:15]

    report: dict[str, Any] = {
        "loop_iter_id": iter_id,
        "slug": "lookalike_hotspots",
        "friction": "lookalike mate@k confusion hotspots for FT + education UX",
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
            "predictions": _repo_rel(npz_path) if npz_path.is_file() else None,
            "label2idx": _repo_rel(models / "label2idx.json"),
            "catalog_v2": _repo_rel(V2),
            "classic_pairs": _repo_rel(CLASSIC),
            "hard_neg_lineage": _repo_rel(HARD_NEG) if HARD_NEG.is_file() else None,
            "version": metrics.get("version")
            or (ssot.get("version") if isinstance(ssot, dict) else None),
            "train": metrics.get("train_domain")
            or (ssot.get("train_domain") if isinstance(ssot, dict) else None),
            "test": metrics.get("test_domain")
            or (ssot.get("test_domain") if isinstance(ssot, dict) else None),
        },
        "ece": ece_block,
        "pair_sources": pair_sources,
        "hard_negative_lineage": hard_neg,
        "aggregate": {
            "k": eval_block.get("k"),
            "n_directed_pairs_curated": eval_block.get("n_directed_pairs_curated"),
            "n_pairs_with_eval_samples": eval_block.get("n_pairs_with_eval_samples"),
            "n_eval_samples": eval_block.get("n_eval_samples"),
            "true_in_topk_rate": eval_block.get("true_in_topk_rate"),
            "lookalike_mate_in_topk_rate": eval_block.get("lookalike_mate_in_topk_rate"),
            "n_hotspots": len(eval_block.get("hotspots") or []),
            "n_deadly_hotspots": len(eval_block.get("deadly_hotspots") or []),
            "note": eval_block.get("note"),
        },
        "hotspot_thresholds": eval_block.get("hotspot_thresholds"),
        "top_hotspots": top_hotspots,
        "top_deadly_hotspots": top_deadly,
        "hard_neg_suggestions_lab_only": suggestions,
        "by_pair_full_n": len(eval_block.get("by_pair") or []),
        # Keep full by_pair for tooling but cap in MD; JSON may be large — include all ranked
        "by_pair": eval_block.get("by_pair") or [],
        "gaps": gaps,
        "honesty": {
            "pairs_from_ssot_only": True,
            "never_invent_lookalikes": True,
            "mate_rate_is_confusion_not_accuracy": True,
            "map_is_not_safety": True,
            "product_unlock_forced_false": True,
            "hard_neg_suggestions_not_auto_applied": True,
        },
        "ux_data_only": True,
        "note": (
            "Lab friction report for lookalike hotspots. Fresh timestamp DoD. "
            "UX education data + FT hard-neg suggestions only. "
            "Orientation only — never consumption permission. product_unlock=false."
        ),
    }
    return report


def _fmt(v: Any) -> str:
    if v is None:
        return "null"
    if isinstance(v, float):
        return repr(v)
    return str(v)


def render_md(report: dict[str, Any]) -> str:
    agg = report.get("aggregate") or {}
    e = report.get("ece") or {}
    prov = report.get("provenance") or {}
    hn = report.get("hard_negative_lineage") or {}
    lines = [
        f"# Loop iter {report.get('loop_iter_id')} — lookalike hotspots",
        "",
        f"**Generated:** `{report.get('generated_at')}`  ",
        f"**Status:** `{report.get('status')}`  ",
        f"**Artifact:** `{report.get('artifact_stem')}`  ",
        f"**Policy:** `{report.get('policy')}`  ",
        f"**product_unlock:** `{report.get('product_unlock')}` (forced false)  ",
        f"**Lab only:** `{report.get('lab_only')}` · **kaggle_push:** `{report.get('kaggle_push')}`",
        "",
        "> mate@k is a **confusion signal**, not accuracy. Curated pairs only. UX data only.",
        "",
        "## Provenance",
        "",
        f"- checkpoint: `{prov.get('checkpoint')}`",
        f"- version: `{prov.get('version')}`",
        f"- eval_protocol: `{report.get('eval_protocol')}`",
        f"- train: `{prov.get('train')}` · test: `{prov.get('test')}`",
        f"- catalog: `{prov.get('catalog_v2')}` · classic: `{prov.get('classic_pairs')}`",
        "",
        "## Aggregate [MEASURED]",
        "",
        "| Metric | Value |",
        "|--------|-------|",
        f"| k | {agg.get('k')} |",
        f"| curated directed pairs | {agg.get('n_directed_pairs_curated')} |",
        f"| pairs with eval samples | {agg.get('n_pairs_with_eval_samples')} |",
        f"| n_eval samples | {agg.get('n_eval_samples')} |",
        f"| true_in_topk_rate | {_fmt(agg.get('true_in_topk_rate'))} |",
        f"| lookalike_mate_in_topk_rate | {_fmt(agg.get('lookalike_mate_in_topk_rate'))} |",
        f"| n_hotspots | {agg.get('n_hotspots')} |",
        f"| n_deadly_hotspots | {agg.get('n_deadly_hotspots')} |",
        "",
        f"Note: {agg.get('note')}",
        "",
        "## Dual ECE honesty (kernel cite)",
        "",
        f"- primary: `{e.get('primary')}` = `{_fmt(e.get('primary_value'))}` "
        f"(source=`{e.get('primary_source')}`)",
        f"- posthoc (separate): `{_fmt(e.get('posthoc_value'))}`",
        "",
        "## Top lookalike hotspots",
        "",
        "| A (true) | B (mate) | n | mate@k rate | true@k rate | deadly? |",
        "|----------|----------|--:|------------:|------------:|:-------:|",
    ]
    for h in report.get("top_hotspots") or []:
        lines.append(
            f"| {h.get('a')} | {h.get('b')} | {h.get('n')} | "
            f"{_fmt(h.get('mate_in_topk_rate'))} | {_fmt(h.get('true_in_topk_rate'))} | "
            f"{'Y' if h.get('involves_deadly') else ''} |"
        )
    lines += [
        "",
        "## Deadly-involving hotspots (safety-critical education)",
        "",
        "| A | B | n | mate@k rate |",
        "|---|---|--:|------------:|",
    ]
    for h in report.get("top_deadly_hotspots") or []:
        lines.append(
            f"| {h.get('a')} | {h.get('b')} | {h.get('n')} | {_fmt(h.get('mate_in_topk_rate'))} |"
        )
    lines += [
        "",
        "## Hard-negative lineage (existing)",
        "",
        f"- path: `{hn.get('path')}`",
        f"- n_pairs: `{hn.get('n_pairs')}` · ids: `{', '.join(hn.get('pair_ids') or []) or 'none'}`",
        f"- source_loop_iters (historical): `{hn.get('source_loop_iters')}`",
        "",
        "## Lab suggestions (NOT auto-applied)",
        "",
    ]
    sugg = report.get("hard_neg_suggestions_lab_only") or []
    if not sugg:
        lines.append("_No hotspot-derived suggestions under thresholds._")
    else:
        for s in sugg:
            lines.append(
                f"- **{s.get('id')}**: {s.get('taxa')} · rate={_fmt(s.get('mate_in_topk_rate'))} "
                f"n={s.get('n')} · already_in_lineage={s.get('already_in_hard_neg_lineage')} "
                f"· priority={s.get('priority')}"
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
        "- invent lookalike pairs",
        "- product_unlock=true",
        "- forage / consumption permission",
        "- auto-apply hard-neg without operator",
        "",
        "---",
        "",
        "_Orientation only · never consumption · product_unlock=false · UX data only_",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--models-dir", type=Path, default=None)
    ap.add_argument("--iter-id", type=int, default=DEFAULT_ITER_ID)
    ap.add_argument("--date", type=str, default=None)
    ap.add_argument("--k", type=int, default=3)
    ap.add_argument("--output-dir", type=Path, default=REPORT_DIR)
    args = ap.parse_args()

    models = resolve_models_dir(args.models_dir)
    date_slug = args.date or _today()
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    if models is None:
        gap = {
            "loop_iter_id": args.iter_id,
            "slug": "lookalike_hotspots",
            "generated_at": _utc_now(),
            "status": "blocked_on_gap",
            "gaps": ["models_dir_not_found"],
            "product_unlock": False,
            "can_auto_unlock": False,
            "forage_permission": False,
            "consumption_permission": False,
            "policy": POLICY,
            "metrics_label": "[MEASURED]",
        }
        stem = f"loop_iter_{args.iter_id}_lookalike_hotspots_{date_slug}"
        jp = out_dir / f"{stem}.json"
        mp = out_dir / f"{stem}.md"
        jp.write_text(json.dumps(gap, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        mp.write_text(
            f"# Loop iter {args.iter_id} — lookalike hotspots\n\n"
            f"**Status:** blocked_on_gap\n\nModels dir not found.\n",
            encoding="utf-8",
        )
        print(json.dumps({"status": "blocked_on_gap", "json": str(jp)}, indent=2))
        return 0

    report = build_report(models, iter_id=args.iter_id, date_slug=date_slug, k=args.k)
    stem = report["artifact_stem"]
    jp = out_dir / f"{stem}.json"
    mp = out_dir / f"{stem}.md"
    jp.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    mp.write_text(render_md(report), encoding="utf-8")

    latest_json = out_dir / "loop_lookalike_hotspots_latest.json"
    latest_md = out_dir / "loop_lookalike_hotspots_latest.md"
    latest_json.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    latest_md.write_text(render_md(report), encoding="utf-8")

    summary = {
        "status": report.get("status"),
        "json": _repo_rel(jp) or str(jp),
        "md": _repo_rel(mp) or str(mp),
        "n_hotspots": (report.get("aggregate") or {}).get("n_hotspots"),
        "n_deadly_hotspots": (report.get("aggregate") or {}).get("n_deadly_hotspots"),
        "mate_rate": (report.get("aggregate") or {}).get("lookalike_mate_in_topk_rate"),
        "product_unlock": False,
        "models": _repo_rel(models) or str(models),
    }
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
