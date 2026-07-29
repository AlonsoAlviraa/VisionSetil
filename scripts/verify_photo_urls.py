#!/usr/bin/env python3
"""Spot-check speciesPhotos URLs for catalog taxa (open hosts + local)."""
from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PHOTOS = ROOT / "frontend" / "src" / "data" / "speciesPhotos.json"
CATALOG = ROOT / "frontend" / "src" / "data" / "speciesCatalog.json"
UA = "VisionSetilBot/1.1 (+photo verify)"

FLAKY = re.compile(
    r"(svampe\.databasen\.org|botanicgardens\.netx\.net|s3\.hpc\.ut\.ee)", re.I
)


def check(url: str):
    if url.startswith("/media/"):
        p = ROOT / "media" / url[len("/media/") :]
        if p.exists() and p.stat().st_size > 5000:
            return "local-ok", p.stat().st_size
        return "local-missing", 0
    try:
        req = urllib.request.Request(
            url, headers={"User-Agent": UA, "Range": "bytes=0-200"}
        )
        with urllib.request.urlopen(req, timeout=18) as r:
            return str(r.status), r.headers.get("Content-Type", "")
    except Exception as e:
        return "ERR", str(e)[:100]


def main() -> int:
    ph = json.loads(PHOTOS.read_text(encoding="utf-8"))
    cat = json.loads(CATALOG.read_text(encoding="utf-8"))
    pm = ph.get("photos") or {}

    issues = []
    for s in cat.get("species") or []:
        taxon = (s.get("taxon") or "").strip()
        e = pm.get(taxon.lower())
        if not e or not e.get("url"):
            issues.append((taxon, "missing", None))
        elif "Special:FilePath" in e["url"]:
            issues.append((taxon, "filepath", e["url"]))
        elif FLAKY.search(e["url"]):
            issues.append((taxon, "flaky", e["url"]))

    print(f"catalog issues (missing/filepath/flaky): {len(issues)}")
    for row in issues:
        print(" ", row[0], row[1])

    # check recently filled keys
    sample = [
        "agaricus freirei",
        "amanita caesarea",
        "boletus edulis",
        "morchella esculenta",
        "armillaria lutea",
        "laccaria amethystina",
        "chlorophyllum olivieri",
        "pleurotus ostreatus",
        "suillus luteus",
        "picosphaera cistidiolens",
    ]
    print("\nspot-check:")
    for k in sample:
        e = pm.get(k) or {}
        u = e.get("url") or ""
        st, info = check(u) if u else ("no-url", "")
        print(f"  {k:28} {st:12} {e.get('provider')} {u[:80]}")

    print("\nstats", ph.get("stats"))
    return 0 if not issues else 1


if __name__ == "__main__":
    raise SystemExit(main())
