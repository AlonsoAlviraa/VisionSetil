"""Static guards for generated training notebooks."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any


LANDMINE_FRAGMENTS = (
    "replace('\\\\', '/')",  # ast.unparse style that becomes replace('\\','/')
    "replace(\"\\\\\", \"/\")",
    "replace('\\', '/')",
    'replace("\\", "/")',
)


def scan_notebook(path: Path) -> dict[str, Any]:
    path = Path(path)
    if not path.is_file():
        return {"pass": False, "error": f"missing {path}", "path": str(path)}
    nb = json.loads(path.read_text(encoding="utf-8"))
    sources = []
    for cell in nb.get("cells", []):
        if cell.get("cell_type") != "code":
            continue
        src = cell.get("source", "")
        if isinstance(src, list):
            src = "".join(src)
        sources.append(src)
    raw = "\n".join(sources)
    landmines = [f for f in LANDMINE_FRAGMENTS if f in raw]
    # Only flag the dangerous broken form used in Kaggle crash
    broken = "replace('\\', '/')" in raw or 'replace("\\", "/")' in raw
    has_dp = "DataParallel" in raw
    bare_freeze = "for p in model.backbone.backbone.parameters():" in raw
    safe_freeze = (
        "for p in _unwrap(model).backbone.backbone.parameters():" in raw
        or "for p in model.module.backbone.backbone.parameters():" in raw
    )
    checks = {
        "has_chr92": "chr(92)" in raw,
        "has_train_obs": "train_obs.json" in raw,
        "has_deadly_at_3": "safety_recall_deadly_at_3" in raw or "deadly_recall_at_k" in raw,
        "has_fail_closed": "unevaluable" in raw or "fail-closed" in raw.lower() or "n_deadly" in raw,
        "has_dataparallel": has_dp,
        # If DP is present, freeze must go through unwrap — bare .backbone crashes on T4x2
        "safe_dp_freeze": (not has_dp) or (safe_freeze and not bare_freeze),
        "no_broken_backslash_replace": not broken,
    }
    return {
        "path": str(path),
        "pass": all(checks.values()),
        "checks": checks,
        "landmine_hits": landmines if broken else [],
    }
