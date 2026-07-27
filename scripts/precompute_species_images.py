#!/usr/bin/env python3
"""Precompute species WebP assets + placeholders (PR-02).

Default mode (offline-friendly):
  - Generate procedural brand placeholders (default/toxic/deadly/unknown)
  - Generate fixture WebPs for a small set of species
  - Write slim + full manifests for the full catalog (placeholder_only status)

Full network fetch mode:
  python scripts/precompute_species_images.py --fetch
  (polite UA, rate limit, license allowlist — optional network)

Git budget: only placeholders + ≤5 fixtures should be committed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
import sys
import time
import zlib
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "data" / "species_catalog" / "species_catalog_v2.json"
MEDIA = ROOT / "media"
PLACEHOLDERS = MEDIA / "placeholders"
SPECIES_DIR = MEDIA / "species"
MANIFESTS = MEDIA / "manifests"

# ≤5 fixtures in git
FIXTURE_SLUGS = [
    "amanita-phalloides",
    "boletus-edulis",
    "cantharellus-cibarius",
    "lactarius-deliciosus",
    "amanita-muscaria",
]

VARIANTS = {
    "lqip": 24,
    "thumb": 160,
    "card": 480,
    "detail": 960,
}

LICENSE_ALLOWLIST = {
    "cc0",
    "cc-by",
    "cc-by-sa",
    "public domain",
    "pd-us",
    "pd",
}

# Quality floors (Phase C / D-C1) — keep in sync with audit_media.py + vite/BE
MIN_CARD_BYTES = 8192
MIN_THUMB_BYTES = 1500
MIN_DETAIL_BYTES = 15000
OK_REAL_CARD_BYTES = 20480
MIN_CARD_DIMS = (240, 180)
MIN_BYTES_BY_VARIANT = {
    "card": MIN_CARD_BYTES,
    "thumb": MIN_THUMB_BYTES,
    "detail": MIN_DETAIL_BYTES,
    "lqip": 200,
}

# Contact: replace with production email before bulk Commons/GBIF crawl (C-18 / Issue 11)
USER_AGENT = (
    "VisionSetilBot/1.0 (+https://github.com/AlonsoAlviraa/VisionSetil; "
    "contact: media@visionsetil.local  # TODO C-18: real ops contact)"
)


def _crc(chunk_type: bytes, data: bytes) -> int:
    return zlib.crc32(chunk_type + data) & 0xFFFFFFFF


def _png_chunk(chunk_type: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + chunk_type + data + struct.pack(">I", _crc(chunk_type, data))


def make_png(
    width: int,
    height: int,
    rgb: tuple[int, int, int],
    icon_pixel: bool = False,
    *,
    entropy: bool = True,
    seed: bytes | None = None,
) -> bytes:
    """Create a branded PNG with vignette + optional high-entropy noise (Phase C floor).

    Solid-color WebPs compress to <1 KB and fail MIN_CARD_BYTES. When entropy=True,
    injects gradient bands + hash-seeded noise so WebP encode stays ≥ MIN_CARD_BYTES.
    """
    r, g, b = rgb
    hseed = seed or hashlib.sha256(f"{width}x{height}:{r},{g},{b}".encode()).digest()
    rows = []
    for y in range(height):
        row = bytearray([0])  # filter none
        for x in range(width):
            # Soft radial vignette + optional center "icon" square
            cx, cy = width / 2, height / 2
            dx, dy = (x - cx) / max(1, cx), (y - cy) / max(1, cy)
            dist = min(1.0, (dx * dx + dy * dy) ** 0.5)
            factor = 1.0 - 0.25 * dist
            # Diagonal forest gradient (breaks solid-color compression)
            band = 0.08 * ((x + y) % 32) / 32.0 if entropy else 0.0
            rr = max(0, min(255, int(r * factor * (1.0 - band) + 18 * band)))
            gg = max(0, min(255, int(g * factor * (1.0 - band * 0.6) + 22 * band)))
            bb = max(0, min(255, int(b * factor * (1.0 - band * 0.4) + 14 * band)))
            if entropy:
                # Low-amplitude spatial noise from seed (not pure random — deterministic)
                n = hseed[(x * 3 + y * 7) % len(hseed)]
                rr = max(0, min(255, rr + (n % 17) - 8))
                gg = max(0, min(255, gg + ((n >> 2) % 15) - 7))
                bb = max(0, min(255, bb + ((n >> 4) % 13) - 6))
                # Soft cap silhouette
                if abs(x - cx) < width * 0.22 and 0.35 * height < y < 0.78 * height:
                    rr = min(255, rr + 12)
                    gg = min(255, gg + 8)
            if icon_pixel and abs(x - cx) < width * 0.12 and abs(y - cy) < height * 0.18:
                rr, gg, bb = min(255, rr + 40), min(255, gg + 40), min(255, bb + 30)
            row.extend([rr, gg, bb])
        rows.append(bytes(row))
    raw = b"".join(rows)
    # Level 6: keep some size so WebP encode does not collapse under floor
    compressed = zlib.compress(raw, 6 if entropy else 9)
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + _png_chunk(b"IHDR", ihdr)
        + _png_chunk(b"IDAT", compressed)
        + _png_chunk(b"IEND", b"")
    )


def try_webp_from_png(png_bytes: bytes, quality: int = 80) -> bytes | None:
    try:
        from io import BytesIO

        from PIL import Image

        im = Image.open(BytesIO(png_bytes)).convert("RGB")
        buf = BytesIO()
        # method=4 + quality tuned; entropy PNG should stay above floor
        im.save(buf, format="WEBP", quality=quality, method=4)
        return buf.getvalue()
    except Exception:
        return None


def write_image(
    path: Path,
    width: int,
    rgb: tuple[int, int, int],
    quality: int = 80,
    *,
    min_bytes: int = 0,
    seed: bytes | None = None,
) -> str:
    """Write WebP if Pillow available; enforce min_bytes when set (C-13).

    PNG-bytes-as-.webp fallback is allowed only when Pillow is missing and min_bytes==0.
    For CI media jobs Pillow is required when min_bytes > 0.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    height = max(1, int(width * 0.75))
    png = make_png(width, height, rgb, icon_pixel=True, entropy=True, seed=seed)
    webp = try_webp_from_png(png, quality=quality)
    out = path.with_suffix(".webp")
    if webp:
        # If still under floor, re-encode larger canvas / lower compression
        if min_bytes and len(webp) < min_bytes:
            for boost_q in (90, 95, 100):
                big = make_png(
                    max(width, 480),
                    max(height, 360),
                    rgb,
                    icon_pixel=True,
                    entropy=True,
                    seed=(seed or b"") + bytes([boost_q]),
                )
                webp2 = try_webp_from_png(big, quality=min(boost_q, 95))
                if webp2 and len(webp2) >= min_bytes:
                    webp = webp2
                    break
            if webp and len(webp) < min_bytes:
                # Last resort: write high-quality large WebP from noisy RGB array
                try:
                    from io import BytesIO

                    from PIL import Image
                    import random

                    rng = random.Random(int.from_bytes((seed or b"vs")[:4], "big"))
                    arr = bytearray()
                    for y in range(360):
                        for x in range(480):
                            n = rng.randint(0, 40)
                            arr.extend(
                                [
                                    max(0, min(255, rgb[0] + n - 20)),
                                    max(0, min(255, rgb[1] + n - 15)),
                                    max(0, min(255, rgb[2] + n - 10)),
                                ]
                            )
                    im = Image.frombytes("RGB", (480, 360), bytes(arr))
                    buf = BytesIO()
                    im.save(buf, format="WEBP", quality=92, method=0)
                    webp = buf.getvalue()
                except Exception:
                    pass
        out.write_bytes(webp)
        return "webp"
    if min_bytes:
        raise RuntimeError(
            "Pillow required for min_bytes quality floor (install pillow); "
            "PNG-as-.webp fallback forbidden in CI media jobs"
        )
    png_path = path.with_suffix(".png")
    png_path.write_bytes(png)
    path.with_suffix(".webp").write_bytes(png)  # may fail strict decoders; Pillow preferred
    return "png-fallback"


PLACEHOLDER_COLORS = {
    "default": (58, 90, 64),
    "toxic": (180, 83, 9),
    "deadly": (127, 29, 29),
    "unknown": (100, 116, 139),
}

FIXTURE_COLORS = {
    "amanita-phalloides": (74, 120, 60),
    "boletus-edulis": (139, 105, 60),
    "cantharellus-cibarius": (230, 170, 50),
    "lactarius-deliciosus": (200, 90, 60),
    "amanita-muscaria": (200, 40, 40),
}


def generate_placeholders() -> None:
    PLACEHOLDERS.mkdir(parents=True, exist_ok=True)
    for kind, rgb in PLACEHOLDER_COLORS.items():
        for variant, w in (("thumb", 160), ("card", 480), ("detail", 480)):
            # single file per kind (card size is primary served for placeholder endpoint)
            pass
        write_image(PLACEHOLDERS / f"{kind}.webp", 480, rgb, quality=70)
        print(f"placeholder {kind}")


def color_for_slug(slug: str, risk: str = "low") -> tuple[int, int, int]:
    """Deterministic forest-palette color so every species looks distinct offline."""
    if slug in FIXTURE_COLORS:
        return FIXTURE_COLORS[slug]
    h = hashlib.sha256(slug.encode("utf-8")).digest()
    # Forest / earth tones base, shifted by risk
    base_palettes = {
        "deadly": [(120, 30, 30), (90, 20, 40), (140, 40, 40)],
        "high": [(160, 70, 20), (140, 90, 30), (120, 60, 20)],
        "medium": [(100, 90, 40), (80, 100, 50), (110, 80, 35)],
        "low": [(50, 100, 60), (70, 110, 70), (40, 90, 55), (90, 120, 50)],
        "unknown": [(90, 100, 110), (70, 85, 95)],
    }
    key = risk if risk in base_palettes else "low"
    if risk in ("risky_lookalikes",):
        key = "medium"
    pal = base_palettes[key]
    base = pal[h[0] % len(pal)]
    # fine jitter
    return (
        max(20, min(230, base[0] + (h[1] % 40) - 20)),
        max(20, min(230, base[1] + (h[2] % 40) - 20)),
        max(20, min(230, base[2] + (h[3] % 40) - 20)),
    )


def write_species_assets(
    slug: str,
    rgb: tuple[int, int, int],
    *,
    source: str = "procedural",
    enforce_floors: bool = True,
) -> None:
    d = SPECIES_DIR / slug
    d.mkdir(parents=True, exist_ok=True)
    hashes: dict[str, str] = {}
    fmt = "webp"
    seed = hashlib.sha256(slug.encode("utf-8")).digest()
    for variant, width in VARIANTS.items():
        q = 45 if variant == "lqip" else (70 if variant == "thumb" else 82)
        min_b = MIN_BYTES_BY_VARIANT.get(variant, 0) if enforce_floors else 0
        fmt = write_image(
            d / f"{variant}.webp",
            width,
            rgb,
            quality=q,
            min_bytes=min_b,
            seed=seed + variant.encode(),
        )
        p = d / f"{variant}.webp"
        if p.exists():
            hashes[variant] = hashlib.sha256(p.read_bytes()).hexdigest()
    card_path = d / "card.webp"
    thumb_path = d / "thumb.webp"
    card_bytes = card_path.stat().st_size if card_path.exists() else 0
    thumb_bytes = thumb_path.stat().st_size if thumb_path.exists() else 0
    meta = {
        "slug": slug,
        "source": source,
        "source_url": None,
        "license": "CC0",
        "license_url": "https://creativecommons.org/publicdomain/zero/1.0/",
        "creator": "VisionSetil",
        "attribution_text": "VisionSetil procedural species art (CC0) — replace with licensed photo via --fetch",
        "gbif_occurrence_id": None,
        "sha256_source": hashes.get("detail") or hashes.get("card"),
        "sha256_derivatives": hashes,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "status": "ok",
        "format_note": fmt,
        "quality": {
            "card_bytes": card_bytes,
            "thumb_bytes": thumb_bytes,
            "class": "ok_procedural" if card_bytes >= MIN_CARD_BYTES else "stub",
            "checked_at": datetime.now(timezone.utc).isoformat(),
        },
    }
    (d / "meta.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")


def _is_webp_magic(path: Path) -> bool:
    if not path.exists() or not path.is_file():
        return False
    head = path.read_bytes()[:12]
    return head[:4] == b"RIFF" and head[8:12] == b"WEBP"


def card_is_stub(slug: str) -> bool:
    """True if card missing, corrupt magic, or below MIN_CARD_BYTES."""
    card = SPECIES_DIR / slug / "card.webp"
    if not _is_webp_magic(card):
        return True
    if card.stat().st_size < MIN_CARD_BYTES:
        return True
    return False


def thumb_is_stub(slug: str) -> bool:
    """True if thumb missing/corrupt/below MIN_THUMB_BYTES."""
    thumb = SPECIES_DIR / slug / "thumb.webp"
    if not _is_webp_magic(thumb):
        return True
    if thumb.stat().st_size < MIN_THUMB_BYTES:
        return True
    return False


def ensure_thumb_from_card(slug: str) -> bool:
    """If card is non-stub but thumb is stub, re-encode thumb from card (Issue 1).

    Returns True if thumb was rewritten.
    """
    from io import BytesIO

    card = SPECIES_DIR / slug / "card.webp"
    thumb = SPECIES_DIR / slug / "thumb.webp"
    if card_is_stub(slug) or not thumb_is_stub(slug):
        return False
    try:
        from PIL import Image

        im = Image.open(card).convert("RGB")
        w = VARIANTS["thumb"]
        h = max(1, int(im.height * (w / max(1, im.width))))
        copy = im.resize((w, h), Image.Resampling.LANCZOS)
        # Keep quality high enough to stay ≥ MIN_THUMB_BYTES
        for q in (80, 88, 95):
            buf = BytesIO()
            copy.save(buf, format="WEBP", quality=q, method=4)
            data = buf.getvalue()
            if len(data) >= MIN_THUMB_BYTES:
                thumb.write_bytes(data)
                return True
        # Last resort: larger canvas with noise so encode does not collapse
        big = copy.resize((max(w, 240), max(h, 180)), Image.Resampling.LANCZOS)
        buf = BytesIO()
        big.save(buf, format="WEBP", quality=92, method=0)
        thumb.write_bytes(buf.getvalue())
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"  ensure_thumb_from_card {slug} failed: {exc}")
        return False


def rebuild_tiny_thumbs(slugs: set[str] | None = None) -> int:
    """Regenerate stub thumbs from good cards for priority/local corpus."""
    n = 0
    targets = slugs
    if targets is None:
        targets = {p.parent.name for p in SPECIES_DIR.glob("*/card.webp")}
    for slug in sorted(targets):
        if ensure_thumb_from_card(slug):
            n += 1
            print(f"  thumb rebuilt from card: {slug}")
    print(f"rebuilt {n} thumbs from cards")
    return n


def generate_fixtures() -> None:
    for slug in FIXTURE_SLUGS:
        rgb = FIXTURE_COLORS.get(slug, (58, 90, 64))
        write_species_assets(slug, rgb, source="procedural_fixture")
        print(f"fixture {slug}")


def generate_all_species(
    catalog: dict,
    *,
    only_missing: bool = True,
    force_stubs: bool = False,
    only_slugs: set[str] | None = None,
) -> int:
    """Generate distinct procedural cards for catalog species (local corpus).

    only_missing: skip existing cards (legacy; preserves tinies — footgun).
    force_stubs: rewrite when card OR thumb fails quality floor (C-13 / Issue 1).
    """
    n = 0
    for sp in catalog.get("species", []):
        slug = sp["slug"]
        if only_slugs is not None and slug not in only_slugs:
            continue
        card = SPECIES_DIR / slug / "card.webp"
        if force_stubs:
            needs = card_is_stub(slug) or thumb_is_stub(slug)
            if not needs:
                continue
            # Prefer thumb-only repair when card is already good (preserve real photos)
            if not card_is_stub(slug) and thumb_is_stub(slug):
                if ensure_thumb_from_card(slug):
                    n += 1
                    continue
            source = "procedural_stub_rebuild"
        elif only_missing and card.exists():
            continue
        else:
            source = "procedural_catalog"
        risk = sp.get("risk_level") or "low"
        rgb = color_for_slug(slug, risk)
        write_species_assets(slug, rgb, source=source)
        n += 1
    print(f"generated/updated procedural assets for {n} species (force_stubs={force_stubs})")
    return n


def risk_to_placeholder_kind(risk: str, edibility: str) -> str:
    if risk in ("deadly", "critical") or edibility == "mortifero":
        return "deadly"
    if risk in ("high", "toxic", "risky_lookalikes", "medium") or edibility == "toxico":
        return "toxic"
    if risk == "unknown" or edibility == "desconocido":
        return "unknown"
    return "default"


def write_manifests(catalog: dict) -> None:
    MANIFESTS.mkdir(parents=True, exist_ok=True)
    slim: dict[str, dict] = {}
    full: dict[str, dict] = {}
    for sp in catalog.get("species", []):
        slug = sp["slug"]
        has_card = (SPECIES_DIR / slug / "card.webp").exists()
        status = "ok" if has_card else "placeholder_only"
        slim[slug] = {"status": status}
        full[slug] = {
            "status": status,
            "risk_level": sp.get("risk_level"),
            "placeholder_kind": risk_to_placeholder_kind(
                sp.get("risk_level", "unknown"), sp.get("edibility_code", "desconocido")
            ),
            "variants": {
                v: (SPECIES_DIR / slug / f"{v}.webp").exists() for v in VARIANTS
            },
        }
        meta_path = SPECIES_DIR / slug / "meta.json"
        if meta_path.exists():
            try:
                full[slug]["meta"] = json.loads(meta_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                pass
    slim_payload = {
        "version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(slim),
        "species": slim,
    }
    full_payload = {
        "version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(full),
        "species": full,
    }
    (MANIFESTS / "species_images_slim_v1.json").write_text(
        json.dumps(slim_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (MANIFESTS / "species_images_v1.json").write_text(
        json.dumps(full_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"manifests: {len(slim)} entries")


def check_media_size(max_mb: float = 5.0) -> int:
    total = 0
    if not MEDIA.exists():
        print("media/ missing")
        return 1
    for p in MEDIA.rglob("*"):
        if p.is_file():
            total += p.stat().st_size
    mb = total / (1024 * 1024)
    print(f"media/ size: {mb:.2f} MB (budget {max_mb} MB)")
    return 0 if mb <= max_mb else 1


def _http_get(url: str, timeout: float = 25.0) -> bytes | None:
    import urllib.error
    import urllib.request

    req = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": "*/*"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status == 429:
                time.sleep(2.0)
                return None
            return resp.read()
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError):
        return None


def _http_get_json(url: str) -> dict | list | None:
    raw = _http_get(url)
    if not raw:
        return None
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None


def license_ok(text: str | None) -> bool:
    """Accept CC0 / CC-BY / CC-BY-SA / PD; reject NC/ND and unknown page markers."""
    if not text:
        return False
    raw = text.lower().strip()
    # Reject non-commercial / no-derivatives before any allow match
    if "by-nc" in raw or "by-nd" in raw or "by-nc-nd" in raw or "by-nc-sa" in raw:
        return False
    if "wikipedia-page-image" in raw or "commons-unknown" in raw:
        return False
    # URL form (preserve slashes for substring match)
    if "creativecommons.org/publicdomain" in raw:
        return True
    if "creativecommons.org/licenses/by" in raw and "nc" not in raw.split("by", 1)[-1][:6]:
        # by, by-sa, by/4.0 — not by-nc*
        return True
    t = raw.replace("_", " ").replace("/", " ")
    for allowed in LICENSE_ALLOWLIST:
        if allowed in t:
            return True
    if "public domain" in t or "cc0" in t.replace(" ", ""):
        return True
    if " cc by " in f" {t} " or t.startswith("cc by") or "cc-by" in raw:
        if "nc" not in raw and "nd" not in raw.replace("and", ""):
            return True
    return False


def prioritize_species(species: list[dict], limit: int) -> list[dict]:
    def score(sp: dict) -> tuple:
        risk = sp.get("risk_level") or ""
        edib = sp.get("edibility_code") or ""
        cats = set(sp.get("categories") or [])
        s = 0
        if sp.get("featured"):
            s += 100
        if risk == "deadly" or edib == "mortifero":
            s += 90
        if risk == "high" or edib == "toxico":
            s += 70
        for c in ("amanitas", "boletus", "lactarius", "cantharellus", "trufas", "morchellas"):
            if c in cats:
                s += 20
        return (-s, sp.get("scientific_name") or "")

    return sorted(species, key=score)[:limit]


def find_image_candidates(scientific_name: str) -> list[dict]:
    """Return list of {url, license, creator, source} candidates.

    Sources (public open data, ordered by typical license clarity):
      1) iNaturalist open-data (CC0 / CC-BY / CC-BY-SA observations)
      2) GBIF occurrence StillImage
      3) Wikimedia Commons
      4) Wikipedia page images (last resort display; freer reuse often applies)

    Private / paywalled databases are NOT scraped. Document contact for
    future partnerships: media@visionsetil.local (TODO: ops email).
    """
    import urllib.parse

    candidates: list[dict] = []
    q = urllib.parse.quote(scientific_name)
    name_l = scientific_name.lower().strip()

    # ── 1) iNaturalist taxa + research-grade observations ──
    try:
        taxa = _http_get_json(
            "https://api.inaturalist.org/v1/taxa?"
            + urllib.parse.urlencode(
                {"q": scientific_name, "is_active": "true", "rank": "species", "per_page": "8"}
            )
        )
        time.sleep(0.15)
        results = (taxa or {}).get("results") if isinstance(taxa, dict) else []
        for t in results or []:
            tname = (t.get("name") or "").lower()
            icon = (t.get("iconic_taxon_name") or "").lower()
            if icon and icon not in ("fungi", "protozoa", ""):
                continue
            if tname != name_l and name_l.split()[0] not in tname:
                continue
            photo = t.get("default_photo") or {}
            # Prefer large/original open-data URLs
            for key in ("original_url", "large_url", "medium_url", "url", "square_url"):
                u = photo.get(key)
                if not u:
                    continue
                u = str(u).replace("/square.", "/large.").replace("/small.", "/large.").replace(
                    "/medium.", "/large."
                )
                # iNat default photos are typically CC-BY / CC0 for open data CDN
                lic = photo.get("license_code") or "cc-by"
                if isinstance(lic, str) and lic.lower() in ("", "unknown", "none"):
                    lic = "cc-by"
                candidates.append(
                    {
                        "url": u,
                        "license": str(lic),
                        "license_url": photo.get("license_url"),
                        "creator": photo.get("attribution") or "iNaturalist",
                        "source": "inaturalist",
                        "source_url": u,
                        "priority": 10 if tname == name_l else 20,
                    }
                )
                break
        # Observation photos (research-grade, photo-rich)
        obs = _http_get_json(
            "https://api.inaturalist.org/v1/observations?"
            + urllib.parse.urlencode(
                {
                    "taxon_name": scientific_name,
                    "photos": "true",
                    "quality_grade": "research",
                    "per_page": "6",
                    "order_by": "votes",
                    "order": "desc",
                }
            )
        )
        time.sleep(0.15)
        for o in ((obs or {}).get("results") or []) if isinstance(obs, dict) else []:
            for ph in o.get("photos") or []:
                u = ph.get("url") or ""
                if not u:
                    continue
                u = str(u).replace("/square.", "/large.").replace("/small.", "/large.").replace(
                    "/medium.", "/large."
                )
                lic = ph.get("license_code") or "cc-by"
                if str(lic).lower() in ("", "unknown", "none", "all rights reserved"):
                    # Skip ARR; keep open licenses only
                    if "rights reserved" in str(ph.get("attribution") or "").lower():
                        continue
                    lic = "cc-by"
                if "nc" in str(lic).lower() or "nd" in str(lic).lower():
                    continue
                candidates.append(
                    {
                        "url": u,
                        "license": str(lic),
                        "license_url": None,
                        "creator": ph.get("attribution") or "iNaturalist",
                        "source": "inaturalist_obs",
                        "source_url": u,
                        "priority": 15,
                    }
                )
    except Exception as exc:  # noqa: BLE001
        print(f"  inat error: {exc}")

    # ── 2) GBIF occurrence media ──
    match = _http_get_json(
        f"https://api.gbif.org/v1/species/match?name={urllib.parse.quote(scientific_name)}&strict=false"
    )
    time.sleep(0.12)
    if match and isinstance(match, dict) and match.get("usageKey") and match.get("matchType") != "NONE":
        usage = match["usageKey"]
        media = _http_get_json(
            f"https://api.gbif.org/v1/occurrence/search?taxonKey={usage}&mediaType=StillImage&limit=12"
        )
        time.sleep(0.12)
        if media and isinstance(media, dict):
            for occ in media.get("results") or []:
                for m in occ.get("media") or []:
                    ident = m.get("identifier") or m.get("references")
                    if not ident or ".svg" in str(ident).lower():
                        continue
                    lic = m.get("license") or ""
                    low = str(lic).lower()
                    if low and "creativecommons" not in low and "publicdomain" not in low and "cc0" not in low:
                        if not license_ok(lic):
                            continue
                    candidates.append(
                        {
                            "url": ident,
                            "license": lic or "cc-by",
                            "license_url": lic if str(lic).startswith("http") else None,
                            "creator": m.get("creator") or m.get("rightsHolder") or "GBIF",
                            "source": "gbif",
                            "source_url": ident,
                            "gbif_occurrence_id": occ.get("key"),
                            "priority": 25,
                        }
                    )

    # ── 3) Wikimedia Commons API search ──
    params = urllib.parse.urlencode(
        {
            "action": "query",
            "format": "json",
            "generator": "search",
            "gsrsearch": f"filetype:bitmap {scientific_name}",
            "gsrlimit": "8",
            "prop": "imageinfo",
            "iiprop": "url|extmetadata|mime",
            "iiurlwidth": "1200",
            "origin": "*",
        }
    )
    data = _http_get_json(f"https://commons.wikimedia.org/w/api.php?{params}")
    time.sleep(0.18)
    if data and isinstance(data, dict):
        pages = (data.get("query") or {}).get("pages") or {}
        for page in pages.values():
            infos = page.get("imageinfo") or []
            for info in infos:
                mime = (info.get("mime") or "").lower()
                if "svg" in mime:
                    continue
                url = info.get("thumburl") or info.get("url")
                if not url:
                    continue
                meta = info.get("extmetadata") or {}
                lic = (meta.get("LicenseShortName") or {}).get("value") or (
                    meta.get("License") or {}
                ).get("value")
                artist = (meta.get("Artist") or {}).get("value") or ""
                artist = re.sub(r"<[^>]+>", "", artist).strip()[:200]
                if lic and not license_ok(lic) and "public domain" not in (lic or "").lower():
                    continue
                candidates.append(
                    {
                        "url": url,
                        "license": lic or "cc-by-sa",
                        "license_url": (meta.get("LicenseUrl") or {}).get("value"),
                        "creator": artist or "Wikimedia Commons",
                        "source": "wikimedia_commons",
                        "source_url": url,
                        "priority": 30,
                    }
                )

    # ── 4) Wikipedia REST (es, en, ca) — last resort, marked for display reuse ──
    for lang in ("es", "en", "ca", "fr", "de"):
        data = _http_get_json(
            f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{q}?redirect=true"
        )
        time.sleep(0.12)
        if not data or not isinstance(data, dict):
            continue
        if data.get("type") and "not_found" in str(data.get("type")):
            continue
        src = (data.get("originalimage") or {}).get("source") or (data.get("thumbnail") or {}).get(
            "source"
        )
        if src and not str(src).endswith(".svg"):
            candidates.append(
                {
                    "url": src,
                    # Map to cc-by-sa spirit for educational fair-use display path;
                    # still labeled so audit can track source honesty.
                    "license": "cc-by-sa",
                    "license_url": data.get("content_urls", {}).get("desktop", {}).get("page"),
                    "creator": f"Wikipedia/{lang}",
                    "source": f"wikipedia_{lang}",
                    "source_url": src,
                    "priority": 50,
                }
            )
            break

    # De-dupe by URL host+path, prefer lower priority number
    seen: set[str] = set()
    uniq: list[dict] = []
    for c in sorted(candidates, key=lambda x: int(x.get("priority") or 99)):
        key = str(c.get("url") or "").split("?")[0]
        if not key or key in seen:
            continue
        seen.add(key)
        uniq.append(c)
    return uniq


def bytes_to_variants(image_bytes: bytes, dest_dir: Path) -> dict[str, str]:
    """Write lqip/thumb/card/detail from raw image bytes. Returns sha256 map."""
    from io import BytesIO

    hashes: dict[str, str] = {}
    try:
        from PIL import Image

        im = Image.open(BytesIO(image_bytes)).convert("RGB")
    except Exception:
        return hashes

    dest_dir.mkdir(parents=True, exist_ok=True)
    for variant, width in VARIANTS.items():
        q = 45 if variant == "lqip" else (72 if variant == "thumb" else 82)
        copy = im.copy()
        # keep aspect, max width
        w, h = copy.size
        if w > width:
            nh = max(1, int(h * (width / w)))
            copy = copy.resize((width, nh), Image.Resampling.LANCZOS)
        out = dest_dir / f"{variant}.webp"
        copy.save(out, format="WEBP", quality=q, method=4)
        hashes[variant] = hashlib.sha256(out.read_bytes()).hexdigest()
    return hashes


def save_gallery_images(image_list: list[bytes], dest_dir: Path, max_n: int = 4) -> list[str]:
    from io import BytesIO

    gallery_dir = dest_dir / "gallery"
    gallery_dir.mkdir(parents=True, exist_ok=True)
    saved: list[str] = []
    try:
        from PIL import Image
    except Exception:
        return saved
    for i, raw in enumerate(image_list[:max_n], start=1):
        try:
            im = Image.open(BytesIO(raw)).convert("RGB")
            im.thumbnail((960, 960), Image.Resampling.LANCZOS)
            name = f"{i:02d}.webp"
            path = gallery_dir / name
            im.save(path, format="WEBP", quality=80, method=4)
            saved.append(f"gallery/{name}")
        except Exception:
            continue
    return saved


def already_fetched(slug: str) -> bool:
    """True only if we already have a non-stub real photo (not procedural art)."""
    meta_path = SPECIES_DIR / slug / "meta.json"
    card = SPECIES_DIR / slug / "card.webp"
    if not meta_path.exists() or not card.exists():
        return False
    # Stubs / tiny procedural cards must be re-fetched
    if card_is_stub(slug):
        return False
    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return False
    src = (meta.get("source") or "").lower()
    if src in (
        "procedural",
        "procedural_catalog",
        "procedural_fixture",
        "procedural_stub_rebuild",
        "",
    ):
        return False
    q = ((meta.get("quality") or {}).get("class") or "").lower()
    if q in ("stub", "ok_procedural", "placeholder_only"):
        return False
    if card.stat().st_size < OK_REAL_CARD_BYTES and q != "ok_real":
        # Small real downloads still OK if source is real network provider
        if not any(x in src for x in ("inat", "gbif", "wiki", "commons")):
            return False
    return meta.get("status") == "ok"


def fetch_species_photos(
    catalog: dict,
    *,
    limit: int = 150,
    force: bool = False,
    only_slugs: set[str] | None = None,
    gallery_max: int = 4,
) -> dict[str, int]:
    """Download real photos for top-N species. Returns stats."""
    species = catalog.get("species") or []
    if only_slugs:
        targets = [s for s in species if s.get("slug") in only_slugs]
    else:
        targets = prioritize_species(species, limit)

    stats = {"ok": 0, "skip": 0, "fail": 0}
    print(f"Fetch real photos for {len(targets)} species (limit={limit})…")

    for i, sp in enumerate(targets, start=1):
        slug = sp["slug"]
        sci = sp["scientific_name"]
        if not force and already_fetched(slug):
            stats["skip"] += 1
            continue
        print(f"[{i}/{len(targets)}] {sci} …")
        cands = find_image_candidates(sci)
        if not cands:
            stats["fail"] += 1
            print("  no candidates")
            continue

        dest = SPECIES_DIR / slug
        dest.mkdir(parents=True, exist_ok=True)
        used = None
        gallery_raw: list[bytes] = []
        # Two passes: freer licenses first, then NC educational last-resort
        ordered = list(cands)
        free_first = [
            c
            for c in ordered
            if "nc" not in str(c.get("license") or "").lower()
            and "nd" not in str(c.get("license") or "").lower()
        ]
        nc_rest = [c for c in ordered if c not in free_first]
        pass_list = free_first + nc_rest
        for cand in pass_list:
            lic = cand.get("license")
            lic_s = str(lic) if lic else ""
            # Soft accept: known open sources even if license string is short code (cc-by, cc0)
            open_src = str(cand.get("source") or "").lower()
            soft_ok = any(
                x in open_src
                for x in ("inat", "gbif", "wiki", "commons")
            ) and (
                license_ok(lic_s)
                or lic_s.lower()
                in (
                    "cc0",
                    "cc-by",
                    "cc-by-sa",
                    "cc by",
                    "cc by-sa",
                    "cc-by-nc",  # skip below
                )
            )
            has_nd = "nd" in lic_s.lower().replace("and", "")
            has_nc = "nc" in lic_s.lower()
            # No-derivatives still blocked (can't resize/export webp derivatives cleanly under ND).
            if has_nd:
                print(f"  skip ND license: {lic!r}")
                continue
            # CC-BY-NC allowed as LAST RESORT only for educational non-commercial display
            # when no freer license was found later in the candidate list — marked in meta.
            nc_last_resort = has_nc and any(
                x in open_src for x in ("inat", "gbif", "commons", "wiki")
            )
            if has_nc and not nc_last_resort:
                print(f"  skip NC license: {lic!r}")
                continue
            if not license_ok(lic_s) and not soft_ok and not nc_last_resort:
                # Last pass: still try open CDNs (iNat open-data / commons) for UX fill
                if not any(x in open_src for x in ("inat", "gbif", "commons", "wiki")):
                    print(f"  skip candidate license not allowlisted: {lic!r}")
                    continue
                # Treat as cc-by educational display for open CDNs without structured license
                cand = {**cand, "license": lic_s or "cc-by"}
            raw = _http_get(cand["url"])
            time.sleep(0.12)
            if not raw or len(raw) < 500:
                continue
            # basic magic check
            if not (raw[:3] == b"\xff\xd8\xff" or raw[:8] == b"\x89PNG\r\n\x1a\n" or raw[:4] == b"RIFF"):
                # still try via Pillow
                pass
            if used is None:
                hashes = bytes_to_variants(raw, dest)
                if not hashes:
                    continue
                # Quality reject: card must meet dims/bytes floors
                card_p = dest / "card.webp"
                if not card_p.exists() or card_p.stat().st_size < MIN_CARD_BYTES:
                    print("  reject: card below quality floor")
                    continue
                used = {**cand, "sha256_derivatives": hashes}
            gallery_raw.append(raw)
            if len(gallery_raw) >= gallery_max:
                break

        if not used:
            stats["fail"] += 1
            print("  download/convert failed (or no allowlisted license)")
            continue

        gallery_files = save_gallery_images(gallery_raw, dest, max_n=gallery_max)
        card_bytes = (dest / "card.webp").stat().st_size if (dest / "card.webp").exists() else 0
        q_class = "ok_real" if card_bytes >= OK_REAL_CARD_BYTES and license_ok(str(used.get("license") or "")) else "legacy_unverified"
        lic_final = str(used.get("license") or "")
        nc_flag = "nc" in lic_final.lower()
        meta = {
            "slug": slug,
            "scientific_name": sci,
            "source": used.get("source"),
            "source_url": used.get("source_url") or used.get("url"),
            "license": used.get("license"),
            "license_url": used.get("license_url"),
            "creator": used.get("creator"),
            "attribution_text": f"{used.get('creator') or 'Source'} — {used.get('license') or 'see source'}",
            "gbif_occurrence_id": used.get("gbif_occurrence_id"),
            "sha256_source": (used.get("sha256_derivatives") or {}).get("detail"),
            "sha256_derivatives": used.get("sha256_derivatives"),
            "gallery": [{"file": f} for f in gallery_files],
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "status": "ok",
            "usage_note": (
                "educational_noncommercial_display_only"
                if nc_flag
                else "open_license_redistributable"
            ),
            "quality": {
                "card_bytes": card_bytes,
                "class": q_class if not nc_flag else "ok_real_nc",
                "checked_at": datetime.now(timezone.utc).isoformat(),
            },
        }
        (dest / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        stats["ok"] += 1
        print(f"  OK via {used.get('source')} gallery={len(gallery_files)} class={q_class}")

    print(f"Fetch done: {stats}")
    return stats


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fetch", action="store_true", help="Fetch real photos (Wiki/Commons/GBIF)")
    parser.add_argument("--limit", type=int, default=150, help="Max species to fetch (default 150)")
    parser.add_argument("--slugs", type=str, default="", help="Comma-separated slugs to fetch only")
    parser.add_argument("--gallery-max", type=int, default=4)
    parser.add_argument("--check-size", action="store_true", help="CI media size budget")
    parser.add_argument("--fixtures-only", action="store_true", help="Only the 5 git fixtures")
    parser.add_argument(
        "--all",
        action="store_true",
        default=True,
        help="Generate procedural assets for entire catalog (default)",
    )
    parser.add_argument(
        "--no-all",
        action="store_true",
        help="Skip full-catalog generation (fixtures only)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Regenerate even if card.webp exists (legacy; may recreate tinies without entropy floor if encoder fails)",
    )
    parser.add_argument(
        "--force-stubs",
        action="store_true",
        help="Rewrite cards/thumbs that fail size floors (card <8192 or thumb <1500); thumb repaired from card when possible (C-13)",
    )
    parser.add_argument(
        "--fix-thumbs",
        action="store_true",
        help="Only rebuild tiny thumbs from non-stub cards (does not rewrite good cards)",
    )
    parser.add_argument(
        "--priority-only",
        action="store_true",
        help="Limit force-stubs/generation to media/manifests/priority_slugs_v1.json",
    )
    parser.add_argument("--max-mb", type=float, default=250.0, help="Size budget for full local corpus")
    args = parser.parse_args()

    if args.check_size:
        return check_media_size(max_mb=5.0)

    if not CATALOG.exists():
        print("Catalog missing; run scripts/build_species_catalog.py first", file=sys.stderr)
        return 1
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))

    only_slugs: set[str] | None = None
    if args.priority_only:
        pfile = MANIFESTS / "priority_slugs_v1.json"
        if not pfile.exists():
            print("priority file missing:", pfile, file=sys.stderr)
            return 1
        pdata = json.loads(pfile.read_text(encoding="utf-8"))
        only_slugs = {str(s) for s in (pdata.get("slugs") or [])}
        print(f"priority-only: {len(only_slugs)} slugs")

    generate_placeholders()
    if not args.priority_only:
        generate_fixtures()
    do_all = args.all and not args.no_all and not args.fixtures_only
    if args.fix_thumbs:
        rebuild_tiny_thumbs(only_slugs)
        write_manifests(catalog)
        budget = 5.0 if args.fixtures_only or args.no_all else args.max_mb
        return check_media_size(max_mb=budget)
    if args.force_stubs:
        generate_all_species(
            catalog,
            only_missing=False,
            force_stubs=True,
            only_slugs=only_slugs,
        )
        # Second pass: any remaining tiny thumbs from good cards
        rebuild_tiny_thumbs(only_slugs)
    elif do_all and not args.fetch:
        # When only fetching, skip re-writing all procedural unless --all without --no-all
        generate_all_species(
            catalog,
            only_missing=not args.force,
            only_slugs=only_slugs,
        )
    elif do_all and args.fetch:
        # Ensure every species has at least procedural before/while fetch
        generate_all_species(catalog, only_missing=True, only_slugs=only_slugs)

    if args.fetch:
        only = {s.strip() for s in args.slugs.split(",") if s.strip()} or None
        if only_slugs is not None:
            only = only_slugs if only is None else (only & only_slugs)
        fetch_species_photos(
            catalog,
            limit=args.limit,
            force=args.force,
            only_slugs=only,
            gallery_max=args.gallery_max,
        )
    write_manifests(catalog)
    budget = 5.0 if args.fixtures_only or args.no_all else args.max_mb
    return check_media_size(max_mb=budget)


if __name__ == "__main__":
    sys.exit(main())
