#!/usr/bin/env python3
"""Build verified mycology photo catalog (Wikipedia + iNaturalist).

Usage:
  python scripts/build_species_photos.py
"""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "frontend" / "src" / "data" / "speciesCatalog.json"
OUT = ROOT / "frontend" / "src" / "data" / "speciesPhotos.json"
UA = "VisionSetil/1.0 (educational mycology; local build script)"


def get_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode("utf-8", errors="replace"))


def wiki_image(name: str, lang: str) -> str | None:
    url = f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/" + urllib.parse.quote(
        name.replace(" ", "_")
    )
    try:
        data = get_json(url)
        if "not_found" in str(data.get("type", "")):
            return None
        return (data.get("originalimage") or {}).get("source") or (data.get("thumbnail") or {}).get(
            "source"
        )
    except Exception:
        return None


def inat_image(name: str) -> str | None:
    q = urllib.parse.urlencode({"q": name, "is_active": "true", "rank": "species", "per_page": 8})
    try:
        data = get_json(f"https://api.inaturalist.org/v1/taxa?{q}")
        results = data.get("results") or []
        for t in results:
            if (t.get("name") or "").lower() == name.lower():
                p = t.get("default_photo") or {}
                u = p.get("medium_url") or p.get("url") or p.get("square_url")
                if u:
                    return u.replace("/square.", "/medium.")
        for t in results:
            icon = (t.get("iconic_taxon_name") or "").lower()
            if icon and icon not in ("fungi", "protozoa", ""):
                continue
            p = t.get("default_photo") or {}
            u = p.get("medium_url") or p.get("url")
            if u and name.split()[0].lower() in (t.get("name") or "").lower():
                return u.replace("/square.", "/medium.")
        return None
    except Exception:
        return None


def main() -> None:
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    species = catalog["species"]
    photos: dict = {}
    missing: list[str] = []
    for i, s in enumerate(species):
        taxon = s["taxon"].strip()
        src = None
        provider = None
        for lang in ("en", "es"):
            img = wiki_image(taxon, lang)
            if img:
                src, provider = img, f"wikipedia_{lang}"
                break
            time.sleep(0.04)
        if not src:
            img = inat_image(taxon)
            if img:
                src, provider = img, "inaturalist"
            time.sleep(0.12)
        else:
            time.sleep(0.06)
        if src:
            photos[taxon.lower()] = {"taxon": taxon, "url": src, "provider": provider}
        else:
            missing.append(taxon)
        if (i + 1) % 25 == 0:
            print(f"progress {i+1}/{len(species)} ok={len(photos)}")
    out = {
        "version": "2.0.0",
        "generated": time.strftime("%Y-%m-%d"),
        "policy": "mycology-only verified photos; orientation only",
        "photos": photos,
        "stats": {
            "total": len(species),
            "with_photo": len(photos),
            "missing": len(missing),
            "missing_taxa": missing,
        },
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print("wrote", OUT, "with_photo", len(photos), "missing", len(missing))


if __name__ == "__main__":
    main()
