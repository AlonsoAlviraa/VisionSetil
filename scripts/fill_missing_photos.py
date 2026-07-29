#!/usr/bin/env python3
"""Fill missing / weak species photos from open APIs only.

Targets taxa with:
  - no entry in speciesPhotos.json
  - Special:FilePath / wiki page URLs (not direct image files)
  - flaky GBIF host URLs (svampe, plutof SSL, netx)
  - local_media-only without remote catalog URL

Sources (legal open APIs only):
  Wikipedia REST (en/es), Wikimedia Commons API, iNaturalist taxa, GBIF occurrence media.

Does NOT scrape commercial apps. Orientation-only product policy.

Usage:
  python scripts/fill_missing_photos.py --dry-run
  python scripts/fill_missing_photos.py --write
  python scripts/fill_missing_photos.py --write --check-broken  # also HEAD-sample flaky
"""
from __future__ import annotations

import argparse
import json
import re
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
    "VisionSetilBot/1.1 (+https://github.com/AlonsoAlviraa/VisionSetil; "
    "open-api photo fill; educational mycology; orientation-only)"
)

FLAKY_HOST_RE = re.compile(
    r"(svampe\.databasen\.org|botanicgardens\.netx\.net|s3\.hpc\.ut\.ee|"
    r"plutof-public|arter\.dk)",
    re.I,
)


def get_json(url: str, timeout: float = 22.0) -> dict | list | None:
    req = urllib.request.Request(
        url, headers={"User-Agent": UA, "Accept": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8", errors="replace"))
    except (
        urllib.error.HTTPError,
        urllib.error.URLError,
        TimeoutError,
        json.JSONDecodeError,
    ):
        return None


def is_direct_image_url(url: str) -> bool:
    if not url or not url.startswith("http"):
        return False
    if "Special:FilePath" in url or "/wiki/" in url and "upload.wikimedia" not in url:
        return False
    if FLAKY_HOST_RE.search(url):
        return False
    # direct files or known CDNs
    if re.search(r"\.(jpe?g|png|webp|gif)(\?|$)", url, re.I):
        return True
    if "inaturalist" in url or "upload.wikimedia.org" in url:
        return True
    return False


def weak_reason(entry: dict | None) -> str | None:
    if not entry or not entry.get("url"):
        return "missing"
    u = entry["url"]
    if u.startswith("data:"):
        return "data_uri"
    if "placeholder" in u.lower():
        return "placeholder"
    if "Special:FilePath" in u or (
        "/wiki/" in u and "upload.wikimedia" not in u
    ):
        return "wiki_page_not_file"
    if entry.get("provider") == "local_media" or u.startswith("/media/"):
        return "local_media_only"
    if FLAKY_HOST_RE.search(u):
        return "flaky_host"
    if not is_direct_image_url(u) and not u.startswith("/media/"):
        return "not_direct_image"
    return None


def wiki_summary(taxon: str, lang: str) -> dict | None:
    base = f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/"
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
    # Prefer sized thumb when available
    thumb = (data.get("thumbnail") or {}).get("source")
    if thumb and re.search(r"/\d+px-", thumb):
        img = re.sub(r"/\d+px-", "/1280px-", thumb)
    return {
        "provider": f"wikipedia_{lang}",
        "url": img,
        "title": data.get("title"),
        "license": "wikipedia-page-image",
    }


def commons_search(taxon: str) -> dict | None:
    q = urllib.parse.urlencode(
        {
            "action": "query",
            "format": "json",
            "generator": "search",
            "gsrsearch": f"filetype:bitmap {taxon}",
            "gsrlimit": 5,
            "prop": "imageinfo",
            "iiprop": "url|extmetadata|mime",
            "iiurlwidth": 1280,
            "origin": "*",
        }
    )
    data = get_json(f"https://commons.wikimedia.org/w/api.php?{q}")
    if not isinstance(data, dict):
        return None
    pages = (data.get("query") or {}).get("pages") or {}
    for _pid, page in pages.items():
        title = (page.get("title") or "").lower()
        # Prefer titles that mention the taxon words
        words = [w for w in taxon.lower().split() if len(w) > 3]
        if words and not any(w in title for w in words):
            continue
        infos = page.get("imageinfo") or []
        if not infos:
            continue
        info = infos[0]
        mime = (info.get("mime") or "").lower()
        if mime and not mime.startswith("image/"):
            continue
        url = info.get("thumburl") or info.get("url")
        if not url:
            continue
        meta = info.get("extmetadata") or {}
        license_short = (meta.get("LicenseShortName") or {}).get("value")
        artist = (meta.get("Artist") or {}).get("value")
        return {
            "provider": "wikimedia_commons",
            "url": url,
            "license": license_short or "commons",
            "artist_html": artist,
            "title": page.get("title"),
        }
    # fallback: first image page regardless of title match
    for _pid, page in pages.items():
        infos = page.get("imageinfo") or []
        if not infos:
            continue
        info = infos[0]
        url = info.get("thumburl") or info.get("url")
        if url:
            return {
                "provider": "wikimedia_commons",
                "url": url,
                "license": "commons",
                "title": page.get("title"),
            }
    return None


def resolve_special_filepath(url: str) -> dict | None:
    """Convert Special:FilePath/Name.jpg → direct commons file URL via API."""
    m = re.search(r"Special:FilePath/([^?#]+)", url)
    if not m:
        return None
    filename = urllib.parse.unquote(m.group(1))
    title = filename if filename.startswith("File:") else f"File:{filename}"
    q = urllib.parse.urlencode(
        {
            "action": "query",
            "format": "json",
            "titles": title,
            "prop": "imageinfo",
            "iiprop": "url|extmetadata",
            "iiurlwidth": 1280,
            "origin": "*",
        }
    )
    data = get_json(f"https://commons.wikimedia.org/w/api.php?{q}")
    if not isinstance(data, dict):
        return None
    pages = (data.get("query") or {}).get("pages") or {}
    for page in pages.values():
        infos = page.get("imageinfo") or []
        if not infos:
            continue
        info = infos[0]
        u = info.get("thumburl") or info.get("url")
        if not u:
            continue
        meta = info.get("extmetadata") or {}
        return {
            "provider": "wikimedia_commons",
            "url": u,
            "license": (meta.get("LicenseShortName") or {}).get("value") or "commons",
            "title": page.get("title") or title,
        }
    return None


def inat_default_photo(taxon: str) -> dict | None:
    q = urllib.parse.urlencode(
        {
            "q": taxon,
            "is_active": "true",
            "rank": "species",
            "per_page": "8",
        }
    )
    data = get_json(f"https://api.inaturalist.org/v1/taxa?{q}")
    if not isinstance(data, dict):
        return None
    results = data.get("results") or []
    # exact name first, then iconic fungi
    ordered = []
    for t in results:
        if (t.get("name") or "").lower() == taxon.lower():
            ordered.insert(0, t)
        else:
            ordered.append(t)
    for t in ordered:
        icon = (t.get("iconic_taxon_name") or "").lower()
        if icon and icon not in ("fungi", "protozoa", ""):
            continue
        # prefer exact
        if ordered[0] is not t and (t.get("name") or "").lower() != taxon.lower():
            # allow close if observation count high
            if (t.get("observations_count") or 0) < 20:
                continue
        p = t.get("default_photo") or {}
        u = p.get("medium_url") or p.get("url") or p.get("square_url")
        if not u:
            continue
        u = re.sub(
            r"/(square|small|medium|large|original|thumb)\.",
            "/medium.",
            str(u),
        )
        return {
            "provider": "inaturalist",
            "url": u,
            "taxon_id": t.get("id"),
            "license": p.get("license_code"),
            "attribution": p.get("attribution"),
            "matched_name": t.get("name"),
        }
    return None


def gbif_media(taxon: str) -> dict | None:
    # Try without country first (more hits), then ES
    for country in (None, "ES"):
        params: dict = {
            "scientificName": taxon,
            "mediaType": "StillImage",
            "limit": "8",
        }
        if country:
            params["country"] = country
        q = urllib.parse.urlencode(params)
        data = get_json(f"https://api.gbif.org/v1/occurrence/search?{q}")
        if not isinstance(data, dict):
            continue
        for occ in data.get("results") or []:
            for m in occ.get("media") or []:
                ident = m.get("identifier")
                if not ident or not str(ident).startswith("http"):
                    continue
                if FLAKY_HOST_RE.search(str(ident)):
                    continue
                if not is_direct_image_url(str(ident)) and "inaturalist" not in str(
                    ident
                ):
                    # still accept gbif image servers
                    if not re.search(r"\.(jpe?g|png|webp)(\?|$)", str(ident), re.I):
                        continue
                return {
                    "provider": "gbif",
                    "url": str(ident),
                    "license": m.get("license"),
                    "creator": m.get("creator"),
                    "gbif_key": occ.get("key"),
                }
    return None


def slugify(taxon: str) -> str:
    s = taxon.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def probe_taxon(taxon: str, existing: dict | None) -> dict:
    hit: dict = {
        "taxon": taxon,
        "slug": slugify(taxon),
        "reason": weak_reason(existing),
        "prev_url": (existing or {}).get("url"),
        "sources": {},
        "best": None,
    }

    # 1) If existing is Special:FilePath, try resolve first (cheap)
    if existing and existing.get("url") and "Special:FilePath" in existing["url"]:
        resolved = resolve_special_filepath(existing["url"])
        time.sleep(0.15)
        if resolved and is_direct_image_url(resolved["url"]):
            hit["sources"]["filepath_resolve"] = resolved
            hit["best"] = resolved
            return hit

    # 2) Wikipedia en / es
    for lang in ("en", "es"):
        w = wiki_summary(taxon, lang)
        time.sleep(0.12)
        if w and is_direct_image_url(w["url"]):
            hit["sources"][f"wiki_{lang}"] = w
            hit["best"] = w
            return hit

    # 3) Commons search
    c = commons_search(taxon)
    time.sleep(0.15)
    if c and is_direct_image_url(c["url"]):
        hit["sources"]["commons"] = c
        hit["best"] = c
        return hit

    # 4) iNaturalist
    i = inat_default_photo(taxon)
    time.sleep(0.2)
    if i and is_direct_image_url(i["url"]):
        hit["sources"]["inat"] = i
        hit["best"] = i
        return hit

    # 5) GBIF (filter flaky hosts)
    g = gbif_media(taxon)
    time.sleep(0.12)
    if g and is_direct_image_url(g["url"]):
        hit["sources"]["gbif"] = g
        hit["best"] = g
        return hit

    return hit


def load_catalog_species() -> list[dict]:
    raw = json.loads(CATALOG.read_text(encoding="utf-8"))
    return list(raw.get("species") or raw)


def find_targets(photo_map: dict) -> list[tuple[str, dict | None, str]]:
    out: list[tuple[str, dict | None, str]] = []
    for s in load_catalog_species():
        taxon = (s.get("taxon") or "").strip()
        if not taxon:
            continue
        entry = photo_map.get(taxon.lower())
        reason = weak_reason(entry)
        if reason:
            out.append((taxon, entry, reason))
    return out


def merge_into_photos(
    photo_map: dict, results: list[dict], only_if_better: bool = True
) -> int:
    updated = 0
    for r in results:
        best = r.get("best")
        if not best or not best.get("url"):
            continue
        if not is_direct_image_url(best["url"]):
            continue
        key = r["taxon"].lower()
        prev = photo_map.get(key) or {}
        if only_if_better and prev.get("url") and not weak_reason(prev):
            continue
        photo_map[key] = {
            "taxon": r["taxon"],
            "url": best["url"],
            "provider": best.get("provider") or "open_api",
            "license": best.get("license") or best.get("license_code") or "open",
            "slug": r.get("slug") or slugify(r["taxon"]),
        }
        if best.get("attribution"):
            photo_map[key]["attribution_text"] = best["attribution"]
        if best.get("creator"):
            photo_map[key]["creator"] = best["creator"]
        if best.get("matched_name") and best["matched_name"] != r["taxon"]:
            photo_map[key]["matched_name"] = best["matched_name"]
        updated += 1
    return updated


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--write", action="store_true", help="Write speciesPhotos.json")
    ap.add_argument("--dry-run", action="store_true", help="Probe only, no write")
    ap.add_argument(
        "--all-weak",
        action="store_true",
        default=True,
        help="Process all weak/missing (default)",
    )
    ap.add_argument("--limit", type=int, default=0, help="Cap targets (0=all)")
    args = ap.parse_args()
    if not args.write and not args.dry_run:
        args.dry_run = True

    photos_doc = json.loads(PHOTOS.read_text(encoding="utf-8"))
    photo_map: dict = dict(photos_doc.get("photos") or {})
    targets = find_targets(photo_map)
    if args.limit and args.limit > 0:
        targets = targets[: args.limit]

    print(f"targets={len(targets)} (missing/weak catalog photos)")
    for t, _e, reason in targets:
        print(f"  - {t} [{reason}]")

    results: list[dict] = []
    for i, (taxon, entry, reason) in enumerate(targets):
        print(f"[{i+1}/{len(targets)}] probing {taxon} ({reason})…")
        hit = probe_taxon(taxon, entry)
        results.append(hit)
        if hit.get("best"):
            print(f"    → {hit['best'].get('provider')}: {hit['best']['url'][:90]}")
        else:
            print("    → NO HIT")

    filled = sum(1 for r in results if r.get("best"))
    print(f"hits={filled}/{len(results)}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "policy": "open APIs only — no commercial app scrape",
        "targets": len(targets),
        "hits": filled,
        "results": results,
    }
    (OUT_DIR / f"fill_{stamp}.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (OUT_DIR / "fill_latest.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"report → {OUT_DIR / 'fill_latest.json'}")

    if args.write:
        updated = merge_into_photos(photo_map, results, only_if_better=True)
        # recompute stats vs catalog
        cat = load_catalog_species()
        missing = []
        for s in cat:
            t = (s.get("taxon") or "").strip()
            e = photo_map.get(t.lower())
            if weak_reason(e) in ("missing", "data_uri", "placeholder"):
                missing.append(t)
        out = {
            "version": "3.1.0-open-fill",
            "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "policy": (
                "open-license mycology photos via Wikipedia/Commons/iNat/GBIF; "
                "orientation only — never consumption; no commercial scrape"
            ),
            "photos": dict(sorted(photo_map.items(), key=lambda kv: kv[0])),
            "stats": {
                "total": len(cat),
                "with_photo": len(cat) - len(missing),
                "missing": len(missing),
                "missing_taxa": missing,
                "missing_total": len(missing),
                "photo_keys": len(photo_map),
                "updated_this_run": updated,
            },
        }
        PHOTOS.write_text(
            json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        print(f"wrote {PHOTOS} updated={updated} still_missing={len(missing)}")
        if missing:
            print("still missing:", ", ".join(missing))
    else:
        print("dry-run (pass --write to save)")

    return 0 if filled == len(results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
