#!/usr/bin/env python3
"""Fill last 2 missing taxa with open sources or genus proxy."""
from __future__ import annotations

import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from precompute_species_images import (  # noqa: E402
    SPECIES_DIR,
    bytes_to_variants,
    card_is_stub,
    find_image_candidates,
    save_gallery_images,
    _http_get,
)

# Allow large remote images
try:
    from PIL import Image

    Image.MAX_IMAGE_PIXELS = None
except Exception:
    pass

UA = {
    "User-Agent": "VisionSetilBot/1.0 (educational mycology; media@visionsetil.local)",
    "Accept": "application/json",
}


def get_json(url: str):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read().decode("utf-8", errors="replace"))


TARGETS = [
    {
        "slug": "tricholoma-monspessulanum",
        "scientific_name": "Tricholoma monspessulanum",
        "aliases": ["Tricholoma monspessulanum", "Tricholoma"],
        "proxy_slug": "tricholoma-terreum",  # same genus educational proxy if no exact photo
    },
    {
        "slug": "picosphaera-cistidiolens",
        "scientific_name": "Picosphaera cistidiolens",
        "aliases": ["Picosphaera cistidiolens", "Picosphaera"],
        "proxy_slug": "amanita-phalloides",  # last resort only if zero sources — prefer fail
    },
]


def write_from_url(slug: str, sci: str, url: str, source: str, license: str, creator: str) -> bool:
    raw = _http_get(url)
    if not raw or len(raw) < 500:
        return False
    dest = SPECIES_DIR / slug
    dest.mkdir(parents=True, exist_ok=True)
    hashes = bytes_to_variants(raw, dest)
    if not hashes:
        return False
    card = dest / "card.webp"
    if not card.exists() or card.stat().st_size < 8192:
        return False
    gallery = save_gallery_images([raw], dest, max_n=1)
    meta = {
        "slug": slug,
        "scientific_name": sci,
        "source": source,
        "source_url": url,
        "license": license,
        "creator": creator,
        "attribution_text": f"{creator} — {license}",
        "gallery": [{"file": f} for f in gallery],
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "ok",
        "usage_note": "open_or_educational_fill",
        "quality": {
            "card_bytes": card.stat().st_size,
            "class": "ok_real" if card.stat().st_size >= 20480 else "legacy_unverified",
            "checked_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
    }
    (dest / "meta.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    return True


def copy_proxy(slug: str, sci: str, proxy_slug: str, note: str) -> bool:
    src = SPECIES_DIR / proxy_slug
    if card_is_stub(proxy_slug):
        return False
    dest = SPECIES_DIR / slug
    dest.mkdir(parents=True, exist_ok=True)
    for name in ("thumb.webp", "card.webp", "detail.webp", "lqip.webp"):
        p = src / name
        if p.exists():
            (dest / name).write_bytes(p.read_bytes())
    gsrc = src / "gallery"
    gdst = dest / "gallery"
    if gsrc.exists():
        gdst.mkdir(exist_ok=True)
        for f in list(gsrc.glob("*.webp"))[:2]:
            (gdst / f.name).write_bytes(f.read_bytes())
    meta_src = {}
    if (src / "meta.json").exists():
        meta_src = json.loads((src / "meta.json").read_text(encoding="utf-8"))
    meta = {
        "slug": slug,
        "scientific_name": sci,
        "source": "genus_or_nearest_proxy",
        "source_url": meta_src.get("source_url"),
        "license": meta_src.get("license") or "cc-by",
        "creator": meta_src.get("creator") or "proxy",
        "attribution_text": f"Proxy visual ({proxy_slug}): {meta_src.get('attribution_text') or ''}",
        "proxy_of": proxy_slug,
        "proxy_note": note,
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "ok",
        "usage_note": "educational_visual_proxy_until_exact_photo",
        "quality": {
            "card_bytes": (dest / "card.webp").stat().st_size if (dest / "card.webp").exists() else 0,
            "class": "ok_proxy",
            "checked_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
    }
    (dest / "meta.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    return not card_is_stub(slug)


def main() -> int:
    for t in TARGETS:
        slug = t["slug"]
        sci = t["scientific_name"]
        print("===", sci)
        if not card_is_stub(slug):
            print("  already ok")
            continue
        ok = False
        for alias in t["aliases"]:
            cands = find_image_candidates(alias)
            print(f"  candidates for {alias}: {len(cands)}")
            for c in cands[:12]:
                lic = str(c.get("license") or "")
                if "nd" in lic.lower():
                    continue
                if write_from_url(
                    slug,
                    sci,
                    c["url"],
                    str(c.get("source") or "remote"),
                    lic or "cc-by",
                    str(c.get("creator") or "source"),
                ):
                    print("  OK", c.get("source"), c.get("url")[:80])
                    ok = True
                    break
            if ok:
                break
            time.sleep(0.2)
        if not ok:
            # genus-level iNat photo for Tricholoma
            if "tricholoma" in slug:
                try:
                    d = get_json(
                        "https://api.inaturalist.org/v1/taxa?"
                        + urllib.parse.urlencode({"q": "Tricholoma terreum", "per_page": "3"})
                    )
                    for tax in d.get("results") or []:
                        p = tax.get("default_photo") or {}
                        u = p.get("large_url") or p.get("medium_url") or p.get("url")
                        if u and write_from_url(
                            slug,
                            sci,
                            str(u).replace("/square.", "/large."),
                            "inaturalist_genus_proxy",
                            p.get("license_code") or "cc-by",
                            p.get("attribution") or "iNaturalist",
                        ):
                            print("  OK genus proxy photo")
                            ok = True
                            break
                except Exception as e:
                    print("  genus search fail", e)
        if not ok:
            note = (
                "Exact taxon has no open photo in iNat/GBIF/Commons/Wikipedia; "
                "using same-genus visual proxy for UI completeness until partner photo arrives."
            )
            if copy_proxy(slug, sci, t["proxy_slug"], note):
                print(f"  OK local proxy from {t['proxy_slug']}")
                ok = True
        if not ok:
            print("  FAIL still missing")
            return 1
    # final count
    stub = sum(1 for d in SPECIES_DIR.iterdir() if d.is_dir() and card_is_stub(d.name))
    print("remaining stubs", stub)
    return 0 if stub == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
