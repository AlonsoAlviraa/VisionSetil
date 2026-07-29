#!/usr/bin/env python3
"""True same-occurrence multi-view eval on local GBIF multi-image packs.

Groups industrial GBIF images by occurrence id (filename stem digits) so each
pack is multiple photos of the **same** specimen/observation — not proxy noise.

Runs MultiView E20 torch forward with 1 / 2 / 4 views and reports top-1, MAP@3,
open-set reject under calibrated thr. Orientation only — never product_unlock.

  python eval/scripts/paired_multiview_loo_eval.py
  python eval/scripts/paired_multiview_loo_eval.py --max-packs 80 --device cpu
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

REPO = Path(__file__).resolve().parents[2]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))
BACKEND = REPO / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

GBIF_IMAGES = REPO / "data" / "industrial_v1" / "gbif" / "images"
LABEL2IDX = REPO / "kaggle" / "kernel_output_v20" / "models" / "label2idx.json"
WEIGHTS = REPO / "kaggle" / "kernel_output_v20" / "models" / "best.pt"
THRESHOLDS = REPO / "eval" / "reports" / "open_set_thresholds.json"
OUT = REPO / "eval" / "reports" / "ml_experiments" / "paired_multiview_loo_eval.json"
CANONICAL = ("gills", "front", "habitat", "detail")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_thresholds() -> tuple[float, float, float]:
    conf, mar, ent = 0.92, 0.05, 0.15
    if THRESHOLDS.is_file():
        try:
            t = json.loads(THRESHOLDS.read_text(encoding="utf-8"))
            conf = float(t.get("calibrated_threshold", conf))
            mar = float(t.get("calibrated_margin", mar))
            ent = float(t.get("calibrated_entropy", ent) or 0.0)
        except (OSError, ValueError, TypeError):
            pass
    return conf, mar, ent


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


def open_set_reject(
    probs: np.ndarray, conf_thr: float, mar_thr: float, ent_thr: float
) -> np.ndarray:
    order = np.argsort(-probs, axis=1)
    p1 = probs[np.arange(len(probs)), order[:, 0]]
    p2 = probs[np.arange(len(probs)), order[:, 1]]
    margin = p1 - p2
    eps = 1e-12
    p = np.clip(probs, eps, 1.0)
    p = p / p.sum(axis=1, keepdims=True)
    ent = -(p * np.log(p)).sum(axis=1)
    rej = (p1 < conf_thr) | (margin < mar_thr)
    if ent_thr > 0:
        rej = rej | (ent > ent_thr)
    return rej


def inventory_packs(
    image_root: Path, label2idx: dict[str, int], *, min_images: int = 2
) -> list[dict[str, Any]]:
    """Group files by (species_folder, occurrence_id)."""
    # label2idx uses spaces; folders use underscores
    folder_to_label = {}
    for name, idx in label2idx.items():
        folder_to_label[name.replace(" ", "_")] = (name, int(idx))
        folder_to_label[name] = (name, int(idx))

    buckets: dict[tuple[str, str], list[Path]] = defaultdict(list)
    for sp_dir in sorted(image_root.iterdir()):
        if not sp_dir.is_dir():
            continue
        key = sp_dir.name
        if key not in folder_to_label:
            # try fuzzy: underscore variants
            alt = key.replace("_", " ")
            if alt not in label2idx:
                continue
        for f in sp_dir.iterdir():
            if f.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
                continue
            m = re.match(r"^(\d+)", f.stem)
            if not m:
                continue
            buckets[(key, m.group(1))].append(f)

    packs: list[dict[str, Any]] = []
    for (folder, occ), files in buckets.items():
        if len(files) < min_images:
            continue
        if folder not in folder_to_label:
            continue
        latin, idx = folder_to_label[folder]
        files_sorted = sorted(files, key=lambda p: p.name)
        packs.append(
            {
                "species": latin,
                "label_idx": idx,
                "occurrence_id": occ,
                "n_images": len(files_sorted),
                "paths": [str(p) for p in files_sorted],
            }
        )
    packs.sort(key=lambda p: (-p["n_images"], p["species"], p["occurrence_id"]))
    return packs


def stratified_select(
    packs: list[dict[str, Any]],
    max_packs: int,
    *,
    min_images: int = 4,
    seed: int = 42,
) -> list[dict[str, Any]]:
    """Round-robin across species so LOO is not dominated by one taxon."""
    pool = [p for p in packs if p["n_images"] >= min_images] or list(packs)
    by_sp: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for p in pool:
        by_sp[p["species"]].append(p)
    rng = np.random.default_rng(seed)
    for sp in by_sp:
        rng.shuffle(by_sp[sp])
    species = sorted(by_sp.keys())
    selected: list[dict[str, Any]] = []
    idx = {sp: 0 for sp in species}
    while len(selected) < max_packs:
        progressed = False
        for sp in species:
            i = idx[sp]
            if i < len(by_sp[sp]):
                selected.append(by_sp[sp][i])
                idx[sp] = i + 1
                progressed = True
                if len(selected) >= max_packs:
                    break
        if not progressed:
            break
    return selected

def load_image_tensor(path: Path, size: int = 224):
    """Load RGB float tensor CHW [0,1] without depending on PIL if possible."""
    from PIL import Image
    import torch
    from torchvision import transforms

    tfm = transforms.Compose(
        [
            transforms.Resize(int(size * 1.14)),
            transforms.CenterCrop(size),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=(0.485, 0.456, 0.406), std=(0.229, 0.224, 0.225)
            ),
        ]
    )
    img = Image.open(path).convert("RGB")
    return tfm(img)


def _softmax_temp(logits: np.ndarray, temperature: float, n_cls: int) -> np.ndarray:
    t = max(float(temperature), 0.1)
    z = logits.astype(np.float64) / t
    z = z - z.max()
    e = np.exp(z)
    pr = e / e.sum()
    if pr.shape[0] < n_cls:
        pad = np.zeros(n_cls, dtype=np.float64)
        pad[: pr.shape[0]] = pr
        return pad
    return pr[:n_cls]


def run_torch_eval(
    packs: list[dict[str, Any]],
    *,
    weights: Path,
    device: str,
    conf_thr: float,
    mar_thr: float,
    ent_thr: float,
    max_packs: int,
    temperature: float = 1.588,
    do_loo: bool = True,
    seed: int = 42,
) -> dict[str, Any]:
    import torch

    sys.path.insert(0, str(REPO / "backend"))
    from app.ml.multiview_v8 import load_v8_from_checkpoint

    t0 = time.perf_counter()
    ckpt = torch.load(weights, map_location=device, weights_only=False)
    model, meta = load_v8_from_checkpoint(ckpt, device=device)
    model.eval()
    load_s = time.perf_counter() - t0

    n_cls = int((meta.get("hparams") or {}).get("num_classes") or meta.get("num_classes") or 40)
    selected = stratified_select(packs, max_packs, min_images=4, seed=seed)
    n_species = len({p["species"] for p in selected})
    results_by_n: dict[str, dict[str, Any]] = {}

    def _meta_zeros():
        return {
            "habitat": torch.zeros(1, dtype=torch.long, device=device),
            "substrate": torch.zeros(1, dtype=torch.long, device=device),
            "smell": torch.zeros(1, dtype=torch.long, device=device),
            "country": torch.zeros(1, dtype=torch.long, device=device),
        }

    def _forward_paths(paths: list[Path]) -> np.ndarray:
        tensors = [load_image_tensor(p) for p in paths]
        n_views = len(tensors)
        batch = torch.stack(tensors, dim=0).unsqueeze(0).to(device)
        view_idx = torch.arange(n_views, dtype=torch.long, device=device).unsqueeze(0)
        attention_mask = torch.ones(1, n_views, dtype=torch.bool, device=device)
        meta_idx = _meta_zeros()
        with torch.inference_mode():
            out = model(batch, view_idx, attention_mask, meta_idx, labels=None)
            logits = out[0] if isinstance(out, (tuple, list)) else out
            logits = logits.float().cpu().numpy().reshape(-1)
        return _softmax_temp(logits, temperature, n_cls)

    for n_views in (1, 2, 4):
        probs_list = []
        labels_list = []
        errors = 0
        ms_total = 0.0
        for pack in selected:
            paths = [Path(p) for p in pack["paths"][:n_views]]
            if len(paths) < n_views:
                while len(paths) < n_views and pack["paths"]:
                    paths.append(Path(pack["paths"][len(paths) % len(pack["paths"])]))
            try:
                t1 = time.perf_counter()
                pr = _forward_paths(paths)
                ms_total += (time.perf_counter() - t1) * 1000
                probs_list.append(pr)
                labels_list.append(int(pack["label_idx"]))
            except Exception as exc:  # noqa: BLE001
                errors += 1
                if errors <= 3:
                    print(f"  warn pack {pack['occurrence_id']}: {exc}", file=sys.stderr)
                continue

        if not probs_list:
            results_by_n[str(n_views)] = {
                "n": 0,
                "error": "no_successful_forwards",
                "errors": errors,
            }
            continue
        probs = np.stack(probs_list, axis=0)
        labels = np.array(labels_list, dtype=int)
        top1 = float((probs.argmax(1) == labels).mean())
        map3 = map_at_k(probs, labels, 3)
        rej = open_set_reject(probs, conf_thr, mar_thr, ent_thr)
        keep = ~rej
        results_by_n[str(n_views)] = {
            "n": int(len(labels)),
            "errors": errors,
            "top1": round(top1, 4),
            "map_at_3": round(map3, 4),
            "reject_rate": round(float(rej.mean()), 4),
            "acc_keep": round(float((probs.argmax(1) == labels)[keep].mean()), 4)
            if keep.any()
            else None,
            "ms_per_pack_mean": round(ms_total / max(len(labels), 1), 2),
            "temperature": temperature,
            "interpretation": {
                1: "single photo from same occurrence",
                2: "two photos same occurrence",
                4: "up to four photos same occurrence (cycle-pad if fewer)",
            }[n_views],
        }

    # Leave-one-photo-out: full first-4 vs each held-out single among first-4
    loo_block: dict[str, Any] | None = None
    if do_loo and selected:
        full_probs = []
        loo_probs = []  # mean metrics over leave-one
        labels_loo = []
        n_loo_slots = 0
        loo_errors = 0
        for pack in selected:
            paths4 = [Path(p) for p in pack["paths"][:4]]
            if len(paths4) < 2:
                continue
            # pad to 4 only if needed for full-packet comparison
            while len(paths4) < 4:
                paths4.append(paths4[len(paths4) % max(len(paths4), 1)])
            try:
                pr_full = _forward_paths(paths4)
                # LOO: for each left-out index, predict on remaining 3
                slot_hits = []
                for leave in range(4):
                    kept = [paths4[i] for i in range(4) if i != leave]
                    pr_k = _forward_paths(kept)
                    slot_hits.append(pr_k)
                    n_loo_slots += 1
                # average LOO probs across leave-outs (or evaluate each — use mean AP later)
                pr_loo_mean = np.mean(np.stack(slot_hits, axis=0), axis=0)
                full_probs.append(pr_full)
                loo_probs.append(pr_loo_mean)
                labels_loo.append(int(pack["label_idx"]))
            except Exception as exc:  # noqa: BLE001
                loo_errors += 1
                if loo_errors <= 2:
                    print(f"  loo warn {pack['occurrence_id']}: {exc}", file=sys.stderr)
                continue
        if full_probs:
            fp = np.stack(full_probs)
            lp = np.stack(loo_probs)
            y = np.array(labels_loo, dtype=int)
            loo_block = {
                "n_packs": int(len(y)),
                "n_loo_forwards": n_loo_slots,
                "errors": loo_errors,
                "full4_map_at_3": round(map_at_k(fp, y, 3), 4),
                "full4_top1": round(float((fp.argmax(1) == y).mean()), 4),
                "loo_mean_map_at_3": round(map_at_k(lp, y, 3), 4),
                "loo_mean_top1": round(float((lp.argmax(1) == y).mean()), 4),
                "delta_map3_full_minus_loo": round(
                    map_at_k(fp, y, 3) - map_at_k(lp, y, 3), 4
                ),
                "interpretation": (
                    "full4 = first 4 media of occurrence; loo_mean = mean softmax over "
                    "leave-one-of-4 remaining triples (same occurrence)"
                ),
            }

    return {
        "ok": True,
        "load_seconds": round(load_s, 3),
        "device": device,
        "n_packs_attempted": len(selected),
        "n_species_in_sample": n_species,
        "sampling": "stratified_round_robin_by_species",
        "temperature": temperature,
        "by_n_views": results_by_n,
        "leave_one_photo_out": loo_block,
        "arch": meta.get("arch"),
        "num_classes": n_cls,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Paired multi-view LOO / n-views eval")
    ap.add_argument("--image-root", type=Path, default=GBIF_IMAGES)
    ap.add_argument("--weights", type=Path, default=WEIGHTS)
    ap.add_argument("--label2idx", type=Path, default=LABEL2IDX)
    ap.add_argument("--max-packs", type=int, default=80)
    ap.add_argument("--min-images", type=int, default=2)
    ap.add_argument("--device", type=str, default="cpu")
    ap.add_argument("--temperature", type=float, default=None, help="Softmax T (default: metrics.json)")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--no-loo", action="store_true", help="Skip leave-one-photo-out block")
    ap.add_argument(
        "--deadly-only",
        action="store_true",
        help="Restrict packs to industrial deadly taxa present in label2idx",
    )
    ap.add_argument("--skip-torch", action="store_true")
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args()

    if not args.label2idx.is_file():
        print(f"ERROR: missing {args.label2idx}", file=sys.stderr)
        return 2
    l2i = json.loads(args.label2idx.read_text(encoding="utf-8"))
    label2idx = {str(k): int(v) for k, v in l2i.items()}

    if not args.image_root.is_dir():
        rep = {
            "generated": now_iso(),
            "product_unlock": False,
            "ok": False,
            "reason": "image_root_missing",
            "image_root": str(args.image_root),
        }
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(rep, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(rep, indent=2))
        return 2

    packs = inventory_packs(args.image_root, label2idx, min_images=args.min_images)
    deadly_filter: list[str] | None = None
    if args.deadly_only:
        deadly_path = REPO / "data" / "industrial_v1" / "deadly_set.json"
        deadly_names: set[str] = set()
        if deadly_path.is_file():
            raw = json.loads(deadly_path.read_text(encoding="utf-8"))
            names = raw if isinstance(raw, list) else raw.get("species") or raw.get("latin_names") or []
            if names and isinstance(names[0], dict):
                names = [x.get("latin_name") or x.get("name") for x in names]
            deadly_names = {str(n) for n in names if n and n in label2idx}
        packs = [p for p in packs if p["species"] in deadly_names]
        deadly_filter = sorted(deadly_names)
    ge4 = sum(1 for p in packs if p["n_images"] >= 4)
    conf, mar, ent = load_thresholds()
    temperature = args.temperature
    if temperature is None:
        metrics_path = args.weights.parent / "metrics.json"
        temperature = 1.588
        if metrics_path.is_file():
            try:
                md = json.loads(metrics_path.read_text(encoding="utf-8"))
                if md.get("temperature") is not None:
                    temperature = float(md["temperature"])
            except (OSError, ValueError, TypeError):
                pass

    protocol = "same_occurrence_multi_image_gbif_local_stratified"
    if args.deadly_only:
        protocol += "_deadly_only"

    report: dict[str, Any] = {
        "generated": now_iso(),
        "product_unlock": False,
        "policy": "orientation_only_never_consume",
        "image_root": str(args.image_root),
        "protocol": protocol,
        "deadly_only": bool(args.deadly_only),
        "deadly_taxa_in_label_space": deadly_filter,
        "note": (
            "Packs grouped by GBIF occurrence id prefix in filenames. "
            "Multiple media of the same occurrence — not FungiTastic view slots. "
            "View order is arbitrary (filename sort), not labeled gills/front. "
            "Sample is stratified round-robin by species; T from E20 metrics."
            + (" Deadly-only filter applied." if args.deadly_only else "")
        ),
        "inventory": {
            "n_packs_ge2": len(packs),
            "n_packs_ge4": ge4,
            "n_species": len({p["species"] for p in packs}),
            "max_images": max((p["n_images"] for p in packs), default=0),
        },
        "thresholds": {
            "conf": conf,
            "margin": mar,
            "entropy": ent,
            "temperature": temperature,
        },
        "torch": None,
    }

    if args.skip_torch or not args.weights.is_file():
        report["torch"] = {
            "ok": False,
            "skipped": True,
            "reason": "skip_torch or weights missing",
        }
    else:
        preferred = [p for p in packs if p["n_images"] >= 4] or packs
        report["torch"] = run_torch_eval(
            preferred,
            weights=args.weights,
            device=args.device,
            conf_thr=conf,
            mar_thr=mar,
            ent_thr=ent,
            max_packs=args.max_packs,
            temperature=float(temperature),
            do_loo=not args.no_loo,
            seed=args.seed,
        )
        by = (report["torch"] or {}).get("by_n_views") or {}
        if "1" in by and "4" in by and by["1"].get("n") and by["4"].get("n"):
            report["deltas"] = {
                "map3_4_minus_1": round(
                    float(by["4"]["map_at_3"]) - float(by["1"]["map_at_3"]), 4
                ),
                "map3_2_minus_1": round(
                    float(by["2"]["map_at_3"]) - float(by["1"]["map_at_3"]), 4
                )
                if by.get("2", {}).get("map_at_3") is not None
                else None,
                "top1_4_minus_1": round(
                    float(by["4"]["top1"]) - float(by["1"]["top1"]), 4
                ),
                "reject_1_minus_4": round(
                    float(by["1"]["reject_rate"]) - float(by["4"]["reject_rate"]), 4
                ),
            }
            report["gates"] = {
                "map3_full_ge_single": by["4"]["map_at_3"] >= by["1"]["map_at_3"] - 1e-6,
                "map3_pair_ge_single": (
                    by.get("2", {}).get("map_at_3", 0) >= by["1"]["map_at_3"] - 1e-6
                ),
                "reject_not_worse_with_more_views": by["4"]["reject_rate"]
                <= by["1"]["reject_rate"] + 0.08,
            }
        loo = (report["torch"] or {}).get("leave_one_photo_out")
        if loo and loo.get("n_packs"):
            report["loo_summary"] = {
                "full4_map_at_3": loo.get("full4_map_at_3"),
                "loo_mean_map_at_3": loo.get("loo_mean_map_at_3"),
                "delta_map3_full_minus_loo": loo.get("delta_map3_full_minus_loo"),
            }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    md = args.out.with_suffix(".md")
    inv = report["inventory"]
    lines = [
        "# Paired multi-view LOO / n-views (local GBIF)",
        "",
        f"**Generated:** {report['generated']}",
        f"**product_unlock:** `false`",
        f"**Packs ≥2 / ≥4:** {inv['n_packs_ge2']} / {inv['n_packs_ge4']} · species {inv['n_species']}",
        "",
        report.get("note") or "",
        "",
    ]
    torch_r = report.get("torch") or {}
    if torch_r.get("by_n_views"):
        lines.append("## Torch results (stratified)")
        lines.append("")
        lines.append(
            f"n_packs={torch_r.get('n_packs_attempted')} · species={torch_r.get('n_species_in_sample')} · T={torch_r.get('temperature')}"
        )
        lines.append("")
        lines.append("| n_views | n | MAP@3 | top1 | reject |")
        lines.append("|--------:|--:|------:|-----:|-------:|")
        for k in ("1", "2", "4"):
            b = torch_r["by_n_views"].get(k) or {}
            if not b or b.get("n") is None:
                continue
            lines.append(
                f"| {k} | {b.get('n')} | {b.get('map_at_3')} | {b.get('top1')} | {b.get('reject_rate')} |"
            )
        if report.get("deltas"):
            lines.append("")
            lines.append(f"Deltas: `{json.dumps(report['deltas'])}`")
        loo = torch_r.get("leave_one_photo_out")
        if loo:
            lines.append("")
            lines.append("## Leave-one-photo-out (same occurrence)")
            lines.append("")
            lines.append(
                f"- full4 MAP@3={loo.get('full4_map_at_3')} top1={loo.get('full4_top1')}"
            )
            lines.append(
                f"- loo_mean MAP@3={loo.get('loo_mean_map_at_3')} top1={loo.get('loo_mean_top1')}"
            )
            lines.append(f"- Δ full−loo MAP@3={loo.get('delta_map3_full_minus_loo')}")
    md.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "ok": True,
                "out": str(args.out),
                "packs_ge2": inv["n_packs_ge2"],
                "packs_ge4": inv["n_packs_ge4"],
                "torch_ok": bool((report.get("torch") or {}).get("ok")),
                "n_packs": (report.get("torch") or {}).get("n_packs_attempted"),
                "n_species": (report.get("torch") or {}).get("n_species_in_sample"),
                "deltas": report.get("deltas"),
                "loo_summary": report.get("loo_summary"),
                "product_unlock": False,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
