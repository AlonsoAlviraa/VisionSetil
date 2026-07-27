#!/usr/bin/env python3
"""Honest GBIF-only hold-out evaluation of E19 best.pt (offline, local images).

Protocol (documented in report):
  1. Load industrial allowlist 40 + deadly set.
  2. Load local GBIF observations from obs_gbif_es.jsonl with existing images.
  3. fair_cap_observations: 200 normal / 400 deadly, prefer cc_ok (same as E19).
  4. Anti-leak stratified split by observation_id (seed=42, 70/15/15) — pure GBIF.
  5. Evaluate E19 checkpoint on the **test** partition only.
  6. Contamination note: E19 already trained on a random ~70% of a *mixed* FT+GBIF
     fair_cap pool. Local pure-GBIF fair_cap selects a different obs set (full cap
     to one source). We estimate upper-bound contamination as ~70% of any GBIF obs
     that *could* have been in E19 train under the Kaggle mixed split (not exact).

Metrics: MAP@3, top-1, top-3, macro-F1, deadly@3, per-species worst list, ECE
(temperature scaler if loadable).

Outputs:
  eval/reports/ml_experiments/e19_gbif_holdout.md
  eval/reports/ml_experiments/e19_gbif_holdout.json

Orientation only — never consumption permission.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import numpy as np
import pandas as pd

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO))

from kaggle.fungi_csv_loader import fair_cap_observations  # noqa: E402
from scripts.audit_e19_leak import (  # noqa: E402
    DEADLY_FORCE,
    MAX_OBS,
    MAX_OBS_DEADLY,
    SEED,
    TEST_SIZE,
    VAL_SIZE,
    anti_leak_split_obs,
    deadly_recall_at_k,
    deadly_top1_from_preds,
    ece_naive,
    load_allowlist,
    load_deadly_names,
    map_at_k,
    topk_hit,
)

E19_MODELS = REPO / "kaggle" / "kernel_output_v19" / "models"
GBIF_JSONL = REPO / "data" / "industrial_v1" / "obs_gbif_es.jsonl"
OUT_MD = REPO / "eval" / "reports" / "ml_experiments" / "e19_gbif_holdout.md"
OUT_JSON = REPO / "eval" / "reports" / "ml_experiments" / "e19_gbif_holdout.json"

VIEW_TYPES = ("gills", "front", "habitat", "detail")
VIEW_TO_IDX = {v: i for i, v in enumerate(VIEW_TYPES)}


def load_local_gbif_df() -> pd.DataFrame:
    """Load GBIF jsonl; resolve paths relative to REPO."""
    rows: list[dict] = []
    with GBIF_JSONL.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            o = json.loads(line)
            sp = str(o.get("species", "")).strip()
            oid = str(o.get("observation_id", ""))
            paths = o.get("image_paths") or []
            if isinstance(paths, str):
                paths = [paths]
            for p in paths:
                rel = str(p).replace("\\", "/")
                full = REPO / rel
                if not full.exists():
                    # fallback: images/<Species>/<basename>
                    sp_dir = sp.replace(" ", "_")
                    alt = REPO / "data" / "industrial_v1" / "gbif" / "images" / sp_dir / Path(rel).name
                    if alt.exists():
                        full = alt
                    else:
                        continue
                rows.append(
                    {
                        "image_path": str(full.resolve()),
                        "species": sp,
                        "observation_id": oid if oid.startswith("gbif_") else f"gbif_{oid}",
                        "genus": sp.split()[0] if sp else "unknown",
                        "family": "unknown",
                        "habitat": "unknown",
                        "substrate": "unknown",
                        "smell": "unknown",
                        "country": o.get("country") or "ES",
                        "license_class": str(o.get("license_class") or "unknown").lower(),
                        "source_db": "gbif_es",
                    }
                )
    return pd.DataFrame(rows)


def build_obs_records(df: pd.DataFrame, max_views: int = 4) -> list[dict]:
    records = []
    for oid, g in df.groupby("observation_id"):
        sp = str(g["species"].iloc[0])
        images = []
        for _, row in g.head(max_views).iterrows():
            images.append((str(row["image_path"]), "front"))
        if not images:
            continue
        records.append(
            {
                "observation_id": str(oid),
                "species": sp,
                "images": images,
                "habitat": str(g["habitat"].iloc[0]) if "habitat" in g.columns else "unknown",
                "substrate": str(g["substrate"].iloc[0]) if "substrate" in g.columns else "unknown",
                "smell": str(g["smell"].iloc[0]) if "smell" in g.columns else "unknown",
                "country": str(g["country"].iloc[0]) if "country" in g.columns else "ES",
            }
        )
    return records


def ece_binned(probs: np.ndarray, labels: np.ndarray, n_bins: int = 15) -> float:
    """Standard reliability-diagram ECE (15 bins by default)."""
    conf = probs.max(axis=1)
    pred = probs.argmax(axis=1)
    correct = (pred == labels).astype(np.float64)
    bins = np.linspace(0.0, 1.0, n_bins + 1)
    ece = 0.0
    for i in range(n_bins):
        hi = bins[i + 1] if i < n_bins - 1 else bins[i + 1] + 1e-9
        m = (conf >= bins[i]) & (conf < hi)
        if not np.any(m):
            continue
        ece += abs(correct[m].mean() - conf[m].mean()) * float(m.mean())
    return float(ece)


def macro_f1(preds: np.ndarray, labels: np.ndarray) -> float:
    """Sklearn-compatible macro-F1 over labels present in y_true (zero_division=0)."""
    try:
        from sklearn.metrics import f1_score

        return float(f1_score(labels, preds, average="macro", zero_division=0))
    except Exception:
        # fallback: average only classes with support > 0
        present = sorted(set(int(x) for x in labels.tolist()))
        f1s = []
        for c in present:
            tp = int(((preds == c) & (labels == c)).sum())
            fp = int(((preds == c) & (labels != c)).sum())
            fn = int(((preds != c) & (labels == c)).sum())
            prec = tp / (tp + fp) if (tp + fp) else 0.0
            rec = tp / (tp + fn) if (tp + fn) else 0.0
            f1s.append(2 * prec * rec / (prec + rec) if (prec + rec) else 0.0)
        return float(np.mean(f1s)) if f1s else 0.0


def load_model(device: str):
    import torch
    from backend.app.ml.multiview_v8 import load_v8_from_checkpoint

    ckpt = torch.load(E19_MODELS / "best.pt", map_location=device, weights_only=False)
    model, info = load_v8_from_checkpoint(ckpt, device=device)
    meta_vocab = ckpt.get("metadata_vocab") or {}
    # ensure defaults
    for field in ("habitat", "substrate", "smell", "country"):
        if field not in meta_vocab:
            meta_vocab[field] = {"<unk>": 0, "unknown": 1}
    label2idx = ckpt.get("label2idx") or json.loads(
        (E19_MODELS / "label2idx.json").read_text(encoding="utf-8")
    )
    return model, label2idx, meta_vocab, info


def apply_temperature(logits, temp_path: Path, device: str):
    import torch
    import torch.nn.functional as F

    if not temp_path.exists():
        return F.softmax(logits, dim=-1), None
    ts = torch.load(temp_path, map_location=device, weights_only=False)
    # E19 stores log_temp [16] combo temperatures — use mean exp
    if isinstance(ts, dict) and "log_temp" in ts:
        log_t = ts["log_temp"]
        if hasattr(log_t, "detach"):
            T = float(torch.exp(log_t).mean().item())
        else:
            T = float(np.exp(np.mean(np.asarray(log_t))))
    elif isinstance(ts, dict) and "temperature" in ts:
        T = float(ts["temperature"])
    else:
        T = 1.0
    T = max(T, 1e-3)
    return F.softmax(logits / T, dim=-1), T


def run_inference(
    model,
    records: list[dict],
    label2idx: dict[str, int],
    meta_vocab: dict,
    device: str,
    batch_size: int = 4,
    image_size: int = 224,
    max_views: int = 2,
) -> tuple[np.ndarray, np.ndarray, list[str], list[str], dict[str, int]]:
    import torch
    from PIL import Image
    from torchvision import transforms

    # Some GBIF StillImages are huge; allow load + resize (not a security boundary here).
    Image.MAX_IMAGE_PIXELS = 200_000_000

    tfm = transforms.Compose(
        [
            transforms.Resize((image_size, image_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )

    # filter to known labels
    usable = [r for r in records if r["species"] in label2idx]
    skipped_label = len(records) - len(usable)
    if skipped_label:
        print(f"  skip {skipped_label} obs with species outside label2idx")

    # Pre-load images; drop obs with zero successful loads (no blank tensors in metrics)
    prepared: list[dict] = []
    n_failed_images = 0
    n_dropped_obs_no_image = 0
    for rec in usable:
        tensors = []
        views = []
        for path, vtype in rec["images"][:max_views]:
            try:
                im = Image.open(path).convert("RGB")
                tensors.append(tfm(im))
                views.append(VIEW_TO_IDX.get(vtype, 1))
            except Exception:
                n_failed_images += 1
        if not tensors:
            n_dropped_obs_no_image += 1
            continue
        prepared.append({**rec, "_tensors": tensors, "_views": views})
    if n_dropped_obs_no_image or n_failed_images:
        print(
            f"  image load: failed_imgs={n_failed_images} "
            f"dropped_obs_no_image={n_dropped_obs_no_image} kept={len(prepared)}"
        )

    all_probs: list[np.ndarray] = []
    all_labels: list[int] = []
    all_oids: list[str] = []
    all_spp: list[str] = []

    model.eval()
    t0 = time.time()
    n = len(prepared)
    for start in range(0, n, batch_size):
        batch = prepared[start : start + batch_size]
        B = len(batch)
        N = max_views
        images = torch.zeros(B, N, 3, image_size, image_size, device=device)
        view_idx = torch.zeros(B, N, dtype=torch.long, device=device)
        mask = torch.zeros(B, N, dtype=torch.bool, device=device)
        meta = {
            k: torch.zeros(B, dtype=torch.long, device=device)
            for k in ("habitat", "substrate", "smell", "country")
        }
        labels_b = []
        oids_b = []
        spp_b = []

        for bi, rec in enumerate(batch):
            for vi, (ten, vidx) in enumerate(zip(rec["_tensors"], rec["_views"])):
                images[bi, vi] = ten
                view_idx[bi, vi] = int(vidx)
                mask[bi, vi] = True
            for field in ("habitat", "substrate", "smell", "country"):
                val = rec.get(field, "unknown") or "unknown"
                vocab = meta_vocab.get(field, {"<unk>": 0, "unknown": 1})
                meta[field][bi] = int(vocab.get(val, vocab.get("unknown", 0)))
            labels_b.append(label2idx[rec["species"]])
            oids_b.append(rec["observation_id"])
            spp_b.append(rec["species"])

        with torch.no_grad():
            logits, _ = model(images, view_idx, mask, meta, labels=None)
            probs, _T = apply_temperature(logits, E19_MODELS / "temperature_scaler.pt", device)
            all_probs.append(probs.cpu().numpy())
        all_labels.extend(labels_b)
        all_oids.extend(oids_b)
        all_spp.extend(spp_b)

        done = min(start + batch_size, n)
        if done % 50 == 0 or done == n or done == 0:
            elapsed = time.time() - t0
            rate = done / max(elapsed, 1e-6) if done else 0.0
            eta = (n - done) / max(rate, 1e-6) if rate else 0.0
            print(f"  infer {done}/{n} ({rate:.1f} obs/s, ETA {eta/60:.1f} min)")

    probs = np.concatenate(all_probs, axis=0) if all_probs else np.zeros((0, 40), dtype=np.float32)
    labels = np.array(all_labels, dtype=np.int64)
    load_stats = {
        "skipped_outside_label2idx": skipped_label,
        "n_failed_images": n_failed_images,
        "n_dropped_obs_no_image": n_dropped_obs_no_image,
        "n_evaluated": int(len(labels)),
    }
    return probs, labels, all_oids, all_spp, load_stats


def main() -> int:
    ap = argparse.ArgumentParser(description="E19 GBIF-only hold-out eval")
    ap.add_argument("--batch-size", type=int, default=4)
    ap.add_argument("--max-views", type=int, default=2)
    ap.add_argument("--max-test-obs", type=int, default=0, help="0=all; else cap for smoke")
    ap.add_argument("--device", type=str, default="cpu")
    ap.add_argument("--seed", type=int, default=SEED)
    args = ap.parse_args()

    print("=== E19 GBIF-only hold-out ===")
    print("Loading local GBIF…")
    df = load_local_gbif_df()
    print(f"  raw existing images: {len(df)} | obs: {df['observation_id'].nunique()} | spp: {df['species'].nunique()}")

    allow = {a.lower() for a in load_allowlist()}
    df = df[df["species"].str.lower().isin(allow)].copy()
    print(f"  after allowlist40: {len(df)} imgs | {df['observation_id'].nunique()} obs | {df['species'].nunique()} spp")

    df_cap = fair_cap_observations(
        df,
        max_obs=MAX_OBS,
        max_obs_deadly=MAX_OBS_DEADLY,
        deadly_force=DEADLY_FORCE,
        prefer_cc_ok=True,
    )
    df_cap = df_cap.drop_duplicates(subset=["image_path"], keep="first")
    print(
        f"  post fair_cap 200/400: {len(df_cap)} imgs | "
        f"{df_cap['observation_id'].nunique()} obs | {df_cap['species'].nunique()} spp"
    )

    train_df, val_df, test_df, split_meta = anti_leak_split_obs(
        df_cap, val_size=VAL_SIZE, test_size=TEST_SIZE, seed=args.seed
    )
    print(f"  split: {split_meta}")
    assert split_meta["pass"], f"LEAK in hold-out split: {split_meta['leaks']}"

    test_records = build_obs_records(test_df, max_views=args.max_views)
    if args.max_test_obs and args.max_test_obs > 0:
        # stratified subsample of test records
        by_sp: dict[str, list] = defaultdict(list)
        for r in test_records:
            by_sp[r["species"]].append(r)
        rng = np.random.default_rng(args.seed)
        picked = []
        # round-robin until cap
        spp_list = sorted(by_sp.keys())
        while len(picked) < args.max_test_obs and any(by_sp[s] for s in spp_list):
            for s in spp_list:
                if by_sp[s] and len(picked) < args.max_test_obs:
                    picked.append(by_sp[s].pop())
        test_records = picked
        print(f"  capped test to {len(test_records)} obs")

    print(f"  test observations to evaluate: {len(test_records)}")

    print("Loading E19 best.pt…")
    model, label2idx, meta_vocab, info = load_model(args.device)
    print(f"  hparams: {info['hparams']}")

    # temperature from metrics.json
    metrics_e19 = {}
    if (E19_MODELS / "metrics.json").exists():
        metrics_e19 = json.loads((E19_MODELS / "metrics.json").read_text(encoding="utf-8"))

    print("Running inference…")
    t0 = time.time()
    probs, labels, oids, spp, load_stats = run_inference(
        model,
        test_records,
        label2idx,
        meta_vocab,
        device=args.device,
        batch_size=args.batch_size,
        max_views=args.max_views,
    )
    elapsed = time.time() - t0
    print(f"  done in {elapsed/60:.1f} min")

    preds = probs.argmax(axis=1)
    i2l = {int(v): k for k, v in label2idx.items()}
    deadly_names = {n.lower() for n in load_deadly_names()}
    deadly_idxs = {i for i, n in i2l.items() if n.lower() in deadly_names}

    # Recompute E19 deadly@3 from official mixed test npz (true definition)
    e19_deadly_at3 = None
    e19_deadly_top1_npz = None
    e19_ece_naive = None
    npz_path = E19_MODELS / "test_predictions.npz"
    if npz_path.exists() and (E19_MODELS / "label2idx.json").exists():
        z = np.load(npz_path, allow_pickle=True)
        ep = z["probs"]
        el = z["labels"].astype(int)
        epr = z["preds"].astype(int)
        e19_deadly_at3, _ = deadly_recall_at_k(ep, el, deadly_idxs, 3)
        e19_deadly_top1_npz, _ = deadly_top1_from_preds(epr, el, deadly_idxs)
        e19_ece_naive = ece_naive(ep, el)

    map3 = map_at_k(probs, labels, 3) if len(labels) else 0.0
    top1 = float((preds == labels).mean()) if len(labels) else 0.0
    top3 = topk_hit(probs, labels, 3) if len(labels) else 0.0
    f1 = macro_f1(preds, labels) if len(labels) else 0.0
    d3, n_d = deadly_recall_at_k(probs, labels, deadly_idxs, 3)
    d1, _ = deadly_top1_from_preds(preds, labels, deadly_idxs)
    ece15 = ece_binned(probs, labels, 15) if len(labels) else 0.0
    ece_n = ece_naive(probs, labels) if len(labels) else 0.0

    # bootstrap CI for MAP@3
    rng = np.random.default_rng(args.seed)
    if len(labels):
        boots = []
        for _ in range(200):
            idx = rng.integers(0, len(labels), size=len(labels))
            boots.append(map_at_k(probs[idx], labels[idx], 3))
        ci_lo, ci_hi = float(np.percentile(boots, 2.5)), float(np.percentile(boots, 97.5))
    else:
        ci_lo, ci_hi = 0.0, 0.0

    per_class = []
    for idx, name in sorted(i2l.items(), key=lambda x: x[1]):
        m = labels == idx
        n = int(m.sum())
        if n == 0:
            continue
        acc = float((preds[m] == labels[m]).mean())
        top = np.argsort(probs[m], axis=1)[:, ::-1][:, :3]
        map_c = float(
            np.mean(
                [
                    1.0 / (np.where(top[i] == labels[m][i])[0][0] + 1)
                    if len(np.where(top[i] == labels[m][i])[0])
                    else 0.0
                    for i in range(n)
                ]
            )
        )
        per_class.append(
            {
                "species": name,
                "n": n,
                "top1": acc,
                "map3": map_c,
                "deadly": name.lower() in deadly_names,
            }
        )
    per_class.sort(key=lambda r: (r["map3"], r["top1"], r["n"]))

    # contamination estimate
    # E19: 8665 obs total mixed, ~6065 train (~70%). GBIF was 12326/23263 imgs ≈ 53% of pool.
    # Without FT we cannot list exact train GBIF oids. Honest bound:
    contamination = {
        "protocol": "pure_gbif_anti_leak_split_seed42",
        "e19_trained_on_mixed_ft_gbif": True,
        "e19_train_frac": 0.70,
        "e19_gbif_imgs_post_cap": 12326,
        "e19_ft_imgs_post_cap": 10937,
        "local_gbif_post_cap_obs": int(df_cap["observation_id"].nunique()),
        "local_test_obs": len(labels),
        "estimate": (
            "E19 randomly assigned ~70% of its post-cap observation pool to train. "
            "Local pure-GBIF fair_cap selects a DIFFERENT observation set than E19's "
            "per-source reserved cap. Therefore train-overlap for this hold-out is "
            "UNKNOWN but non-zero expected. Treat scores as UPPER BOUND on true "
            "unseen-GBIF performance (data contamination possible)."
        ),
        "contamination_risk": "medium-high",
        "strict_unseen_gbif": False,
    }

    e19_map = float(metrics_e19.get("test_map_at_3") or 0)
    e19_top1 = float(metrics_e19.get("test_accuracy") or 0)
    e19_deadly_top1_stored = float(metrics_e19.get("safety_recall_deadly") or 0)
    e19_d3 = float(e19_deadly_at3) if e19_deadly_at3 is not None else None
    e19_d1 = (
        float(e19_deadly_top1_npz)
        if e19_deadly_top1_npz is not None
        else e19_deadly_top1_stored
    )

    result = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "experiment": "E19-gbif-holdout",
        "checkpoint": str(E19_MODELS / "best.pt"),
        "orientation_only": True,
        "protocol": {
            "allowlist": "industrial_v1 40 spp",
            "source": "local obs_gbif_es.jsonl + images",
            "fair_cap": {"max_obs": MAX_OBS, "max_obs_deadly": MAX_OBS_DEADLY, "prefer_cc_ok": True},
            "split": "anti_leak observation_id stratified 70/15/15 seed=42",
            "eval_partition": "test",
            "max_views": args.max_views,
            "device": args.device,
            "fungitastic_local": False,
            "note_max_views": (
                "Checkpoint is multi-view trained; max_views=1 is a domain mismatch "
                "documented for offline CPU eval."
            ),
            "macro_f1": "sklearn f1_score average=macro zero_division=0 (classes in y_true)",
        },
        "pool": {
            "raw_imgs": int(len(df)),
            "post_cap_imgs": int(len(df_cap)),
            "post_cap_obs": int(df_cap["observation_id"].nunique()),
            "post_cap_species": int(df_cap["species"].nunique()) if len(df_cap) else 0,
            "split": split_meta,
            "species_dropped_min_per_class": split_meta.get("species_dropped_min_per_class"),
            "n_species_in_split": split_meta.get("n_species"),
            "load_stats": load_stats,
        },
        "contamination": contamination,
        "metrics": {
            "n_test_obs": int(len(labels)),
            "map_at_3": map3,
            "map_at_3_ci_low": ci_lo,
            "map_at_3_ci_high": ci_hi,
            "top1": top1,
            "top3": top3,
            "macro_f1": f1,
            "deadly_at_3": d3,
            "deadly_top1": d1,
            "n_deadly": n_d,
            "ece_naive": ece_n,
            "ece_binned_15": ece15,
            "temperature_metrics_json": metrics_e19.get("temperature"),
            "elapsed_sec": elapsed,
        },
        "e19_headline": {
            "map_at_3": e19_map,
            "top1": e19_top1,
            "deadly_top1": e19_d1,
            "deadly_top1_source": (
                "metrics.json safety_recall_deadly (gen_notebook test cell = top-1, "
                "NOT @3; verified vs npz)"
            ),
            "deadly_at_3": e19_d3,
            "deadly_at_3_source": "recomputed from test_predictions.npz top-3 hit among deadly",
            "safety_recall_deadly_raw": e19_deadly_top1_stored,
            "ece_naive": e19_ece_naive if e19_ece_naive is not None else metrics_e19.get("test_ece"),
            "ece_naive_source": "mean(|max_prob-correct|); metrics.json test_ece",
            "ece_binned_15": None,
            "macro_f1": metrics_e19.get("test_f1_macro"),
        },
        "delta_vs_headline": {
            "map_at_3": map3 - e19_map,
            "top1": top1 - e19_top1,
            "deadly_at_3": (d3 - e19_d3) if e19_d3 is not None else None,
            "deadly_top1": d1 - e19_d1,
            "ece_naive": (ece_n - float(e19_ece_naive))
            if e19_ece_naive is not None
            else (ece_n - float(metrics_e19.get("test_ece") or 0)),
            "note": (
                "deadly_at_3 Δ uses recomputed E19 @3 from npz, NOT safety_recall_deadly "
                "(which is top-1)."
            ),
        },
        "worst_species": per_class[:15],
        "product_gates_trustworthy": "partial" if map3 >= 0.5 else "no",
        "product_recommendation": "",
    }

    # gates from E19 soft thresholds (orientation research only)
    gate_map = 0.25
    gate_deadly = 0.50
    soft_deadly = 0.90
    pass_map = map3 >= gate_map
    pass_deadly = d3 >= gate_deadly
    pass_soft_deadly = d3 >= soft_deadly

    if map3 >= 0.90 and d3 >= 0.90:
        # still suspiciously high → contamination likely
        result["product_gates_trustworthy"] = "partial"
        result["product_recommendation"] = (
            f"GBIF-only hold-out MAP@3={map3:.3f} deadly@3={d3:.3f} still high — "
            "possible train contamination and/or easy GBIF StillImage domain. "
            "Do NOT unlock product Identify; require true unseen field photos + "
            "source-holdout retrain (E20)."
        )
    elif pass_map and pass_deadly:
        result["product_gates_trustworthy"] = "partial"
        result["product_recommendation"] = (
            f"Hold-out passes research expand gates (MAP@3≥{gate_map}, deadly@3≥{gate_deadly}) "
            f"with MAP@3={map3:.3f}, deadly@3={d3:.3f}. Soft deadly≥0.90: "
            f"{'PASS' if pass_soft_deadly else 'FAIL'}. Contamination risk remains — "
            "orientation only, no consumption permission, no product ID unlock."
        )
    else:
        result["product_gates_trustworthy"] = "no"
        result["product_recommendation"] = (
            f"Hold-out FAILS research gates: MAP@3={map3:.3f} (need ≥{gate_map}), "
            f"deadly@3={d3:.3f} (need ≥{gate_deadly}). E19 headline metrics are NOT "
            "trustworthy for product. Keep orientation-only; do not expand allowlist."
        )

    # write reports
    OUT_MD.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(result, indent=2, default=str) + "\n", encoding="utf-8")

    dropped = split_meta.get("species_dropped_min_per_class") or []
    d3_delta = result["delta_vs_headline"]["deadly_at_3"]
    d3_delta_s = f"{d3_delta:+.4f}" if d3_delta is not None else "—"
    e19_d3_s = f"{e19_d3:.4f}" if e19_d3 is not None else "—"

    md = [
        "# E19 GBIF-only hold-out evaluation",
        "",
        f"**Generated:** {result['generated_at']}",
        f"**Checkpoint:** `{E19_MODELS / 'best.pt'}`",
        f"**Product gates trustworthy:** **{result['product_gates_trustworthy']}**",
        "",
        "> Orientation only — never consumption permission. Allowlist 40 spp.",
        "",
        "## Protocol",
        "",
        "1. Load industrial allowlist 40 + deadly set (11 taxa).",
        "2. Load local `data/industrial_v1/obs_gbif_es.jsonl` with existing images under "
        "`data/industrial_v1/gbif/images/`.",
        "3. `fair_cap_observations` max_obs=200 / max_obs_deadly=400, prefer `cc_ok`.",
        "4. Anti-leak stratified split by `observation_id` (seed=42, val=15%, test=15%, min_per_class=4).",
        "5. Evaluate E19 `best.pt` (ConvNeXtV2-tiny multi-view v8) on **test** obs only.",
        "6. FungiTastic **not** available locally — pure GBIF hold-out with contamination caveat.",
        "7. Drop observations with zero successful image loads (no blank-tensor inference).",
        "",
        "### Metric definitions (important)",
        "",
        "- **Deadly@3**: true class in top-3 among deadly-labeled samples (val loop + this hold-out).",
        "- **Deadly top-1**: argmax equals true deadly class. E19 `metrics.json` field "
        "`safety_recall_deadly` is **top-1**, despite gate logs saying deadly@3.",
        "- **ECE naive**: `mean(|max_prob − correct|)` — E19 `test_ece`.",
        "- **ECE 15-bin**: standard reliability-diagram ECE (hold-out only).",
        "- **Macro-F1**: sklearn `average='macro', zero_division=0` (aligned with E19).",
        "",
        "### Contamination honesty",
        "",
        contamination["estimate"],
        "",
        f"- Contamination risk: **{contamination['contamination_risk']}**",
        f"- Strict unseen GBIF: **{contamination['strict_unseen_gbif']}**",
        "",
        "## Pool / split",
        "",
        f"| Stage | Imgs | Obs | Species |",
        f"|-------|-----:|----:|--------:|",
        f"| Raw existing | {result['pool']['raw_imgs']} | — | 40 allowlist |",
        f"| Post fair_cap | {result['pool']['post_cap_imgs']} | {result['pool']['post_cap_obs']} | {result['pool']['post_cap_species']} |",
        f"| After min_per_class=4 | — | — | **{split_meta.get('n_species')}** |",
        f"| Train | — | {split_meta['n_train_obs']} | |",
        f"| Val | — | {split_meta['n_val_obs']} | |",
        f"| **Test (eval)** | — | **{result['metrics']['n_test_obs']}** | |",
        "",
        f"Species dropped by min_per_class: **{dropped if dropped else 'none'}** "
        f"(allowlist 40 → split {split_meta.get('n_species')} spp).",
        "",
        f"Obs-id leak check on this split: **{'PASS' if split_meta['pass'] else 'FAIL'}**",
        f"Image load: failed_imgs={load_stats.get('n_failed_images')} "
        f"dropped_obs_no_image={load_stats.get('n_dropped_obs_no_image')}",
        "",
        "## Metrics vs E19 headline",
        "",
        "| Metric | E19 mixed test | GBIF-only hold-out | Δ |",
        "|--------|---------------:|-------------------:|--:|",
        f"| MAP@3 | {e19_map} | **{map3:.4f}** [{ci_lo:.3f}, {ci_hi:.3f}] | {result['delta_vs_headline']['map_at_3']:+.4f} |",
        f"| Top-1 | {e19_top1} | **{top1:.4f}** | {result['delta_vs_headline']['top1']:+.4f} |",
        f"| Top-3 | — | **{top3:.4f}** | — |",
        f"| Macro-F1 (sklearn) | {metrics_e19.get('test_f1_macro')} | **{f1:.4f}** | — |",
        f"| Deadly **top-1** | **{e19_d1:.4f}** (`safety_recall_deadly`) | **{d1:.4f}** | {result['delta_vs_headline']['deadly_top1']:+.4f} |",
        f"| Deadly **@3** | **{e19_d3_s}** (npz recompute) | **{d3:.4f}** (n={n_d}) | {d3_delta_s} |",
        f"| ECE naive | {result['e19_headline'].get('ece_naive')} | **{ece_n:.4f}** | {result['delta_vs_headline']['ece_naive']:+.4f} |",
        f"| ECE 15-bin | — (not in E19) | **{ece15:.4f}** | n/a — different definition |",
        "",
        f"Inference wall time: {elapsed/60:.1f} min on `{args.device}` "
        f"(batch={args.batch_size}, max_views={args.max_views}).",
        "",
        "## Research gates (not product unlock)",
        "",
        "Gates use **true deadly@3** (not the mislabeled top-1 field).",
        "",
        f"| Gate | Threshold | Result |",
        f"|------|----------:|--------|",
        f"| MAP@3 soft A | ≥ {gate_map} | {'✅' if pass_map else '❌'} ({map3:.4f}) |",
        f"| Deadly expand | ≥ {gate_deadly} | {'✅' if pass_deadly else '❌'} ({d3:.4f}) |",
        f"| Deadly soft | ≥ {soft_deadly} | {'✅' if pass_soft_deadly else '❌'} ({d3:.4f}) |",
        "",
        "## Worst species (by MAP@3)",
        "",
        "| Species | n | top1 | map3 | deadly |",
        "|---------|--:|-----:|-----:|:------:|",
    ]
    for r in per_class[:15]:
        md.append(
            f"| {r['species']} | {r['n']} | {r['top1']:.3f} | {r['map3']:.3f} | "
            f"{'Y' if r['deadly'] else ''} |"
        )
    md += [
        "",
        "## Product recommendation",
        "",
        result["product_recommendation"],
        "",
        "## Artifacts",
        "",
        f"- JSON: `{OUT_JSON}`",
        f"- Leak audit: `eval/reports/ml_experiments/e19_leak_audit.md`",
        "",
    ]
    OUT_MD.write_text("\n".join(md), encoding="utf-8")
    print(f"Wrote {OUT_MD}")
    print(f"Wrote {OUT_JSON}")
    print(
        f"HOLD-OUT map3={map3:.4f} top1={top1:.4f} deadly3={d3:.4f} deadly1={d1:.4f} "
        f"vs E19 map3={e19_map} deadly@3={e19_d3_s} deadly_top1={e19_d1:.4f}"
    )
    print(f"product_trustworthy={result['product_gates_trustworthy']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
