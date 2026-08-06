"""
Index Fungorum (Kew) nomenclatural client.

Live SOAP/HTTP API (confirmed 2026-07-28):
  https://www.indexfungorum.org/ixfwebservice/fungus.asmx

Policy:
  - Nomenclatural backbone only (names, status, IF RecordID, current name).
  - Never edibility / consumption / risk labels.
  - Always attribute Index Fungorum + link back to site (Kew request).
  - Does NOT auto-overwrite VisionSetil SSOT product names.
"""
from __future__ import annotations

import re
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass
from functools import lru_cache
from typing import Any

try:
    # Prefer defusedxml for untrusted remote IF XML (Bandit B314)
    from defusedxml import ElementTree as ET  # type: ignore[no-redef]
except ImportError:  # pragma: no cover - fallback if optional dep missing
    import xml.etree.ElementTree as ET  # noqa: S314

IF_API_BASE = "https://www.indexfungorum.org/ixfwebservice/fungus.asmx"
IF_HOME = "https://www.indexfungorum.org/"
IF_RECORD_TMPL = "https://www.indexfungorum.org/Names/NamesRecord.asp?RecordID={record_id}"
IF_ATTR_SHORT = "Index Fungorum (Royal Botanic Gardens, Kew)"
IF_ATTR_POLICY = (
    "Nomenclatural data from Index Fungorum. Always cite Index Fungorum and link to "
    "https://www.indexfungorum.org/ when used as a taxonomic backbone. "
    "Never forage/consumption permission."
)
USER_AGENT = "VisionSetil/1.0 (educational mycology; orientation-only; +https://www.indexfungorum.org/)"
DEFAULT_TIMEOUT = 20.0


@dataclass(frozen=True)
class IndexFungorumName:
    name: str
    authors: str | None
    year: str | None
    name_status: str | None
    record_number: str | None
    current_name: str | None
    current_name_record_number: str | None
    basionym_record_number: str | None
    uuid: str | None
    nomenclatural_comment: str | None = None

    @property
    def record_url(self) -> str | None:
        if not self.record_number:
            return None
        return IF_RECORD_TMPL.format(record_id=self.record_number)

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["record_url"] = self.record_url
        d["is_current"] = bool(
            self.current_name
            and self.name
            and self.current_name.strip().lower() == self.name.strip().lower()
        )
        return d


def attribution_block() -> dict[str, str]:
    return {
        "source": "Index Fungorum",
        "maintainer": "Royal Botanic Gardens, Kew",
        "url": IF_HOME,
        "api": IF_API_BASE,
        "label": IF_ATTR_SHORT,
        "policy": IF_ATTR_POLICY,
        "required": "true",
    }


def _decode_tag(tag: str) -> str:
    t = tag
    # ASMX encodes spaces as _x0020_
    t = re.sub(r"_x([0-9A-Fa-f]{4})_", lambda m: chr(int(m.group(1), 16)), t)
    return t.strip()


def _http_get(url: str, timeout: float = DEFAULT_TIMEOUT) -> str:
    # Index Fungorum only — scheme allowlist (Bandit B310)
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"Unsupported URL scheme for Index Fungorum: {parsed.scheme!r}")
    if not (parsed.netloc or "").lower().endswith("indexfungorum.org"):
        raise ValueError(f"Refusing non-Index-Fungorum host: {parsed.netloc!r}")
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # nosec B310
        return resp.read().decode("utf-8", errors="replace")


def is_alive(timeout: float = 8.0) -> bool:
    try:
        body = _http_get(f"{IF_API_BASE}/IsAlive", timeout=timeout)
        return "true" in body.lower()
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


def _parse_index_fungorum_xml(xml_text: str) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    # Prefer ElementTree; fall back to regex blocks if namespaces confuse
    try:
        root = ET.fromstring(xml_text)  # nosec B314 — prefer defusedxml when installed
        for node in root.iter():
            tag = _decode_tag(node.tag.split("}")[-1] if "}" in node.tag else node.tag)
            if tag != "IndexFungorum":
                continue
            fields: dict[str, str] = {}
            for child in list(node):
                ctag = _decode_tag(child.tag.split("}")[-1] if "}" in child.tag else child.tag)
                if child.text is not None:
                    fields[ctag] = child.text.strip()
            if fields:
                rows.append(fields)
        if rows:
            return rows
    except ET.ParseError:
        pass

    blocks = re.findall(r"<IndexFungorum>(.*?)</IndexFungorum>", xml_text, re.S)
    for b in blocks:
        fields = {
            _decode_tag(k): v.strip()
            for k, v in re.findall(r"<([A-Za-z0-9_]+)>(.*?)</\1>", b, re.S)
        }
        if fields:
            rows.append(fields)
    return rows


def _row_to_name(row: dict[str, str]) -> IndexFungorumName:
    return IndexFungorumName(
        name=row.get("NAME OF FUNGUS") or row.get("NAME_OF_FUNGUS") or "",
        authors=row.get("AUTHORS"),
        year=row.get("YEAR OF PUBLICATION") or row.get("YEAR_OF_PUBLICATION"),
        name_status=row.get("NAME STATUS") or row.get("NAME_STATUS"),
        record_number=row.get("RECORD NUMBER") or row.get("RECORD_NUMBER"),
        current_name=row.get("CURRENT NAME") or row.get("CURRENT_NAME"),
        current_name_record_number=row.get("CURRENT NAME RECORD NUMBER")
        or row.get("CURRENT_NAME_RECORD_NUMBER"),
        basionym_record_number=row.get("BASIONYM RECORD NUMBER")
        or row.get("BASIONYM_RECORD_NUMBER"),
        uuid=row.get("UUID"),
        nomenclatural_comment=row.get("NOMENCLATURAL COMMENT")
        or row.get("NOMENCLATURAL_COMMENT"),
    )


def name_search(
    query: str,
    *,
    max_number: int = 15,
    anywhere: bool = False,
    timeout: float = DEFAULT_TIMEOUT,
) -> list[IndexFungorumName]:
    q = (query or "").strip()
    if not q:
        return []
    qs = urllib.parse.urlencode(
        {
            "SearchText": q,
            "AnywhereInText": "true" if anywhere else "false",
            "MaxNumber": str(max(1, min(int(max_number), 50))),
        }
    )
    xml = _http_get(f"{IF_API_BASE}/NameSearch?{qs}", timeout=timeout)
    return [_row_to_name(r) for r in _parse_index_fungorum_xml(xml) if r]


def names_by_current_key(
    record_number: str,
    *,
    timeout: float = DEFAULT_TIMEOUT,
) -> list[IndexFungorumName]:
    """Homotypic/related names under current-name key (param: CurrentKey)."""
    rec = str(record_number or "").strip()
    if not rec:
        return []
    qs = urllib.parse.urlencode({"CurrentKey": rec})
    try:
        xml = _http_get(f"{IF_API_BASE}/NamesByCurrentKey?{qs}", timeout=timeout)
    except (urllib.error.URLError, TimeoutError, OSError):
        return []
    return [_row_to_name(r) for r in _parse_index_fungorum_xml(xml) if r]


def _score_match(name: IndexFungorumName, query: str) -> int:
    q = query.strip().lower()
    n = (name.name or "").strip().lower()
    status = (name.name_status or "").lower()
    score = 0
    if n == q:
        score += 100
    elif n.startswith(q):
        score += 60
    elif q in n:
        score += 30
    if "invalid" in status or "illegitimate" in status:
        score -= 40
    if status == "legitimate":
        score += 15
    if name.current_name and name.current_name.strip().lower() == n:
        score += 10
    if name.record_number:
        score += 1
    return score


def pick_best(names: list[IndexFungorumName], query: str) -> IndexFungorumName | None:
    if not names:
        return None
    ranked = sorted(names, key=lambda n: _score_match(n, query), reverse=True)
    return ranked[0]


def resolve_name(
    query: str,
    *,
    max_number: int = 15,
    include_synonyms: bool = True,
    timeout: float = DEFAULT_TIMEOUT,
) -> dict[str, Any]:
    """
    Resolve a scientific name against Index Fungorum.

    Returns product-safe payload: best match, current name, synonym list (if available),
    attribution. Never invents risk/edibility.
    """
    q = (query or "").strip()
    out: dict[str, Any] = {
        "query": q,
        "ok": False,
        "alive": None,
        "best": None,
        "current_name": None,
        "ssot_unchanged": True,
        "synonyms": [],
        "hits": 0,
        "attribution": attribution_block(),
        "policy": "nomenclature_only_never_consumption",
        "error": None,
    }
    if not q:
        out["error"] = "empty_query"
        return out
    try:
        hits = name_search(q, max_number=max_number, timeout=timeout)
        out["hits"] = len(hits)
        best = pick_best(hits, q)
        if not best:
            out["error"] = "no_match"
            return out
        out["ok"] = True
        out["best"] = best.to_dict()
        current = (best.current_name or best.name or "").strip() or None
        out["current_name"] = current
        # Product SSOT is independent; surface if IF current differs from query
        out["ssot_unchanged"] = True
        out["if_differs_from_query"] = bool(
            current and current.lower() != q.lower()
        )

        if include_synonyms:
            key = best.current_name_record_number or best.record_number
            if key:
                related = names_by_current_key(key, timeout=timeout)
                # Prefer current-name key when available
                if not related and best.record_number:
                    related = names_by_current_key(best.record_number, timeout=timeout)
                # Unique synonym scientific names (exclude best exact)
                seen: set[str] = set()
                for r in related:
                    nm = (r.name or "").strip()
                    if not nm:
                        continue
                    k = nm.lower()
                    if k in seen:
                        continue
                    seen.add(k)
                    out["synonyms"].append(
                        {
                            "name": nm,
                            "authors": r.authors,
                            "record_number": r.record_number,
                            "name_status": r.name_status,
                            "record_url": r.record_url,
                        }
                    )
                    if len(out["synonyms"]) >= 40:
                        break
        return out
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        out["error"] = f"upstream:{type(e).__name__}"
        return out
    except Exception as e:  # noqa: BLE001 — surface clean JSON to API
        out["error"] = f"parse:{type(e).__name__}"
        return out


@lru_cache(maxsize=256)
def resolve_name_cached(query: str, max_number: int = 12) -> dict[str, Any]:
    """Process-local cache for encyclopedia deep-links (nomenclature only)."""
    return resolve_name(query, max_number=max_number, include_synonyms=True)
