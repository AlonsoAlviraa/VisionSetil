#!/usr/bin/env python3
"""Evaluate allowlist-40 overlap for P1 Kaggle image packs (folder-style).

Uses `kaggle datasets files` pagination — no full download.
Maps common/vernacular folder names when possible via industrial allowlist latin names.

Usage:
  python scripts/eval_p1_kaggle_overlap.py
  python scripts/eval_p1_kaggle_overlap.py --write
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]

# P1 candidates from inventory (plus E18 secondaries for re-check)
P1_SLUGS = [
    "thehir0/mushroom-species",
    "daniilonishchenko/mushrooms-images-classification-215",
    "maysee/mushrooms-classification-common-genuss-images",
    "lizhecheng/mushroom-classification",
    "marcosvolpato/edible-and-poisonous-fungi",
    "zlatan599/mushroom1",
    "dariobaumberger/combined-kaggle-mushrooms-dataset",
]

# Optional vernacular → latin for common pack folders (subset)
VERNACULAR_TO_LATIN = {
    "death_cap": "Amanita phalloides",
    "destroying_angel": "Amanita virosa",
    "fly_agaric": "Amanita muscaria",
    "panther_cap": "Amanita pantherina",
    "false_death_cap": "Amanita citrina",
    "blusher": "Amanita rubescens",
    "funeral_bell": "Galerina marginata",
    "sheathed_woodtuft": "Kuehneromyces mutabilis",
    "false_morel": "Gyromitra esculenta",
    "deadly_webcap": "Cortinarius rubellus",
    "sulphur_tuft": "Hypholoma fasciculare",
    "field_mushroom": "Agaricus campestris",
    "porcini": "Boletus edulis",
    "bay_bolete": "Imleria badia",
    "slippery_jack": "Suillus luteus",
    "oyster_mushroom": "Pleurotus ostreatus",
    "shaggy_ink_cap": "Coprinus comatus",
    "fairy_ring_mushroom": "Marasmius oreades",
    "wood_blewit": "Lepista nuda",
    "turkey_tail": "Trametes versicolor",
    "chicken_of_the_woods": "Laetiporus sulphureus",
    "stinkhorn": "Phallus impudicus",
    "common_earthball": "Scleroderma citrinum",
    "almond_mushroom": "Agaricus campestris",  # weak; often A. subrufescens — flag weak
}


def load_allowlist() -> list[str]:
    allow = json.loads(
        (REPO / "data" / "industrial_v1" / "species_allowlist.json").read_text(
            encoding="utf-8"
        )
    )
    return [s["latin_name"] for s in allow["species"]]


def load_deadly() -> set[str]:
    deadly = json.loads(
        (REPO / "data" / "industrial_v1" / "deadly_set.json").read_text(encoding="utf-8")
    )
    return {s["latin_name"].lower() for s in deadly["species"]}


def norm_folder(name: str) -> str:
    s = name.strip().replace("_", " ").replace("-", " ")
    s = re.sub(r"\s+", " ", s)
    return s


def match_species(folder: str, allow_set: set[str]) -> str | None:
    """Return allowlist latin name if folder matches, else None."""
    n = norm_folder(folder)
    low = n.lower()
    # exact latin
    for a in allow_set:
        if a.lower() == low:
            return a
    # Genus_epithet already spaced
    parts = low.split()
    if len(parts) >= 2:
        cand = f"{parts[0].capitalize()} {parts[1]}"
        for a in allow_set:
            if a.lower() == cand.lower():
                return a
    # vernacular map
    key = folder.strip().lower().replace(" ", "_").replace("-", "_")
    if key in VERNACULAR_TO_LATIN:
        lat = VERNACULAR_TO_LATIN[key]
        if lat.lower() in {x.lower() for x in allow_set}:
            return lat
    return None


def list_dataset_files(slug: str, max_pages: int = 15, page_size: int = 200) -> list[str]:
    """Return list of file names via kaggle CLI pagination (page-size up to 200)."""
    names: list[str] = []
    token: str | None = None
    for page in range(max_pages):
        cmd = [
            "kaggle",
            "datasets",
            "files",
            slug,
            "--page-size",
            str(page_size),
            "--format",
            "csv",
        ]
        if token:
            cmd.extend(["--page-token", token])
        try:
            r = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=180,
                cwd=str(REPO),
            )
        except Exception as e:
            print(f"  ERROR listing {slug}: {e}", file=sys.stderr)
            break
        out = (r.stdout or "") + "\n" + (r.stderr or "")
        next_token = None
        for line in out.splitlines():
            line_st = line.strip()
            if "Next Page Token" in line_st or line_st.startswith("nextPageToken"):
                # table form: Next Page Token = XXX
                if "=" in line_st:
                    next_token = line_st.split("=", 1)[-1].strip()
                continue
            if not line_st or line_st.lower().startswith("name"):
                continue
            # CSV: name,size,creationDate
            if "," in line_st:
                name = line_st.split(",", 1)[0].strip().strip('"')
                if name and name != "name":
                    names.append(name)
                    continue
            m = re.match(r"^(\S+(?: \S+)*)\s+\d+", line_st)
            if m:
                names.append(m.group(1).strip())
        if not next_token or next_token == token:
            break
        token = next_token
        if page >= max_pages - 1:
            break
    return names


def folders_from_paths(paths: list[str]) -> set[str]:
    folders: set[str] = set()
    for p in paths:
        # normalize
        p = p.replace("\\", "/")
        segs = [s for s in p.split("/") if s and s not in {".", ".."}]
        # skip non-species roots
        skip = {
            "images",
            "image",
            "data",
            "dataset",
            "train",
            "test",
            "val",
            "merged_dataset",
            "mushroom1",
            "mushrooms",
            "files",
        }
        for i, seg in enumerate(segs[:-1]):  # folder containing files
            if seg.lower() in skip:
                continue
            # if looks like species (has space or underscore or 2-word latin-ish)
            if "_" in seg or "-" in seg or " " in seg or (seg[:1].isupper() and len(seg) > 3):
                folders.add(seg)
            elif i >= 1 and segs[i - 1].lower() in skip:
                folders.add(seg)
    return folders


def evaluate_slug(slug: str, allow: list[str], deadly: set[str]) -> dict:
    allow_set = set(allow)
    print(f"\n=== {slug} ===")
    files = list_dataset_files(slug)
    print(f"  files listed (page1): {len(files)}")
    folders = folders_from_paths(files)
    print(f"  candidate folders: {len(folders)}")
    hits: dict[str, str] = {}
    for f in sorted(folders):
        m = match_species(f, allow_set)
        if m:
            hits[f] = m
    hit_latin = sorted(set(hits.values()))
    deadly_hits = [s for s in hit_latin if s.lower() in deadly]
    score = len(hit_latin) / max(len(allow), 1)
    recommend = score >= 0.15 or len(deadly_hits) >= 3  # meaningful overlap
    result = {
        "slug": slug,
        "files_listed": len(files),
        "folders_seen": sorted(folders)[:80],
        "n_folders": len(folders),
        "allowlist_hits": hit_latin,
        "n_allowlist_hits": len(hit_latin),
        "deadly_hits": deadly_hits,
        "n_deadly_hits": len(deadly_hits),
        "overlap_ratio": round(score, 3),
        "recommend_for_train": recommend,
        "note": "First-page file list only; underestimates folder count on large packs.",
    }
    print(
        f"  allowlist hits: {len(hit_latin)}/{len(allow)} "
        f"({score:.0%}) | deadly: {len(deadly_hits)} | recommend={recommend}"
    )
    if hit_latin:
        print("  species:", ", ".join(hit_latin[:15]), ("..." if len(hit_latin) > 15 else ""))
    return result


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--slugs", nargs="*", default=None)
    args = ap.parse_args()

    allow = load_allowlist()
    deadly = load_deadly()
    slugs = args.slugs or P1_SLUGS
    results = []
    for slug in slugs:
        try:
            results.append(evaluate_slug(slug, allow, deadly))
        except Exception as e:
            results.append({"slug": slug, "error": str(e), "recommend_for_train": False})

    recommended = [r for r in results if r.get("recommend_for_train")]
    rejected = [r for r in results if not r.get("recommend_for_train")]
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "allowlist_size": len(allow),
        "deadly_size": len(deadly),
        "results": results,
        "recommended_slugs": [r["slug"] for r in recommended],
        "rejected_or_low_overlap": [r["slug"] for r in rejected],
        "policy": "Only use recommended packs for train; keep 40 spp until MAP>=0.22 and deadly>=0.50",
    }
    print("\n=== SUMMARY ===")
    print("RECOMMENDED:", report["recommended_slugs"])
    print("SKIP/LOW:", report["rejected_or_low_overlap"])

    if args.write:
        out = REPO / "data" / "industrial_v1" / "p1_kaggle_overlap.json"
        out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print("wrote", out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
