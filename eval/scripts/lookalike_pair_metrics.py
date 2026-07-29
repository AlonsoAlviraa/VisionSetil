#!/usr/bin/env python3
"""Lookalike pair metrics from curated SSOT pairs + model top-k predictions.

Never invents pairs. Reads species_catalog_v2 lookalikes and optional classic pairs.
Usage (offline eval):
  python eval/scripts/lookalike_pair_metrics.py --probs probs.npz --labels labels.npy --idx2label labels.json
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
V2 = ROOT / "data" / "species_catalog" / "species_catalog_v2.json"


def load_pairs() -> list[tuple[str, str]]:
    data = json.loads(V2.read_text(encoding="utf-8"))
    pairs: list[tuple[str, str]] = []
    for rec in data.get("species") or []:
        a = str(rec.get("scientific_name") or "").strip()
        for lk in rec.get("lookalikes") or []:
            if isinstance(lk, dict):
                b = str(lk.get("scientific_name") or "").strip()
            else:
                b = str(lk or "").strip()
            if a and b:
                pairs.append((a, b))
    # unique undirected edges for reporting + directed for confusion
    return pairs


def pair_error_rate(
    labels: np.ndarray,
    probs: np.ndarray,
    idx2label: dict[int, str],
    pairs: list[tuple[str, str]],
    k: int = 3,
) -> dict:
    """Among samples whose true taxon is side A of a pair, rate at which mate B is in top-k.

    High rate on dangerous mates is a *confusion* signal (useful for safety education
    and hard-negative mining). Also reports when true A is missing from top-k.
    """
    # idx2label: {int_idx: name} or {"0": name}; build name → idx
    # (do not name loop vars `k` — shadows top-k parameter)
    label2idx: dict[str, int] = {
        str(name): int(idx) for idx, name in idx2label.items()
    }

    mate_in_topk = 0
    true_in_topk = 0
    n = 0
    by_pair: dict[str, dict] = {}
    top_k = int(k)

    for a, b in pairs:
        if a not in label2idx:
            continue
        a_idx = label2idx[a]
        mask = labels == a_idx
        if not mask.any():
            continue
        b_idx = label2idx.get(b)
        for i in np.where(mask)[0]:
            n += 1
            order = np.argsort(-probs[i])[:top_k]
            if a_idx in order:
                true_in_topk += 1
            if b_idx is not None and b_idx in order:
                mate_in_topk += 1
            pair_key = f"{a}||{b}"
            st = by_pair.setdefault(pair_key, {"n": 0, "mate_in_topk": 0, "true_in_topk": 0})
            st["n"] += 1
            if a_idx in order:
                st["true_in_topk"] += 1
            if b_idx is not None and b_idx in order:
                st["mate_in_topk"] += 1

    return {
        "k": top_k,
        "n_eval_samples": n,
        "n_pairs_in_label_space": len({(a, b) for a, b in pairs if a in label2idx}),
        "true_in_topk_rate": round(true_in_topk / n, 4) if n else None,
        "lookalike_mate_in_topk_rate": round(mate_in_topk / n, 4) if n else None,
        "note": "mate_in_topk is a confusion signal (not accuracy). Curated pairs only.",
        "by_pair_sample": {
            pk: pv for pk, pv in list(by_pair.items())[:15]
        },
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--probs", type=Path, help="npz with arr 'probs' [N,C]")
    ap.add_argument("--labels", type=Path, help="npy labels [N]")
    ap.add_argument("--idx2label", type=Path, help="json {idx: name}")
    ap.add_argument("--k", type=int, default=3)
    ap.add_argument("--report-pairs-only", action="store_true")
    args = ap.parse_args()

    pairs = load_pairs()
    if args.report_pairs_only or not args.probs:
        print(json.dumps({"n_directed_pairs": len(pairs), "sample": pairs[:20]}, indent=2))
        return

    probs = np.load(args.probs)
    if isinstance(probs, np.lib.npyio.NpzFile):
        probs = probs["probs"]
    labels = np.load(args.labels)
    idx2label = {int(k): v for k, v in json.loads(args.idx2label.read_text(encoding="utf-8")).items()}
    report = pair_error_rate(labels, probs, idx2label, pairs, k=args.k)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
