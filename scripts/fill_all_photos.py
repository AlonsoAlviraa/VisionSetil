#!/usr/bin/env python3
"""Fill every species without a real photo using open public databases.

Sources (all public / open-license where possible):
  - iNaturalist open data
  - GBIF occurrence StillImage
  - Wikimedia Commons
  - Wikipedia page images (last resort)

Does NOT scrape private paywalled libraries (Mushroom Observer private,
commercial stock). Partnership contact placeholder: media@visionsetil.local

Usage:
  python scripts/fill_all_photos.py
  python scripts/fill_all_photos.py --limit 50
  python scripts/fill_all_photos.py --only-stubs
  python scripts/fill_all_photos.py --sync-catalog-only
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from precompute_species_images import (  # noqa: E402
    CATALOG,
    MIN_CARD_BYTES,
    SPECIES_DIR,
    already_fetched,
    card_is_stub,
    fetch_species_photos,
    write_manifests,
)

FE_PHOTOS = ROOT / "frontend" / "src" / "data" / "speciesPhotos.json"
FE_CATALOG = ROOT / "frontend" / "src" / "data" / "speciesCatalog.json"


def list_stub_slugs(catalog: dict) -> list[str]:
    out: list[str] = []
    for sp in catalog.get("species") or []:
        slug = sp.get("slug") or ""
        if not slug:
            continue
        if card_is_stub(slug) or not already_fetched(slug):
            out.append(slug)
    return out


def sync_species_photos_json(catalog: dict) -> dict:
    """Rebuild frontend speciesPhotos.json from local meta + remaining remote fallbacks."""
    photos: dict = {}
    missing: list[str] = []

    # Prefer local-derived absolute-ish paths for FE: keep remote URLs when meta has source_url
    for sp in catalog.get("species") or []:
        slug = sp.get("slug") or ""
        sci = (sp.get("scientific_name") or sp.get("taxon") or "").strip()
        if not sci:
            continue
        key = sci.lower()
        meta_path = SPECIES_DIR / slug / "meta.json"
        card = SPECIES_DIR / slug / "card.webp"
        if meta_path.exists() and card.exists() and not card_is_stub(slug):
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                meta = {}
            url = meta.get("source_url")
            if url and str(url).startswith("http"):
                photos[key] = {
                    "taxon": sci,
                    "url": url,
                    "provider": meta.get("source") or "local_media",
                    "license": meta.get("license"),
                    "slug": slug,
                }
                continue
            # Local-only real photo: still map for FE cascade via catalog provider field
            photos[key] = {
                "taxon": sci,
                "url": f"/media/species/{slug}/card.webp",
                "provider": "local_media",
                "license": meta.get("license"),
                "slug": slug,
            }
            continue
        missing.append(sci)

    # Merge previous remote catalog for any still missing
    if FE_PHOTOS.exists():
        old = json.loads(FE_PHOTOS.read_text(encoding="utf-8"))
        for k, v in (old.get("photos") or {}).items():
            if k not in photos and v.get("url"):
                photos[k] = v
                if v.get("taxon") in missing:
                    missing = [m for m in missing if m != v.get("taxon")]

    # Also index frontend species catalog (347 taxa)
    if FE_CATALOG.exists():
        fe = json.loads(FE_CATALOG.read_text(encoding="utf-8"))
        for s in fe.get("species") or []:
            tax = (s.get("taxon") or "").strip()
            if not tax:
                continue
            k = tax.lower()
            if k in photos:
                continue
            slug = s.get("slug") or ""
            if slug and not card_is_stub(slug):
                photos[k] = {
                    "taxon": tax,
                    "url": f"/media/species/{slug}/card.webp",
                    "provider": "local_media",
                    "slug": slug,
                }

    out = {
        "version": "3.0.0",
        "generated": time.strftime("%Y-%m-%d"),
        "policy": "open-license mycology photos; orientation only — never consumption",
        "photos": photos,
        "stats": {
            "total": len(catalog.get("species") or []),
            "with_photo": len(photos),
            "missing": len(missing),
            "missing_taxa": missing[:50],
            "missing_total": len(missing),
        },
    }
    FE_PHOTOS.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {FE_PHOTOS} with_photo={len(photos)} missing={len(missing)}")
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--limit", type=int, default=0, help="Max stubs to fetch (0=all)")
    ap.add_argument("--only-stubs", action="store_true", default=True)
    ap.add_argument("--all-species", action="store_true", help="Try every catalog species")
    ap.add_argument("--sync-catalog-only", action="store_true")
    ap.add_argument("--gallery-max", type=int, default=3)
    ap.add_argument("--batch-size", type=int, default=40, help="Fetch in batches of N")
    args = ap.parse_args()

    if not CATALOG.exists():
        print("Missing catalog", CATALOG, file=sys.stderr)
        return 1
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))

    if args.sync_catalog_only:
        sync_species_photos_json(catalog)
        write_manifests(catalog)
        return 0

    if args.all_species:
        slugs = [s["slug"] for s in catalog.get("species") or [] if s.get("slug")]
    else:
        slugs = list_stub_slugs(catalog)

    if args.limit and args.limit > 0:
        slugs = slugs[: args.limit]

    print(f"Target species to fill: {len(slugs)}")
    if not slugs:
        print("Nothing to fetch — syncing catalog only")
        sync_species_photos_json(catalog)
        return 0

    # Batch to avoid huge arg lists and allow progress checkpoints
    total_ok = total_fail = total_skip = 0
    batch = max(1, args.batch_size)
    for i in range(0, len(slugs), batch):
        chunk = slugs[i : i + batch]
        print(f"\n=== Batch {i // batch + 1}: {len(chunk)} species ({i+1}-{i+len(chunk)}/{len(slugs)}) ===")
        stats = fetch_species_photos(
            catalog,
            limit=len(chunk),
            force=False,  # already_fetched skips real ok; stubs re-fetch
            only_slugs=set(chunk),
            gallery_max=args.gallery_max,
        )
        total_ok += stats.get("ok", 0)
        total_fail += stats.get("fail", 0)
        total_skip += stats.get("skip", 0)
        # checkpoint sync after each batch
        sync_species_photos_json(catalog)
        print(f"checkpoint ok={total_ok} fail={total_fail} skip={total_skip}")

    write_manifests(catalog)
    remaining = list_stub_slugs(catalog)
    print(
        f"\nDONE fill ok={total_ok} fail={total_fail} skip={total_skip} "
        f"remaining_stubs={len(remaining)}"
    )
    if remaining:
        print("Still without real photo (sample):", remaining[:30])
        print(
            "Next: re-run this script; rare taxa may need manual CC photos or "
            "partner requests to mycological societies (media@visionsetil.local)."
        )
    return 0 if len(remaining) == 0 else 0  # soft pass — keep iterating


if __name__ == "__main__":
    raise SystemExit(main())
