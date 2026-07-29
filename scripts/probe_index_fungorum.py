"""Probe Index Fungorum SOAP/HTTP API and summarize fitness for VisionSetil."""
from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

BASE = "https://www.indexfungorum.org/ixfwebservice/fungus.asmx"
OUT = Path(__file__).resolve().parents[1] / "eval" / "reports" / "ml_experiments" / "index_fungorum_probe.json"


def get(url: str, timeout: int = 45) -> tuple[int, str]:
    req = urllib.request.Request(url, headers={"User-Agent": "VisionSetil-IF-Probe/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace") if e.fp else ""
        return e.code, body


def parse_records(xml: str) -> list[dict[str, str]]:
    blocks = re.findall(r"<IndexFungorum>(.*?)</IndexFungorum>", xml, re.S)
    rows: list[dict[str, str]] = []
    for b in blocks:
        fields = dict(re.findall(r"<([A-Za-z0-9_]+)>(.*?)</\1>", b, re.S))
        # normalize space-encoded keys
        norm = {
            k.replace("_x0020_", " ").replace("_x002F_", "/"): v
            for k, v in fields.items()
        }
        rows.append(norm)
    return rows


def name_search(q: str, max_n: int = 20) -> list[dict[str, str]]:
    qs = urllib.parse.urlencode(
        {"SearchText": q, "AnywhereInText": "false", "MaxNumber": str(max_n)}
    )
    code, body = get(f"{BASE}/NameSearch?{qs}")
    if code != 200:
        return [{"_error": str(code), "_body": body[:400]}]
    return parse_records(body)


def name_by_key(record: str) -> list[dict[str, str]]:
    # try plain record number as NameLsid
    for val in (
        record,
        f"urn:lsid:indexfungorum.org:names:{record}",
    ):
        qs = urllib.parse.urlencode({"NameLsid": val})
        code, body = get(f"{BASE}/NameByKey?{qs}")
        if code == 200 and "IndexFungorum" in body:
            return parse_records(body)
        # sometimes returns <string> only
        if code == 200:
            return [{"_raw": body[:500], "_lsid": val}]
    return [{"_error": "NameByKey failed", "record": record}]


def names_by_current_key(record: str) -> list[dict[str, str]]:
    qs = urllib.parse.urlencode({"CurrentNameLsid": record})
    code, body = get(f"{BASE}/NamesByCurrentKey?{qs}")
    if code != 200:
        # try alternate param names from WSDL
        for key in ("NameLsid", "CurrentKey", "Key"):
            qs = urllib.parse.urlencode({key: record})
            code, body = get(f"{BASE}/NamesByCurrentKey?{qs}")
            if code == 200 and ("IndexFungorum" in body or "string" in body):
                break
    if code != 200:
        return [{"_error": str(code), "_body": body[:400]}]
    recs = parse_records(body)
    return recs if recs else [{"_raw": body[:500]}]


def pick_best(rows: list[dict[str, str]], query: str) -> dict[str, str] | None:
    if not rows or "_error" in rows[0]:
        return None
    q = query.lower().strip()
    # Prefer Legitimate / Legitimate with current name self
    scored: list[tuple[int, dict[str, str]]] = []
    for r in rows:
        name = (r.get("NAME OF FUNGUS") or "").lower()
        status = (r.get("NAME STATUS") or "").lower()
        score = 0
        if name == q:
            score += 50
        elif name.startswith(q):
            score += 30
        if "illegitimate" in status or "invalid" in status or "orthographic" in status:
            score -= 20
        if status in ("legitimate", ""):
            score += 10
        if r.get("CURRENT NAME RECORD NUMBER") or r.get("CURRENT NAME"):
            score += 5
        scored.append((score, r))
    scored.sort(key=lambda x: -x[0])
    return scored[0][1] if scored else None


def summarize_row(r: dict[str, str]) -> dict[str, Any]:
    keys = [
        "NAME OF FUNGUS",
        "AUTHORS",
        "YEAR OF PUBLICATION",
        "NAME STATUS",
        "RECORD NUMBER",
        "CURRENT NAME",
        "CURRENT NAME RECORD NUMBER",
        "BASIONYM",
        "BASIONYM RECORD NUMBER",
        "ORTHOGRAPHIC VARIANT",
        "FAMILY",
        "UUID",
        "NOMENCLATURAL COMMENT",
    ]
    return {k: r.get(k) for k in keys if r.get(k)}


def main() -> None:
    alive_code, alive_body = get(f"{BASE}/IsAlive")
    queries = [
        "Amanita phalloides",
        "Amanita muscaria",
        "Boletus edulis",
        "Coprinopsis atramentaria",
        "Coprinus atramentarius",
        "Galerina marginata",
        "Cantharellus cibarius",
        "Gyromitra esculenta",
    ]
    results: dict[str, Any] = {
        "base": BASE,
        "is_alive": {"status": alive_code, "body": alive_body.strip()},
        "attribution_required": True,
        "attribution_url": "https://www.indexfungorum.org/",
        "queries": {},
        "operations_http_get_documented": [
            "IsAlive",
            "NameSearch",
            "NameSearchDs",
            "EpithetSearch",
            "NameByKey",
            "NameByKeyDs",
            "NameFullByKey",
            "NameByKeyRDF",
            "AuthorSearch",
            "NamesByCurrentKey",
            "AllUpdatedNames",
            "UpdatedNames",
            "UpdatedNamesInRange",
            "NewNames",
            "NewNamesInRange",
            "DeprecatedNames",
            "DeprecatedNamesByRank",
        ],
        "fitness_for_visionsetil": {
            "synonym_resolution": "high",
            "accepted_name_lookup": "high",
            "if_record_id_ssot": "high",
            "risk_edibility": "none",
            "photos_media": "none",
            "iberian_common_names": "none",
            "live_classify_path": "no",
            "offline_catalog_enrichment": "yes",
            "recommendation": (
                "Use IF as nomenclatural backbone (accepted names, IF RecordIDs, "
                "synonym map enrichment). Never for edibility/risk. Cache offline; "
                "respect Kew attribution + link."
            ),
        },
    }

    for q in queries:
        rows = name_search(q, 15)
        best = pick_best(rows, q)
        block: dict[str, Any] = {
            "n_hits": 0 if (rows and "_error" in rows[0]) else len(rows),
            "best": summarize_row(best) if best else None,
            "sample_statuses": [],
        }
        if rows and "_error" not in rows[0]:
            block["sample_statuses"] = [
                {
                    "name": r.get("NAME OF FUNGUS"),
                    "status": r.get("NAME STATUS"),
                    "record": r.get("RECORD NUMBER"),
                    "current": r.get("CURRENT NAME") or r.get("CURRENT NAME RECORD NUMBER"),
                }
                for r in rows[:8]
            ]
            rec = (best or {}).get("RECORD NUMBER")
            if rec:
                block["name_by_key"] = [
                    summarize_row(x) if "NAME OF FUNGUS" in x else x
                    for x in name_by_key(rec)[:3]
                ]
                block["names_by_current_key"] = [
                    summarize_row(x) if "NAME OF FUNGUS" in x else x
                    for x in names_by_current_key(rec)[:8]
                ]
            # all field keys observed
            keys: set[str] = set()
            for r in rows[:5]:
                keys.update(r.keys())
            block["field_keys"] = sorted(keys)
        else:
            block["error"] = rows
        results["queries"][q] = block
        print(f"=== {q} hits={block.get('n_hits')} best={block.get('best')}")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    print("Wrote", OUT)


if __name__ == "__main__":
    main()
