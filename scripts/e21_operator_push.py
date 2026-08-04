#!/usr/bin/env python3
"""E21 operator-gated Kaggle push — dual/triple human gate; never silent auto push.

SAFE path: optional scale only with an explicit human operator. Fail-closed.

Usage (default = dry-run, no network)::

  python scripts/e21_operator_push.py
  python scripts/e21_operator_push.py --dry-run

Real push requires ALL of:
  1. env E21_OPERATOR_APPROVED=true
  2. env E21_ALLOW_KAGGLE_PUSH=true   (third gate: schedule ≠ push)
  3. CLI --i-accept-operator-responsibility  and/or  --confirm-push
  4. CLI --execute                       (opt-in out of dry-run)
  5. evaluate_e21_readiness ready_for_e21_schedule
  6. A real E21 kernel dir with notebook (kaggle/push_e21/*.ipynb)

Never set product_unlock / forage / consumption true.
PRODUCT_UNLOCK alone never authorizes push.
Readiness / metrics alone never push.

See docs/E21_SCALE_PLAN.md § Operator push (manual CLI).
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.e21_readiness import evaluate_e21_readiness  # noqa: E402

POLICY = "orientation_only_never_consume"
E21_OPERATOR_ENV = "E21_OPERATOR_APPROVED"
E21_ALLOW_PUSH_ENV = "E21_ALLOW_KAGGLE_PUSH"
PRODUCT_UNLOCK_ENV = "PRODUCT_UNLOCK"

KERNEL_DIR = ROOT / "kaggle" / "push_e21"
KERNEL_SLUG = "alonsoalviraaaa/visionsetil-exp-v21-scale-holdout"
ACTIONS_LOG = ROOT / "eval" / "reports" / "ml_experiments" / "e21_operator_actions.jsonl"
OPERATOR_PUSH_CLI = "scripts/e21_operator_push.py"


def _env_truthy(name: str) -> bool:
    return str(os.getenv(name, "") or "").strip().lower() in ("1", "true", "yes", "on")


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def discover_kernel_notebook(kernel_dir: Path | None = None) -> Path | None:
    """Return first real .ipynb under push_e21, or None if GAP."""
    kdir = Path(kernel_dir or KERNEL_DIR)
    if not kdir.is_dir():
        return None
    for p in sorted(kdir.glob("*.ipynb")):
        if p.is_file() and p.stat().st_size > 0:
            return p
    return None


def kernel_metadata_path(kernel_dir: Path | None = None) -> Path | None:
    kdir = Path(kernel_dir or KERNEL_DIR)
    meta = kdir / "kernel-metadata.json"
    return meta if meta.is_file() else None


def append_action_log(record: dict[str, Any], path: Path | None = None) -> Path:
    log_path = path or ACTIONS_LOG
    log_path.parent.mkdir(parents=True, exist_ok=True)
    # Absolute policy stamps — never claim unlock/forage from this log
    record = {
        **record,
        "product_unlock": False,
        "can_auto_unlock": False,
        "forage_permission": False,
        "consumption_permission": False,
        "policy": POLICY,
    }
    with log_path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False) + "\n")
    return log_path


def evaluate_gates(
    *,
    confirm_cli: bool,
    execute: bool,
    readiness: dict | None = None,
    operator_approved: bool | None = None,
    allow_kaggle_push: bool | None = None,
    product_unlock_env: bool | None = None,
) -> dict[str, Any]:
    """Compute gate state. Never pushes; pure decision record."""
    if readiness is None:
        readiness = evaluate_e21_readiness(
            operator_approved=operator_approved
            if operator_approved is not None
            else None
        )
    if operator_approved is None:
        operator_approved = _env_truthy(E21_OPERATOR_ENV)
    if allow_kaggle_push is None:
        allow_kaggle_push = _env_truthy(E21_ALLOW_PUSH_ENV)
    if product_unlock_env is None:
        product_unlock_env = _env_truthy(PRODUCT_UNLOCK_ENV)

    ready = bool(readiness.get("ready_for_e21_schedule"))
    nb = discover_kernel_notebook()
    meta = kernel_metadata_path()
    kernel_gap = nb is None

    gates = {
        "e21_operator_approved": bool(operator_approved),
        "e21_allow_kaggle_push": bool(allow_kaggle_push),
        "cli_operator_responsibility": bool(confirm_cli),
        "execute_flag": bool(execute),
        "ready_for_e21_schedule": ready,
        "kernel_notebook_present": not kernel_gap,
        "kernel_metadata_present": meta is not None,
        # Informational — never sufficient alone
        "product_unlock_env_set": bool(product_unlock_env),
        "product_unlock_does_not_authorize_push": True,
    }
    missing = [
        name
        for name, ok in (
            ("E21_OPERATOR_APPROVED", gates["e21_operator_approved"]),
            ("E21_ALLOW_KAGGLE_PUSH", gates["e21_allow_kaggle_push"]),
            ("--i-accept-operator-responsibility|--confirm-push", gates["cli_operator_responsibility"]),
            ("--execute", gates["execute_flag"]),
            ("ready_for_e21_schedule", gates["ready_for_e21_schedule"]),
            ("kernel_notebook", gates["kernel_notebook_present"]),
        )
        if not ok
    ]
    # Dual gate (human): operator env + CLI responsibility; third = allow push env
    dual_ok = gates["e21_operator_approved"] and gates["cli_operator_responsibility"]
    triple_ok = dual_ok and gates["e21_allow_kaggle_push"]
    all_push_gates = (
        triple_ok
        and gates["execute_flag"]
        and gates["ready_for_e21_schedule"]
        and gates["kernel_notebook_present"]
    )
    # PRODUCT_UNLOCK alone never authorizes
    if product_unlock_env and not all_push_gates:
        # still blocked — explicit annotation
        pass

    dry_run = not all_push_gates  # fail-closed: missing any gate → no real push
    if not execute:
        dry_run = True

    return {
        "gates": gates,
        "missing_for_real_push": missing,
        "dual_gate_ok": dual_ok,
        "triple_gate_ok": triple_ok,
        "all_push_gates_ok": all_push_gates,
        "dry_run": dry_run,
        "kernel_gap": kernel_gap,
        "kernel_notebook": str(nb) if nb else None,
        "kernel_metadata": str(meta) if meta else None,
        "kernel_dir": str(KERNEL_DIR),
        "kernel_slug": KERNEL_SLUG,
        "ready_for_e21_schedule": ready,
        "readiness_status": readiness.get("status"),
        "auto_kaggle_push": False,
        "requires_operator_dual_gate": True,
        "product_unlock_does_not_push": True,
        "product_unlock": False,
        "can_auto_unlock": False,
        "forage_permission": False,
        "consumption_permission": False,
        "e21_launched": False,
        "kaggle_push": False,
        "policy": POLICY,
        "operator_push_cli": OPERATOR_PUSH_CLI,
    }


def build_plan(gate_state: dict[str, Any]) -> dict[str, Any]:
    """Human-readable plan for dry-run / audit."""
    gap_notes: list[str] = []
    if gate_state.get("kernel_gap"):
        gap_notes.append(
            "GAP: no E21 training notebook under kaggle/push_e21/*.ipynb — "
            "scaffold metadata only; do not invent fake training. "
            "Build notebook from E20 lineage (build_exp_v20) before real push."
        )
    if not gate_state["gates"].get("kernel_metadata_present"):
        gap_notes.append(
            "GAP: missing kaggle/push_e21/kernel-metadata.json (stub may be scaffolded)."
        )
    if not gate_state.get("ready_for_e21_schedule"):
        gap_notes.append(
            "Baseline not ready: run python scripts/e21_readiness.py and fix fail_reasons."
        )

    return {
        "action": "kaggle_kernels_push" if not gate_state["dry_run"] else "dry_run_plan",
        "command_if_ready": [
            "kaggle",
            "kernels",
            "push",
            "-p",
            str(KERNEL_DIR),
        ],
        "kernel_slug": KERNEL_SLUG,
        "kernel_dir": str(KERNEL_DIR),
        "kernel_notebook": gate_state.get("kernel_notebook"),
        "gap_notes": gap_notes,
        "gates": gate_state["gates"],
        "missing_for_real_push": gate_state["missing_for_real_push"],
        "auto_kaggle_push": False,
        "note": (
            "No auto Kaggle push from PRODUCT_UNLOCK, metrics, or readiness alone. "
            "Operator dual/triple gate required. Orientation only — never forage."
        ),
    }


def run_kaggle_push(
    kernel_dir: Path,
    *,
    runner: Any = None,
) -> dict[str, Any]:
    """Invoke ``kaggle kernels push``. Injectable runner for tests (no network)."""
    cmd = ["kaggle", "kernels", "push", "-p", str(kernel_dir)]
    if runner is not None:
        return runner(cmd)
    print(" $", " ".join(cmd))
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(ROOT))
    out = (result.stdout or "") + (result.stderr or "")
    if result.stdout:
        print(result.stdout[-4000:] if len(result.stdout) > 4000 else result.stdout)
    if result.stderr:
        print(
            result.stderr[-2000:] if len(result.stderr) > 2000 else result.stderr,
            file=sys.stderr,
        )
    return {
        "returncode": result.returncode,
        "cmd": cmd,
        "output_tail": out[-2000:] if len(out) > 2000 else out,
    }


def run_operator_push(
    *,
    confirm_cli: bool = False,
    execute: bool = False,
    readiness: dict | None = None,
    operator_approved: bool | None = None,
    allow_kaggle_push: bool | None = None,
    product_unlock_env: bool | None = None,
    log_path: Path | None = None,
    kaggle_runner: Any = None,
    write_log: bool = True,
) -> tuple[int, dict[str, Any]]:
    """Core entry used by CLI and tests.

    Returns (exit_code, result_dict). Never sets product_unlock/forage true.
    Default dry-run: exit 0 even with kernel GAP. Real push with GAP → non-zero.
    """
    if readiness is None:
        readiness = evaluate_e21_readiness(
            operator_approved=operator_approved
            if operator_approved is not None
            else None
        )
    gate_state = evaluate_gates(
        confirm_cli=confirm_cli,
        execute=execute,
        readiness=readiness,
        operator_approved=operator_approved,
        allow_kaggle_push=allow_kaggle_push,
        product_unlock_env=product_unlock_env,
    )
    plan = build_plan(gate_state)
    dry_run = bool(gate_state["dry_run"])
    who = {
        "user": os.getenv("USERNAME") or os.getenv("USER") or "unknown",
        "E21_OPERATOR_APPROVED": _env_truthy(E21_OPERATOR_ENV)
        if operator_approved is None
        else bool(operator_approved),
        "E21_ALLOW_KAGGLE_PUSH": _env_truthy(E21_ALLOW_PUSH_ENV)
        if allow_kaggle_push is None
        else bool(allow_kaggle_push),
        "PRODUCT_UNLOCK": _env_truthy(PRODUCT_UNLOCK_ENV)
        if product_unlock_env is None
        else bool(product_unlock_env),
        "confirm_cli": bool(confirm_cli),
        "execute": bool(execute),
    }

    result: dict[str, Any] = {
        "timestamp": _utc_now(),
        "dry_run": dry_run,
        "gates": gate_state["gates"],
        "missing_for_real_push": gate_state["missing_for_real_push"],
        "dual_gate_ok": gate_state["dual_gate_ok"],
        "triple_gate_ok": gate_state["triple_gate_ok"],
        "all_push_gates_ok": gate_state["all_push_gates_ok"],
        "who": who,
        "kernel_path": gate_state.get("kernel_notebook"),
        "kernel_dir": gate_state.get("kernel_dir"),
        "kernel_gap": gate_state.get("kernel_gap"),
        "plan": plan,
        "auto_kaggle_push": False,
        "requires_operator_dual_gate": True,
        "product_unlock_does_not_push": True,
        "product_unlock": False,
        "can_auto_unlock": False,
        "forage_permission": False,
        "consumption_permission": False,
        "e21_launched": False,
        "kaggle_push": False,
        "kaggle_push_attempted": False,
        "policy": POLICY,
        "operator_push_cli": OPERATOR_PUSH_CLI,
    }

    # Real push path
    if not dry_run and gate_state["all_push_gates_ok"]:
        push_out = run_kaggle_push(KERNEL_DIR, runner=kaggle_runner)
        result["kaggle_push_attempted"] = True
        result["kaggle_result"] = push_out
        rc = int(push_out.get("returncode", 1))
        # Action-log only: product/readiness surfaces still re-assert e21_launched=false
        # and never grant product_unlock / forage. Audit fields record the operator act.
        if rc == 0:
            result["status"] = "push_submitted"
            result["kaggle_push_submitted"] = True
        else:
            result["status"] = "push_failed"
            result["kaggle_push_submitted"] = False
        result["e21_launched"] = False
        result["kaggle_push"] = False
        result["product_unlock"] = False
        result["forage_permission"] = False
        result["consumption_permission"] = False
        if write_log:
            append_action_log(result, path=log_path)
        return rc, result

    # Dry-run / blocked (execute requested but gates incomplete, incl. kernel GAP)
    if execute and not gate_state["all_push_gates_ok"]:
        if gate_state.get("kernel_gap"):
            result["status"] = "blocked_kernel_gap"
            result["error"] = (
                "No E21 notebook under kaggle/push_e21/*.ipynb. "
                "Dry-run documents GAP (exit 0); real push requires a real notebook. "
                "Do not invent fake training. Also missing: "
                + ", ".join(gate_state["missing_for_real_push"])
            )
            exit_code = 2
        else:
            result["status"] = "blocked_gates"
            result["error"] = (
                "Real push blocked — missing gates: "
                + ", ".join(gate_state["missing_for_real_push"])
            )
            exit_code = 1
        if write_log:
            append_action_log(result, path=log_path)
        return exit_code, result

    result["status"] = "dry_run"
    if write_log:
        append_action_log(result, path=log_path)
    return 0, result


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        description=(
            "E21 operator Kaggle push (default dry-run). "
            "Never auto-pushes from PRODUCT_UNLOCK or readiness alone."
        )
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        default=False,
        help="Force dry-run plan only (default behavior unless --execute)",
    )
    ap.add_argument(
        "--execute",
        action="store_true",
        help=(
            "Attempt real kaggle kernels push (still requires dual/triple gates + "
            "notebook). Without this flag, always dry-run."
        ),
    )
    ap.add_argument(
        "--confirm-push",
        action="store_true",
        help="Operator CLI acceptance (one of two responsibility flags)",
    )
    ap.add_argument(
        "--i-accept-operator-responsibility",
        action="store_true",
        dest="accept_responsibility",
        help="Operator CLI acceptance (one of two responsibility flags)",
    )
    ap.add_argument(
        "--no-log",
        action="store_true",
        help="Skip writing e21_operator_actions.jsonl",
    )
    args = ap.parse_args(argv)

    confirm = bool(args.confirm_push or args.accept_responsibility)
    # --dry-run wins over --execute
    execute = bool(args.execute) and not bool(args.dry_run)

    rc, result = run_operator_push(
        confirm_cli=confirm,
        execute=execute,
        write_log=not args.no_log,
    )
    print(json.dumps(result, indent=2, ensure_ascii=False))
    if result.get("status") == "dry_run":
        print(
            "\n[dry-run] No network push. To attempt real push (operator only):\n"
            f"  set {E21_OPERATOR_ENV}=true\n"
            f"  set {E21_ALLOW_PUSH_ENV}=true\n"
            "  python scripts/e21_operator_push.py "
            "--i-accept-operator-responsibility --execute\n"
            "Requires ready_for_e21_schedule + kaggle/push_e21/*.ipynb.\n"
            "PRODUCT_UNLOCK alone never pushes. auto_kaggle_push=false forever here.",
            file=sys.stderr,
        )
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
