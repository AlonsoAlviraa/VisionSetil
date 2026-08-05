#!/usr/bin/env python3
"""E20b Lepiota FT — operator-gated Kaggle push (≤1 relaunch path).

Default is dry-run. Never silent auto push. Never product_unlock.

Real push requires ALL of:
  1. diagnose artifact exists with relaunch_allowed / notebook fixes present
  2. CLI --execute
  3. CLI --i-accept-operator-responsibility
  4. anti-leak rails can_stage (unless --force-ignore-rails — still no product unlock)

Usage::

  python scripts/push_kaggle_e20b.py              # dry-run
  python scripts/push_kaggle_e20b.py --status
  python scripts/push_kaggle_e20b.py --execute --i-accept-operator-responsibility

See eval/reports/ml_experiments/e20b_diagnose_lepiota_ft.json.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
K = ROOT / "kaggle"
# Tracked sources (push_e* is gitignored — stage from tracked paths)
TRACKED_NB = K / "visionsetil_exp_v20b_lepiota_ft.ipynb"
TRACKED_META = K / "kernel-metadata-exp-v20b.json"
PUSH_DIR = K / "push_e20b"
SLUG = "alonsoalviraaaa/visionsetil-exp-v20b-lepiota-ft"
DIAGNOSE_JSON = ROOT / "eval" / "reports" / "ml_experiments" / "e20b_diagnose_lepiota_ft.json"
RAILS_JSON = ROOT / "eval" / "reports" / "ml_experiments" / "anti_leak_rails_train_latest.json"
ACTIONS_LOG = ROOT / "eval" / "reports" / "ml_experiments" / "e20b_operator_actions.jsonl"
NB_NAME = "visionsetil_exp_v20b_lepiota_ft.ipynb"


def _ensure_push_dir_from_tracked() -> Path:
    """Materialize gitignored push_e20b from tracked notebook + metadata."""
    if not TRACKED_NB.is_file():
        raise SystemExit(f"missing tracked notebook {TRACKED_NB}")
    if not TRACKED_META.is_file():
        raise SystemExit(f"missing tracked metadata {TRACKED_META}")
    PUSH_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy(TRACKED_NB, PUSH_DIR / NB_NAME)
    meta = json.loads(TRACKED_META.read_text(encoding="utf-8"))
    meta["code_file"] = NB_NAME
    meta["id"] = SLUG
    meta["enable_gpu"] = True
    (PUSH_DIR / "kernel-metadata.json").write_text(
        json.dumps(meta, indent=2) + "\n", encoding="utf-8"
    )
    return PUSH_DIR


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_json(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        d = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return d if isinstance(d, dict) else None


def _run(cmd: list[str], check: bool = True) -> subprocess.CompletedProcess:
    print(" $", " ".join(cmd))
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=str(ROOT))
    if r.stdout:
        print(r.stdout[-4000:] if len(r.stdout) > 4000 else r.stdout)
    if r.stderr:
        print(r.stderr[-2000:] if len(r.stderr) > 2000 else r.stderr, file=sys.stderr)
    if check and r.returncode != 0:
        raise SystemExit(r.returncode)
    return r


def _append_action(record: dict[str, Any]) -> None:
    ACTIONS_LOG.parent.mkdir(parents=True, exist_ok=True)
    with ACTIONS_LOG.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def notebook_ready(push_dir: Path | None = None) -> dict[str, Any]:
    # Prefer tracked notebook for readiness (survives gitignore on push_e*)
    nb = TRACKED_NB if TRACKED_NB.is_file() else (push_dir or PUSH_DIR) / NB_NAME
    meta = TRACKED_META if TRACKED_META.is_file() else (push_dir or PUSH_DIR) / "kernel-metadata.json"
    info: dict[str, Any] = {
        "tracked_notebook": str(TRACKED_NB),
        "tracked_metadata": str(TRACKED_META),
        "notebook": str(nb),
        "notebook_present": nb.is_file(),
        "metadata_present": meta.is_file(),
        "syntax_fix_present": False,
        "weight_path_fix_present": False,
        "ready": False,
    }
    if not nb.is_file():
        return info
    text = nb.read_text(encoding="utf-8", errors="replace")
    info["syntax_fix_present"] = (
        "'lepiota subincarnata': 28.0,  # E20b FT boost" in text
        and "'lepiota subincarnata': 28.0  # E20b FT boost," not in text
    )
    info["weight_path_fix_present"] = (
        "datasets/alonsoalviraaaa/visionsetil-e20-weights" in text
    )
    info["ready"] = bool(
        info["notebook_present"]
        and info["metadata_present"]
        and info["syntax_fix_present"]
        and info["weight_path_fix_present"]
    )
    return info


def status() -> int:
    _run(["kaggle", "kernels", "status", SLUG], check=False)
    return 0


def dry_run_report() -> dict[str, Any]:
    diag = _load_json(DIAGNOSE_JSON)
    rails = _load_json(RAILS_JSON)
    nb = notebook_ready()
    can_stage = bool((rails or {}).get("can_stage_train_notebook"))
    dec = ((diag or {}).get("decision_tree") or {}).get("decision") or {}
    return {
        "generated_at": _utc_now(),
        "mode": "dry_run",
        "product_unlock": False,
        "kaggle_push": False,
        "slug": SLUG,
        "notebook": nb,
        "rails_can_stage": can_stage,
        "diagnose_present": diag is not None,
        "diagnose_decision": dec.get("decision"),
        "relaunch_allowed_in_diagnose": dec.get("relaunch_allowed"),
        "would_push": bool(nb.get("ready") and can_stage),
        "blockers": [
            *([] if nb.get("ready") else ["notebook_not_ready"]),
            *([] if can_stage else ["rails_not_green"]),
            *([] if diag is not None else ["diagnose_json_missing_run_diagnose_first"]),
        ],
        "note": (
            "Dry-run only. Real push needs --execute and "
            "--i-accept-operator-responsibility. Never product_unlock."
        ),
    }


def execute_push(*, force_ignore_rails: bool = False) -> int:
    nb_info = notebook_ready()
    if not nb_info["ready"]:
        print("FATAL: notebook not ready for relaunch:", json.dumps(nb_info, indent=2))
        return 2
    rails = _load_json(RAILS_JSON) or {}
    can_stage = bool(rails.get("can_stage_train_notebook"))
    if not can_stage and not force_ignore_rails:
        print("FATAL: rails not green (can_stage_train_notebook=false). Refuse push.")
        return 3

    # Materialize from tracked sources into gitignored push_e20b, then stage
    _ensure_push_dir_from_tracked()
    staging = K / "push_e20b_staging"
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True)
    shutil.copy(TRACKED_NB, staging / NB_NAME)
    meta = json.loads(TRACKED_META.read_text(encoding="utf-8"))
    meta["code_file"] = NB_NAME
    meta["id"] = SLUG
    meta["enable_gpu"] = True
    (staging / "kernel-metadata.json").write_text(
        json.dumps(meta, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(meta, indent=2))
    r = _run(["kaggle", "kernels", "push", "-p", str(staging)], check=False)
    _append_action(
        {
            "at": _utc_now(),
            "action": "kaggle_kernels_push",
            "slug": SLUG,
            "returncode": r.returncode,
            "product_unlock": False,
            "rails_can_stage": can_stage,
            "force_ignore_rails": force_ignore_rails,
            "note": "operator-gated E20b relaunch (≤1 design path)",
        }
    )
    print(f"push returncode={r.returncode}")
    print(f"Monitor: https://www.kaggle.com/code/{SLUG}")
    print(f"  kaggle kernels status {SLUG}")
    return 0 if r.returncode == 0 else r.returncode


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--dry-run", action="store_true", default=False)
    ap.add_argument(
        "--execute",
        action="store_true",
        help="Actually push (still requires --i-accept-operator-responsibility)",
    )
    ap.add_argument(
        "--i-accept-operator-responsibility",
        action="store_true",
        help="Human operator gate for real push",
    )
    ap.add_argument(
        "--force-ignore-rails",
        action="store_true",
        help="Dangerous: push even if rails red (still no product_unlock)",
    )
    args = ap.parse_args()

    if args.status:
        return status()

    # Default = dry-run unless --execute
    if not args.execute:
        report = dry_run_report()
        print(json.dumps(report, indent=2))
        out = ROOT / "eval" / "reports" / "ml_experiments" / "e20b_push_dry_run_latest.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {out} (dry-run; no push)")
        return 0

    if not args.i_accept_operator_responsibility:
        print(
            "FATAL: --execute requires --i-accept-operator-responsibility. "
            "No silent push. product_unlock stays false."
        )
        return 4

    return execute_push(force_ignore_rails=args.force_ignore_rails)


if __name__ == "__main__":
    raise SystemExit(main())
