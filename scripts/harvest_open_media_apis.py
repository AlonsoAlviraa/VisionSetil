#!/usr/bin/env python3
"""Harvest / probe OPEN media APIs only (Wikipedia, iNaturalist, GBIF, Commons).

Legal graph-engineering helper. Does NOT scrape commercial mushroom apps
(Picture Mushroom, Shroomify, etc.) or reverse-engineer proprietary models.

Usage:
  python scripts/harvest_open_media_apis.py --probe --limit 25
  python scripts/harvest_open_media_apis.py --write-report
  python scripts/harvest_open_media_apis.py --refresh-photos-subset --limit 50

Policy: orientation only · respect rate limits · User-Agent required · CC filter notes.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "frontend" / "src" / "data" / "speciesCatalog.json"
PHOTOS = ROOT / "frontend" / "src" / "data" / "speciesPhotos.json"
OUT_DIR = ROOT / "data" / "open_api_harvest"
UA = (
    "VisionSetilBot/1.0 (+https://github.com/AlonsoAlviraa/VisionSetil; "
    "open-api harvest; educational mycology)"
)

# Public open endpoints (document + probe)
OPEN_APIS = {
    "wikipedia_rest_es": "https://es.wikipedia.org/api/rest_v1/page/summary/",
    "wikipedia_rest_en": "https://en.wikipedia.org/api/rest_v1/page/summary/",
    "inaturalist_taxa": "https://api.inaturalist.org/v1/taxa",
    "gbif_occurrence": "https://api.gbif.org/v1/occurrence/search",
    "gbif_species_match": "https://api.gbif.org/v1/species/match",
    "commons_api": "https://commons.wikimedia.org/w/api.php",
}


def get_json(url: str, timeout: float = 20.0) -> dict | list | None:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": UA, "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8", errors="replace"))
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None


def wiki_summary(taxon: str, lang: str) -> dict | None:
    base = OPEN_APIS[f"wikipedia_rest_{lang}"]
    url = base + urllib.parse.quote(taxon.replace(" ", "_"))
    data = get_json(url)
    if not isinstance(data, dict):
        return None
    if "not_found" in str(data.get("type", "")):
        return None
    img = (data.get("originalimage") or {}).get("source") or (
        data.get("thumbnail") or {}
    ).get("source")
    if not img:
        return None
    return {
        "provider": f"wikipedia_{lang}",
        "url": img,
        "page": (data.get("content_urls") or {}).get("desktop", {}).get("page"),
        "title": data.get("title"),
    }


def inat_default_photo(taxon: str) -> dict | None:
    q = urllib.parse.urlencode(
        {"q": taxon, "is_active": "true", "rank": "species", "per_page": 5}
    )
    data = get_json(f"{OPEN_APIS['inaturalist_taxa']}?{q}")
    if not isinstance(data, dict):
        return None
    for t in data.get("results") or []:
        if (t.get("name") or "").lower() != taxon.lower():
            continue
        p = t.get("default_photo") or {}
        u = p.get("medium_url") or p.get("url") or p.get("square_url")
        if not u:
            return None
        return {
            "provider": "inaturalist",
            "url": str(u).replace("/square.", "/medium."),
            "taxon_id": t.get("id"),
            "license_code": p.get("license_code"),
            "attribution": p.get("attribution"),
        }
    return None


def gbif_media_sample(taxon: str, country: str = "ES") -> dict | None:
    q = urllib.parse.urlencode(
        {
            "scientificName": taxon,
            "country": country,
            "mediaType": "StillImage",
            "limit": 3,
        }
    )
    data = get_json(f"{OPEN_APIS['gbif_occurrence']}?{q}")
    if not isinstance(data, dict):
        return None
    for occ in data.get("results") or []:
        for m in occ.get("media") or []:
            ident = m.get("identifier")
            if not ident:
                continue
            return {
                "provider": "gbif",
                "url": ident,
                "license": m.get("license"),
                "creator": m.get("creator"),
                "gbif_key": occ.get("key"),
                "country": country,
            }
    return None


def commons_search(taxon: str) -> dict | None:
    q = urllib.parse.urlencode(
        {
            "action": "query",
            "format": "json",
            "generator": "search",
            "gsrsearch": f"filetype:bitmap {taxon}",
            "gsrlimit": 3,
            "prop": "imageinfo",
            "iiprop": "url|extmetadata",
            "iiurlwidth": 800,
        }
    )
    data = get_json(f"{OPEN_APIS['commons_api']}?{q}")
    if not isinstance(data, dict):
        return None
    pages = (data.get("query") or {}).get("pages") or {}
    for _pid, page in pages.items():
        infos = page.get("imageinfo") or []
        if not infos:
            continue
        info = infos[0]
        url = info.get("thumburl") or info.get("url")
        if not url:
            continue
        meta = info.get("extmetadata") or {}
        license_short = (meta.get("LicenseShortName") or {}).get("value")
        artist = (meta.get("Artist") or {}).get("value")
        return {
            "provider": "wikimedia_commons",
            "url": url,
            "license": license_short,
            "artist_html": artist,
            "title": page.get("title"),
        }
    return None


def load_taxa(limit: int | None) -> list[str]:
    if not CATALOG.exists():
        print(f"missing catalog {CATALOG}", file=sys.stderr)
        return []
    raw = json.loads(CATALOG.read_text(encoding="utf-8"))
    species = raw.get("species") or raw
    names = [s["taxon"].strip() for s in species if s.get("taxon")]
    if limit:
        return names[:limit]
    return names


def probe_one(taxon: str) -> dict:
    hit: dict = {"taxon": taxon, "sources": {}}
    for lang in ("en", "es"):
        w = wiki_summary(taxon, lang)
        time.sleep(0.05)
        if w:
            hit["sources"][f"wiki_{lang}"] = w
            break
    i = inat_default_photo(taxon)
    time.sleep(0.12)
    if i:
        hit["sources"]["inat"] = i
    g = gbif_media_sample(taxon)
    time.sleep(0.08)
    if g:
        hit["sources"]["gbif"] = g
    c = commons_search(taxon)
    time.sleep(0.08)
    if c:
        hit["sources"]["commons"] = c
    hit["best"] = (
        hit["sources"].get("wiki_en")
        or hit["sources"].get("wiki_es")
        or hit["sources"].get("commons")
        or hit["sources"].get("inat")
        or hit["sources"].get("gbif")
    )
    return hit


def write_report(results: list[dict], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    covered = sum(1 for r in results if r.get("best"))
    by_provider: dict[str, int] = {}
    for r in results:
        b = r.get("best") or {}
        p = b.get("provider") or "none"
        by_provider[p] = by_provider.get(p, 0) + 1
    doc = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "policy": "open APIs only — no commercial app scrape",
        "apis": OPEN_APIS,
        "stats": {
            "probed": len(results),
            "with_any_media": covered,
            "coverage_pct": round(100.0 * covered / max(len(results), 1), 2),
            "by_best_provider": by_provider,
        },
        "results": results,
    }
    path.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {path} coverage={doc['stats']['coverage_pct']}%")


def refresh_photos_subset(results: list[dict]) -> None:
    """Merge best open URLs into speciesPhotos.json (does not delete existing)."""
    photos: dict = {}
    if PHOTOS.exists():
        photos = json.loads(PHOTOS.read_text(encoding="utf-8")).get("photos") or {}
    updated = 0
    for r in results:
        best = r.get("best")
        if not best or not best.get("url"):
            continue
        key = r["taxon"].lower()
        prev = photos.get(key) or {}
        # Prefer wiki/commons over empty; keep existing if already wiki
        if prev.get("url") and prev.get("provider", "").startswith("wikipedia"):
            continue
        photos[key] = {
            "taxon": r["taxon"],
            "url": best["url"],
            "provider": best.get("provider") or "open_api",
        }
        updated += 1
    out = {
        "version": "2.1.0-open-harvest",
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "policy": "mycology open APIs only; orientation only; no commercial scrape",
        "photos": photos,
        "stats": {
            "total_keys": len(photos),
            "updated_this_run": updated,
        },
    }
    PHOTOS.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"updated {PHOTOS} (+{updated} keys)")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--probe", action="store_true", help="Probe open APIs for N taxa")
    ap.add_argument("--limit", type=int, default=25, help="Taxa limit (default 25)")
    ap.add_argument("--write-report", action="store_true", help="Write JSON report under data/")
    ap.add_argument(
        "--refresh-photos-subset",
        action="store_true",
        help="Merge best open hits into speciesPhotos.json",
    )
    args = ap.parse_args()

    if not (args.probe or args.write_report or args.refresh_photos_subset):
        ap.print_help()
        print("\nOpen APIs:", file=sys.stderr)
        for k, v in OPEN_APIS.items():
            print(f"  {k}: {v}", file=sys.stderr)
        return 0

    taxa = load_taxa(args.limit if args.probe or args.refresh_photos_subset else args.limit)
    if not taxa:
        return 1

    print(f"probing {len(taxa)} taxa against open APIs…")
    results: list[dict] = []
    for i, taxon in enumerate(taxa):
        results.append(probe_one(taxon))
        if (i + 1) % 10 == 0:
            ok = sum(1 for r in results if r.get("best"))
            print(f"  {i+1}/{len(taxa)} hits={ok}")

    ok = sum(1 for r in results if r.get("best"))
    print(f"done hits={ok}/{len(results)}")

    if args.write_report or args.probe:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        write_report(results, OUT_DIR / f"probe_{stamp}.json")
        write_report(results, OUT_DIR / "probe_latest.json")

    if args.refresh_photos_subset:
        refresh_photos_subset(results)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
