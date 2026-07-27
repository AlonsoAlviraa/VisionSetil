#!/usr/bin/env python3
"""Request + poll + download a GBIF occurrence archive for industrial allowlist.

Credentials via environment only (never commit):
  set GBIF_USER=...
  set GBIF_PASSWORD=...
  python scripts/gbif_download_allowlist.py

Downloads to data/industrial_v1/gbif/downloads/<key>/
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
OUT_ROOT = REPO / "data" / "industrial_v1" / "gbif" / "downloads"
PROBE = REPO / "data" / "industrial_v1" / "gbif" / "allowlist40_es_cc_probe.json"
PKG = REPO / "data" / "industrial_v1" / "gbif" / "gbif_es_allowlist_package.json"
UA = "VisionSetil-GBIF-Download/1.0 (educational orientation only)"


def load_taxon_keys() -> list[str]:
    keys: list[str] = []
    for path in (PROBE, PKG):
        if not path.is_file():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        rows = data.get("species") or data.get("species_rows") or []
        for r in rows:
            k = r.get("gbif_usage_key")
            if k is not None:
                keys.append(str(int(k)))
    # unique preserve order
    seen = set()
    out = []
    for k in keys:
        if k not in seen:
            seen.add(k)
            out.append(k)
    return out


def auth_header(user: str, password: str) -> str:
    token = base64.b64encode(f"{user}:{password}".encode("utf-8")).decode("ascii")
    return f"Basic {token}"


def request_download(user: str, password: str, taxon_keys: list[str], fmt: str) -> str:
    """POST download request; returns download key."""
    taxon_preds = [
        {"type": "equals", "key": "TAXON_KEY", "value": k} for k in taxon_keys
    ]
    predicate = {
        "type": "and",
        "predicates": [
            {"type": "equals", "key": "COUNTRY", "value": "ES"},
            {"type": "equals", "key": "MEDIA_TYPE", "value": "StillImage"},
            {"type": "or", "predicates": taxon_preds},
        ],
    }
    body = {
        "creator": user,
        "notificationAddresses": [],
        "sendNotification": False,
        "format": fmt,  # SIMPLE_CSV | DWCA
        "predicate": predicate,
    }
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        "https://api.gbif.org/v1/occurrence/download/request",
        data=data,
        method="POST",
        headers={
            "User-Agent": UA,
            "Content-Type": "application/json",
            "Authorization": auth_header(user, password),
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            key = resp.read().decode("utf-8").strip().strip('"')
            return key
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"GBIF request failed HTTP {e.code}: {err[:500]}") from e


def get_status(key: str, user: str, password: str) -> dict:
    req = urllib.request.Request(
        f"https://api.gbif.org/v1/occurrence/download/{key}",
        headers={
            "User-Agent": UA,
            "Authorization": auth_header(user, password),
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def download_file(url: str, dest: Path, user: str, password: str) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Authorization": auth_header(user, password),
        },
    )
    with urllib.request.urlopen(req, timeout=600) as resp, open(dest, "wb") as f:
        while True:
            chunk = resp.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--format", default="DWCA", choices=["DWCA", "SIMPLE_CSV"])
    ap.add_argument("--poll-sec", type=int, default=30)
    ap.add_argument("--max-wait-min", type=int, default=180)
    ap.add_argument("--key", default=None, help="Resume polling an existing download key")
    args = ap.parse_args()

    user = os.environ.get("GBIF_USER", "").strip()
    password = os.environ.get("GBIF_PASSWORD", "").strip()
    if not user or not password:
        print(
            "Set GBIF_USER and GBIF_PASSWORD in the environment (do not commit them).",
            file=sys.stderr,
        )
        return 2

    keys = load_taxon_keys()
    if not keys:
        print("No taxon keys found in gbif probe/package JSON", file=sys.stderr)
        return 1
    print(f"Taxon keys: {len(keys)}", flush=True)

    if args.key:
        key = args.key
        print(f"Resuming key={key}", flush=True)
    else:
        print("Requesting GBIF download (ES + StillImage + allowlist)…", flush=True)
        key = request_download(user, password, keys, args.format)
        print(f"Download key: {key}", flush=True)
        meta_path = OUT_ROOT / f"{key}.request.json"
        meta_path.parent.mkdir(parents=True, exist_ok=True)
        meta_path.write_text(
            json.dumps(
                {
                    "key": key,
                    "requested_at": datetime.now(timezone.utc).isoformat(),
                    "format": args.format,
                    "n_taxon_keys": len(keys),
                    "creator": user,
                    "predicate_summary": "COUNTRY=ES AND MEDIA_TYPE=StillImage AND TAXON_KEY IN allowlist40",
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )

    deadline = time.time() + args.max_wait_min * 60
    status = "PREPARING"
    info: dict = {}
    while time.time() < deadline:
        info = get_status(key, user, password)
        status = info.get("status") or "UNKNOWN"
        total = info.get("totalRecords")
        print(f"  status={status} totalRecords={total}", flush=True)
        if status in ("SUCCEEDED", "FAILED", "KILLED", "CANCELLED"):
            break
        time.sleep(args.poll_sec)

    if status != "SUCCEEDED":
        print(f"Download not ready: {status}", file=sys.stderr)
        print(json.dumps({k: info.get(k) for k in ("status", "downloadLink", "size", "totalRecords")}, indent=2))
        return 1

    link = info.get("downloadLink")
    if not link:
        print("No downloadLink in status payload", file=sys.stderr)
        return 1

    dest_dir = OUT_ROOT / key
    dest_dir.mkdir(parents=True, exist_ok=True)
    zip_path = dest_dir / f"{key}.zip"
    print(f"Downloading archive → {zip_path}", flush=True)
    download_file(link, zip_path, user, password)
    print(f"Saved {zip_path.stat().st_size / 1e6:.1f} MB", flush=True)

    # extract
    extract_dir = dest_dir / "extracted"
    extract_dir.mkdir(exist_ok=True)
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(extract_dir)
    print(f"Extracted to {extract_dir}", flush=True)
    for p in sorted(extract_dir.rglob("*"))[:30]:
        if p.is_file():
            print(f"  {p.relative_to(extract_dir)} ({p.stat().st_size})", flush=True)

    status_path = dest_dir / "status.json"
    status_path.write_text(json.dumps(info, indent=2) + "\n", encoding="utf-8")
    print("DONE", key)
    print("Next: python scripts/merge_gbif_stub.py --gbif-dir", extract_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
