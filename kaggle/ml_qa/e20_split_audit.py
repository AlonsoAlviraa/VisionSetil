"""Audit local E20 source-holdout split artifacts (pre-metrics)."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def audit_e20_split(repo: Path) -> dict[str, Any]:
    """Validate kernel_output_v20 split_manifest + obs disjoint when present.

    PASS when artifacts missing (not yet complete) or when leaks==0 and pass=True.
    FAIL only when artifacts claim pass=False or non-zero leaks.
    """
    models = Path(repo) / "kaggle" / "kernel_output_v20" / "models"
    manifest = models / "split_manifest.json"
    suite: dict[str, Any] = {
        "name": "S7 E20 split integrity",
        "status": "SKIP",
        "detail": "no split_manifest yet",
        "flags": [],
        "metrics": {},
    }
    if not manifest.is_file():
        return suite

    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return {
            "name": "S7 E20 split integrity",
            "status": "FAIL",
            "detail": f"manifest unreadable: {exc}",
            "flags": ["manifest_unreadable"],
            "metrics": {},
        }

    leaks = data.get("leaks") or {}
    if isinstance(leaks, dict) and "leaks" in data.get("split_meta", {}):
        # prefer top-level leaks
        pass
    leak_vals = {
        k: int(v)
        for k, v in (leaks.items() if isinstance(leaks, dict) else [])
        if k in ("train_val", "train_test", "val_test")
    }
    declared_pass = bool(data.get("pass", False))
    n_train = data.get("n_train_obs")
    n_val = data.get("n_val_obs")
    n_test = data.get("n_test_obs")
    protocol = (data.get("protocol") or data.get("split_meta", {}).get("protocol") or "")

    flags: list[str] = []
    if not declared_pass:
        flags.append("manifest_pass_false")
    for k, v in leak_vals.items():
        if v != 0:
            flags.append(f"leak_{k}={v}")

    # Optional obs file disjoint re-check
    def _ids(name: str) -> set[str] | None:
        p = models / name
        if not p.is_file():
            return None
        try:
            rows = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        if not isinstance(rows, list):
            return None
        out: set[str] = set()
        for r in rows:
            if isinstance(r, dict) and r.get("observation_id") is not None:
                out.add(str(r["observation_id"]))
            elif isinstance(r, str):
                out.add(r)
        return out

    train_ids, val_ids, test_ids = _ids("train_obs.json"), _ids("val_obs.json"), _ids("test_obs.json")
    if train_ids is not None and test_ids is not None:
        inter = train_ids & test_ids
        if inter:
            flags.append(f"train_test_obs_overlap={len(inter)}")
        suite["metrics"]["n_train_obs_file"] = len(train_ids)
        suite["metrics"]["n_test_obs_file"] = len(test_ids)
    if train_ids is not None and val_ids is not None:
        inter = train_ids & val_ids
        if inter:
            flags.append(f"train_val_obs_overlap={len(inter)}")

    ok = not flags and declared_pass
    suite.update(
        {
            "status": "PASS" if ok else "FAIL",
            "detail": json.dumps(
                {
                    "protocol": protocol,
                    "pass": declared_pass,
                    "leaks": leak_vals,
                    "n_train_obs": n_train,
                    "n_val_obs": n_val,
                    "n_test_obs": n_test,
                    "has_metrics": (models / "metrics.json").is_file(),
                },
                ensure_ascii=False,
            ),
            "flags": flags,
            "metrics": {
                **suite.get("metrics", {}),
                "protocol": protocol,
                "leaks": leak_vals,
                "n_train_obs": n_train,
                "n_val_obs": n_val,
                "n_test_obs": n_test,
            },
        }
    )
    return suite
