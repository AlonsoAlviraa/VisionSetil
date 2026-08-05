#!/usr/bin/env python3
"""E20b Lepiota FT — operator-gated Kaggle push (≤1 relaunch path).

Default is dry-run. Never silent auto push. Never product_unlock.

Real push requires ALL of:
  1. diagnose artifact present with relaunch_allowed=true and product_unlock=false
  2. ≤1 successful push budget remaining (action log), unless --i-accept-extra-relaunch
  3. notebook fixes present (syntax + weight paths)
  4. weights dataset preflight (best.pt on Kaggle), unless --force-skip-weights-preflight
  5. CLI --execute
  6. CLI --i-accept-operator-responsibility
  7. anti-leak rails can_stage (unless --force-ignore-rails — still no product unlock)

Usage::

  python scripts/push_kaggle_e20b.py              # dry-run
  python scripts/push_kaggle_e20b.py --status
  python scripts/push_kaggle_e20b.py --execute --i-accept-operator-responsibility

See eval/reports/ml_experiments/e20b_diagnose_lepiota_ft.json.
"""
from __future__ import annotations

import argparse
import ast
import json
import re
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
WEIGHTS_DATASET = "alonsoalviraaaa/visionsetil-e20-weights"
DIAGNOSE_JSON = ROOT / "eval" / "reports" / "ml_experiments" / "e20b_diagnose_lepiota_ft.json"
RAILS_JSON = ROOT / "eval" / "reports" / "ml_experiments" / "anti_leak_rails_train_latest.json"
ACTIONS_LOG = ROOT / "eval" / "reports" / "ml_experiments" / "e20b_operator_actions.jsonl"
NB_NAME = "visionsetil_exp_v20b_lepiota_ft.ipynb"
MAX_HUMAN_RELAUNCH_BUDGET = 1


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


def count_successful_pushes(
    slug: str = SLUG, log_path: Path = ACTIONS_LOG
) -> int:
    """Count successful kaggle_kernels_push for slug in action log."""
    if not log_path.is_file():
        return 0
    n = 0
    try:
        lines = log_path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return 0
    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(rec, dict):
            continue
        if rec.get("action") != "kaggle_kernels_push":
            continue
        if rec.get("slug") != slug:
            continue
        if rec.get("returncode") == 0:
            n += 1
    return n


def _hard_neg_syntax_ok(source: str) -> bool:
    """AST-check _HARD_NEG is a valid dict; reject comma-in-comment pattern."""
    # Residual bad pattern: number then comment that contains a trailing comma
    if re.search(r":\s*\d+(?:\.\d+)?\s+#.*,\s*$", source, re.M):
        # only fail if it appears near HARD_NEG
        if "_HARD_NEG" in source:
            return False
    # Extract assignment and parse
    m = re.search(
        r"_HARD_NEG\s*=\s*\{.*?\n\}",
        source,
        re.S,
    )
    if not m:
        # also try single-line
        m = re.search(r"_HARD_NEG\s*=\s*\{[^}]+\}", source)
    if not m:
        return False
    snippet = m.group(0)
    try:
        tree = ast.parse(snippet)
    except SyntaxError:
        return False
    assign = None
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for t in node.targets:
                if isinstance(t, ast.Name) and t.id == "_HARD_NEG":
                    assign = node
                    break
    if assign is None or not isinstance(assign.value, ast.Dict):
        return False
    # Require deadly lepiota keys with finite positive floats
    keys: dict[str, float] = {}
    for k_node, v_node in zip(assign.value.keys, assign.value.values):
        if isinstance(k_node, ast.Constant) and isinstance(k_node.value, str):
            if isinstance(v_node, ast.Constant) and isinstance(
                v_node.value, (int, float)
            ):
                keys[k_node.value.lower()] = float(v_node.value)
    required = {
        "lepiota subincarnata",
        "lepiota castanea",
        "lepiota cristata",
    }
    if not required.issubset(keys):
        return False
    return all(keys[k] > 0 for k in required)


def notebook_ready(push_dir: Path | None = None) -> dict[str, Any]:
    # Prefer tracked notebook for readiness (survives gitignore on push_e*)
    nb = TRACKED_NB if TRACKED_NB.is_file() else (push_dir or PUSH_DIR) / NB_NAME
    meta = (
        TRACKED_META
        if TRACKED_META.is_file()
        else (push_dir or PUSH_DIR) / "kernel-metadata.json"
    )
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
    # Prefer AST over fragile exact comment substrings
    try:
        nb_obj = json.loads(text)
        sources = []
        for cell in nb_obj.get("cells") or []:
            if cell.get("cell_type") == "code":
                sources.append("".join(cell.get("source") or []))
        joined = "\n".join(sources)
    except (json.JSONDecodeError, TypeError):
        joined = text
    info["syntax_fix_present"] = _hard_neg_syntax_ok(joined)
    info["weight_path_fix_present"] = (
        "datasets/alonsoalviraaaa/visionsetil-e20-weights" in joined
        or "datasets/alonsoalviraaaa/visionsetil-e20-weights" in text
    )
    info["ready"] = bool(
        info["notebook_present"]
        and info["metadata_present"]
        and info["syntax_fix_present"]
        and info["weight_path_fix_present"]
    )
    return info


def diagnose_gate(diag: dict[str, Any] | None) -> dict[str, Any]:
    """Evaluate diagnose-first / relaunch_allowed / product_unlock gates."""
    out: dict[str, Any] = {
        "diagnose_present": diag is not None,
        "relaunch_allowed": False,
        "product_unlock_false": False,
        "decision": None,
        "ok": False,
        "blockers": [],
    }
    if diag is None:
        out["blockers"].append("diagnose_json_missing_run_diagnose_first")
        return out
    # product_unlock must be explicitly false (not missing / not true)
    pu = diag.get("product_unlock")
    out["product_unlock_false"] = pu is False
    if pu is not False:
        out["blockers"].append("product_unlock_not_false")
    dec = ((diag.get("decision_tree") or {}).get("decision") or {})
    out["decision"] = dec.get("decision")
    out["relaunch_allowed"] = bool(dec.get("relaunch_allowed"))
    if not out["relaunch_allowed"]:
        out["blockers"].append("relaunch_not_allowed_by_diagnose")
    out["ok"] = (
        out["diagnose_present"]
        and out["product_unlock_false"]
        and out["relaunch_allowed"]
        and not out["blockers"]
    )
    # if only product_unlock failed, ok already false; if relaunch false too, listed
    # recompute ok without double-counting empty blockers from ok path
    out["ok"] = (
        out["diagnose_present"]
        and out["product_unlock_false"]
        and out["relaunch_allowed"]
    )
    if out["ok"]:
        out["blockers"] = []
    return out


def budget_gate(
    *,
    accept_extra: bool = False,
    max_budget: int = MAX_HUMAN_RELAUNCH_BUDGET,
) -> dict[str, Any]:
    used = count_successful_pushes()
    remaining = max(0, int(max_budget) - used)
    out = {
        "successful_pushes": used,
        "max_human_relaunch_budget": int(max_budget),
        "budget_remaining": remaining,
        "accept_extra": accept_extra,
        "ok": remaining > 0 or accept_extra,
        "blockers": [],
    }
    if not out["ok"]:
        out["blockers"].append(
            f"relaunch_budget_exhausted used={used} max={max_budget} "
            "(pass --i-accept-extra-relaunch to override; still no product_unlock)"
        )
    return out


def weights_preflight(*, skip: bool = False) -> dict[str, Any]:
    out: dict[str, Any] = {
        "dataset": WEIGHTS_DATASET,
        "skipped": skip,
        "ok": False,
        "has_best_pt": False,
        "raw_tail": "",
        "blockers": [],
    }
    if skip:
        out["ok"] = True
        out["blockers"] = []
        return out
    r = _run(
        ["kaggle", "datasets", "files", WEIGHTS_DATASET],
        check=False,
    )
    text = ((r.stdout or "") + (r.stderr or "")).strip()
    out["raw_tail"] = text[-1500:]
    out["has_best_pt"] = bool(
        re.search(r"\bbest\.pt\b", text)
        or re.search(r"models/best\.pt", text)
    )
    if r.returncode != 0:
        out["blockers"].append(f"weights_dataset_list_failed_rc={r.returncode}")
    elif not out["has_best_pt"]:
        out["blockers"].append("weights_dataset_missing_best_pt")
    out["ok"] = out["has_best_pt"] and r.returncode == 0
    return out


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


def status() -> int:
    _run(["kaggle", "kernels", "status", SLUG], check=False)
    return 0


def evaluate_gates(
    *,
    force_ignore_rails: bool = False,
    force_skip_weights: bool = False,
    accept_extra_relaunch: bool = False,
) -> dict[str, Any]:
    diag = _load_json(DIAGNOSE_JSON)
    rails = _load_json(RAILS_JSON)
    nb = notebook_ready()
    can_stage = bool((rails or {}).get("can_stage_train_notebook"))
    dgate = diagnose_gate(diag)
    # budget from diagnose honesty if present
    honesty = (diag or {}).get("honesty") or {}
    max_budget = int(
        honesty.get("max_human_relaunch_budget")
        or ((diag or {}).get("decision_tree") or {})
        .get("decision", {})
        .get("relaunch_budget_remaining")
        or MAX_HUMAN_RELAUNCH_BUDGET
    )
    # If budget_remaining is residual, successful used may already exist —
    # always compute from action log against absolute max budget of 1 (or honesty).
    max_budget = int(honesty.get("max_human_relaunch_budget") or MAX_HUMAN_RELAUNCH_BUDGET)
    bgate = budget_gate(accept_extra=accept_extra_relaunch, max_budget=max_budget)
    wgate = weights_preflight(skip=force_skip_weights)

    blockers: list[str] = []
    blockers.extend(dgate.get("blockers") or [])
    if not nb.get("ready"):
        blockers.append("notebook_not_ready")
    if not can_stage and not force_ignore_rails:
        blockers.append("rails_not_green")
    blockers.extend(bgate.get("blockers") or [])
    blockers.extend(wgate.get("blockers") or [])

    would_push = (
        dgate.get("ok")
        and bool(nb.get("ready"))
        and (can_stage or force_ignore_rails)
        and bgate.get("ok")
        and wgate.get("ok")
    )
    return {
        "generated_at": _utc_now(),
        "product_unlock": False,
        "kaggle_push": False,
        "auto_kaggle_push": False,
        "slug": SLUG,
        "notebook": nb,
        "rails_can_stage": can_stage,
        "diagnose": dgate,
        "budget": bgate,
        "weights": {
            "dataset": wgate.get("dataset"),
            "skipped": wgate.get("skipped"),
            "ok": wgate.get("ok"),
            "has_best_pt": wgate.get("has_best_pt"),
            "blockers": wgate.get("blockers"),
        },
        "would_push": bool(would_push),
        "blockers": blockers,
        "note": (
            "product_unlock forced false. Execute requires diagnose + relaunch_allowed "
            "+ budget + notebook + weights + dual human flags."
        ),
    }


def dry_run_report(
    *,
    force_ignore_rails: bool = False,
    force_skip_weights: bool = False,
    accept_extra_relaunch: bool = False,
) -> dict[str, Any]:
    g = evaluate_gates(
        force_ignore_rails=force_ignore_rails,
        force_skip_weights=force_skip_weights,
        accept_extra_relaunch=accept_extra_relaunch,
    )
    g["mode"] = "dry_run"
    g["diagnose_present"] = g["diagnose"]["diagnose_present"]
    g["diagnose_decision"] = g["diagnose"]["decision"]
    g["relaunch_allowed_in_diagnose"] = g["diagnose"]["relaunch_allowed"]
    return g


def execute_push(
    *,
    force_ignore_rails: bool = False,
    force_skip_weights: bool = False,
    accept_extra_relaunch: bool = False,
) -> int:
    gates = evaluate_gates(
        force_ignore_rails=force_ignore_rails,
        force_skip_weights=force_skip_weights,
        accept_extra_relaunch=accept_extra_relaunch,
    )

    # Explicit ordered FATALS matching review contract
    diag = _load_json(DIAGNOSE_JSON)
    if diag is None:
        print("FATAL: diagnose JSON missing. Run scripts/diagnose_e20b_lepiota_ft.py first.")
        _append_action(
            {
                "at": _utc_now(),
                "action": "kaggle_kernels_push_refused",
                "reason": "diagnose_missing",
                "product_unlock": False,
            }
        )
        return 5

    if diag.get("product_unlock") is not False:
        print("FATAL: diagnose.product_unlock is not false. Refuse push.")
        return 7

    dec = ((diag.get("decision_tree") or {}).get("decision") or {})
    if not dec.get("relaunch_allowed"):
        print(
            "FATAL: diagnose.relaunch_allowed is not true "
            f"(decision={dec.get('decision')}). Refuse push."
        )
        _append_action(
            {
                "at": _utc_now(),
                "action": "kaggle_kernels_push_refused",
                "reason": "relaunch_not_allowed",
                "decision": dec.get("decision"),
                "product_unlock": False,
            }
        )
        return 6

    bg = gates["budget"]
    if not bg.get("ok"):
        print(
            "FATAL: relaunch budget exhausted "
            f"(successful_pushes={bg.get('successful_pushes')} "
            f"max={bg.get('max_human_relaunch_budget')}). "
            "Pass --i-accept-extra-relaunch to override. product_unlock stays false."
        )
        _append_action(
            {
                "at": _utc_now(),
                "action": "kaggle_kernels_push_refused",
                "reason": "budget_exhausted",
                "budget": bg,
                "product_unlock": False,
            }
        )
        return 8

    nb_info = gates["notebook"]
    if not nb_info.get("ready"):
        print("FATAL: notebook not ready for relaunch:", json.dumps(nb_info, indent=2))
        return 2

    rails = _load_json(RAILS_JSON) or {}
    can_stage = bool(rails.get("can_stage_train_notebook"))
    if not can_stage and not force_ignore_rails:
        print("FATAL: rails not green (can_stage_train_notebook=false). Refuse push.")
        return 3

    w = gates["weights"]
    if not w.get("ok"):
        print(
            "FATAL: weights preflight failed "
            f"(dataset={WEIGHTS_DATASET} has_best_pt={w.get('has_best_pt')} "
            f"blockers={w.get('blockers')}). "
            "Pass --force-skip-weights-preflight only if you accept non-FT risk."
        )
        return 9

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
            "force_skip_weights_preflight": force_skip_weights,
            "accept_extra_relaunch": accept_extra_relaunch,
            "budget_before": bg,
            "diagnose_decision": dec.get("decision"),
            "relaunch_allowed": True,
            "note": "operator-gated E20b relaunch (≤1 design path; diagnose-first)",
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
        help="Actually push (requires --i-accept-operator-responsibility + diagnose gates)",
    )
    ap.add_argument(
        "--i-accept-operator-responsibility",
        action="store_true",
        help="Human operator gate for real push",
    )
    ap.add_argument(
        "--i-accept-extra-relaunch",
        action="store_true",
        help="Override ≤1 budget after a successful prior push (still no product_unlock)",
    )
    ap.add_argument(
        "--force-ignore-rails",
        action="store_true",
        help="Dangerous: push even if rails red (still no product_unlock)",
    )
    ap.add_argument(
        "--force-skip-weights-preflight",
        action="store_true",
        help="Dangerous: skip best.pt dataset check (risk of non-FT train from init)",
    )
    args = ap.parse_args()

    if args.status:
        return status()

    # Default = dry-run unless --execute
    if not args.execute:
        report = dry_run_report(
            force_ignore_rails=args.force_ignore_rails,
            force_skip_weights=args.force_skip_weights_preflight,
            accept_extra_relaunch=args.i_accept_extra_relaunch,
        )
        print(json.dumps(report, indent=2))
        out = (
            ROOT
            / "eval"
            / "reports"
            / "ml_experiments"
            / "e20b_push_dry_run_latest.json"
        )
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

    return execute_push(
        force_ignore_rails=args.force_ignore_rails,
        force_skip_weights=args.force_skip_weights_preflight,
        accept_extra_relaunch=args.i_accept_extra_relaunch,
    )


if __name__ == "__main__":
    raise SystemExit(main())
