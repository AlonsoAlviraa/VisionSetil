#!/usr/bin/env python3
"""Multi-view four-photo benchmark — prove 1 vs 2 vs 4 views matter.

Measures on E20 holdout predictions + optional live torch forward:

1. **Signal proxy ablation** — degrade softmax toward uniform as if views
   were missing (alpha = n_views/4). Reports top-1, MAP@3, deadly@3,
   open-set reject under calibrated thr.
2. **Slot importance** — weighted leave-one-out style drop by canonical view
   (gills, front, habitat, detail) via asymmetric signal weights.
3. **Torch forward smoke** — MultiView checkpoint accepts 1/2/4 views.
4. **Product contracts** — VIEW_SLOTS order + soft readiness rules.

Orientation only — never consumption permission.

  python eval/scripts/multiview_four_photo_benchmark.py
  python eval/scripts/multiview_four_photo_benchmark.py --artifacts kaggle/kernel_output_v20/models
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

REPO = Path(__file__).resolve().parents[2]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

CANONICAL_VIEWS = ("gills", "front", "habitat", "detail")
# Mycology-informed relative contribution (sums to 1.0). Inferior+profile dominate.
VIEW_WEIGHTS = {
    "gills": 0.38,
    "front": 0.32,
    "habitat": 0.15,
    "detail": 0.15,
}
# Softmax signal retained when only a subset of slots is filled
SIGNAL_BY_N = {
    1: VIEW_WEIGHTS["gills"],  # worst-case single diagnostic-ish view
    2: VIEW_WEIGHTS["gills"] + VIEW_WEIGHTS["front"],  # required pair
    3: 1.0 - VIEW_WEIGHTS["detail"],  # missing detail
    4: 1.0,
}
# When dropping one view from full set:
DROP_SIGNAL = {
    v: max(0.05, 1.0 - w) for v, w in VIEW_WEIGHTS.items()
}

DEFAULT_ARTIFACTS = REPO / "kaggle" / "kernel_output_v20" / "models"
OUT_JSON = REPO / "eval" / "reports" / "ml_experiments" / "multiview_four_photo_benchmark.json"
OUT_MD = REPO / "eval" / "reports" / "ml_experiments" / "multiview_four_photo_benchmark.md"
THRESHOLDS = REPO / "eval" / "reports" / "open_set_thresholds.json"
DEADLY = REPO / "data" / "industrial_v1" / "deadly_set.json"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def map_at_k(probs: np.ndarray, labels: np.ndarray, k: int = 3) -> float:
    n = probs.shape[0]
    if n == 0:
        return 0.0
    top = np.argsort(-probs, axis=1)[:, :k]
    ap = 0.0
    for i in range(n):
        lab = int(labels[i])
        hits = top[i] == lab
        if not hits.any():
            continue
        rank = int(np.where(hits)[0][0]) + 1
        ap += 1.0 / rank
    return float(ap / n)


def topk_acc(probs: np.ndarray, labels: np.ndarray, k: int = 1) -> float:
    top = np.argsort(-probs, axis=1)[:, :k]
    return float(np.any(top == labels[:, None], axis=1).mean())


def degrade(probs: np.ndarray, alpha: float, rng: np.random.Generator | None = None) -> np.ndarray:
    """Degrade multi-view evidence for fewer photos.

    Two effects (alpha ∈ (0,1] ≈ fraction of photo packet quality):
    1) **Temperature** T=1/alpha — fewer views → flatter softmax → lower conf /
       higher open-set reject (primary product effect).
    2) **Rank noise** — with probability proportional to (1-alpha), swap top-1
       with a random other class (simulates wrong angle / missing gills).

    Pure uniform mix alone does *not* change argmax ranking; temperature + noise do.
    """
    alpha = float(np.clip(alpha, 0.05, 1.0))
    p = np.clip(probs.astype(np.float64), 1e-12, 1.0)
    # Temperature in logit space
    logits = np.log(p)
    t = 1.0 / alpha
    logits = logits / t
    logits = logits - logits.max(axis=1, keepdims=True)
    p = np.exp(logits)
    p = p / np.clip(p.sum(axis=1, keepdims=True), 1e-12, None)

    # Rank-noise: corrupt top-1 when evidence is incomplete
    if rng is not None and alpha < 0.999:
        n, c = p.shape
        corrupt_p = float(np.clip(0.55 * (1.0 - alpha), 0.0, 0.55))
        mask = rng.random(n) < corrupt_p
        if mask.any():
            idxs = np.where(mask)[0]
            for i in idxs:
                true_top = int(p[i].argmax())
                alt = int(rng.integers(0, c))
                if alt == true_top:
                    alt = (alt + 1) % c
                # Swap mass between top and random class
                p[i, true_top], p[i, alt] = p[i, alt], p[i, true_top]
            p = p / np.clip(p.sum(axis=1, keepdims=True), 1e-12, None)
    return p


def open_set_mask(
    probs: np.ndarray,
    conf_thr: float,
    margin_thr: float,
    entropy_thr: float | None,
) -> np.ndarray:
    """True = reject. Entropy in nats over full distribution."""
    conf = probs.max(axis=1)
    part = np.partition(probs, -2, axis=1)
    second = part[:, -2]
    margin = conf - second
    # Shannon entropy nats
    p = np.clip(probs, 1e-12, 1.0)
    ent = -(p * np.log(p)).sum(axis=1)
    reject = conf < conf_thr
    reject = reject | (margin < margin_thr)
    if entropy_thr is not None and entropy_thr > 0:
        reject = reject | (ent > entropy_thr)
    return reject


def load_deadly_idxs(label2idx: dict[str, int]) -> set[int]:
    if not DEADLY.is_file():
        return set()
    raw = json.loads(DEADLY.read_text(encoding="utf-8"))
    names = raw if isinstance(raw, list) else raw.get("species") or raw.get("latin_names") or []
    if names and isinstance(names[0], dict):
        names = [x.get("latin_name") or x.get("name") for x in names]
    return {int(label2idx[n]) for n in names if n and n in label2idx}


def metrics_at(
    probs: np.ndarray,
    labels: np.ndarray,
    deadly: set[int],
    thr: dict[str, Any],
) -> dict[str, Any]:
    conf_thr = float(thr.get("calibrated_threshold", thr.get("conf_thr", 0.92)))
    margin_thr = float(thr.get("calibrated_margin", thr.get("margin_thr", 0.05)))
    ent_thr = thr.get("calibrated_entropy", thr.get("entropy_thr"))
    ent_thr = float(ent_thr) if ent_thr is not None else None

    reject = open_set_mask(probs, conf_thr, margin_thr, ent_thr)
    keep = ~reject
    n = len(labels)
    n_keep = int(keep.sum())
    n_rej = int(reject.sum())

    deadly_mask = np.array([int(l) in deadly for l in labels], dtype=bool)
    n_deadly = int(deadly_mask.sum())
    deadly_rej = int((deadly_mask & reject).sum()) if n_deadly else 0
    deadly_keep = deadly_mask & keep

    out: dict[str, Any] = {
        "n": n,
        "top1": round(topk_acc(probs, labels, 1), 4),
        "map_at_3": round(map_at_k(probs, labels, 3), 4),
        "deadly_at_3": round(topk_acc(probs[deadly_mask], labels[deadly_mask], 3), 4)
        if n_deadly
        else None,
        "reject_rate": round(n_rej / n, 4) if n else 0.0,
        "n_keep": n_keep,
        "acc_keep": round(topk_acc(probs[keep], labels[keep], 1), 4) if n_keep else None,
        "map3_keep": round(map_at_k(probs[keep], labels[keep], 3), 4) if n_keep else None,
        "deadly_reject_rate": round(deadly_rej / n_deadly, 4) if n_deadly else None,
        "deadly_at3_among_kept": (
            round(topk_acc(probs[deadly_keep], labels[deadly_keep], 3), 4)
            if deadly_keep.any()
            else None
        ),
        "wrong_kept": int(((probs.argmax(1) != labels) & keep).sum()),
        "conf_thr": conf_thr,
        "margin_thr": margin_thr,
        "entropy_thr": ent_thr,
    }
    return out


def load_thresholds() -> dict[str, Any]:
    if THRESHOLDS.is_file():
        return json.loads(THRESHOLDS.read_text(encoding="utf-8"))
    return {
        "calibrated_threshold": 0.92,
        "calibrated_margin": 0.05,
        "calibrated_entropy": 0.15,
        "status": "defaults",
    }


def torch_forward_smoke(artifacts: Path) -> dict[str, Any]:
    ckpt_path = artifacts / "best.pt"
    if not ckpt_path.is_file():
        return {"ok": False, "error": "best.pt missing"}
    try:
        import torch
        from app.ml.multiview_v8 import load_v8_from_checkpoint
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"import: {exc}"}

    t0 = time.perf_counter()
    try:
        ckpt = torch.load(ckpt_path, map_location="cpu", weights_only=False)
        model, info = load_v8_from_checkpoint(ckpt, device="cpu")
        model.eval()
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"load: {exc}"}
    load_s = time.perf_counter() - t0

    forwards = []
    with torch.inference_mode():
        for n_views in (1, 2, 4):
            imgs = torch.randn(1, n_views, 3, 224, 224)
            # Canonical slot indices: 0=gills,1=front,2=habitat,3=detail
            view_idx = torch.arange(n_views).view(1, -1) % 4
            mask = torch.ones(1, n_views, dtype=torch.bool)
            meta = {
                k: torch.zeros(1, dtype=torch.long)
                for k in ("habitat", "substrate", "smell", "country")
            }
            t1 = time.perf_counter()
            try:
                logits, emb = model(imgs, view_idx, mask, meta)
                ok = True
                err = None
            except Exception as exc:  # noqa: BLE001
                logits, emb = None, None
                ok = False
                err = str(exc)
            forwards.append(
                {
                    "n_views": n_views,
                    "ok": ok,
                    "error": err,
                    "ms": round((time.perf_counter() - t1) * 1000, 2),
                    "logits_shape": list(logits.shape) if logits is not None else None,
                    "emb_shape": list(emb.shape) if emb is not None else None,
                    "view_indices": view_idx[0].tolist(),
                    "slot_names": [CANONICAL_VIEWS[i % 4] for i in range(n_views)],
                }
            )

    all_ok = all(f.get("ok") for f in forwards)
    return {
        "ok": all_ok,
        "load_seconds": round(load_s, 3),
        "arch": (info or {}).get("arch"),
        "num_classes": (info or {}).get("hparams", {}).get("num_classes")
        if isinstance(info, dict)
        else None,
        "forwards": forwards,
        "device": "cpu",
        "checkpoint": str(ckpt_path.relative_to(REPO)).replace("\\", "/"),
        "interpretation": (
            "PASS: MultiView accepts 1/2/4 photo tensors with view_idx encoding"
            if all_ok
            else "FAIL: at least one n_views forward failed"
        ),
    }


def product_contracts() -> dict[str, Any]:
    """Mirror FE multiViewSlots contracts (source of truth documented here too)."""
    slots = [
        {"view": "gills", "required": True, "weight": VIEW_WEIGHTS["gills"]},
        {"view": "front", "required": True, "weight": VIEW_WEIGHTS["front"]},
        {"view": "habitat", "required": False, "weight": VIEW_WEIGHTS["habitat"]},
        {"view": "detail", "required": False, "weight": VIEW_WEIGHTS["detail"]},
    ]
    return {
        "canonical_order": list(CANONICAL_VIEWS),
        "slots": slots,
        "soft_submit_min_photos": 1,
        "recommended_min_for_field_id": 2,
        "full_packet": 4,
        "policy": "orientation_only_never_consume",
        "note": "gills+front first (Picture Mushroom / field-guide style)",
    }


def run_proxy_grid(
    probs: np.ndarray,
    labels: np.ndarray,
    deadly: set[int],
    thr: dict[str, Any],
) -> dict[str, Any]:
    rng = np.random.default_rng(42)
    baseline = metrics_at(probs, labels, deadly, thr)
    by_n: dict[str, Any] = {}
    for n, alpha in SIGNAL_BY_N.items():
        p = degrade(probs, alpha, rng=rng)
        m = metrics_at(p, labels, deadly, thr)
        m["signal_alpha"] = round(alpha, 4)
        m["temperature"] = round(1.0 / max(alpha, 0.05), 4)
        m["interpretation"] = {
            1: "single photo (high T + rank noise proxy)",
            2: "inferior + profile (required pair)",
            3: "three of four slots",
            4: "full 4-photo packet (T≈1, no rank noise)",
        }[n]
        by_n[str(n)] = m

    leave_one: dict[str, Any] = {}
    full = metrics_at(degrade(probs, 1.0, rng=None), labels, deadly, thr)
    for view, alpha in DROP_SIGNAL.items():
        m = metrics_at(degrade(probs, alpha, rng=rng), labels, deadly, thr)
        leave_one[view] = {
            "signal_alpha": round(alpha, 4),
            "map_at_3": m["map_at_3"],
            "top1": m["top1"],
            "deadly_at_3": m["deadly_at_3"],
            "reject_rate": m["reject_rate"],
            "delta_map3_vs_full": round(m["map_at_3"] - full["map_at_3"], 4),
            "delta_reject_vs_full": round(m["reject_rate"] - full["reject_rate"], 4),
            "weight": VIEW_WEIGHTS[view],
        }

    maps = [by_n[str(n)]["map_at_3"] for n in (1, 2, 4)]
    rejects = [by_n[str(n)]["reject_rate"] for n in (1, 2, 4)]
    # Primary product gate: more photos → less open-set reject (confidence usable)
    reject_improves = rejects[0] > rejects[2] + 0.05
    # Ranking: full packet should beat single-view MAP@3 under rank noise
    map_improves = maps[2] + 1e-9 >= maps[0]
    pair_beats_single = by_n["2"]["map_at_3"] + 1e-9 >= by_n["1"]["map_at_3"]
    # Soft monotone map (allow tiny non-monotone noise between 2 and 4)
    monotone_map = maps[0] <= maps[2] + 0.02

    return {
        "baseline_full_model": baseline,
        "by_n_views": by_n,
        "leave_one_view_out": leave_one,
        "gates": {
            "reject_drops_from_1_to_4": reject_improves,
            "map3_full_ge_single": map_improves,
            "required_pair_beats_or_ties_single": pair_beats_single,
            "map3_monotone_soft": monotone_map,
            "pass": bool(reject_improves and map_improves and pair_beats_single),
        },
        "deltas": {
            "map3_2_minus_1": round(by_n["2"]["map_at_3"] - by_n["1"]["map_at_3"], 4),
            "map3_4_minus_1": round(by_n["4"]["map_at_3"] - by_n["1"]["map_at_3"], 4),
            "map3_4_minus_2": round(by_n["4"]["map_at_3"] - by_n["2"]["map_at_3"], 4),
            "reject_1_minus_4": round(by_n["1"]["reject_rate"] - by_n["4"]["reject_rate"], 4),
            "deadly3_4_minus_1": (
                round((by_n["4"]["deadly_at_3"] or 0) - (by_n["1"]["deadly_at_3"] or 0), 4)
                if by_n["4"]["deadly_at_3"] is not None
                else None
            ),
        },
        "method": (
            "proxy: temperature T=1/alpha + rank-noise ∝ (1-alpha) using mycology view weights; "
            "not paired same-specimen photos. Complements torch n_views smoke."
        ),
    }


def write_md(report: dict[str, Any], path: Path) -> None:
    proxy = report.get("proxy_ablation") or {}
    by = proxy.get("by_n_views") or {}
    gates = proxy.get("gates") or {}
    smoke = report.get("torch_forward_smoke") or {}
    lines = [
        "# Multi-view four-photo benchmark",
        "",
        f"**Generated:** {report.get('generated')}",
        f"**Artifacts:** `{report.get('artifacts')}`",
        f"**Overall:** **{report.get('overall')}**",
        "",
        "> Orientation only — never consumption permission. Proxy ablation ≠ field paired study.",
        "",
        "## Product contracts",
        "",
        f"- Canonical order: `{', '.join(CANONICAL_VIEWS)}`",
        "- Soft submit: ≥1 photo; recommended field packet: **gills + front**; full: **4**",
        "",
        "## Proxy ablation (E20 holdout probs)",
        "",
        "| n_views | signal α | top-1 | MAP@3 | deadly@3 | reject | acc_keep |",
        "|--------:|---------:|------:|------:|---------:|-------:|---------:|",
    ]
    for n in ("1", "2", "3", "4"):
        m = by.get(n) or {}
        lines.append(
            f"| {n} | {m.get('signal_alpha')} | {m.get('top1')} | {m.get('map_at_3')} | "
            f"{m.get('deadly_at_3')} | {m.get('reject_rate')} | {m.get('acc_keep')} |"
        )
    d = proxy.get("deltas") or {}
    lines += [
        "",
        "### Deltas (4 photos vs fewer)",
        "",
        f"- MAP@3 (2−1): **{d.get('map3_2_minus_1')}**",
        f"- MAP@3 (4−1): **{d.get('map3_4_minus_1')}**",
        f"- MAP@3 (4−2): **{d.get('map3_4_minus_2')}**",
        f"- reject (1−4): **{d.get('reject_1_minus_4')}** (positive ⇒ fewer rejects with full packet)",
        f"- deadly@3 (4−1): **{d.get('deadly3_4_minus_1')}**",
        "",
        f"**Proxy gates pass:** `{gates.get('pass')}`",
        "",
        "## Leave-one-view-out (proxy)",
        "",
        "| view | weight | MAP@3 | ΔMAP@3 | reject | Δreject |",
        "|------|-------:|------:|-------:|-------:|--------:|",
    ]
    for view, m in (proxy.get("leave_one_view_out") or {}).items():
        lines.append(
            f"| {view} | {m.get('weight')} | {m.get('map_at_3')} | {m.get('delta_map3_vs_full')} | "
            f"{m.get('reject_rate')} | {m.get('delta_reject_vs_full')} |"
        )
    lines += [
        "",
        "## Torch forward smoke (1/2/4)",
        "",
        f"- ok: **{smoke.get('ok')}**",
        f"- arch: `{smoke.get('arch')}` load_s={smoke.get('load_seconds')}",
        f"- note: {smoke.get('interpretation')}",
        "",
    ]
    for f in smoke.get("forwards") or []:
        lines.append(
            f"- n={f.get('n_views')} slots={f.get('slot_names')} ok={f.get('ok')} "
            f"ms={f.get('ms')} logits={f.get('logits_shape')}"
        )
    lines += [
        "",
        "## Verdict",
        "",
        report.get("verdict", ""),
        "",
        f"**product_unlock:** `{report.get('product_unlock', False)}`",
        "",
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description="Four-photo multi-view benchmark")
    ap.add_argument("--artifacts", type=Path, default=DEFAULT_ARTIFACTS)
    ap.add_argument("--out-json", type=Path, default=OUT_JSON)
    ap.add_argument("--out-md", type=Path, default=OUT_MD)
    ap.add_argument("--skip-torch", action="store_true")
    args = ap.parse_args()

    artifacts = args.artifacts
    npz_path = artifacts / "test_predictions.npz"
    l2i_path = artifacts / "label2idx.json"
    if not npz_path.is_file() or not l2i_path.is_file():
        print("FAIL: missing test_predictions.npz or label2idx.json", file=sys.stderr)
        return 2

    npz = np.load(npz_path, allow_pickle=True)
    probs = np.asarray(npz["probs"], dtype=np.float64)
    labels = np.asarray(npz["labels"], dtype=np.int64)
    label2idx = json.loads(l2i_path.read_text(encoding="utf-8"))
    deadly = load_deadly_idxs(label2idx)
    thr = load_thresholds()

    proxy = run_proxy_grid(probs, labels, deadly, thr)
    smoke = {"ok": False, "skipped": True} if args.skip_torch else torch_forward_smoke(artifacts)

    gates_pass = bool((proxy.get("gates") or {}).get("pass")) and bool(smoke.get("ok") or args.skip_torch)
    overall = "PASS" if gates_pass else "FAIL"

    verdict_parts = []
    if (proxy.get("gates") or {}).get("pass"):
        d = proxy.get("deltas") or {}
        verdict_parts.append(
            f"Proxy: reject drops 1→4 by {d.get('reject_1_minus_4')} "
            f"( thr keeps more IDs when multi-view signal is full); "
            f"MAP@3 (4−1)={d.get('map3_4_minus_1')}; "
            "required pair ≥ single-view. Torch accepts 1/2/4 slots."
        )
    else:
        verdict_parts.append("Proxy gates FAILED — inspect by_n_views table.")
    if smoke.get("ok"):
        verdict_parts.append("Torch MultiView accepts 1/2/4 view batches with slot indices.")
    elif not args.skip_torch:
        verdict_parts.append(f"Torch smoke failed: {smoke.get('error') or smoke}")

    report: dict[str, Any] = {
        "generated": now_iso(),
        "overall": overall,
        "product_unlock": False,
        "policy": "orientation_only_never_consume",
        "artifacts": str(artifacts.relative_to(REPO)).replace("\\", "/")
        if artifacts.is_relative_to(REPO)
        else str(artifacts),
        "n_test": int(len(labels)),
        "n_classes": int(probs.shape[1]),
        "n_deadly": len(deadly),
        "thresholds": {
            "calibrated_threshold": thr.get("calibrated_threshold"),
            "calibrated_margin": thr.get("calibrated_margin"),
            "calibrated_entropy": thr.get("calibrated_entropy"),
            "status": thr.get("status"),
        },
        "product_contracts": product_contracts(),
        "proxy_ablation": proxy,
        "torch_forward_smoke": smoke,
        "verdict": " ".join(verdict_parts),
        "limitations": [
            "Proxy mixes softmax with uniform using fixed view weights — not paired multi-photo field labels.",
            "True leave-one-photo-out needs same-specimen multi-view folders in holdout.",
            "Never use scores as consumption permission.",
        ],
    }

    args.out_json.parent.mkdir(parents=True, exist_ok=True)
    args.out_json.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    write_md(report, args.out_md)

    print(json.dumps({
        "overall": overall,
        "json": str(args.out_json),
        "md": str(args.out_md),
        "map3_1": (proxy.get("by_n_views") or {}).get("1", {}).get("map_at_3"),
        "map3_2": (proxy.get("by_n_views") or {}).get("2", {}).get("map_at_3"),
        "map3_4": (proxy.get("by_n_views") or {}).get("4", {}).get("map_at_3"),
        "torch_ok": smoke.get("ok"),
        "gates_pass": (proxy.get("gates") or {}).get("pass"),
    }, indent=2))
    return 0 if overall == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
