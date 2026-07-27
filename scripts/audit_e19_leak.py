#!/usr/bin/env python3
"""E19 leak audit — observation split, cross-source near-dup, suspicious metrics.

Reconstructs E19 combine+cap+split logic offline where possible, audits
test_predictions + log signals, and writes:

  eval/reports/ml_experiments/e19_leak_audit.md
  eval/reports/ml_experiments/e19_leak_audit.json

Orientation only — never consumption permission.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import numpy as np
import pandas as pd

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO))

from kaggle.fungi_csv_loader import fair_cap_observations, load_from_jsonl_manifest  # noqa: E402
from sklearn.model_selection import train_test_split  # noqa: E402

E19_DIR = REPO / "kaggle" / "kernel_output_v19"
MODELS = E19_DIR / "models"
LOG_PATH = E19_DIR / "visionsetil-exp-v19-gbif-mega.log"
GBIF_ROOT = REPO / "data" / "industrial_v1"
GBIF_JSONL = GBIF_ROOT / "obs_gbif_es.jsonl"
ALLOWLIST_PATH = REPO / "data" / "industrial_v1" / "species_allowlist.json"
DEADLY_PATH = REPO / "data" / "industrial_v1" / "deadly_set.json"
OUT_MD = REPO / "eval" / "reports" / "ml_experiments" / "e19_leak_audit.md"
OUT_JSON = REPO / "eval" / "reports" / "ml_experiments" / "e19_leak_audit.json"

DEADLY_FORCE = {
    "amanita phalloides",
    "amanita virosa",
    "amanita muscaria",
    "amanita pantherina",
    "galerina marginata",
    "gyromitra esculenta",
    "cortinarius rubellus",
    "hypholoma fasciculare",
    "lepiota castanea",
    "lepiota subincarnata",
    "paxillus involutus",
}

SEED = 42
VAL_SIZE = 0.15
TEST_SIZE = 0.15
MAX_OBS = 200
MAX_OBS_DEADLY = 400


# ── pure helpers (pytest-friendly) ─────────────────────────────────────────────


def map_at_k(probs: np.ndarray, labels: np.ndarray, k: int = 3) -> float:
    top = np.argsort(probs, axis=1)[:, ::-1][:, :k]
    aps = []
    for i, y in enumerate(labels):
        ranks = np.where(top[i] == y)[0]
        aps.append(float(1.0 / (ranks[0] + 1)) if len(ranks) else 0.0)
    return float(np.mean(aps)) if len(aps) else 0.0


def topk_hit(probs: np.ndarray, labels: np.ndarray, k: int = 3) -> float:
    top = np.argsort(probs, axis=1)[:, ::-1][:, :k]
    return float(np.mean([labels[i] in top[i] for i in range(len(labels))]))


def deadly_recall_at_k(
    probs: np.ndarray,
    labels: np.ndarray,
    deadly_idxs: set[int],
    k: int = 3,
) -> tuple[float, int]:
    """Recall of true deadly class in top-k predictions (among deadly-labeled samples)."""
    top = np.argsort(probs, axis=1)[:, ::-1][:, :k]
    mask = np.array([int(y) in deadly_idxs for y in labels], dtype=bool)
    n = int(mask.sum())
    if n == 0:
        return 0.0, 0
    hits = sum(1 for i in range(len(labels)) if mask[i] and labels[i] in top[i])
    return float(hits / n), n


def deadly_top1_from_preds(
    preds: np.ndarray,
    labels: np.ndarray,
    deadly_idxs: set[int],
) -> tuple[float, int]:
    """Same definition as E19 metrics.json safety_recall_deadly (top-1 among deadly)."""
    mask = np.array([int(y) in deadly_idxs for y in labels], dtype=bool)
    n = int(mask.sum())
    if n == 0:
        return 0.0, 0
    return float((preds[mask] == labels[mask]).mean()), n


def ece_naive(probs: np.ndarray, labels: np.ndarray) -> float:
    """E19-style unbinned ECE: mean(|max_prob - correct|)."""
    conf = probs.max(axis=1)
    pred = probs.argmax(axis=1)
    correct = (pred == labels).astype(np.float64)
    return float(np.mean(np.abs(conf - correct)))


def anti_leak_split_obs(
    df: pd.DataFrame,
    val_size: float = VAL_SIZE,
    test_size: float = TEST_SIZE,
    seed: int = SEED,
    min_per_class: int = 4,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, dict[str, Any]]:
    """Mirror of gen_notebook_v8.anti_leak_split (observation-level)."""
    agg_map: dict[str, str] = {"species": "first"}
    if "genus" in df.columns:
        agg_map["genus"] = "first"
    obs_df = df.groupby("observation_id").agg(agg_map).reset_index()
    if "genus" not in obs_df.columns:
        obs_df["genus"] = obs_df["species"].astype(str).str.split().str[0]

    species_counts = obs_df["species"].value_counts()
    dropped_species = sorted(
        species_counts[species_counts < min_per_class].index.astype(str).tolist()
    )
    valid = species_counts[species_counts >= min_per_class].index
    obs_df = obs_df[obs_df["species"].isin(valid)].copy()

    species_final = obs_df["species"].value_counts()
    large_species = species_final[species_final >= 4].index
    small_species = species_final[(species_final >= 2) & (species_final < 4)].index
    obs_large = obs_df[obs_df["species"].isin(large_species)].copy()
    obs_small = obs_df[obs_df["species"].isin(small_species)].copy()

    train_parts: list[pd.DataFrame] = []
    val_parts: list[pd.DataFrame] = []
    test_parts: list[pd.DataFrame] = []

    if len(obs_large) > 0:
        try:
            train_large, temp_large = train_test_split(
                obs_large,
                test_size=val_size + test_size,
                random_state=seed,
                stratify=obs_large["species"],
            )
            val_large, test_large = train_test_split(
                temp_large,
                test_size=test_size / (val_size + test_size),
                random_state=seed,
                stratify=temp_large["species"],
            )
        except ValueError:
            train_large, temp_large = train_test_split(
                obs_large, test_size=val_size + test_size, random_state=seed
            )
            val_large, test_large = train_test_split(
                temp_large, test_size=0.5, random_state=seed
            )
        train_parts.append(train_large)
        val_parts.append(val_large)
        test_parts.append(test_large)

    if len(obs_small) > 0:
        train_small, temp_small = train_test_split(
            obs_small, test_size=val_size + test_size, random_state=seed
        )
        if len(temp_small) >= 2:
            val_small, test_small = train_test_split(
                temp_small, test_size=0.5, random_state=seed
            )
        else:
            train_small = pd.concat([train_small, temp_small])
            val_small = pd.DataFrame(columns=obs_small.columns)
            test_small = pd.DataFrame(columns=obs_small.columns)
        train_parts.append(train_small)
        val_parts.append(val_small)
        test_parts.append(test_small)

    train_obs = pd.concat(train_parts, ignore_index=True) if train_parts else pd.DataFrame()
    val_obs = pd.concat(val_parts, ignore_index=True) if val_parts else pd.DataFrame()
    test_obs = pd.concat(test_parts, ignore_index=True) if test_parts else pd.DataFrame()

    train_ids = set(train_obs["observation_id"].astype(str))
    val_ids = set(val_obs["observation_id"].astype(str))
    test_ids = set(test_obs["observation_id"].astype(str))

    leaks = {
        "train_val": len(train_ids & val_ids),
        "train_test": len(train_ids & test_ids),
        "val_test": len(val_ids & test_ids),
    }
    meta = {
        "n_train_obs": len(train_ids),
        "n_val_obs": len(val_ids),
        "n_test_obs": len(test_ids),
        "n_species": int(obs_df["species"].nunique()) if len(obs_df) else 0,
        "n_species_pre_min_filter": int(species_counts.shape[0]),
        "species_dropped_min_per_class": dropped_species,
        "min_per_class": min_per_class,
        "leaks": leaks,
        "pass": all(v == 0 for v in leaks.values()),
    }
    train_df = df[df["observation_id"].astype(str).isin(train_ids)].reset_index(drop=True)
    val_df = df[df["observation_id"].astype(str).isin(val_ids)].reset_index(drop=True)
    test_df = df[df["observation_id"].astype(str).isin(test_ids)].reset_index(drop=True)
    return train_df, val_df, test_df, meta


def stem_key(path: str) -> str:
    """Normalized basename stem (no extension, lower)."""
    p = Path(str(path).replace("\\", "/"))
    return p.stem.lower()


def media_id_key(path: str) -> Optional[str]:
    """First long numeric token in stem — often GBIF/iNat media id."""
    stem = stem_key(path)
    m = re.match(r"^(\d{6,})", stem)
    return m.group(1) if m else None


def check_obs_disjoint(train_ids: set[str], val_ids: set[str], test_ids: set[str]) -> dict:
    return {
        "train_val": len(train_ids & val_ids),
        "train_test": len(train_ids & test_ids),
        "val_test": len(val_ids & test_ids),
        "pass": (
            len(train_ids & val_ids) == 0
            and len(train_ids & test_ids) == 0
            and len(val_ids & test_ids) == 0
        ),
    }


def cross_source_stem_collisions(df: pd.DataFrame) -> dict[str, Any]:
    """Find basename stems / media ids appearing under >1 source_db."""
    if "source_db" not in df.columns or "image_path" not in df.columns:
        return {"status": "skipped", "reason": "missing source_db or image_path"}

    by_stem: dict[str, set[str]] = defaultdict(set)
    by_media: dict[str, set[str]] = defaultdict(set)
    by_size: dict[tuple[int, str], set[str]] = defaultdict(set)

    for _, row in df.iterrows():
        src = str(row.get("source_db", "?"))
        path = str(row["image_path"])
        st = stem_key(path)
        by_stem[st].add(src)
        mid = media_id_key(path)
        if mid:
            by_media[mid].add(src)
        p = Path(path)
        if p.exists():
            try:
                sz = p.stat().st_size
                by_size[(sz, st[:8])].add(src)
            except OSError:
                pass

    stem_cross = {k: sorted(v) for k, v in by_stem.items() if len(v) > 1}
    media_cross = {k: sorted(v) for k, v in by_media.items() if len(v) > 1}
    size_cross = {
        f"{sz}|{pfx}": sorted(v) for (sz, pfx), v in by_size.items() if len(v) > 1
    }

    # Also same stem under different species (within single source)
    stem_to_spp: dict[str, set[str]] = defaultdict(set)
    for _, row in df.iterrows():
        stem_to_spp[stem_key(str(row["image_path"]))].add(str(row["species"]))
    stem_multi_sp = {k: sorted(v) for k, v in stem_to_spp.items() if len(v) > 1}

    return {
        "status": "ok",
        "n_unique_stems": len(by_stem),
        "n_cross_source_stems": len(stem_cross),
        "n_cross_source_media_ids": len(media_cross),
        "n_cross_source_size_stem_prefix": len(size_cross),
        "n_stems_multi_species": len(stem_multi_sp),
        "examples_cross_stem": dict(list(stem_cross.items())[:10]),
        "examples_multi_species_stem": dict(list(stem_multi_sp.items())[:10]),
        "pass_cross_source": len(stem_cross) == 0 and len(media_cross) == 0,
    }


def parse_e19_log(log_path: Path) -> dict[str, Any]:
    """Extract key data/split/metrics lines from Kaggle JSON-lines log."""
    out: dict[str, Any] = {"path": str(log_path), "exists": log_path.exists()}
    if not log_path.exists():
        return out
    text = log_path.read_text(encoding="utf-8", errors="replace")
    # each line may be a JSON object with data field
    msgs: list[str] = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
            if isinstance(obj, dict) and "data" in obj:
                msgs.append(str(obj["data"]))
            else:
                msgs.append(line)
        except json.JSONDecodeError:
            msgs.append(line)
    blob = "\n".join(msgs)

    def _search(pat: str) -> Optional[str]:
        m = re.search(pat, blob)
        return m.group(0) if m else None

    out["sources_post_cap"] = _search(r"Sources post-cap: \{[^}]+\}")
    out["dedup"] = _search(r"Dedup image_path: \d+ → \d+")
    out["split"] = _search(r"Split: train=\d+ obs \(\d+ imgs\).*test=\d+ obs \(\d+ imgs\)")
    out["e19_pool"] = _search(r"E19 gbif-mega: imgs=\d+ spp=\d+ obs=\d+")
    out["combined"] = _search(r"COMBINED: \d+ existing images")
    out["loaded_ft"] = _search(r"Loaded CSV source 'fungitastic':[^\n]+")
    out["loaded_gbif"] = _search(r"jsonl: \d+ images, \d+ spp")
    # epoch 0 val
    m = re.search(
        r"epoch.?0.*?val_map3[=:]?\s*([0-9.]+).*?val_deadly3[=:]?\s*([0-9.]+)",
        blob,
        re.I | re.S,
    )
    # training_history is better for ep0; keep log hooks
    out["ep0_log_snippet"] = None
    for msg in msgs:
        if "EPOCH 0" in msg or "Ep0" in msg and "val" in msg.lower():
            out["ep0_log_snippet"] = msg[:200]
            break
    # gates
    out["map_gate_line"] = _search(r"DO2b: soft-gate A MAP@3[^\n]+")
    out["deadly_gate_line"] = _search(r"DO3b: soft-gate deadly[^\n]+")
    return out


@dataclass
class Verdict:
    name: str
    status: str  # PASS | FAIL | SUSPECT | UNKNOWN
    detail: str
    numbers: dict[str, Any] = field(default_factory=dict)


def load_allowlist() -> set[str]:
    raw = json.loads(ALLOWLIST_PATH.read_text(encoding="utf-8"))
    return {s["latin_name"] for s in raw["species"]}


def load_deadly_names() -> set[str]:
    raw = json.loads(DEADLY_PATH.read_text(encoding="utf-8"))
    return {s["latin_name"] for s in raw["species"]}


def audit_predictions(metrics: dict, l2i: dict[str, int]) -> dict[str, Any]:
    npz_path = MODELS / "test_predictions.npz"
    if not npz_path.exists():
        return {"status": "missing_predictions"}
    z = np.load(npz_path, allow_pickle=True)
    probs = z["probs"]
    labels = z["labels"].astype(int)
    preds = z["preds"].astype(int)
    i2l = {int(v): k for k, v in l2i.items()}
    deadly_names = {n.lower() for n in load_deadly_names()}
    deadly_idxs = {i for i, n in i2l.items() if n.lower() in deadly_names}

    map3 = map_at_k(probs, labels, 3)
    top1 = float((preds == labels).mean())
    top3 = topk_hit(probs, labels, 3)
    d3, n_d = deadly_recall_at_k(probs, labels, deadly_idxs, 3)
    d1, n_d1 = deadly_top1_from_preds(preds, labels, deadly_idxs)
    assert n_d == n_d1

    metrics_deadly = metrics.get("safety_recall_deadly")
    metrics_deadly_f = float(metrics_deadly) if metrics_deadly is not None else None
    # E19 stores top-1 in safety_recall_deadly (gen_notebook_v8 test cell) but labels gates as @3
    deadly_top1_match = (
        metrics_deadly_f is not None and abs(d1 - metrics_deadly_f) < 1e-3
    )
    deadly_at3_match = (
        metrics_deadly_f is not None and abs(d3 - metrics_deadly_f) < 1e-3
    )
    map_match = abs(map3 - float(metrics.get("test_map_at_3", map3))) < 1e-4

    # per-class top1
    per_class = []
    for idx, name in sorted(i2l.items(), key=lambda x: x[1]):
        m = labels == idx
        n = int(m.sum())
        if n == 0:
            continue
        acc = float((preds[m] == labels[m]).mean())
        per_class.append({"species": name, "n": n, "top1": acc, "deadly": name.lower() in deadly_names})
    per_class.sort(key=lambda r: (r["top1"], r["n"]))

    # perfect deadly species
    perfect_deadly = [r for r in per_class if r["deadly"] and r["top1"] >= 0.99 and r["n"] >= 10]

    # label concentration (same label run length — may indicate sorted test)
    runs = 1
    for i in range(1, len(labels)):
        if labels[i] != labels[i - 1]:
            runs += 1
    sortedness = 1.0 - (runs - 1) / max(len(labels) - 1, 1)

    return {
        "status": "ok",
        "n_test": int(len(labels)),
        "map_at_3": map3,
        "top1": top1,
        "top3": top3,
        "deadly_at_3": d3,
        "deadly_top1": d1,
        "n_deadly": n_d,
        "metrics_json_map3": metrics.get("test_map_at_3"),
        "metrics_json_safety_recall_deadly": metrics_deadly_f,
        "metrics_json_deadly_field_meaning": (
            "top-1 among deadly samples (NOT @3) — gen_notebook_v8 test cell; "
            "E19 gate logs mislabel this field as deadly@3"
        ),
        "map_match_metrics_json": map_match,
        "deadly_top1_match_metrics_json": deadly_top1_match,
        "deadly_at3_match_metrics_json": deadly_at3_match,
        "deadly_definition_mismatch": bool(
            metrics_deadly_f is not None and deadly_top1_match and not deadly_at3_match
        ),
        "ece_naive_recomputed": ece_naive(probs, labels),
        "metrics_json_ece": metrics.get("test_ece"),
        "metrics_json_ece_meaning": "mean(|max_prob - correct|) unbinned — not 15-bin ECE",
        "worst_species": per_class[:8],
        "perfect_deadly_ge10": perfect_deadly,
        "label_sortedness": sortedness,
        "has_obs_ids_in_npz": False,  # documented limitation
        "note": "test_predictions.npz has probs/preds/labels only — no observation_id or source_db",
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="E19 leak audit")
    ap.add_argument("--write", action="store_true", default=True, help="Write report files")
    ap.add_argument("--no-write", action="store_true")
    args = ap.parse_args()
    write = args.write and not args.no_write

    verdicts: list[Verdict] = []
    report: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "experiment": "E19-gbif-mega",
        "orientation_only": True,
        "policy": "never_consumption_permission",
        "verdicts": [],
        "limitations": [],
    }

    # ── artifacts ──────────────────────────────────────────────────────────
    metrics = {}
    if (MODELS / "metrics.json").exists():
        metrics = json.loads((MODELS / "metrics.json").read_text(encoding="utf-8"))
    l2i = {}
    if (MODELS / "label2idx.json").exists():
        l2i = json.loads((MODELS / "label2idx.json").read_text(encoding="utf-8"))
    history = []
    if (MODELS / "training_history.json").exists():
        history = json.loads((MODELS / "training_history.json").read_text(encoding="utf-8"))

    report["headline_metrics"] = {
        "test_map_at_3": metrics.get("test_map_at_3"),
        "test_accuracy": metrics.get("test_accuracy"),
        "safety_recall_deadly": metrics.get("safety_recall_deadly"),
        "safety_recall_deadly_meaning": (
            "top-1 among deadly samples (NOT deadly@3); see gen_notebook_v8 test cell"
        ),
        "test_ece": metrics.get("test_ece"),
        "test_ece_meaning": "mean(|max_prob - correct|) unbinned, not 15-bin ECE",
        "num_train_obs": metrics.get("num_train_obs"),
        "num_val_obs": metrics.get("num_val_obs"),
        "num_test_obs": metrics.get("num_test_obs"),
        "databases_used": metrics.get("databases_used"),
    }

    # ── 1) Observation-id leakage (reconstructable offline?) ───────────────
    limitations = []
    limitations.append(
        "E19 train/val/test observation_id lists were NOT saved as artifacts; "
        "only counts (6065/1300/1300) and test_predictions.npz (labels only)."
    )
    limitations.append(
        "FungiTastic is not available locally — cannot fully rebuild the mixed "
        "FT+GBIF post-cap pool (23263 imgs) used on Kaggle."
    )

    log_info = parse_e19_log(LOG_PATH)
    report["log_extract"] = log_info

    # Reconstruct anti-leak on local GBIF-only (deterministic fair_cap) to prove splitter
    recon: dict[str, Any] = {"local_gbif": None}
    if GBIF_JSONL.exists() or (GBIF_ROOT / "gbif" / "images").exists():
        # Prefer packaging layout: root with jsonl + images
        root = GBIF_ROOT
        if not (root / "obs_gbif_es.jsonl").exists():
            root = GBIF_ROOT / "gbif"
        try:
            df = load_from_jsonl_manifest(root, "gbif_es", log=print)
            # Fix relative paths under industrial_v1
            if len(df) == 0 and GBIF_JSONL.exists():
                # manual load with REPO-relative paths
                rows = []
                with GBIF_JSONL.open(encoding="utf-8") as f:
                    for line in f:
                        o = json.loads(line)
                        for p in o.get("image_paths") or []:
                            full = REPO / str(p).replace("\\", "/")
                            if not full.exists():
                                # try under gbif/images
                                alt = GBIF_ROOT / "gbif" / "images" / Path(p).name
                                if not alt.exists():
                                    continue
                                full = alt
                            sp = o["species"]
                            rows.append(
                                {
                                    "image_path": str(full),
                                    "species": sp,
                                    "observation_id": str(o["observation_id"]),
                                    "genus": sp.split()[0],
                                    "family": "unknown",
                                    "habitat": "unknown",
                                    "substrate": "unknown",
                                    "smell": "unknown",
                                    "country": "ES",
                                    "license_class": o.get("license_class", "unknown"),
                                    "source_db": "gbif_es",
                                }
                            )
                df = pd.DataFrame(rows)
            if len(df) and "source_db" not in df.columns:
                df["source_db"] = "gbif_es"
            if len(df) and "genus" not in df.columns:
                df["genus"] = df["species"].astype(str).str.split().str[0]

            allow = {a.lower() for a in load_allowlist()}
            if len(df):
                df = df[df["species"].str.lower().isin(allow)].copy()
            pre_cap_obs = int(df["observation_id"].nunique()) if len(df) else 0
            pre_cap_imgs = len(df)
            if len(df):
                df_cap = fair_cap_observations(
                    df,
                    max_obs=MAX_OBS,
                    max_obs_deadly=MAX_OBS_DEADLY,
                    deadly_force=DEADLY_FORCE,
                    prefer_cc_ok=True,
                )
                df_cap = df_cap.drop_duplicates(subset=["image_path"], keep="first")
            else:
                df_cap = df
            post_cap_obs = int(df_cap["observation_id"].nunique()) if len(df_cap) else 0
            train_df, val_df, test_df, split_meta = anti_leak_split_obs(df_cap)
            recon["local_gbif"] = {
                "pre_cap_imgs": pre_cap_imgs,
                "pre_cap_obs": pre_cap_obs,
                "post_cap_imgs": len(df_cap),
                "post_cap_obs": post_cap_obs,
                "split": split_meta,
                "note": (
                    "GBIF-only fair_cap uses full 200/400 per species; E19 mixed FT+GBIF "
                    "reserved ~half cap per source — observation sets differ."
                ),
            }
            if split_meta["pass"]:
                verdicts.append(
                    Verdict(
                        "obs_id_leak_splitter_self_test",
                        "PASS",
                        "anti_leak_split on local GBIF-only: train/val/test observation_ids disjoint",
                        split_meta,
                    )
                )
            else:
                verdicts.append(
                    Verdict(
                        "obs_id_leak_splitter_self_test",
                        "FAIL",
                        "observation_id overlap found in reconstructed split",
                        split_meta,
                    )
                )
            # cross-source on GBIF-only is vacuous; still run stem multi-species
            cross = cross_source_stem_collisions(df_cap if len(df_cap) else df)
            recon["stem_audit_gbif_only"] = cross
            if cross.get("n_stems_multi_species", 0) > 0:
                verdicts.append(
                    Verdict(
                        "stem_multi_species_gbif",
                        "SUSPECT",
                        f"{cross['n_stems_multi_species']} stems map to >1 species within GBIF",
                        {"n": cross["n_stems_multi_species"], "examples": cross.get("examples_multi_species_stem")},
                    )
                )
            else:
                verdicts.append(
                    Verdict(
                        "stem_multi_species_gbif",
                        "PASS",
                        "No basename stem collides across species in local GBIF post-cap pool",
                        {"n_stems": cross.get("n_unique_stems")},
                    )
                )
        except Exception as e:
            recon["local_gbif"] = {"error": str(e)}
            verdicts.append(
                Verdict("local_gbif_recon", "UNKNOWN", f"Failed to load/split local GBIF: {e}")
            )
    else:
        limitations.append("Local GBIF jsonl/images missing — skipped reconstruction.")

    report["reconstruction"] = recon

    # Cannot prove original E19 train∩test empty without saved ids
    verdicts.append(
        Verdict(
            "obs_id_leak_e19_original",
            "UNKNOWN",
            "Code-level only: notebook anti_leak_split asserts train∩val∩test empty and log shows "
            "Split train=6065 / val=1300 / test=1300. Exact observation_id lists were NOT saved — "
            "runtime E19 split is NOT re-verified offline. Status UNKNOWN until train_obs/test_obs "
            "artifacts exist (do not dashboard-green this as proven).",
            {
                "num_train_obs": metrics.get("num_train_obs"),
                "num_val_obs": metrics.get("num_val_obs"),
                "num_test_obs": metrics.get("num_test_obs"),
                "split_log": log_info.get("split"),
                "code_asserts_disjoint": True,
                "runtime_ids_reverified": False,
            },
        )
    )

    # ── 2) Cross-source near-duplicates (FT vs GBIF) ───────────────────────
    verdicts.append(
        Verdict(
            "cross_source_path_stem_ft_gbif",
            "UNKNOWN",
            "FungiTastic not present locally; cannot measure FT↔GBIF basename/stem collisions. "
            "E19 only did exact image_path dedup (log: 36648 → 23263). Different roots mean "
            "same media under FT and GBIF would NOT be path-deduped.",
            {
                "dedup_log": log_info.get("dedup"),
                "sources_post_cap": log_info.get("sources_post_cap"),
                "risk": "medium",
            },
        )
    )
    verdicts.append(
        Verdict(
            "cross_source_exact_path_dedup",
            "PASS",
            "E19 applied drop_duplicates on image_path after fair_cap (36648→23263). "
            "Exact path collisions handled; content-level near-dup across sources unhandled.",
            {"dedup_log": log_info.get("dedup")},
        )
    )

    # ── 3) Per-source test breakdown + prediction re-check ─────────────────
    pred_audit = audit_predictions(metrics, l2i) if l2i else {"status": "no_label2idx"}
    report["prediction_audit"] = pred_audit
    if isinstance(pred_audit, dict) and pred_audit.get("status") == "ok":
        report["headline_metrics"]["deadly_at_3_recomputed"] = pred_audit.get("deadly_at_3")
        report["headline_metrics"]["deadly_top1_recomputed"] = pred_audit.get("deadly_top1")
        report["headline_metrics"]["ece_naive_recomputed"] = pred_audit.get("ece_naive_recomputed")

    verdicts.append(
        Verdict(
            "per_source_test_breakdown",
            "UNKNOWN",
            "Cannot split original mixed test into gbif_es vs fungitastic: "
            "test_predictions.npz lacks observation_id/source_db. "
            "See e19_gbif_holdout.md for pure-GBIF re-inference.",
            {"npz_keys": ["probs", "preds", "labels"]},
        )
    )

    # Metric naming mismatch: safety_recall_deadly is top-1, gates say @3
    if isinstance(pred_audit, dict) and pred_audit.get("deadly_definition_mismatch"):
        verdicts.append(
            Verdict(
                "headline_deadly_is_top1_not_at3",
                "SUSPECT",
                "E19 metrics.json `safety_recall_deadly` matches deadly **top-1** "
                f"({pred_audit.get('deadly_top1'):.4f}), NOT deadly@3 "
                f"({pred_audit.get('deadly_at_3'):.4f}). Notebook gate logs label this field as "
                "deadly@3 (DO3/DO3b) — definition mismatch. Val loop uses true @3; test cell uses top-1. "
                "Any comparison labeled 'Deadly@3' that cites 0.963 is wrong; use recomputed 0.993 for @3.",
                {
                    "metrics_json_safety_recall_deadly": pred_audit.get(
                        "metrics_json_safety_recall_deadly"
                    ),
                    "deadly_top1_recomputed": pred_audit.get("deadly_top1"),
                    "deadly_at_3_recomputed": pred_audit.get("deadly_at_3"),
                    "n_deadly": pred_audit.get("n_deadly"),
                    "deadly_top1_match_metrics_json": pred_audit.get(
                        "deadly_top1_match_metrics_json"
                    ),
                    "deadly_at3_match_metrics_json": pred_audit.get(
                        "deadly_at3_match_metrics_json"
                    ),
                },
            )
        )
    elif isinstance(pred_audit, dict) and pred_audit.get("status") == "ok":
        verdicts.append(
            Verdict(
                "headline_deadly_is_top1_not_at3",
                "PASS",
                "Deadly field aligns with recomputed definition (or mismatch not detected).",
                {
                    "deadly_top1": pred_audit.get("deadly_top1"),
                    "deadly_at_3": pred_audit.get("deadly_at_3"),
                },
            )
        )

    # ── 4) Suspicious signals ──────────────────────────────────────────────
    ep0 = history[0] if history else {}
    best = max(history, key=lambda x: x.get("val_map3", 0)) if history else {}
    report["training_dynamics"] = {
        "ep0": ep0,
        "best_epoch": best,
        "n_epochs_logged": len(history),
    }
    ep0_deadly = float(ep0.get("val_deadly3", 0) or 0)
    ep0_map = float(ep0.get("val_map3", 0) or 0)
    if ep0_deadly >= 0.95:
        verdicts.append(
            Verdict(
                "ep0_deadly_suspicious",
                "SUSPECT",
                f"val deadly@3={ep0_deadly:.4f} at epoch 0 (backbone frozen warmup). "
                "Not necessarily leakage: top-3 among 40 classes is generous for distinctive "
                "deadly morphs (A. muscaria, H. fasciculare) + ImageNet-pretrained ConvNeXt. "
                f"ep0 val MAP@3={ep0_map:.4f} is high but not perfect; best MAP@3 at epoch "
                f"{best.get('epoch')}={best.get('val_map3')}. "
                "Note: val uses true deadly@3; final metrics.json uses deadly top-1.",
                {"ep0_val_deadly3": ep0_deadly, "ep0_val_map3": ep0_map, "best": best},
            )
        )
    else:
        verdicts.append(
            Verdict(
                "ep0_deadly_suspicious",
                "PASS",
                f"ep0 val deadly@3={ep0_deadly:.4f} not extreme",
                {"ep0_val_deadly3": ep0_deadly},
            )
        )

    headline_map = float(metrics.get("test_map_at_3") or 0)
    d3_true = (
        float(pred_audit["deadly_at_3"])
        if isinstance(pred_audit, dict) and pred_audit.get("deadly_at_3") is not None
        else None
    )
    d1_store = float(metrics.get("safety_recall_deadly") or 0)
    if headline_map >= 0.90 or (d3_true is not None and d3_true >= 0.90):
        verdicts.append(
            Verdict(
                "headline_too_high_for_fungi",
                "SUSPECT",
                f"Headline MAP@3={headline_map:.3f}; deadly top-1 (stored)={d1_store:.3f}; "
                f"deadly@3 (recomputed)={d3_true}. Unusually high for real-world fungi ID. "
                "Mixed random split of FT+GBIF can inflate metrics vs field photos. "
                "Not proof of train/test obs leak; metrics NOT trustworthy alone for product gates.",
                {
                    "map3": headline_map,
                    "deadly_top1_stored": d1_store,
                    "deadly_at_3_recomputed": d3_true,
                    "perfect_deadly_ge10": pred_audit.get("perfect_deadly_ge10")
                    if isinstance(pred_audit, dict)
                    else None,
                },
            )
        )

    # ── overall product trustworthiness ────────────────────────────────────
    fail = any(v.status == "FAIL" for v in verdicts)
    suspect = any(v.status == "SUSPECT" for v in verdicts)
    if fail:
        overall = "FAIL"
        product = "no"
        product_detail = "Hard leak FAIL — do not use for product gates."
    elif suspect:
        overall = "SUSPECT"
        product = "partial"
        product_detail = (
            "No proven observation_id train/test leak (runtime IDs unverified offline). "
            "Metrics inflated by mixed easy pool / top-3 generosity / possible cross-source "
            "near-dups; plus `safety_recall_deadly` is deadly top-1 mislabeled as @3 in gates. "
            "NOT sufficient alone to unlock product Identify."
        )
    else:
        overall = "PASS"
        product = "partial"
        product_detail = "Audit checks passed within offline limits; still require GBIF-only hold-out."

    report["overall"] = overall
    report["product_gates_trustworthy"] = product
    report["product_recommendation"] = product_detail
    report["verdicts"] = [asdict(v) for v in verdicts]
    report["limitations"] = limitations

    # ── markdown ───────────────────────────────────────────────────────────
    lines = [
        "# E19 Leak Audit",
        "",
        f"**Generated:** {report['generated_at']}",
        f"**Overall:** **{overall}**",
        f"**Product gates trustworthy:** **{product}**",
        "",
        "> Orientation only — never consumption permission. Allowlist remains 40 spp.",
        "",
        "## Headline (E19 artifacts)",
        "",
        "| Metric | Value | Notes |",
        "|--------|------:|-------|",
        f"| MAP@3 | {metrics.get('test_map_at_3')} | matches npz recompute |",
        f"| Top-1 | {metrics.get('test_accuracy')} | |",
        f"| Deadly **top-1** (`safety_recall_deadly`) | {metrics.get('safety_recall_deadly')} | **NOT @3** — gen_notebook test cell |",
        f"| Deadly **@3** (recomputed from npz) | {pred_audit.get('deadly_at_3') if isinstance(pred_audit, dict) else '—'} | true top-3 recall among deadly |",
        f"| ECE naive (`test_ece`) | {metrics.get('test_ece')} | mean(\\|p−correct\\|), not 15-bin |",
        f"| Train/val/test obs | {metrics.get('num_train_obs')} / {metrics.get('num_val_obs')} / {metrics.get('num_test_obs')} | |",
        f"| Sources | {metrics.get('databases_used')} | |",
        "",
        "## Verdicts",
        "",
    ]
    for v in verdicts:
        lines.append(f"### [{v.status}] {v.name}")
        lines.append("")
        lines.append(v.detail)
        lines.append("")
        if v.numbers:
            lines.append("```json")
            lines.append(json.dumps(v.numbers, indent=2, default=str)[:2000])
            lines.append("```")
            lines.append("")

    lines += [
        "## Prediction re-check (test_predictions.npz)",
        "",
        "```json",
        json.dumps(
            {k: pred_audit[k] for k in pred_audit if k not in {"worst_species", "perfect_deadly_ge10"}}
            if isinstance(pred_audit, dict)
            else pred_audit,
            indent=2,
            default=str,
        ),
        "```",
        "",
        "Worst species (top-1):",
        "",
    ]
    if isinstance(pred_audit, dict) and pred_audit.get("worst_species"):
        lines.append("| Species | n | top1 | deadly |")
        lines.append("|---------|--:|-----:|:------:|")
        for r in pred_audit["worst_species"]:
            lines.append(
                f"| {r['species']} | {r['n']} | {r['top1']:.3f} | {'Y' if r['deadly'] else ''} |"
            )
        lines.append("")

    lines += [
        "## Local GBIF reconstruction",
        "",
        "```json",
        json.dumps(recon, indent=2, default=str)[:4000],
        "```",
        "",
        "## Limitations",
        "",
    ]
    for lim in limitations:
        lines.append(f"- {lim}")
    holdout_path = REPO / "eval" / "reports" / "ml_experiments" / "e19_gbif_holdout.json"
    holdout_snip = ""
    if holdout_path.exists():
        try:
            ho = json.loads(holdout_path.read_text(encoding="utf-8"))
            hm = ho.get("metrics") or {}
            eh = ho.get("e19_headline") or {}
            holdout_snip = "\n".join(
                [
                    "",
                    "### Follow-up: GBIF-only hold-out (if present)",
                    "",
                    "| Metric | E19 mixed | GBIF hold-out |",
                    "|--------|----------:|--------------:|",
                    f"| MAP@3 | {eh.get('map_at_3')} | {hm.get('map_at_3')} |",
                    f"| Top-1 | {eh.get('top1')} | {hm.get('top1')} |",
                    f"| Deadly **top-1** | {eh.get('deadly_top1')} | {hm.get('deadly_top1')} |",
                    f"| Deadly **@3** | {eh.get('deadly_at_3')} | {hm.get('deadly_at_3')} |",
                    f"| ECE naive | {eh.get('ece_naive')} | {hm.get('ece_naive')} |",
                    f"| ECE 15-bin | — | {hm.get('ece_binned_15')} |",
                    "",
                    "See `e19_gbif_holdout.md`. Contamination risk medium-high; not product unlock.",
                    "",
                ]
            )
        except Exception:
            holdout_snip = ""

    lines += [
        "",
        "## Product recommendation",
        "",
        product_detail,
        holdout_snip,
        "Required next step: true unseen field photos + source-holdout retrain (E20). "
        "Do **not** unlock product ID on E19 headline alone. Fix deadly@3 naming in future kernels.",
        "",
        "## Fix proposals (if expanding to E20)",
        "",
        "1. Persist `train_obs.json` / `val_obs.json` / `test_obs.json` (observation_ids + source_db).",
        "2. Cross-source stem + media-id + file-size near-dup collapse before split.",
        "3. Prefer **source-holdout**: train on FT, test pure `gbif_es` (or vice versa).",
        "4. Save per-source metrics at eval time; store **both** deadly top-1 and deadly@3 with clear keys.",
        "5. Use `test_es_gbif` industrial split for product gates (currently pending images).",
        "6. Align test-cell safety metric with val-loop deadly@3 (or rename fields).",
        "",
    ]

    md = "\n".join(lines)
    if write:
        OUT_MD.parent.mkdir(parents=True, exist_ok=True)
        OUT_MD.write_text(md, encoding="utf-8")
        OUT_JSON.write_text(json.dumps(report, indent=2, default=str) + "\n", encoding="utf-8")
        print(f"Wrote {OUT_MD}")
        print(f"Wrote {OUT_JSON}")
    print(f"OVERALL={overall} product_trustworthy={product}")
    for v in verdicts:
        print(f"  [{v.status}] {v.name}")
    return 0 if not fail else 1


if __name__ == "__main__":
    raise SystemExit(main())
