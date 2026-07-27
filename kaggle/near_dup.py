"""
Near-duplicate collapse for VisionSetil multi-source training (E20+).

Collapses rows that share basename stem, media-id token, or optional filesize
key so the same capture cannot land in both train and test domains.

Orientation only — never consumption permission.
Path normalize: always use chr(92) for backslash (notebook embed safety).
"""
from __future__ import annotations

import re
from collections import defaultdict
from pathlib import Path
from typing import Any, Callable, Optional

import pandas as pd

LogFn = Callable[[str], None]

# Prefer training sources over GBIF test domain when collapsing dups.
_SOURCE_PRIORITY = {
    "fungitastic": 0,
    "mushroom1": 1,
    "combined_mushrooms": 2,
    "mush215": 3,
    "fungiclef": 4,
    "df20": 5,
    "gbif_es": 10,
    "gbif": 10,
}


def stem_key(path: str) -> str:
    """Normalized basename stem (no extension, lower). Uses chr(92) not '\\\\'."""
    p = Path(str(path).replace(chr(92), "/"))
    return p.stem.lower()


def media_id_key(path: str) -> Optional[str]:
    """First long numeric token in stem — often GBIF/iNat media id."""
    stem = stem_key(path)
    m = re.match(r"^(\d{6,})", stem)
    return m.group(1) if m else None


def _filesize_key(path: str) -> Optional[tuple[int, str]]:
    """Optional key: (size_bytes, full_stem) if file exists.

    Uses full stem (not 8-char prefix) to avoid false-positive collapse of
    unrelated images that share byte size. Path normalized via chr(92).
    """
    try:
        p = Path(str(path).replace(chr(92), "/"))
        if not p.is_file():
            return None
        sz = p.stat().st_size
        return (int(sz), stem_key(path))
    except OSError:
        return None


def _row_priority(row: pd.Series, train_sources: set[str]) -> tuple:
    """Lower is better: cc_ok first, then train-domain source, then multi-image-friendly."""
    lic = str(row.get("license_class", "unknown") or "unknown").lower()
    lic_rank = 0 if lic == "cc_ok" else 1
    src = str(row.get("source_db", "") or "")
    if src in train_sources:
        src_rank = _SOURCE_PRIORITY.get(src, 6)
    else:
        src_rank = _SOURCE_PRIORITY.get(src, 20)
    # Prefer keeping more-complete observation groups later (handled at group level)
    return (lic_rank, src_rank, str(row.get("observation_id", "")))


def near_dup_collapse(
    df: pd.DataFrame,
    train_sources: Optional[set[str]] = None,
    path_col: str = "image_path",
    use_filesize: bool = False,
    log: Optional[LogFn] = None,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """
    Collapse near-duplicate image rows into one representative per group.

    Group keys (union-find style via shared keys):
      - basename stem
      - media-id token from stem when present
      - optional (filesize, stem_prefix) when file exists and use_filesize

    Preference within a group: cc_ok, then training source policy, then stable id.

    Returns (collapsed_df, stats).
    """
    if df is None or len(df) == 0:
        return df if df is not None else pd.DataFrame(), {
            "n_in": 0,
            "n_out": 0,
            "n_collapsed": 0,
            "n_groups": 0,
        }

    train_sources = train_sources or {"fungitastic"}
    df = df.reset_index(drop=True).copy()
    n_in = len(df)

    # Build union-find over row indices sharing a key
    parent = list(range(n_in))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    key_to_idx: dict[str, int] = {}

    def link_key(idx: int, key: str) -> None:
        if not key:
            return
        if key in key_to_idx:
            union(idx, key_to_idx[key])
        else:
            key_to_idx[key] = idx

    for i, row in df.iterrows():
        path = str(row.get(path_col, "") or "")
        if not path:
            continue
        st = stem_key(path)
        link_key(int(i), f"stem:{st}")
        mid = media_id_key(path)
        if mid:
            link_key(int(i), f"media:{mid}")
        if use_filesize:
            fsk = _filesize_key(path)
            if fsk is not None:
                link_key(int(i), f"size:{fsk[0]}:{fsk[1]}")

    groups: dict[int, list[int]] = defaultdict(list)
    for i in range(n_in):
        groups[find(i)].append(i)

    keep_indices: list[int] = []
    n_collapsed_rows = 0
    multi_member = 0
    for members in groups.values():
        if len(members) == 1:
            keep_indices.append(members[0])
            continue
        multi_member += 1
        # Prefer row with best priority; among ties, prefer obs with more images of same oid
        oid_counts = df.loc[members, "observation_id"].value_counts() if "observation_id" in df.columns else None

        def score(idx: int) -> tuple:
            row = df.loc[idx]
            pri = _row_priority(row, train_sources)
            oid = str(row.get("observation_id", ""))
            oid_boost = -int(oid_counts.get(oid, 1)) if oid_counts is not None else 0
            return (*pri, oid_boost, idx)

        best = min(members, key=score)
        keep_indices.append(best)
        n_collapsed_rows += len(members) - 1

    keep_indices.sort()
    out = df.loc[keep_indices].reset_index(drop=True)
    stats = {
        "n_in": n_in,
        "n_out": len(out),
        "n_collapsed": n_collapsed_rows,
        "n_groups": len(groups),
        "n_multi_member_groups": multi_member,
        "train_sources": sorted(train_sources),
    }
    if log:
        log(
            f"Near-dup collapse: {n_in} → {len(out)} rows "
            f"(collapsed {n_collapsed_rows} dups, multi-groups={multi_member})"
        )
    return out, stats


def near_dup_keys_for_row(path: str, use_filesize: bool = False) -> set[str]:
    """Return the set of near-dup keys for a path (for cross-split audits)."""
    keys: set[str] = set()
    if not path:
        return keys
    st = stem_key(path)
    keys.add(f"stem:{st}")
    mid = media_id_key(path)
    if mid:
        keys.add(f"media:{mid}")
    if use_filesize:
        fsk = _filesize_key(path)
        if fsk is not None:
            keys.add(f"size:{fsk[0]}:{fsk[1]}")
    return keys


def shared_near_dup_keys(
    paths_a: list[str],
    paths_b: list[str],
    use_filesize: bool = False,
) -> set[str]:
    """Intersection of near-dup keys between two path sets."""
    ka: set[str] = set()
    kb: set[str] = set()
    for p in paths_a:
        ka |= near_dup_keys_for_row(p, use_filesize=use_filesize)
    for p in paths_b:
        kb |= near_dup_keys_for_row(p, use_filesize=use_filesize)
    return ka & kb
