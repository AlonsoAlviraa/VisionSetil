#!/usr/bin/env python3
"""P16 — Bulk synonym expansion from Index Fungorum (API or Kew CSV).

Policy:
  - Map aliases → **existing SSOT preferred names** only (never invent SSOT taxa).
  - Never auto-flip product SSOT preferred spelling to IF "current name".
  - Human curated edges always kept; IF adds missing aliases.
  - Nomenclature only — never edibility / product_unlock / forage.

Usage:
  python scripts/expand_synonyms_if_bulk.py --limit 30 --delay 0.35
  python scripts/expand_synonyms_if_bulk.py --apply --delay 0.25
  python scripts/expand_synonyms_if_bulk.py --csv path/to/kew.csv --apply

Outputs:
  eval/reports/ml_experiments/if_synonym_bulk_report.json
  (with --apply) data/species_catalog/taxon_synonyms.json + FE copy
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

V2_PATH = ROOT / "data" / "species_catalog" / "species_catalog_v2.json"
SYNONYMS_SSOT = ROOT / "data" / "species_catalog" / "taxon_synonyms.json"
FE_SYNONYMS = ROOT / "frontend" / "src" / "data" / "taxon_synonyms.json"
REPORT_PATH = (
    ROOT / "eval" / "reports" / "ml_experiments" / "if_synonym_bulk_report.json"
)

POLICY = "curated_only_never_invent_taxa"
POLICY_NOTE = (
    "Aliases map to VisionSetil SSOT preferred names. "
    "Index Fungorum bulk is nomenclature-only; never consumption; never auto-flip SSOT."
)


def polish_taxon(taxon: str) -> str:
    parts = taxon.strip().split()
    if len(parts) < 2:
        return taxon.strip()
    genus = parts[0][:1].upper() + parts[0][1:].lower()
    rest = " ".join(p.lower() for p in parts[1:])
    return f"{genus} {rest}"


def load_ssot_taxa() -> list[str]:
    raw = json.loads(V2_PATH.read_text(encoding="utf-8"))
    species = raw.get("species") if isinstance(raw, dict) else raw
    taxa: list[str] = []
    for rec in species or []:
        name = polish_taxon(str(rec.get("scientific_name") or rec.get("taxon") or ""))
        if name and " " in name:
            taxa.append(name)
    # unique preserve order
    seen: set[str] = set()
    out: list[str] = []
    for t in taxa:
        k = t.lower()
        if k in seen:
            continue
        seen.add(k)
        out.append(t)
    return out


def load_synonyms_file(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {
            "policy": POLICY,
            "version": "0",
            "sources": ["curated"],
            "synonyms": {},
        }
    data = json.loads(path.read_text(encoding="utf-8"))
    syn = data.get("synonyms") or {}
    return {
        "policy": data.get("policy") or POLICY,
        "version": str(data.get("version") or "1.0"),
        "sources": list(data.get("sources") or ["curated"]),
        "synonyms": {
            str(k).lower().strip(): polish_taxon(str(v))
            for k, v in syn.items()
            if str(k).strip() and str(v).strip()
        },
        "notes": data.get("notes"),
    }


def is_plausible_scientific(name: str) -> bool:
    n = name.strip()
    if len(n) < 5 or " " not in n:
        return False
    if re.search(r"\d", n):
        return False
    parts = n.split()
    if len(parts) < 2 or len(parts) > 5:
        return False
    if not parts[0][0].isalpha():
        return False
    return True


def proposals_from_if_resolve(
    ssot_name: str,
    resolve_payload: dict[str, Any],
    ssot_set: set[str],
) -> list[dict[str, str]]:
    """
    Build alias→SSOT proposals from one IF resolve payload.

    - IF current name (if different) → SSOT
    - Each synonym name (if different) → SSOT
    - Best name if different → SSOT
    Only when target is the ssot_name (this row's preferred).
    """
    preferred = polish_taxon(ssot_name)
    preferred_l = preferred.lower()
    props: list[dict[str, str]] = []
    seen: set[str] = set()

    def add(alias: str, reason: str) -> None:
        a = polish_taxon(alias)
        if not is_plausible_scientific(a):
            return
        al = a.lower()
        if al == preferred_l or al in seen:
            return
        # Never point away from an existing different SSOT taxon as preferred target
        if al in ssot_set and al != preferred_l:
            # alias is itself a product SSOT taxon — do not map SSOT→SSOT
            return
        seen.add(al)
        props.append(
            {
                "alias": a,
                "preferred": preferred,
                "reason": reason,
                "source": "index_fungorum",
            }
        )

    if not resolve_payload.get("ok"):
        return props

    best = resolve_payload.get("best") or {}
    current = (resolve_payload.get("current_name") or best.get("current_name") or "").strip()
    best_name = (best.get("name") or "").strip()

    if current:
        add(current, "if_current_name")
    if best_name:
        add(best_name, "if_best_name")
    for syn in resolve_payload.get("synonyms") or []:
        nm = (syn.get("name") if isinstance(syn, dict) else None) or ""
        add(str(nm), "if_synonym_cluster")

    return props


def proposals_from_kew_csv(
    csv_path: Path,
    ssot_set: set[str],
    ssot_by_lower: dict[str, str],
) -> list[dict[str, str]]:
    """
    Parse a Kew/IF-style CSV. Flexible headers:
      scientific_name / name / NAME OF FUNGUS
      current_name / CURRENT NAME
      synonym / synonyms (pipe or semicolon separated)
    Rows attach to SSOT when scientific or current matches an SSOT taxon.
    """
    text = csv_path.read_text(encoding="utf-8-sig")
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(text.splitlines(), dialect=dialect)
    props: list[dict[str, str]] = []
    if not reader.fieldnames:
        return props

    def col(*cands: str) -> str | None:
        lower = {str(h).strip().lower(): h for h in reader.fieldnames or []}
        for c in cands:
            if c.lower() in lower:
                return lower[c.lower()]
        return None

    c_name = col("scientific_name", "name", "name of fungus", "NAME OF FUNGUS", "taxon")
    c_current = col("current_name", "current name", "CURRENT NAME", "accepted_name")
    c_syn = col("synonym", "synonyms", "homotypic_synonyms", "SYNONYMS")

    for row in reader:
        name = polish_taxon(str(row.get(c_name) or "").strip()) if c_name else ""
        current = polish_taxon(str(row.get(c_current) or "").strip()) if c_current else ""
        # Prefer SSOT match on current, then name
        preferred = None
        for candidate in (current, name):
            if candidate and candidate.lower() in ssot_by_lower:
                preferred = ssot_by_lower[candidate.lower()]
                break
        if not preferred:
            continue
        aliases = [name, current]
        if c_syn:
            raw = str(row.get(c_syn) or "")
            for part in re.split(r"[|;,]+", raw):
                if part.strip():
                    aliases.append(part.strip())
        for a in aliases:
            a_p = polish_taxon(a)
            if not is_plausible_scientific(a_p):
                continue
            if a_p.lower() == preferred.lower():
                continue
            if a_p.lower() in ssot_set and a_p.lower() != preferred.lower():
                continue
            props.append(
                {
                    "alias": a_p,
                    "preferred": preferred,
                    "reason": "kew_csv",
                    "source": "kew_csv",
                }
            )
    return props


def merge_synonyms(
    base: dict[str, str],
    proposals: Iterable[dict[str, str]],
    ssot_set: set[str],
) -> tuple[dict[str, str], list[dict[str, str]], list[dict[str, str]]]:
    """
    Merge proposals into base map.
    Returns (merged, accepted, rejected).
    Existing keys are never overwritten (curated wins).
    """
    merged = dict(base)
    accepted: list[dict[str, str]] = []
    rejected: list[dict[str, str]] = []
    for p in proposals:
        alias = polish_taxon(p["alias"])
        preferred = polish_taxon(p["preferred"])
        al = alias.lower()
        pl = preferred.lower()
        if al == pl:
            rejected.append({**p, "reject": "alias_equals_preferred"})
            continue
        if pl not in ssot_set:
            rejected.append({**p, "reject": "preferred_not_in_ssot"})
            continue
        if al in ssot_set:
            rejected.append({**p, "reject": "alias_is_ssot_taxon"})
            continue
        if not is_plausible_scientific(alias):
            rejected.append({**p, "reject": "implausible_alias"})
            continue
        if al in merged:
            if merged[al].lower() == pl:
                rejected.append({**p, "reject": "already_present"})
            else:
                rejected.append(
                    {
                        **p,
                        "reject": "curated_conflict",
                        "existing": merged[al],
                    }
                )
            continue
        # Store preferred with SSOT casing
        # recover casing from ssot_set via map — pass preferred as already polished SSOT
        merged[al] = preferred
        accepted.append(p)
    return merged, accepted, rejected


def write_synonyms_ssot(
    path: Path,
    synonyms: dict[str, str],
    *,
    sources: list[str],
    version: str,
    stats: dict[str, Any],
) -> None:
    payload = {
        "policy": POLICY,
        "version": version,
        "sources": sources,
        "notes": POLICY_NOTE,
        "generated": datetime.now(timezone.utc).isoformat(),
        "stats": stats,
        "synonyms": dict(sorted(synonyms.items(), key=lambda kv: kv[0])),
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def run_api_bulk(
    taxa: list[str],
    *,
    delay: float,
    max_hits: int,
) -> tuple[list[dict[str, str]], list[dict[str, Any]]]:
    from app.services.index_fungorum import resolve_name  # type: ignore

    ssot_set = {t.lower() for t in taxa}
    all_props: list[dict[str, str]] = []
    per_taxon: list[dict[str, Any]] = []
    for i, taxon in enumerate(taxa):
        try:
            payload = resolve_name(
                taxon,
                max_number=max_hits,
                include_synonyms=True,
                timeout=25.0,
            )
        except Exception as e:  # noqa: BLE001
            per_taxon.append(
                {
                    "taxon": taxon,
                    "ok": False,
                    "error": type(e).__name__,
                    "proposals": 0,
                }
            )
            if delay > 0:
                time.sleep(delay)
            continue
        props = proposals_from_if_resolve(taxon, payload, ssot_set)
        all_props.extend(props)
        per_taxon.append(
            {
                "taxon": taxon,
                "ok": bool(payload.get("ok")),
                "hits": payload.get("hits"),
                "current_name": payload.get("current_name"),
                "if_differs": payload.get("if_differs_from_query"),
                "n_synonyms_upstream": len(payload.get("synonyms") or []),
                "proposals": len(props),
                "error": payload.get("error"),
            }
        )
        if (i + 1) % 25 == 0:
            print(f"  … {i + 1}/{len(taxa)} taxa", flush=True)
        if delay > 0:
            time.sleep(delay)
    return all_props, per_taxon


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--limit", type=int, default=0, help="Max SSOT taxa (0=all)")
    ap.add_argument("--offset", type=int, default=0, help="Skip first N taxa")
    ap.add_argument("--delay", type=float, default=0.3, help="Seconds between API calls")
    ap.add_argument("--max-hits", type=int, default=12)
    ap.add_argument("--csv", type=Path, default=None, help="Optional Kew/IF CSV path")
    ap.add_argument(
        "--no-api",
        action="store_true",
        help="Skip live Index Fungorum API (CSV-only mode)",
    )
    ap.add_argument(
        "--apply",
        action="store_true",
        help="Write taxon_synonyms.json SSOT + FE mirror",
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="Alias for not --apply (default)",
    )
    args = ap.parse_args()

    taxa = load_ssot_taxa()
    if args.offset:
        taxa = taxa[args.offset :]
    if args.limit and args.limit > 0:
        taxa = taxa[: args.limit]
    ssot_set = {t.lower() for t in load_ssot_taxa()}
    ssot_by_lower = {t.lower(): t for t in load_ssot_taxa()}

    base_doc = load_synonyms_file(SYNONYMS_SSOT)
    base_map: dict[str, str] = dict(base_doc["synonyms"])
    n_base = len(base_map)

    proposals: list[dict[str, str]] = []
    per_taxon: list[dict[str, Any]] = []

    if args.csv:
        if not args.csv.is_file():
            print(f"CSV not found: {args.csv}", file=sys.stderr)
            return 2
        csv_props = proposals_from_kew_csv(args.csv, ssot_set, ssot_by_lower)
        proposals.extend(csv_props)
        print(f"CSV proposals: {len(csv_props)} from {args.csv}")

    use_api = not args.no_api
    if use_api:
        print(f"IF API bulk: {len(taxa)} taxa (delay={args.delay}s)…")
        api_props, per_taxon = run_api_bulk(
            taxa, delay=args.delay, max_hits=args.max_hits
        )
        proposals.extend(api_props)
        print(f"API proposals (raw): {len(api_props)}")

    merged, accepted, rejected = merge_synonyms(base_map, proposals, ssot_set)
    sources = list(base_doc.get("sources") or ["curated"])
    if use_api and "index_fungorum_api" not in sources:
        sources.append("index_fungorum_api")
    if args.csv and "kew_csv" not in sources:
        sources.append("kew_csv")

    stats = {
        "ssot_taxa_scanned": len(taxa),
        "base_synonyms": n_base,
        "proposals_raw": len(proposals),
        "accepted_new": len(accepted),
        "rejected": len(rejected),
        "merged_total": len(merged),
        "product_unlock": False,
        "policy": POLICY_NOTE,
    }

    report = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "version": "1.9.4-p16-if-bulk",
        "stats": stats,
        "sources": sources,
        "accepted_sample": accepted[:80],
        "rejected_sample": rejected[:40],
        "per_taxon_sample": per_taxon[:40],
        "per_taxon_errors": [p for p in per_taxon if p.get("error")][:30],
        "apply": bool(args.apply and not args.dry_run),
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(json.dumps(stats, indent=2))
    print(f"Report: {REPORT_PATH}")

    if args.apply and not args.dry_run:
        version = f"1.1-if-bulk-{datetime.now(timezone.utc).strftime('%Y%m%d')}"
        write_synonyms_ssot(
            SYNONYMS_SSOT,
            merged,
            sources=sources,
            version=version,
            stats=stats,
        )
        write_synonyms_ssot(
            FE_SYNONYMS,
            merged,
            sources=sources,
            version=version,
            stats=stats,
        )
        print(f"Applied → {SYNONYMS_SSOT.relative_to(ROOT)}")
        print(f"Applied → {FE_SYNONYMS.relative_to(ROOT)}")
    else:
        print("Dry-run only (pass --apply to write SSOT).")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
