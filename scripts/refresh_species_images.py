#!/usr/bin/env python3
"""Quarterly media refresh / takedown job stub (PR-22).

Re-HEAD source URLs from meta.json; if 404/410 or license left allowlist,
mark status=placeholder_only, remove public derivatives, log takedown_events.jsonl.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "media"
SPECIES_DIR = MEDIA / "species"
LOG = MEDIA / "takedown_events.jsonl"

LICENSE_ALLOWLIST = {
    "cc0",
    "cc-by",
    "cc-by-sa",
    "public domain",
    "pd-us",
    "pd",
}

USER_AGENT = (
    "VisionSetilBot/1.0 (+https://github.com/AlonsoAlviraa/VisionSetil; "
    "contact: media@visionsetil.local)"
)


def license_ok(license_str: str | None) -> bool:
    if not license_str:
        return False
    low = license_str.lower().strip()
    if low in LICENSE_ALLOWLIST:
        return True
    return any(a in low for a in ("cc0", "cc-by", "public domain", "pd"))


def head_ok(url: str, timeout: float = 10.0) -> tuple[bool, int | None]:
    try:
        req = Request(url, method="HEAD", headers={"User-Agent": USER_AGENT})
        with urlopen(req, timeout=timeout) as resp:
            return True, getattr(resp, "status", 200)
    except HTTPError as e:
        return False, e.code
    except (URLError, ValueError, TimeoutError):
        return False, None


def revoke_slug(slug: str, reason: str) -> None:
    d = SPECIES_DIR / slug
    if not d.exists():
        print(f"skip missing slug {slug}")
        return
    meta_path = d / "meta.json"
    meta = {}
    if meta_path.exists():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
    meta["status"] = "placeholder_only"
    meta["revoked_at"] = datetime.now(timezone.utc).isoformat()
    meta["revoke_reason"] = reason
    meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    for name in ("thumb.webp", "card.webp", "detail.webp", "lqip.webp"):
        p = d / name
        if p.exists():
            p.unlink()
    LOG.parent.mkdir(parents=True, exist_ok=True)
    event = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "slug": slug,
        "reason": reason,
        "action": "placeholder_only",
    }
    with LOG.open("a", encoding="utf-8") as f:
        f.write(json.dumps(event) + "\n")
    print(f"revoked {slug}: {reason}")


def refresh_all(dry_run: bool = False) -> int:
    if not SPECIES_DIR.exists():
        print("no species media dir")
        return 0
    revoked = 0
    for meta_path in SPECIES_DIR.glob("*/meta.json"):
        slug = meta_path.parent.name
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        if meta.get("source") == "procedural_fixture":
            continue
        lic = meta.get("license")
        if not license_ok(lic):
            if dry_run:
                print(f"[dry-run] would revoke {slug}: license {lic}")
            else:
                revoke_slug(slug, f"license_not_allowed:{lic}")
            revoked += 1
            continue
        url = meta.get("source_url")
        if not url:
            continue
        ok, code = head_ok(url)
        if not ok and code in (404, 410):
            if dry_run:
                print(f"[dry-run] would revoke {slug}: HTTP {code}")
            else:
                revoke_slug(slug, f"source_http_{code}")
            revoked += 1
    print(f"done; revoked={revoked}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--revoke", metavar="SLUG", help="Force revoke a slug")
    parser.add_argument("--reason", default="manual_takedown")
    args = parser.parse_args()
    if args.revoke:
        revoke_slug(args.revoke, args.reason)
        return 0
    return refresh_all(dry_run=args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
