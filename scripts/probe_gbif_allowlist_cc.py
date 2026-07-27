#!/usr/bin/env python3
"""Probe GBIF ES StillImage counts for industrial allowlist 40, deadly first.

Also samples licenses (CC0/CC-BY vs NC) for a few records per taxon.
No download of full media — only API counts + samples.

Usage:
  python scripts/probe_gbif_allowlist_cc.py
  python scripts/probe_gbif_allowlist_cc.py --write
"""
from __future__ import annotations

import argparse
import json
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
UA = "VisionSetil-GBIF-Allowlist/1.1 (educational; orientation only)"


def load_allowlist_ordered() -> list[dict]:
    allow = json.loads(
        (REPO / "data" / "industrial_v1" / "species_allowlist.json").read_text(
            encoding="utf-8"
        )
    )
    deadly = json.loads(
        (REPO / "data" / "industrial_v1" / "deadly_set.json").read_text(encoding="utf-8")
    )
    deadly_names = {s["latin_name"].lower() for s in deadly["species"]}
    rows = []
    for s in allow["species"]:
        name = s["latin_name"]
        role = s.get("role") or ("deadly" if name.lower() in deadly_names else "other")
        if name.lower() in deadly_names:
            role = "deadly"
        rows.append({"latin_name": name, "role": role})
    # deadly first
    rows.sort(key=lambda r: (0 if r["role"] == "deadly" else 1, r["latin_name"]))
    return rows


def match_key(name: str) -> int | None:
    q = urllib.parse.urlencode({"name": name, "limit": 1})
    url = f"https://api.gbif.org/v1/species/match?{q}"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        if data.get("usageKey"):
            return int(data["usageKey"])
        if data.get("speciesKey"):
            return int(data["speciesKey"])
    except Exception:
        return None
    return None


def count_es(taxon_key: int, extra: dict | None = None) -> int | None:
    params = {
        "country": "ES",
        "taxonKey": str(taxon_key),
        "mediaType": "StillImage",
        "limit": "0",
    }
    if extra:
        params.update(extra)
    qs = urllib.parse.urlencode(params)
    url = f"https://api.gbif.org/v1/occurrence/search?{qs}"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return int(data.get("count") or 0)
    except Exception:
        return None


def sample_licenses(taxon_key: int, limit: int = 20) -> dict:
    params = {
        "country": "ES",
        "taxonKey": str(taxon_key),
        "mediaType": "StillImage",
        "limit": str(limit),
    }
    qs = urllib.parse.urlencode(params)
    url = f"https://api.gbif.org/v1/occurrence/search?{qs}"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    lic_counts: dict[str, int] = {}
    cc_ok = 0
    nc = 0
    other = 0
    try:
        with urllib.request.urlopen(req, timeout=35) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        for rec in data.get("results") or []:
            media = rec.get("media") or []
            lic = ""
            if media:
                lic = (media[0].get("license") or "") + " " + (rec.get("license") or "")
            else:
                lic = rec.get("license") or ""
            lic_l = lic.lower()
            key = lic.strip()[:80] or "unknown"
            lic_counts[key] = lic_counts.get(key, 0) + 1
            if "nc" in lic_l or "noncommercial" in lic_l or "non-commercial" in lic_l:
                nc += 1
            elif "cc0" in lic_l or "/zero/" in lic_l:
                cc_ok += 1
            elif "by" in lic_l and "nc" not in lic_l:
                cc_ok += 1
            elif "creativecommons.org/publicdomain" in lic_l:
                cc_ok += 1
            else:
                other += 1
    except Exception as e:
        return {"error": str(e)}
    return {
        "sample_n": sum(lic_counts.values()),
        "cc_ok_ish": cc_ok,
        "nc_ish": nc,
        "other": other,
        "licenses_top": dict(sorted(lic_counts.items(), key=lambda x: -x[1])[:6]),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--sleep", type=float, default=0.35)
    args = ap.parse_args()

    rows_in = load_allowlist_ordered()
    out_rows = []
    total_es = 0
    deadly_es = 0
    for i, r in enumerate(rows_in):
        name = r["latin_name"]
        print(f"[{i+1}/{len(rows_in)}] {name} ({r['role']}) ...", flush=True)
        key = match_key(name)
        time.sleep(args.sleep)
        row = {"latin_name": name, "role": r["role"], "gbif_usage_key": key}
        if key is None:
            row["es_still_image_count"] = None
            row["license_sample"] = None
            out_rows.append(row)
            continue
        n = count_es(key)
        time.sleep(args.sleep)
        row["es_still_image_count"] = n
        if n:
            total_es += n
            if r["role"] == "deadly":
                deadly_es += n
        # license sample for deadly + first commons with data
        if r["role"] == "deadly" or (n and n >= 50 and r["role"] != "deadly"):
            row["license_sample"] = sample_licenses(key, limit=15)
            time.sleep(args.sleep)
        out_rows.append(row)
        print(f"  key={key} ES_imgs={n}", flush=True)

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "country": "ES",
        "mediaType": "StillImage",
        "allowlist_n": len(out_rows),
        "total_es_still_image_sum": total_es,
        "deadly_es_still_image_sum": deadly_es,
        "species": out_rows,
        "download_instructions": [
            "Create free GBIF account",
            "Occurrence download with predicate: country=ES AND mediaType=StillImage AND taxonKey IN allowlist keys",
            "Filter media licenses: prefer CC0 / CC-BY / CC-BY-SA; drop NC and all-rights-reserved for commercial train",
            "Deadly taxa first when sampling for hard mining",
            "Merge via scripts/merge_gbif_stub.py into industrial JSONL",
        ],
        "policy": "orientation_only; never consumption permission",
    }

    # print deadly summary
    print("\n=== DEADLY FIRST ===")
    for r in out_rows:
        if r["role"] == "deadly":
            print(f"  {r['latin_name']}: {r.get('es_still_image_count')}")
    print(f"TOTAL ES still images (sum taxa): {total_es}")
    print(f"DEADLY ES still images (sum): {deadly_es}")

    if args.write:
        out = REPO / "data" / "industrial_v1" / "gbif" / "allowlist40_es_cc_probe.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print("wrote", out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
