"""Product gate dry-run + operator unlock package (advisory).

Orientation only — never consumption. product_unlock is always False from this
module; metrics alone never auto-unlock Identify or forage permission.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from kaggle.ml_qa.metrics_core import deadly_gate_eval

# Experiments that may *advise* soft-gate readiness for product_unlock.
# Never set product_unlock=True from this module alone without dual honesty.
E20_VERSION_MARKERS = (
    "v20",
    "e20",
    "source-holdout",
    "source_holdout",
)

POLICY = "orientation_only_never_consume"
OPERATOR_CYCLE_REASON = "all_checks_pass_but_product_unlock_forced_false_until_operator_cycle"
FORCED_FALSE_NOTE = (
    "Fail-closed: product_unlock stays false until a human operator cycle. "
    "Metrics eligibility (unlock_eligible_advisory) is advisory only — never forage/"
    "consumption permission and never a 'safe to eat' go-ahead. "
    "Soft MAP@3 / deadly@3 gates are advisory orientation signals only."
)
# Residual codes always stamped on metrics packages (metrics ≠ forage)
_METRICS_POLICY_RESIDUALS = (
    "policy_orientation_only_never_consume",
    "no_auto_unlock_from_metrics_alone",
    "metrics_never_authorize_forage_or_consumption",
    "soft_map_deadly_gates_advisory_only",
)


def evaluate_product_gates(
    map_at_3: Optional[float],
    deadly_at_3: Optional[float],
    n_deadly: int,
    *,
    expand_map: float = 0.22,
    expand_deadly: float = 0.50,
    soft_map: float = 0.25,
    soft_deadly: float = 0.90,
) -> dict[str, Any]:
    """Evaluate expand + soft gates. Never unlock language; advisory only."""
    gates: dict[str, Any] = {
        "policy": POLICY,
        "product_unlock": False,
        "forage_permission": False,
        "consumption_permission": False,
        "can_auto_unlock": False,
        "soft_gates_advisory_only": True,
        "note": (
            "Gates are advisory metrics only; never unlock Identify, forage, or "
            "consumption from MAP/deadly alone. Soft gates ≠ safe to eat."
        ),
    }
    m = None if map_at_3 is None else float(map_at_3)
    gates["expand_map"] = {
        "threshold": expand_map,
        "value": m,
        "pass": (m is not None) and (m >= expand_map),
        "status": "ok" if m is not None else "missing",
    }
    gates["soft_map"] = {
        "threshold": soft_map,
        "value": m,
        "pass": (m is not None) and (m >= soft_map),
        "status": "ok" if m is not None else "missing",
    }
    d_exp = deadly_gate_eval(
        float(deadly_at_3 or 0.0), int(n_deadly), threshold=expand_deadly
    )
    d_soft = deadly_gate_eval(
        float(deadly_at_3 or 0.0), int(n_deadly), threshold=soft_deadly
    )
    gates["expand_deadly_at_3"] = d_exp
    gates["soft_deadly_at_3"] = d_soft
    gates["all_expand_pass"] = bool(
        gates["expand_map"]["pass"] and d_exp["pass"]
    )
    return gates


def _is_e20_experiment(metrics: dict[str, Any], path: str | Path | None = None) -> bool:
    blob = " ".join(
        str(metrics.get(k) or "")
        for k in ("version", "experiment", "protocol", "split_protocol", "name", "eval_protocol")
    ).lower()
    if path is not None:
        blob += " " + str(path).lower()
    return any(m in blob for m in E20_VERSION_MARKERS)


def _bool_check(
    *,
    ok: bool,
    criterion: str,
    detail: str,
    value: Any = None,
) -> dict[str, Any]:
    return {
        "id": criterion,
        "pass": bool(ok),
        "status": "PASS" if ok else "FAIL",
        "detail": detail,
        "value": value,
    }


def evaluate_product_unlock_criteria(
    metrics: dict[str, Any] | None,
    *,
    metrics_path: str | Path | None = None,
    soft_map: float = 0.25,
    soft_deadly: float = 0.90,
    pro_tester_ok: bool | None = None,
    safe_dp_freeze_ok: bool | None = None,
) -> dict[str, Any]:
    """Fail-closed product_unlock criteria evaluation.

    product_unlock is **always False** here (policy). Reports which checklist
    items pass so operators can see readiness. Requires:
      - metrics present
      - E20 source-holdout experiment identity
      - dual deadly keys (at_1 and at_3)
      - soft MAP@3 and deadly@3 thresholds
      - non-vacuous n_deadly
      - orientation-only policy (always true in this helper)
      - optional: pro_tester overall PASS, safe_dp_freeze when supplied
    """
    fail_reasons: list[str] = []
    residual_lock_reasons: list[str] = list(_METRICS_POLICY_RESIDUALS)
    checks: dict[str, bool] = {
        "metrics_present": False,
        "e20_experiment": False,
        "dual_deadly_keys": False,
        "soft_map": False,
        "soft_deadly_at_3": False,
        "n_deadly_nonzero": False,
        "orientation_only_policy": True,  # enforced by this module
    }
    if pro_tester_ok is not None:
        checks["pro_tester_pass"] = bool(pro_tester_ok)
    if safe_dp_freeze_ok is not None:
        checks["safe_dp_freeze"] = bool(safe_dp_freeze_ok)

    checklist: list[dict[str, Any]] = []
    out: dict[str, Any] = {
        "policy": POLICY,
        "product_unlock": False,
        "can_auto_unlock": False,
        "unlock_eligible_advisory": False,
        "eligible_but_locked": False,
        "operator_cycle_required": True,
        "checks": checks,
        "checklist": checklist,
        "reasons": fail_reasons,
        "residual_lock_reasons": residual_lock_reasons,
        "metrics_path": str(metrics_path) if metrics_path else None,
        "note": FORCED_FALSE_NOTE,
        "forage_permission": False,
        "consumption_permission": False,
        "soft_gates_advisory_only": True,
        "metrics_authorize_forage": False,
    }
    if not metrics or not isinstance(metrics, dict):
        fail_reasons.append("no_metrics")
        checklist.append(
            _bool_check(
                ok=False,
                criterion="metrics_present",
                detail="No metrics dict / metrics.json missing",
            )
        )
        checklist.append(
            _bool_check(
                ok=True,
                criterion="orientation_only_policy",
                detail=(
                    "product_unlock forced false; never forage/consumption; "
                    "metrics eligibility ≠ forage permission"
                ),
            )
        )
        out["operator_action"] = "supply_e20_metrics_then_re_run_operator_package"
        # Fail-closed shape consistent with success paths / package
        out["eligible_but_locked"] = False
        out["forage_permission"] = False
        out["consumption_permission"] = False
        out["product_unlock"] = False
        out["can_auto_unlock"] = False
        out["soft_gates_advisory_only"] = True
        out["metrics_authorize_forage"] = False
        return out

    checks["metrics_present"] = True
    checklist.append(
        _bool_check(
            ok=True,
            criterion="metrics_present",
            detail="Metrics blob present",
            value={"keys": sorted(list(metrics.keys())[:24])},
        )
    )

    is_e20 = _is_e20_experiment(metrics, metrics_path)
    checks["e20_experiment"] = is_e20
    if not is_e20:
        fail_reasons.append("not_e20_source_holdout")
    checklist.append(
        _bool_check(
            ok=is_e20,
            criterion="e20_experiment",
            detail="Must be E20 / source-holdout experiment identity",
            value={
                "version": metrics.get("version"),
                "eval_protocol": metrics.get("eval_protocol"),
            },
        )
    )

    at1 = metrics.get("safety_recall_deadly_at_1")
    at3 = metrics.get("safety_recall_deadly_at_3")
    dual = at1 is not None and at3 is not None
    checks["dual_deadly_keys"] = dual
    if not dual:
        fail_reasons.append("missing_dual_deadly_keys")
    checklist.append(
        _bool_check(
            ok=dual,
            criterion="dual_deadly_keys",
            detail="Both safety_recall_deadly_at_1 and _at_3 required",
            value={"at_1": at1, "at_3": at3},
        )
    )

    map3 = metrics.get("test_map_at_3")
    n_deadly = int(metrics.get("n_deadly_in_test") or 0)
    checks["n_deadly_nonzero"] = n_deadly > 0
    if n_deadly <= 0:
        fail_reasons.append("n_deadly_vacuous")
    checklist.append(
        _bool_check(
            ok=n_deadly > 0,
            criterion="n_deadly_nonzero",
            detail="Deadly eval set must be non-vacuous",
            value=n_deadly,
        )
    )

    gates = evaluate_product_gates(
        float(map3) if map3 is not None else None,
        float(at3) if at3 is not None else None,
        n_deadly,
        soft_map=soft_map,
        soft_deadly=soft_deadly,
    )
    checks["soft_map"] = bool(gates["soft_map"]["pass"])
    checks["soft_deadly_at_3"] = bool(gates["soft_deadly_at_3"]["pass"])
    if not checks["soft_map"]:
        fail_reasons.append("soft_map_fail")
    if not checks["soft_deadly_at_3"]:
        fail_reasons.append("soft_deadly_fail")
    checklist.append(
        _bool_check(
            ok=checks["soft_map"],
            criterion="soft_map",
            detail=f"test_map_at_3 >= {soft_map}",
            value=map3,
        )
    )
    checklist.append(
        _bool_check(
            ok=checks["soft_deadly_at_3"],
            criterion="soft_deadly_at_3",
            detail=f"safety_recall_deadly_at_3 >= {soft_deadly}",
            value=at3,
        )
    )

    if pro_tester_ok is not None:
        if not pro_tester_ok:
            fail_reasons.append("pro_tester_not_pass")
        checklist.append(
            _bool_check(
                ok=bool(pro_tester_ok),
                criterion="pro_tester_pass",
                detail="Professional tester overall PASS",
                value=pro_tester_ok,
            )
        )
    if safe_dp_freeze_ok is not None:
        if not safe_dp_freeze_ok:
            fail_reasons.append("safe_dp_freeze_fail")
        checklist.append(
            _bool_check(
                ok=bool(safe_dp_freeze_ok),
                criterion="safe_dp_freeze",
                detail="Notebook/DataParallel freeze uses _unwrap(model).backbone",
                value=safe_dp_freeze_ok,
            )
        )

    checklist.append(
        _bool_check(
            ok=True,
            criterion="orientation_only_policy",
            detail=(
                "product_unlock forced false; never forage/consumption permission; "
                "soft MAP/deadly gates advisory only"
            ),
        )
    )

    out["gates"] = gates
    out["values"] = {
        "test_map_at_3": map3,
        "safety_recall_deadly_at_1": at1,
        "safety_recall_deadly_at_3": at3,
        "n_deadly_in_test": n_deadly,
        "version": metrics.get("version"),
    }
    # Advisory only: all checks green → eligible *recommendation*, never auto-unlock
    all_ok = all(checks.values())
    out["unlock_eligible_advisory"] = all_ok
    # Hard policy: this helper never sets product_unlock True
    out["product_unlock"] = False
    out["can_auto_unlock"] = False
    out["operator_cycle_required"] = True
    # Re-stamp policy residuals (metrics package never authorizes forage)
    for r in _METRICS_POLICY_RESIDUALS:
        if r not in residual_lock_reasons:
            residual_lock_reasons.append(r)
    if all_ok:
        fail_reasons.append(OPERATOR_CYCLE_REASON)
        residual_lock_reasons.append(OPERATOR_CYCLE_REASON)
        residual_lock_reasons.append("human_operator_must_explicitly_approve_unlock")
        out["operator_action"] = (
            "eligible_but_locked: review checklist, S9 live reject, open-set thr; "
            "only then decide unlock (still orientation-only, never consumption; "
            "unlock_eligible_advisory is not forage permission)"
        )
        out["eligible_but_locked"] = True
    else:
        out["eligible_but_locked"] = False
        out["operator_action"] = "fix_failing_checks_then_re_run_operator_package"
    # Re-assert fail-closed after any mutation
    out["product_unlock"] = False
    out["can_auto_unlock"] = False
    out["forage_permission"] = False
    out["consumption_permission"] = False
    out["soft_gates_advisory_only"] = True
    out["metrics_authorize_forage"] = False
    out["residual_lock_reasons"] = residual_lock_reasons
    return out


def _load_json(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def _pro_tester_signals(repo: Path) -> tuple[bool | None, bool | None, dict[str, Any]]:
    """Read professional_tester_latest for overall PASS + safe_dp_freeze flag."""
    path = repo / "eval" / "reports" / "ml_experiments" / "professional_tester_latest.json"
    blob = _load_json(path)
    meta: dict[str, Any] = {"path": str(path), "present": blob is not None}
    if not blob:
        return None, None, meta
    overall = str(blob.get("overall") or "").upper()
    pro_ok = overall == "PASS"
    meta["overall"] = overall
    meta["product_unlock"] = blob.get("product_unlock")
    safe_dp: bool | None = None
    for suite in blob.get("suites") or []:
        if not isinstance(suite, dict):
            continue
        name = str(suite.get("name") or "")
        if "notebook" not in name.lower() and "S4" not in name:
            # still parse detail if present
            pass
        detail_raw = suite.get("detail")
        detail: dict[str, Any] = {}
        if isinstance(detail_raw, str):
            try:
                parsed = json.loads(detail_raw)
                if isinstance(parsed, dict):
                    detail = parsed
            except json.JSONDecodeError:
                detail = {}
        elif isinstance(detail_raw, dict):
            detail = detail_raw
        if "safe_dp_freeze" in detail:
            safe_dp = bool(detail.get("safe_dp_freeze"))
            meta["safe_dp_freeze"] = safe_dp
            meta["safe_dp_suite"] = name
            break
    return pro_ok, safe_dp, meta


def evaluate_e20_local_artifacts(repo_root: str | Path) -> dict[str, Any]:
    """Scan local kernel_output_v20 metrics for unlock criteria (fail-closed)."""
    root = Path(repo_root)
    metrics_path = root / "kaggle" / "kernel_output_v20" / "models" / "metrics.json"
    pro_ok, safe_dp, _ = _pro_tester_signals(root)
    if not metrics_path.is_file():
        return evaluate_product_unlock_criteria(
            None,
            metrics_path=metrics_path,
            pro_tester_ok=pro_ok,
            safe_dp_freeze_ok=safe_dp,
        )
    metrics = _load_json(metrics_path)
    return evaluate_product_unlock_criteria(
        metrics,
        metrics_path=metrics_path,
        pro_tester_ok=pro_ok,
        safe_dp_freeze_ok=safe_dp,
    )


def build_operator_unlock_package(repo_root: str | Path) -> dict[str, Any]:
    """Single operator-facing package: checklist + residual lock + policy.

    Regenerable from shipped eval helpers. Never sets product_unlock True.
    """
    root = Path(repo_root)
    unlock = evaluate_e20_local_artifacts(root)
    pro_ok, safe_dp, pro_meta = _pro_tester_signals(root)

    # Live S9 snapshot (import local to avoid circular weight)
    try:
        from kaggle.ml_qa.live_reject_monitor import summarize_feedback_log

        live = summarize_feedback_log(repo=root)
    except Exception as exc:  # noqa: BLE001
        live = {
            "status": "unavailable",
            "product_unlock": False,
            "error": str(exc),
            "policy": POLICY,
        }

    criteria_rows = []
    for item in unlock.get("checklist") or []:
        criteria_rows.append(
            {
                "id": item.get("id"),
                "status": item.get("status"),
                "pass": item.get("pass"),
                "detail": item.get("detail"),
                "value": item.get("value"),
            }
        )

    residual = list(unlock.get("residual_lock_reasons") or [])
    for r in _METRICS_POLICY_RESIDUALS:
        if r not in residual:
            residual.append(r)

    package: dict[str, Any] = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "policy": POLICY,
        "product_unlock": False,
        "can_auto_unlock": False,
        "unlock_eligible_advisory": bool(unlock.get("unlock_eligible_advisory")),
        "eligible_but_locked": bool(unlock.get("eligible_but_locked")),
        "operator_cycle_required": True,
        "operator_action": unlock.get("operator_action"),
        "residual_lock_reasons": residual,
        "reasons": list(unlock.get("reasons") or []),
        "checks": dict(unlock.get("checks") or {}),
        "checklist": criteria_rows,
        "values": unlock.get("values"),
        "gates": unlock.get("gates"),
        "metrics_path": unlock.get("metrics_path"),
        "pro_tester": pro_meta,
        "pro_tester_pass": pro_ok,
        "safe_dp_freeze": safe_dp,
        "live_reject_monitor": {
            "status": live.get("status"),
            "n_entries": live.get("n_entries"),
            "reject_rate": live.get("reject_rate"),
            "reasons": live.get("reasons"),
            "product_unlock": False,
            "forage_permission": False,
            "consumption_permission": False,
            "log_path": live.get("log_path"),
        },
        "operator_runbook_path": "docs/OPERATOR_UNLOCK_RUNBOOK.md",
        "regenerate_command": "python -m kaggle.ml_qa.gate_eval",
        "note": FORCED_FALSE_NOTE,
        "forage_permission": False,
        "consumption_permission": False,
        "soft_gates_advisory_only": True,
        "metrics_authorize_forage": False,
    }
    # Absolute fail-closed
    package["product_unlock"] = False
    package["can_auto_unlock"] = False
    package["forage_permission"] = False
    package["consumption_permission"] = False
    package["soft_gates_advisory_only"] = True
    package["metrics_authorize_forage"] = False
    return package


def render_operator_unlock_markdown(package: dict[str, Any]) -> str:
    """Human-readable operator checklist from package JSON."""
    lines = [
        "# Operator unlock checklist (fail-closed)",
        "",
        f"- **Generated:** {package.get('generated')}",
        f"- **Policy:** `{package.get('policy')}`",
        f"- **product_unlock:** **{package.get('product_unlock')}** (always false from package)",
        f"- **unlock_eligible_advisory:** {package.get('unlock_eligible_advisory')} "
        f"(advisory only — **not** forage permission)",
        f"- **eligible_but_locked:** {package.get('eligible_but_locked')}",
        f"- **operator_cycle_required:** {package.get('operator_cycle_required')}",
        f"- **can_auto_unlock:** {package.get('can_auto_unlock')}",
        f"- **forage_permission / consumption_permission:** false / false",
        f"- **soft_gates_advisory_only:** true (MAP/deadly never authorize forage)",
        "",
        "## Residual lock reasons",
        "",
    ]
    for r in package.get("residual_lock_reasons") or []:
        lines.append(f"- `{r}`")
    lines.extend(["", "## Checklist", ""])
    lines.append("| Criterion | Status | Detail |")
    lines.append("|---|---|---|")
    for row in package.get("checklist") or []:
        lines.append(
            f"| `{row.get('id')}` | **{row.get('status')}** | {row.get('detail')} |"
        )
    lines.extend(
        [
            "",
            "## Operator action",
            "",
            str(package.get("operator_action") or "review"),
            "",
            "## Live reject monitor (S9 snapshot)",
            "",
            f"- status: `{((package.get('live_reject_monitor') or {}).get('status'))}`",
            f"- n_entries: `{(package.get('live_reject_monitor') or {}).get('n_entries')}`",
            f"- reject_rate: `{(package.get('live_reject_monitor') or {}).get('reject_rate')}`",
            f"- reasons: `{(package.get('live_reject_monitor') or {}).get('reasons')}`",
            "",
            "## Operator runbook",
            "",
            f"- path: `{package.get('operator_runbook_path') or 'docs/OPERATOR_UNLOCK_RUNBOOK.md'}`",
            f"- regenerate: `{package.get('regenerate_command') or 'python -m kaggle.ml_qa.gate_eval'}`",
            "",
            "## Note",
            "",
            str(package.get("note") or FORCED_FALSE_NOTE),
            "",
            "Orientation only — never consumption.",
            "",
        ]
    )
    return "\n".join(lines)


def write_operator_unlock_package(
    repo_root: str | Path,
    *,
    out_dir: str | Path | None = None,
) -> dict[str, Any]:
    """Write operator_unlock_checklist.{json,md} under eval/reports/ml_experiments."""
    root = Path(repo_root)
    package = build_operator_unlock_package(root)
    dest = Path(out_dir) if out_dir else (root / "eval" / "reports" / "ml_experiments")
    dest.mkdir(parents=True, exist_ok=True)
    json_path = dest / "operator_unlock_checklist.json"
    md_path = dest / "operator_unlock_checklist.md"
    json_path.write_text(
        json.dumps(package, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    md_path.write_text(render_operator_unlock_markdown(package), encoding="utf-8")
    package["artifacts"] = {"json": str(json_path), "md": str(md_path)}
    return package


if __name__ == "__main__":
    import sys

    repo = Path(__file__).resolve().parents[2]
    if len(sys.argv) > 1:
        repo = Path(sys.argv[1])
    pkg = write_operator_unlock_package(repo)
    print(json.dumps(pkg, indent=2, ensure_ascii=False))
