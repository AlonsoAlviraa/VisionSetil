#!/usr/bin/env python3
"""Probe GBIF public API for Spain / Soria-ish fungi image availability.

No API key required for occurrence search counts.
Writes JSON snapshot under data/gbif_probe_latest.json when --write is set.

Usage:
  python scripts/probe_gbif_spain_fungi.py
  python scripts/probe_gbif_spain_fungi.py --write
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = "https://api.gbif.org/v1/occurrence/search"
# Kingdom Fungi
TAXON_FUNGI = 5

QUERIES: list[tuple[str, dict[str, str]]] = [
    ("ES_fungi_any", {"country": "ES", "taxonKey": str(TAXON_FUNGI), "limit": "0"}),
    (
        "ES_fungi_with_still_image",
        {
            "country": "ES",
            "taxonKey": str(TAXON_FUNGI),
            "mediaType": "StillImage",
            "limit": "0",
        },
    ),
    (
        "ES_fungi_human_obs_with_image",
        {
            "country": "ES",
            "taxonKey": str(TAXON_FUNGI),
            "mediaType": "StillImage",
            "basisOfRecord": "HUMAN_OBSERVATION",
            "limit": "0",
        },
    ),
    (
        # Approximate Soria province bbox
        "soria_bbox_fungi_with_image",
        {
            "taxonKey": str(TAXON_FUNGI),
            "mediaType": "StillImage",
            "decimalLatitude": "41.4,42.2",
            "decimalLongitude": "-3.2,-1.8",
            "limit": "0",
        },
    ),
]


def _count(params: dict[str, str], timeout: float = 45.0) -> int:
    qs = "&".join(f"{k}={urllib.request.quote(str(v))}" for k, v in params.items())
    url = f"{BASE}?{qs}"
    req = urllib.request.Request(url, headers={"User-Agent": "VisionSetil-GBIF-Probe/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return int(data.get("count") or 0)


def _sample_es(limit: int = 3) -> list[dict]:
    params = {
        "country": "ES",
        "taxonKey": str(TAXON_FUNGI),
        "mediaType": "StillImage",
        "limit": str(limit),
    }
    qs = "&".join(f"{k}={urllib.request.quote(str(v))}" for k, v in params.items())
    url = f"{BASE}?{qs}"
    req = urllib.request.Request(url, headers={"User-Agent": "VisionSetil-GBIF-Probe/1.0"})
    with urllib.request.urlopen(req, timeout=45) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    out = []
    for rec in data.get("results") or []:
        media = (rec.get("media") or [{}])[0]
        out.append(
            {
                "species": rec.get("species") or rec.get("scientificName"),
                "media_url": (media.get("identifier") or "")[:200],
                "license": media.get("license") or rec.get("license"),
                "datasetKey": rec.get("datasetKey"),
            }
        )
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--write",
        action="store_true",
        help="Write data/gbif_probe_latest.json under repo root",
    )
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
    )
    args = parser.parse_args()

    counts: dict[str, int | str] = {}
    for name, params in QUERIES:
        try:
            n = _count(params)
            counts[name] = n
            print(f"{name}: {n}")
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError) as exc:
            counts[name] = f"error:{exc}"
            print(f"{name}: ERROR {exc}", file=sys.stderr)

    samples: list[dict] = []
    try:
        samples = _sample_es(3)
        for s in samples:
            print(f"sample: {s.get('species')} | {s.get('license')}")
    except Exception as exc:  # noqa: BLE001
        print(f"sample ERROR {exc}", file=sys.stderr)

    payload = {
        "probed_at": datetime.now(timezone.utc).isoformat(),
        "api": BASE,
        "counts": counts,
        "samples": samples,
        "next_steps": [
            "Create free GBIF account for bulk occurrence download",
            "Filter licenses CC0/CC-BY for commercial-safe training",
            "Package into VisionSetil observation JSON via kaggle/converters",
            "Contact Micocyl/CESEFOR/Montes de Soria for expert-labelled CyL photos",
        ],
        "docs": "docs/DATA_SOURCES_SPAIN_SORIA.md",
    }

    if args.write:
        out = args.repo_root / "data" / "gbif_probe_latest.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"wrote {out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
