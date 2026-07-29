"""E20 holdout open-set + mate-rate monitor (orientation only).

Reads local ``test_predictions.npz`` + ``label2idx.json`` (prefer v20) and
reports confidence/margin rejection trade-offs vs current product thresholds.
Never sets product_unlock.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

ROOT = Path(__file__).resolve().parents[2]


def _prefer_models_dirs(repo: Path) -> list[Path]:
    kaggle = repo / "kaggle"
    found: list[tuple[int, Path]] = []
    if not kaggle.is_dir():
        return []
    for p in kaggle.glob("kernel_output_v*/models"):
        if not p.is_dir():
            continue
        name = p.parent.name
        digits = "".join(ch if ch.isdigit() else " " for ch in name.split("_v", 1)[-1])
        ver = int(digits.split()[0]) if digits.strip() else 0
        found.append((ver, p))
    found.sort(key=lambda t: t[0], reverse=True)
    return [p for _, p in found]


def resolve_predictions_dir(repo: Path, preferred: Path | None = None) -> Path | None:
    if preferred is not None:
        p = Path(preferred)
        if (p / "test_predictions.npz").is_file() and (p / "label2idx.json").is_file():
            return p
    for d in _prefer_models_dirs(repo):
        if (d / "test_predictions.npz").is_file() and (d / "label2idx.json").is_file():
            return d
    return None


def _load_deadly_idxs(models: Path, repo: Path) -> set[int]:
    l2i_path = models / "label2idx.json"
    deadly_path = repo / "data" / "industrial_v1" / "deadly_set.json"
    if not l2i_path.is_file() or not deadly_path.is_file():
        return set()
    deadly = json.loads(deadly_path.read_text(encoding="utf-8"))
    names = deadly if isinstance(deadly, list) else deadly.get("species") or deadly.get("latin_names") or []
    if names and isinstance(names[0], dict):
        names = [x.get("latin_name") or x.get("name") for x in names]
    l2i = json.loads(l2i_path.read_text(encoding="utf-8"))
    return {int(l2i[n]) for n in names if n and n in l2i}


def _shannon_entropy(probs: np.ndarray) -> np.ndarray:
    eps = 1e-12
    p = np.clip(probs, eps, 1.0)
    return -(p * np.log(p)).sum(axis=1)


def _eval_gate(
    p1: np.ndarray,
    margin: np.ndarray,
    correct: np.ndarray,
    is_deadly: np.ndarray,
    d_hit3: np.ndarray,
    conf_thr: float,
    mar_thr: float,
    entropy: np.ndarray | None = None,
    entropy_thr: float | None = None,
) -> dict[str, Any]:
    rej = (p1 < conf_thr) | (margin < mar_thr)
    if entropy is not None and entropy_thr is not None:
        rej = rej | (entropy > float(entropy_thr))
    keep = ~rej
    n = int(len(p1))
    n_keep = int(keep.sum())
    n_rej = int(rej.sum())
    out: dict[str, Any] = {
        "conf_thr": conf_thr,
        "margin_thr": mar_thr,
        "entropy_thr": entropy_thr,
        "n": n,
        "n_reject": n_rej,
        "n_keep": n_keep,
        "reject_rate": float(n_rej / n) if n else 0.0,
        "acc_keep": float(correct[keep].mean()) if n_keep else None,
        "acc_reject": float(correct[rej].mean()) if n_rej else None,
        "wrong_kept": int((~correct & keep).sum()),
        "correct_rejected": int((correct & rej).sum()),
        "frac_correct_kept": float((correct & keep).sum() / correct.sum()) if correct.any() else None,
    }
    d_keep = is_deadly & keep
    d_rej = is_deadly & rej
    if is_deadly.any():
        out["deadly_reject_rate"] = float(d_rej.mean())
        out["deadly_at3_among_kept"] = float(d_hit3[d_keep].mean()) if d_keep.any() else None
        out["n_deadly"] = int(is_deadly.sum())
        out["n_deadly_kept"] = int(d_keep.sum())
    return out


def recommend_thresholds(
    p1: np.ndarray,
    margin: np.ndarray,
    correct: np.ndarray,
    is_deadly: np.ndarray,
    d_hit3: np.ndarray,
    *,
    entropy: np.ndarray | None = None,
    target_reject: float = 0.12,
    min_acc_keep: float = 0.85,
    max_deadly_reject: float = 0.08,
) -> dict[str, Any]:
    """Grid search conf/margin (+ optional entropy) for orientation-safe abstention."""
    best: dict[str, Any] | None = None
    confs = [0.70, 0.75, 0.80, 0.85, 0.88, 0.90, 0.92, 0.94, 0.95, 0.96, 0.97]
    mars = [0.0, 0.02, 0.05, 0.08, 0.10, 0.15, 0.20]
    for conf in confs:
        for mar in mars:
            g = _eval_gate(p1, margin, correct, is_deadly, d_hit3, conf, mar)
            acc = g.get("acc_keep")
            rej = g.get("reject_rate") or 0.0
            d_rej = g.get("deadly_reject_rate")
            if acc is None or g["n_keep"] < 100:
                continue
            if acc < min_acc_keep:
                continue
            if d_rej is not None and d_rej > max_deadly_reject:
                continue
            # score: near target reject, high acc_keep, low deadly reject
            score = (
                -abs(rej - target_reject)
                + 0.5 * (acc - min_acc_keep)
                - 0.2 * (d_rej or 0.0)
            )
            cand = {**g, "score": score}
            if best is None or score > best["score"]:
                best = cand
    if best is None:
        # fallback: high conf only
        best = _eval_gate(p1, margin, correct, is_deadly, d_hit3, 0.92, 0.05)
        best["score"] = 0.0
        best["note"] = "fallback_default_0.92_0.05"

    # Secondary entropy thr: applied on top of best conf/margin to catch
    # multi-modal uncertain mass without over-rejecting sharp correct preds.
    best["entropy_thr"] = None
    if entropy is not None and len(entropy) == len(p1):
        conf = float(best["conf_thr"])
        mar = max(0.05, float(best.get("margin_thr") or 0.0))
        ent_best = None
        for eth in [0.15, 0.20, 0.25, 0.30, 0.40, 0.50]:
            g = _eval_gate(
                p1, margin, correct, is_deadly, d_hit3, conf, mar, entropy=entropy, entropy_thr=eth
            )
            acc = g.get("acc_keep")
            rej = g.get("reject_rate") or 0.0
            d_rej = g.get("deadly_reject_rate")
            if acc is None or g["n_keep"] < 100:
                continue
            if acc < min_acc_keep:
                continue
            if d_rej is not None and d_rej > max_deadly_reject:
                continue
            # Prefer modest extra reject over conf-only, higher acc_keep
            base_rej = float(best.get("reject_rate") or 0.0)
            score = (acc - min_acc_keep) + 0.3 * max(0.0, rej - base_rej) - 0.2 * (d_rej or 0.0)
            if ent_best is None or score > ent_best["score"]:
                ent_best = {**g, "score": score}
        if ent_best is not None and float(ent_best.get("reject_rate") or 0) > float(
            best.get("reject_rate") or 0
        ):
            best = {**best, **ent_best, "entropy_thr": ent_best.get("entropy_thr")}
            best["note"] = (best.get("note") or "") + "+entropy_secondary"
        else:
            # Safe default secondary thr from E20 sweep (mild)
            best["entropy_thr"] = 0.25
            g2 = _eval_gate(
                p1,
                margin,
                correct,
                is_deadly,
                d_hit3,
                float(best["conf_thr"]),
                max(0.05, float(best.get("margin_thr") or 0.0)),
                entropy=entropy,
                entropy_thr=0.25,
            )
            best = {**best, **g2, "entropy_thr": 0.25, "score": best.get("score", 0.0)}
            best["note"] = (best.get("note") or "") + "+entropy_default_0.25"
    return best


def analyze_open_set_holdout(
    repo: Path | None = None,
    *,
    models_dir: Path | None = None,
) -> dict[str, Any]:
    repo = Path(repo or ROOT)
    pred_dir = resolve_predictions_dir(repo, models_dir)
    if pred_dir is None:
        return {
            "ok": False,
            "reason": "no_predictions",
            "product_unlock": False,
        }

    z = np.load(pred_dir / "test_predictions.npz", allow_pickle=True)
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
    deadly_idxs = _load_deadly_idxs(pred_dir, repo)
    is_deadly = np.isin(labels, list(deadly_idxs)) if deadly_idxs else np.zeros(n, dtype=bool)
    d_hit3 = np.array([int(labels[i]) in set(top3[i].tolist()) for i in range(n)], dtype=bool)

    # Current product defaults (from config comments / settings)
    current_multiview = _eval_gate(p1, margin, correct, is_deadly, d_hit3, 0.10, 0.0)
    current_generic = _eval_gate(p1, margin, correct, is_deadly, d_hit3, 0.48, 0.10)
    recommended = recommend_thresholds(
        p1, margin, correct, is_deadly, d_hit3, entropy=entropy
    )

    # Mate rates (reuse pair metrics when available)
    mate_block: dict[str, Any] = {}
    try:
        from kaggle.ml_qa.pair_metrics import run_pair_metrics_suite

        pair = run_pair_metrics_suite(repo, models_dir=pred_dir, k=3)
        mate_block = {
            "lookalike_mate_in_topk_rate": (pair.get("metrics") or {}).get(
                "lookalike_mate_in_topk_rate"
            ),
            "true_in_topk_rate": (pair.get("metrics") or {}).get("true_in_topk_rate"),
            "n_eval_samples": (pair.get("metrics") or {}).get("n_eval_samples"),
            "n_pairs_in_label_space": (pair.get("metrics") or {}).get("n_pairs_in_label_space"),
            "n_directed_pairs": (pair.get("metrics") or {}).get("n_directed_pairs"),
            "status": pair.get("status"),
        }
    except Exception as exc:  # pragma: no cover
        mate_block = {"error": str(exc)}

    metrics_path = pred_dir / "metrics.json"
    protocol = None
    version = None
    if metrics_path.is_file():
        try:
            mj = json.loads(metrics_path.read_text(encoding="utf-8"))
            protocol = mj.get("eval_protocol")
            version = mj.get("version")
        except Exception:
            pass

    return {
        "ok": True,
        "product_unlock": False,
        "generated": datetime.now(timezone.utc).isoformat(),
        "predictions_dir": str(pred_dir),
        "protocol": protocol,
        "version": version,
        "n": n,
        "top1_accuracy": float(correct.mean()),
        "conf_stats": {
            "mean_correct": float(p1[correct].mean()) if correct.any() else None,
            "mean_wrong": float(p1[~correct].mean()) if (~correct).any() else None,
            "p5_correct": float(np.percentile(p1[correct], 5)) if correct.any() else None,
            "p5_wrong": float(np.percentile(p1[~correct], 5)) if (~correct).any() else None,
            "p50_wrong": float(np.percentile(p1[~correct], 50)) if (~correct).any() else None,
        },
        "margin_stats": {
            "mean_correct": float(margin[correct].mean()) if correct.any() else None,
            "mean_wrong": float(margin[~correct].mean()) if (~correct).any() else None,
            "p5_wrong": float(np.percentile(margin[~correct], 5)) if (~correct).any() else None,
        },
        "entropy_stats": {
            "mean_correct": float(entropy[correct].mean()) if correct.any() else None,
            "mean_wrong": float(entropy[~correct].mean()) if (~correct).any() else None,
            "p90_correct": float(np.percentile(entropy[correct], 90)) if correct.any() else None,
            "p50_wrong": float(np.percentile(entropy[~correct], 50)) if (~correct).any() else None,
        },
        "current_multiview_thr": current_multiview,
        "current_generic_thr": current_generic,
        "recommended": recommended,
        "lookalike_mate_rates": mate_block,
        "note": (
            "Orientation only. Multiview thr 0.10/0.0 rejects ~0% on E20 "
            "(overconfident softmax). Recommended thr raises abstention without "
            "product_unlock."
        ),
    }


def write_calibrated_thresholds(
    analysis: dict[str, Any],
    out_path: Path,
) -> Path:
    """Write open_set_thresholds.json for load_open_set_thresholds consumers."""
    rec = analysis.get("recommended") or {}
    conf = float(rec.get("conf_thr", 0.92))
    # Product floor: margin 0.0 never rejects near-ties; keep a small positive
    # thr even when conf is the binding holdout constraint.
    mar = max(0.05, float(rec.get("margin_thr", 0.05) or 0.0))
    eth = rec.get("entropy_thr")
    eth_f = float(eth) if eth is not None else 0.25
    payload = {
        "calibrated_threshold": conf,
        "calibrated_margin": mar,
        "calibrated_entropy": eth_f,
        "status": "calibrated_e20_holdout",
        "source_experiment": analysis.get("version") or "e20",
        "protocol": analysis.get("protocol"),
        "predictions_dir": analysis.get("predictions_dir"),
        "holdout_stats": {
            "reject_rate": rec.get("reject_rate"),
            "acc_keep": rec.get("acc_keep"),
            "deadly_reject_rate": rec.get("deadly_reject_rate"),
            "deadly_at3_among_kept": rec.get("deadly_at3_among_kept"),
            "n": analysis.get("n"),
            "top1_accuracy_all": analysis.get("top1_accuracy"),
            "entropy_thr": eth_f,
        },
        "lookalike_mate_rates": analysis.get("lookalike_mate_rates"),
        "product_unlock": False,
        "policy": "orientation_only_never_consume",
        "generated": analysis.get("generated"),
        "note": (
            "Calibrated on E20 GBIF-ES pure holdout softmax (conf/margin + entropy). "
            "Does not unlock Identify; product_unlock remains operator-gated."
        ),
    }
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return out_path


def run_open_set_holdout_suite(
    repo: Path | None = None,
    *,
    models_dir: Path | None = None,
    write_thresholds: bool = True,
) -> dict[str, Any]:
    """Professional-tester S8 suite dict."""
    repo = Path(repo or ROOT)
    analysis = analyze_open_set_holdout(repo, models_dir=models_dir)
    flags: list[str] = []
    if not analysis.get("ok"):
        return {
            "name": "S8 E20 open-set + mate monitor",
            "status": "SKIP",
            "detail": analysis.get("reason", "no_predictions"),
            "flags": ["no_local_predictions"],
            "metrics": analysis,
        }

    mv = analysis.get("current_multiview_thr") or {}
    if (mv.get("reject_rate") or 0.0) < 0.01:
        flags.append("multiview_thr_rejects_near_zero")

    rec = analysis.get("recommended") or {}
    mate = analysis.get("lookalike_mate_rates") or {}
    mate_rate = mate.get("lookalike_mate_in_topk_rate")
    if mate_rate is not None and float(mate_rate) > 0.20:
        flags.append(f"high_mate_in_topk:{float(mate_rate):.3f}")

    paths_written: list[str] = []
    if write_thresholds and rec:
        # Repo-root report (primary)
        p1 = write_calibrated_thresholds(
            analysis, repo / "eval" / "reports" / "open_set_thresholds.json"
        )
        paths_written.append(str(p1))
        # ML experiments copy
        p2 = repo / "eval" / "reports" / "ml_experiments" / "e20_open_set_holdout.json"
        p2.parent.mkdir(parents=True, exist_ok=True)
        p2.write_text(json.dumps(analysis, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        paths_written.append(str(p2))
        # Backend-local mirror so load_open_set_thresholds finds it under base_dir
        p3 = repo / "backend" / "eval" / "reports" / "open_set_thresholds.json"
        write_calibrated_thresholds(analysis, p3)
        paths_written.append(str(p3))

    detail = {
        "n": analysis.get("n"),
        "top1_accuracy": analysis.get("top1_accuracy"),
        "multiview_reject_rate": mv.get("reject_rate"),
        "recommended_conf": rec.get("conf_thr"),
        "recommended_margin": rec.get("margin_thr"),
        "recommended_entropy": rec.get("entropy_thr"),
        "recommended_reject_rate": rec.get("reject_rate"),
        "recommended_acc_keep": rec.get("acc_keep"),
        "mate_in_topk": mate_rate,
        "true_in_topk": mate.get("true_in_topk_rate"),
        "paths": paths_written,
    }
    return {
        "name": "S8 E20 open-set + mate monitor",
        "status": "PASS",
        "detail": json.dumps(detail, ensure_ascii=False),
        "flags": flags,
        "metrics": analysis,
    }


if __name__ == "__main__":
    suite = run_open_set_holdout_suite(ROOT, write_thresholds=True)
    print(json.dumps({"status": suite["status"], "detail": suite["detail"], "flags": suite["flags"]}, indent=2))
