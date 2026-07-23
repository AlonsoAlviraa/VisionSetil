#!/usr/bin/env python3
"""Quality-aware species media audit (Phase C / D-C1, D-C22, D-C23).

Usage:
  python scripts/audit_media.py
  python scripts/audit_media.py --json
  python scripts/audit_media.py --priority
  python scripts/audit_media.py --priority --fail-priority
  python scripts/audit_media.py --strict-stubs

Exit codes:
  0  OK (or only soft warnings)
  1  missing/corrupt (or placeholders broken); or priority non-stub fail when --fail-priority
  2  catalog missing / bad args; or --strict-stubs with stub_count > 0
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "data" / "species_catalog" / "species_catalog_v2.json"
MEDIA = ROOT / "media" / "species"
PLACEHOLDERS = ROOT / "media" / "placeholders"
PRIORITY_FILE = ROOT / "media" / "manifests" / "priority_slugs_v1.json"

# Cross-ref: frontend vite.config.ts + backend species_media.py + precompute_species_images.py
MIN_CARD_BYTES = 8192  # stub cut (D-C1)
OK_REAL_CARD_BYTES = 20480  # photo KPI floor
MIN_THUMB_BYTES = 1500
MIN_DETAIL_BYTES = 15000
MIN_CARD_DIMS = (240, 180)

# Same allowlist spirit as scripts/precompute_species_images.py LICENSE_ALLOWLIST (D-C22)
LICENSE_ALLOWLIST = {
    "cc0",
    "cc-by",
    "cc-by-sa",
    "public domain",
    "pd-us",
    "pd",
}

PROCEDURAL_SOURCES = frozenset(
    {
        "procedural",
        "procedural_catalog",
        "procedural_fixture",
        "procedural_brand",
        "procedural_stub_rebuild",
    }
)

QUALITY_STATUSES = (
    "ok_real",
    "ok_procedural",
    "legacy_unverified",
    "stub",
    "corrupt",
    "missing",
    "placeholder_only",
)


def is_webp_magic(path: Path) -> bool:
    if not path.exists() or not path.is_file():
        return False
    head = path.read_bytes()[:12]
    return head[:4] == b"RIFF" and head[8:12] == b"WEBP"


def license_ok(text: str | None) -> bool:
    """Accept CC0 / CC-BY / CC-BY-SA / PD; reject NC/ND (aligned with precompute)."""
    if not text:
        return False
    raw = text.lower().strip()
    if "by-nc" in raw or "by-nd" in raw or "by-nc-nd" in raw or "by-nc-sa" in raw:
        return False
    if "wikipedia-page-image" in raw or "commons-unknown" in raw:
        return False
    if "creativecommons.org/publicdomain" in raw:
        return True
    if "creativecommons.org/licenses/by" in raw:
        return True
    t = raw.replace("_", " ").replace("/", " ")
    for allowed in LICENSE_ALLOWLIST:
        if allowed in t:
            return True
    if "public domain" in t or "cc0" in t.replace(" ", ""):
        return True
    return False


def is_procedural_source(source: str | None) -> bool:
    if not source:
        return False
    s = source.lower().strip()
    if s in PROCEDURAL_SOURCES:
        return True
    return s.startswith("procedural")


def decode_card(path: Path) -> tuple[bool, int, int]:
    """Return (ok, width, height). ok=False if cannot decode."""
    try:
        from PIL import Image

        with Image.open(path) as im:
            im.load()
            w, h = im.size
            return True, int(w), int(h)
    except Exception:
        return False, 0, 0


def load_meta(slug: str) -> dict[str, Any]:
    meta_path = MEDIA / slug / "meta.json"
    if not meta_path.exists():
        return {}
    try:
        return json.loads(meta_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def classify_card(slug: str) -> dict[str, Any]:
    """Classify one species card into quality status (KPI SSOT)."""
    card = MEDIA / slug / "card.webp"
    meta = load_meta(slug)
    meta_status = str(meta.get("status") or "")
    source = str(meta.get("source") or "")
    license_raw = meta.get("license")
    license_str = str(license_raw) if license_raw is not None else None

    if meta_status == "placeholder_only" and (not card.exists() or card.stat().st_size < MIN_CARD_BYTES):
        return {
            "slug": slug,
            "status": "placeholder_only",
            "card_bytes": card.stat().st_size if card.exists() else 0,
            "source": source,
            "license": license_str,
            "license_ok": license_ok(license_str),
        }

    if not card.exists():
        return {
            "slug": slug,
            "status": "missing",
            "card_bytes": 0,
            "source": source,
            "license": license_str,
            "license_ok": license_ok(license_str),
        }

    nbytes = card.stat().st_size
    if not is_webp_magic(card):
        return {
            "slug": slug,
            "status": "corrupt",
            "card_bytes": nbytes,
            "source": source,
            "license": license_str,
            "license_ok": license_ok(license_str),
        }

    ok_decode, w, h = decode_card(card)
    if not ok_decode:
        return {
            "slug": slug,
            "status": "corrupt",
            "card_bytes": nbytes,
            "width": w,
            "height": h,
            "source": source,
            "license": license_str,
            "license_ok": license_ok(license_str),
        }

    if nbytes < MIN_CARD_BYTES or w < MIN_CARD_DIMS[0] or h < MIN_CARD_DIMS[1]:
        return {
            "slug": slug,
            "status": "stub",
            "card_bytes": nbytes,
            "width": w,
            "height": h,
            "source": source,
            "license": license_str,
            "license_ok": license_ok(license_str),
        }

    procedural = is_procedural_source(source)
    lic_ok = license_ok(license_str)

    # KPI ok_real: decode ∧ bytes≥20480 ∧ real source ∧ allowlisted license (D-C22/D-C23)
    if (
        not procedural
        and nbytes >= OK_REAL_CARD_BYTES
        and lic_ok
        and meta_status in ("", "ok", "ok_real")
    ):
        return {
            "slug": slug,
            "status": "ok_real",
            "card_bytes": nbytes,
            "width": w,
            "height": h,
            "source": source,
            "license": license_str,
            "license_ok": True,
        }

    # Branded procedural ≥ floor
    if procedural and nbytes >= MIN_CARD_BYTES:
        return {
            "slug": slug,
            "status": "ok_procedural",
            "card_bytes": nbytes,
            "width": w,
            "height": h,
            "source": source,
            "license": license_str,
            "license_ok": lic_ok,
        }

    # Photo-like but license not allowlisted (e.g. wikipedia-page-image) or below KPI floor
    if not procedural and meta_status == "ok":
        return {
            "slug": slug,
            "status": "legacy_unverified",
            "card_bytes": nbytes,
            "width": w,
            "height": h,
            "source": source,
            "license": license_str,
            "license_ok": lic_ok,
        }

    if not procedural and nbytes >= MIN_CARD_BYTES:
        return {
            "slug": slug,
            "status": "legacy_unverified",
            "card_bytes": nbytes,
            "width": w,
            "height": h,
            "source": source,
            "license": license_str,
            "license_ok": lic_ok,
        }

    return {
        "slug": slug,
        "status": "stub",
        "card_bytes": nbytes,
        "width": w,
        "height": h,
        "source": source,
        "license": license_str,
        "license_ok": lic_ok,
    }


def load_priority_slugs() -> list[str]:
    if not PRIORITY_FILE.exists():
        return []
    try:
        data = json.loads(PRIORITY_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []
    slugs = data.get("slugs") or data.get("priority") or []
    return [str(s) for s in slugs if s]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="Emit full JSON report")
    parser.add_argument(
        "--priority",
        action="store_true",
        help="Include priority-set stats (reads media/manifests/priority_slugs_v1.json)",
    )
    parser.add_argument(
        "--fail-priority",
        action="store_true",
        help=(
            "Exit 1 if any priority slug is stub/missing/corrupt. "
            "Non-stub interim = ok_real|ok_procedural|legacy_unverified with card>=8192 "
            "(ok_real remains separate license-strict KPI; see WEB_PRODUCT_BAR.md)"
        ),
    )
    parser.add_argument(
        "--strict-stubs",
        action="store_true",
        help="Exit 2 if any stub in full corpus",
    )
    parser.add_argument(
        "--min-bytes",
        type=int,
        default=MIN_CARD_BYTES,
        help=f"Stub cut for cards (default {MIN_CARD_BYTES})",
    )
    args = parser.parse_args()

    # CLI override for stub cut (ops); classify_card reads module constant via closure — rebind local floors in report only
    min_card_bytes = int(args.min_bytes)

    if not CATALOG.exists():
        print("catalog missing", file=sys.stderr)
        return 2

    cat = json.loads(CATALOG.read_text(encoding="utf-8"))
    species = cat.get("species") or []
    results: list[dict[str, Any]] = []
    by_status: Counter[str] = Counter()

    legacy_real = 0  # meta.status==ok and source not procedural (deprecated KPI)

    for sp in species:
        slug = sp.get("slug") or ""
        if not slug:
            continue
        row = classify_card(slug)
        # Optional override: re-bucket by custom floor for reporting only
        if min_card_bytes != MIN_CARD_BYTES and row["status"] in ("ok_procedural", "legacy_unverified", "ok_real", "stub"):
            nbytes = int(row.get("card_bytes") or 0)
            if nbytes < min_card_bytes and row["status"] != "stub":
                row = {**row, "status": "stub"}
        results.append(row)
        by_status[row["status"]] += 1

        meta = load_meta(slug)
        src = str(meta.get("source") or "")
        if meta.get("status") == "ok" and not is_procedural_source(src):
            legacy_real += 1

    # size_real: decode ok + bytes >= 20480
    size_real_ge_20kb = sum(
        1
        for r in results
        if r.get("card_bytes", 0) >= OK_REAL_CARD_BYTES
        and r["status"] not in ("missing", "corrupt")
    )

    ph_ok = all(
        is_webp_magic(PLACEHOLDERS / f"{k}.webp")
        for k in ("default", "toxic", "deadly", "unknown")
    )

    quality = {k: int(by_status.get(k, 0)) for k in QUALITY_STATUSES}

    priority_report: dict[str, Any] | None = None
    priority_slugs = load_priority_slugs() if (args.priority or args.fail_priority) else []
    if args.priority or args.fail_priority:
        by_slug = {r["slug"]: r for r in results}
        failing: list[str] = []
        p_ok_real = 0
        p_ok_procedural = 0
        p_legacy = 0
        p_non_stub = 0
        for s in priority_slugs:
            row = by_slug.get(s) or classify_card(s)
            st = row["status"]
            nbytes = int(row.get("card_bytes") or 0)
            # non-stub (C-14): not stub/missing/corrupt/placeholder_only AND bytes ≥ floor
            # includes legacy_unverified photo-like assets (license-honest ok_real is separate KPI)
            if st == "ok_real":
                p_ok_real += 1
                p_non_stub += 1
            elif st == "ok_procedural":
                p_ok_procedural += 1
                p_non_stub += 1
            elif st == "legacy_unverified" and nbytes >= MIN_CARD_BYTES:
                p_legacy += 1
                p_non_stub += 1
            else:
                failing.append(s)
        priority_report = {
            "set_size": len(priority_slugs),
            "ok_real": p_ok_real,
            "ok_procedural": p_ok_procedural,
            "legacy_unverified": p_legacy,
            "non_stub": p_non_stub,
            "failing_slugs": failing,
            "source_file": str(PRIORITY_FILE.relative_to(ROOT)) if PRIORITY_FILE.exists() else None,
        }

    report: dict[str, Any] = {
        "catalog_count": len(species),
        "quality": quality,
        "legacy_real_photos": legacy_real,
        "size_real_ge_20kb": size_real_ge_20kb,
        "placeholders_ok": ph_ok,
        "thresholds": {
            "min_card_bytes": min_card_bytes,
            "ok_real_card_bytes": OK_REAL_CARD_BYTES,
            "min_thumb_bytes": MIN_THUMB_BYTES,
            "min_detail_bytes": MIN_DETAIL_BYTES,
            "min_card_dims": list(MIN_CARD_DIMS),
        },
        # Backward-compatible fields
        "with_valid_card": sum(
            1
            for r in results
            if r["status"]
            in ("ok_real", "ok_procedural", "legacy_unverified", "stub")
        ),
        "missing_card": [r["slug"] for r in results if r["status"] == "missing"],
        "invalid_webp": [r["slug"] for r in results if r["status"] == "corrupt"],
        "real_photos": legacy_real,  # deprecated alias
        "ok": (
            quality["missing"] == 0
            and quality["corrupt"] == 0
            and ph_ok
        ),
    }
    if priority_report is not None:
        report["priority"] = priority_report

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(
            f"catalog={report['catalog_count']} "
            f"ok_real={quality['ok_real']} ok_procedural={quality['ok_procedural']} "
            f"legacy_unverified={quality['legacy_unverified']} "
            f"stub={quality['stub']} corrupt={quality['corrupt']} "
            f"missing={quality['missing']} placeholder_only={quality['placeholder_only']}"
        )
        print(
            f"KPI: ok_real={quality['ok_real']} "
            f"size_real_ge_20kb={size_real_ge_20kb} "
            f"legacy_real_photos={legacy_real} "
            f"(ok_real requires allowlisted license)"
        )
        print(f"placeholders_ok={ph_ok}")
        if priority_report is not None:
            print(
                f"priority: size={priority_report['set_size']} "
                f"non_stub={priority_report['non_stub']} "
                f"ok_real={priority_report['ok_real']} "
                f"failing={len(priority_report['failing_slugs'])}"
            )
            if priority_report["failing_slugs"][:15]:
                print("priority failing sample:", priority_report["failing_slugs"][:15])
        print("STATUS:", "OK" if report["ok"] else "FAIL")

    # Exit codes
    if not report["ok"]:
        return 1
    if args.fail_priority and priority_report and priority_report["failing_slugs"]:
        return 1
    if args.strict_stubs and quality["stub"] > 0:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
