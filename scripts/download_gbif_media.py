#!/usr/bin/env python3
"""Join GBIF occurrence+multimedia and download StillImages for industrial allowlist.

Expects a DWCA extract from scripts/gbif_download_allowlist.py:
  occurrence.txt + multimedia.txt

Filters to allowlist binomial. Classifies license as cc_ok / nc / other.
Downloads images under data/industrial_v1/gbif/images/<species>/

Usage:
  python scripts/download_gbif_media.py --gbif-dir data/industrial_v1/gbif/downloads/<key>/extracted
  python scripts/download_gbif_media.py --gbif-dir ... --max-per-species 80 --prefer-cc-only
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import time
import urllib.error
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
UA = "VisionSetil-GBIF-Media/1.0 (educational orientation only)"


def load_allowlist() -> set[str]:
    allow = json.loads(
        (REPO / "data" / "industrial_v1" / "species_allowlist.json").read_text(
            encoding="utf-8"
        )
    )
    return {s["latin_name"].lower() for s in allow["species"]}


def binomial(name: str) -> str:
    parts = name.replace("_", " ").strip().split()
    if len(parts) >= 2:
        return f"{parts[0]} {parts[1]}"
    return name.strip()


def license_class(lic: str) -> str:
    l = (lic or "").lower()
    if not l:
        return "unknown"
    if "nc" in l or "noncommercial" in l or "non-commercial" in l:
        return "nc"
    if "cc0" in l or "/zero/" in l or "publicdomain" in l:
        return "cc_ok"
    if "by-sa" in l or "by_sa" in l or "/by-sa/" in l:
        return "cc_ok"
    if "/by/" in l or "licenses/by" in l:
        return "cc_ok"
    return "other"


def read_tsv(path: Path) -> list[dict]:
    with path.open(encoding="utf-8", errors="replace", newline="") as f:
        return list(csv.DictReader(f, delimiter="\t"))


def safe_species_dir(name: str) -> str:
    return re.sub(r"[^\w\-.]+", "_", name).strip("_")


def download_one(url: str, dest: Path, timeout: float = 60.0) -> bool:
    if dest.is_file() and dest.stat().st_size > 1000:
        return True
    dest.parent.mkdir(parents=True, exist_ok=True)
    # Prefer medium for iNat open-data CDN
    candidates = [url]
    if "inaturalist-open-data" in url and "/original." in url:
        candidates.insert(0, url.replace("/original.", "/medium."))
    req_headers = {"User-Agent": UA}
    for u in candidates:
        try:
            req = urllib.request.Request(u, headers=req_headers)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = resp.read()
            if len(data) < 500:
                continue
            dest.write_bytes(data)
            return True
        except Exception:
            continue
    return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--gbif-dir", type=Path, required=True)
    ap.add_argument(
        "--out-images",
        type=Path,
        default=REPO / "data" / "industrial_v1" / "gbif" / "images",
    )
    ap.add_argument(
        "--out-jsonl",
        type=Path,
        default=REPO / "data" / "industrial_v1" / "obs_gbif_es.jsonl",
    )
    ap.add_argument("--max-per-species", type=int, default=100)
    ap.add_argument(
        "--prefer-cc-only",
        action="store_true",
        help="Only download cc_ok licenses (CC0/CC-BY/CC-BY-SA)",
    )
    ap.add_argument("--sleep", type=float, default=0.0, help="Delay after each new download (per worker)")
    ap.add_argument("--limit", type=int, default=0, help="Global max downloads (0=all)")
    ap.add_argument(
        "--workers",
        type=int,
        default=8,
        help="Parallel download workers (default 8)",
    )
    args = ap.parse_args()

    gbif_dir = args.gbif_dir
    occ_path = gbif_dir / "occurrence.txt"
    multi_path = gbif_dir / "multimedia.txt"
    if not occ_path.is_file() or not multi_path.is_file():
        print("Need occurrence.txt and multimedia.txt in", gbif_dir)
        return 1

    allow = load_allowlist()
    print("Reading occurrence…", flush=True)
    occ_rows = read_tsv(occ_path)
    print("  rows", len(occ_rows), flush=True)
    occ_by_id: dict[str, dict] = {}
    for r in occ_rows:
        gid = r.get("gbifID") or r.get("id")
        if not gid:
            continue
        sp = binomial(r.get("species") or r.get("scientificName") or "")
        if sp.lower() not in allow:
            continue
        occ_by_id[str(gid)] = {
            "species": sp,
            "license": r.get("license") or "",
            "country": r.get("countryCode") or "ES",
            "decimalLatitude": r.get("decimalLatitude"),
            "decimalLongitude": r.get("decimalLongitude"),
        }

    print("Allowlist occurrences:", len(occ_by_id))
    print("Reading multimedia…")
    media_rows = read_tsv(multi_path)
    print("  media rows", len(media_rows))

    # group media by species with license class
    per_species: dict[str, list[dict]] = defaultdict(list)
    for m in media_rows:
        gid = str(m.get("gbifID") or "")
        if gid not in occ_by_id:
            continue
        url = (m.get("identifier") or "").strip()
        if not url.startswith("http"):
            continue
        if "StillImage" not in (m.get("type") or "StillImage") and m.get("type"):
            # keep if type empty or StillImage
            if m.get("type") and m.get("type") != "StillImage":
                continue
        occ = occ_by_id[gid]
        lic = m.get("license") or occ.get("license") or ""
        lc = license_class(lic)
        if args.prefer_cc_only and lc != "cc_ok":
            continue
        per_species[occ["species"]].append(
            {
                "gbifID": gid,
                "url": url,
                "license": lic,
                "license_class": lc,
                "species": occ["species"],
            }
        )

    # stats
    print("\nPer-species media candidates:")
    for sp in sorted(per_species.keys()):
        items = per_species[sp]
        cc = sum(1 for x in items if x["license_class"] == "cc_ok")
        nc = sum(1 for x in items if x["license_class"] == "nc")
        print(f"  {sp}: n={len(items)} cc_ok={cc} nc={nc}")

    # Build job list: cap per species, prefer cc_ok, unique URLs
    jobs: list[dict] = []
    for sp, items in sorted(per_species.items()):
        items_sorted = sorted(
            items, key=lambda x: (0 if x["license_class"] == "cc_ok" else 1, x["gbifID"])
        )
        seen_url: set[str] = set()
        uniq = []
        for it in items_sorted:
            if it["url"] in seen_url:
                continue
            seen_url.add(it["url"])
            uniq.append(it)
        taken = uniq[: args.max_per_species]
        sp_dir = args.out_images / safe_species_dir(sp)
        for it in taken:
            if args.limit and len(jobs) >= args.limit:
                break
            ext = ".jpg"
            ul = it["url"].lower()
            if ".png" in ul:
                ext = ".png"
            elif ".webp" in ul:
                ext = ".webp"
            elif ".jpeg" in ul:
                ext = ".jpg"
            # Unique per media URL (same gbifID can have multiple StillImages)
            url_hash = hashlib.sha1(it["url"].encode("utf-8")).hexdigest()[:10]
            dest = sp_dir / f"{it['gbifID']}_{url_hash}{ext}"
            jobs.append({**it, "dest": dest, "species": sp})
        if args.limit and len(jobs) >= args.limit:
            break

    print(f"\nJobs queued: {len(jobs)} workers={args.workers}", flush=True)

    def _job(job: dict) -> dict:
        dest: Path = job["dest"]
        already = dest.is_file() and dest.stat().st_size > 1000
        if not already:
            ok = download_one(job["url"], dest)
            if args.sleep:
                time.sleep(args.sleep)
        else:
            ok = True
        return {
            "ok": ok,
            "already": already,
            "observation_id": f"gbif_{job['gbifID']}",
            "species": job["species"],
            "image_paths": [str(dest.relative_to(REPO)).replace("\\", "/")],
            "source": "gbif_es",
            "license": job["license"],
            "license_class": job["license_class"],
            "media_url": job["url"],
            "notes": "orientation_only_never_consume",
        }

    jsonl_rows: list[dict] = []
    n_ok = n_fail = n_skip = 0
    workers = max(1, int(args.workers))
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(_job, j) for j in jobs]
        for i, fut in enumerate(as_completed(futs), 1):
            try:
                r = fut.result()
            except Exception:
                n_fail += 1
                continue
            if r["ok"]:
                n_ok += 1
                if r.get("already"):
                    n_skip += 1
                jsonl_rows.append(
                    {k: v for k, v in r.items() if k not in ("ok", "already")}
                )
            else:
                n_fail += 1
            if i % 200 == 0 or i == len(jobs):
                print(
                    f"  progress {i}/{len(jobs)} ok={n_ok} fail={n_fail} skip_disk={n_skip}",
                    flush=True,
                )

    # Stable jsonl order by species then path
    jsonl_rows.sort(key=lambda r: (r["species"], r["image_paths"][0]))

    args.out_jsonl.parent.mkdir(parents=True, exist_ok=True)
    with args.out_jsonl.open("w", encoding="utf-8") as f:
        for r in jsonl_rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    per_sp_counts: dict[str, int] = defaultdict(int)
    for r in jsonl_rows:
        per_sp_counts[r["species"]] += 1

    summary = {
        "ok": n_ok,
        "fail": n_fail,
        "skip_disk": n_skip,
        "jobs": len(jobs),
        "jsonl": str(args.out_jsonl),
        "images_dir": str(args.out_images),
        "species_with_images": len(per_sp_counts),
        "prefer_cc_only": args.prefer_cc_only,
        "max_per_species": args.max_per_species,
        "workers": workers,
        "per_species": dict(sorted(per_sp_counts.items())),
    }
    print(json.dumps(summary, indent=2), flush=True)
    (args.out_images.parent / "download_summary.json").write_text(
        json.dumps(summary, indent=2) + "\n", encoding="utf-8"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
