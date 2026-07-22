"""API key scopes for VisionSetil (S4).

Key formats (API_KEYS env, comma-separated)::

    vs_key                      → org=default, scopes=classify
    vs_key:acme                 → org=acme, scopes=classify
    vs_key:acme:classify+review  → org=acme, scopes={classify, review}
    vs_key:acme:admin           → org=acme, scopes={admin} (implies all)

Scopes:
    classify — POST /classify, jobs, observations uploads
    review   — human-review queue
    admin    — metrics / models admin surface
"""

from __future__ import annotations

from dataclasses import dataclass

ALL_SCOPES = frozenset({"classify", "review", "admin"})
DEFAULT_SCOPES = frozenset({"classify"})

# Path prefixes → required scope (first match wins)
PATH_SCOPE_RULES: list[tuple[str, str]] = [
    ("/human-reviews", "review"),
    ("/metrics", "admin"),
    ("/models", "admin"),
    ("/classify", "classify"),
    ("/jobs", "classify"),
    ("/observations", "classify"),
    ("/feedback", "classify"),
]


@dataclass(frozen=True)
class ParsedApiKey:
    key: str
    organization_id: str
    scopes: frozenset[str]


def parse_api_key_entry(entry: str, default_org: str = "default") -> ParsedApiKey | None:
    """Parse one API_KEYS entry into key, org, scopes."""
    entry = entry.strip()
    if not entry:
        return None
    parts = entry.split(":")
    if len(parts) == 1:
        return ParsedApiKey(key=parts[0], organization_id=default_org, scopes=DEFAULT_SCOPES)
    if len(parts) == 2:
        # Ambiguous: could be key:org OR key:scopes (if second has +)
        second = parts[1].strip()
        if "+" in second or second in ALL_SCOPES:
            scopes = _parse_scopes(second)
            return ParsedApiKey(key=parts[0], organization_id=default_org, scopes=scopes)
        return ParsedApiKey(
            key=parts[0],
            organization_id=second or default_org,
            scopes=DEFAULT_SCOPES,
        )
    # key:org:scopes
    key, org, scopes_raw = parts[0], parts[1].strip() or default_org, parts[2]
    return ParsedApiKey(key=key, organization_id=org, scopes=_parse_scopes(scopes_raw))


def _parse_scopes(raw: str) -> frozenset[str]:
    tokens = {t.strip().lower() for t in raw.replace(",", "+").split("+") if t.strip()}
    if "admin" in tokens:
        return ALL_SCOPES
    valid = tokens & ALL_SCOPES
    return frozenset(valid) if valid else DEFAULT_SCOPES


def scopes_imply(have: frozenset[str], need: str) -> bool:
    if "admin" in have:
        return True
    return need in have


def required_scope_for_path(path: str) -> str | None:
    """Return required scope for path, or None if no special scope (only valid key)."""
    for prefix, scope in PATH_SCOPE_RULES:
        if path == prefix or path.startswith(prefix + "/"):
            return scope
    return None
