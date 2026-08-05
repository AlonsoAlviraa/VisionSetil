#!/usr/bin/env python3
"""Refresh ML operator handoff from SSOT metrics + anti-leak rails.

Reads measured E20 metrics only (never invents MAP/deadly/ECE).
Writes / refreshes:
  eval/reports/ml_experiments/E20_BASELINE_METRICS_TO_IMPROVE.json  (SSOT numbers)
  eval/reports/ml_experiments/loop_operator_handoff_latest.json
  eval/reports/ml_experiments/loop_operator_handoff_latest.md

Always product_unlock=false, can_auto_unlock=false, forage/consumption=false.
Dual ECE: primary = train-published; posthoc is separate lab-only sidecar.

Usage:
  python scripts/loop_ml_operator_handoff.py
  python scripts/loop_ml_operator_handoff.py --models-dir PATH
  python scripts/loop_ml_operator_handoff.py --skip-rails   # do not re-run rails (read latest)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.verify_anti_leak_rails_for_train import (  # noqa: E402
    OUT_JSON as RAILS_OUT,
    evaluate_anti_leak_rails,
    resolve_models_dir,
    write_report as write_rails_report,
)

POLICY = "orientation_only_never_consume"
REPORT_DIR = ROOT / "eval" / "reports" / "ml_experiments"
SSOT_PATH = REPORT_DIR / "E20_BASELINE_METRICS_TO_IMPROVE.json"
HANDOFF_JSON = REPORT_DIR / "loop_operator_handoff_latest.json"
HANDOFF_MD = REPORT_DIR / "loop_operator_handoff_latest.md"
DEFAULT_MODELS = ROOT / "kaggle" / "kernel_output_v20" / "models"

SOFT_MAP = 0.25
SOFT_DEADLY = 0.90


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_json(path: Path) -> Any | None:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _f(v: Any) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _measured_block(metrics: dict[str, Any], *, source_path: str) -> dict[str, Any]:
    """Build SSOT payload exclusively from a measured metrics blob."""
    ece_primary = _f(metrics.get("test_ece_train_published"))
    if ece_primary is None:
        ece_primary = _f(metrics.get("test_ece"))
    ece_posthoc = _f(metrics.get("test_ece_posthoc"))
    temp_train = _f(metrics.get("temperature_train"))
    if temp_train is None:
        temp_train = _f(metrics.get("temperature"))
    map3 = _f(metrics.get("test_map_at_3"))
    d1 = _f(metrics.get("safety_recall_deadly_at_1"))
    d3 = _f(metrics.get("safety_recall_deadly_at_3"))
    n_deadly = metrics.get("n_deadly_in_test") or metrics.get("n_deadly") or metrics.get("n_deadly_eval")

    soft_map_pass = map3 is not None and map3 >= SOFT_MAP
    soft_deadly_pass = d3 is not None and d3 >= SOFT_DEADLY
    dual_deadly = d1 is not None and d3 is not None

    return {
        "generated_at": _utc_now(),
        "metrics_label": "[MEASURED]",
        "source_metrics_path": source_path,
        "checkpoint": "kaggle/kernel_output_v20/models",
        "version": metrics.get("version"),
        "eval_protocol": metrics.get("eval_protocol") or "source_holdout_e20",
        "test_domain": metrics.get("test_domain"),
        "train_domain": metrics.get("train_domain"),
        "policy": POLICY,
        "product_unlock": False,
        "can_auto_unlock": False,
        "forage_permission": False,
        "consumption_permission": False,
        "lab_only": True,
        "measured": {
            "test_map_at_3": map3,
            "test_map_at_3_ci_low": _f(metrics.get("test_map_at_3_ci_low")),
            "test_map_at_3_ci_high": _f(metrics.get("test_map_at_3_ci_high")),
            "safety_recall_deadly_at_1": d1,
            "safety_recall_deadly_at_3": d3,
            "n_deadly_in_test": n_deadly,
            "test_accuracy": _f(metrics.get("test_accuracy")),
            "test_f1_macro": _f(metrics.get("test_f1_macro")),
            "test_balanced_accuracy": _f(metrics.get("test_balanced_accuracy")),
            "num_classes": metrics.get("num_classes"),
            "num_train_obs": metrics.get("num_train_obs"),
            "num_val_obs": metrics.get("num_val_obs"),
            "num_test_obs": metrics.get("num_test_obs"),
            "primary_checkpoint": metrics.get("primary_checkpoint"),
            "honesty_dual_recompute_at": metrics.get("honesty_dual_recompute_at"),
        },
        "ece": {
            "primary": "train_published",
            "primary_value": ece_primary,
            "test_ece": _f(metrics.get("test_ece")),
            "test_ece_train_published": ece_primary,
            "posthoc_separate": True,
            "posthoc_value": ece_posthoc,
            "test_ece_posthoc": ece_posthoc,
            "temperature_train": temp_train,
            "temperature_posthoc": _f(metrics.get("temperature_posthoc")),
            "posthoc_finetune": metrics.get("posthoc_finetune"),
            "note": (
                "Primary ECE is train-published (serve/advisory). "
                "Posthoc temperature search is lab-only and must not replace primary."
            ),
        },
        "soft_gates_advisory": {
            "soft_map_threshold": SOFT_MAP,
            "soft_deadly_at_3_threshold": SOFT_DEADLY,
            "soft_map_pass": soft_map_pass,
            "soft_deadly_at_3_pass": soft_deadly_pass,
            "dual_deadly_keys_present": dual_deadly,
            "note": "Advisory only — never unlock Identify from soft gates alone.",
        },
        "improve_targets": {
            "note": (
                "Targets are directional lab goals, not product unlock criteria. "
                "Do not treat gap closure as forage permission."
            ),
            "ece_primary_high_residual": bool(ece_primary is not None and ece_primary >= 0.12),
            "deadly_at_1_room": bool(d1 is not None and d1 < 0.90),
            "map_at_3_room": bool(map3 is not None and map3 < 0.90),
            "lepiota_focus": "E20b Lepiota FT when rails green (operator/lab)",
        },
        "never_hardcode_in_pr_titles": True,
        "citation_rule": "Copy [MEASURED] values from this file at run time; do not round in PR titles.",
    }


def bootstrap_or_refresh_ssot(
    *,
    models_dir: Path | None,
    force_refresh: bool = True,
) -> tuple[dict[str, Any] | None, list[str]]:
    """Load SSOT; optionally refresh from measured metrics.json when available."""
    gaps: list[str] = []
    mdir = resolve_models_dir(models_dir)
    metrics_path = (mdir / "metrics.json") if mdir else None
    metrics = _load_json(metrics_path) if metrics_path else None

    existing = _load_json(SSOT_PATH)
    if isinstance(metrics, dict) and force_refresh:
        ssot = _measured_block(metrics, source_path=str(metrics_path))
        SSOT_PATH.parent.mkdir(parents=True, exist_ok=True)
        SSOT_PATH.write_text(
            json.dumps(ssot, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        return ssot, gaps

    if isinstance(existing, dict) and existing.get("measured"):
        return existing, gaps

    if isinstance(metrics, dict):
        ssot = _measured_block(metrics, source_path=str(metrics_path))
        SSOT_PATH.parent.mkdir(parents=True, exist_ok=True)
        SSOT_PATH.write_text(
            json.dumps(ssot, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        return ssot, gaps

    # Last-resort: rehydrate from prior handoff / operator checklist measured fields only
    for fallback in (
        HANDOFF_JSON,
        REPORT_DIR / "operator_unlock_checklist.json",
        REPORT_DIR / "e20_ece_residual.json",
        REPORT_DIR / "e20_unlock_eval.json",
    ):
        blob = _load_json(fallback)
        if not isinstance(blob, dict):
            continue
        # operator package values
        values = blob.get("values") if isinstance(blob.get("values"), dict) else {}
        honesty = blob.get("honesty") if isinstance(blob.get("honesty"), dict) else {}
        measured_src = blob.get("measured") if isinstance(blob.get("measured"), dict) else {}
        candidate = {
            "test_map_at_3": (
                measured_src.get("test_map_at_3")
                or values.get("test_map_at_3")
                or blob.get("test_map_at_3")
                or honesty.get("map_at_3")
            ),
            "safety_recall_deadly_at_1": (
                measured_src.get("safety_recall_deadly_at_1")
                or values.get("safety_recall_deadly_at_1")
                or honesty.get("deadly_at_1")
            ),
            "safety_recall_deadly_at_3": (
                measured_src.get("safety_recall_deadly_at_3")
                or values.get("safety_recall_deadly_at_3")
                or honesty.get("deadly_at_3")
                or blob.get("safety_recall_deadly_at_3")
            ),
            "n_deadly_in_test": (
                measured_src.get("n_deadly_in_test")
                or values.get("n_deadly_in_test")
                or honesty.get("n_deadly")
            ),
            "test_ece": blob.get("test_ece") or measured_src.get("test_ece"),
            "test_ece_train_published": (
                (blob.get("ece") or {}).get("primary_value")
                if isinstance(blob.get("ece"), dict)
                else None
            )
            or blob.get("test_ece"),
            "version": values.get("version") or blob.get("version") or "v20-E20-source-holdout",
            "eval_protocol": blob.get("eval_protocol") or "source_holdout_e20",
            "test_domain": blob.get("test_domain"),
            "temperature": blob.get("temperature"),
        }
        if candidate["test_map_at_3"] is None and candidate["safety_recall_deadly_at_3"] is None:
            continue
        gaps.append(f"ssot_bootstrapped_from_fallback:{fallback.name}")
        ssot = _measured_block(candidate, source_path=str(fallback))
        ssot["bootstrap_gap"] = True
        ssot["bootstrap_source"] = str(fallback)
        SSOT_PATH.parent.mkdir(parents=True, exist_ok=True)
        SSOT_PATH.write_text(
            json.dumps(ssot, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        return ssot, gaps

    gaps.append("ssot_and_metrics_missing")
    return None, gaps


def _fmt_pct(x: float | None, digits: int = 4) -> str:
    if x is None:
        return "n/a"
    return f"{x:.{digits}f}"


def build_handoff(
    *,
    ssot: dict[str, Any] | None,
    rails: dict[str, Any],
    models_dir: Path | None,
    ssot_gaps: list[str],
) -> dict[str, Any]:
    measured = (ssot or {}).get("measured") if isinstance(ssot, dict) else {}
    ece = (ssot or {}).get("ece") if isinstance(ssot, dict) else {}
    soft = (ssot or {}).get("soft_gates_advisory") if isinstance(ssot, dict) else {}
    if not isinstance(measured, dict):
        measured = {}
    if not isinstance(ece, dict):
        ece = {}
    if not isinstance(soft, dict):
        soft = {}

    can_stage = bool(rails.get("can_stage_train_notebook") or rails.get("can_stage"))
    metrics_present = bool(measured.get("test_map_at_3") is not None)
    dual_ok = bool(soft.get("dual_deadly_keys_present"))
    soft_ok = bool(soft.get("soft_map_pass") and soft.get("soft_deadly_at_3_pass"))

    gaps = list(ssot_gaps) + list(rails.get("gaps") or [])
    if not metrics_present:
        gaps.append("measured_metrics_absent")

    if can_stage and metrics_present:
        status = "ready_for_lab_loop"
        operator_action = (
            "Rails green + SSOT metrics present. Continue lab loop "
            "(E20b diagnose / E20c pull / friction iters). "
            "Stage notebook only via stage script; never auto push; never product_unlock."
        )
    elif can_stage:
        status = "rails_ok_metrics_gap"
        operator_action = (
            "Rails green but SSOT metrics incomplete — refresh metrics from E20 models "
            "before citing numbers in PRs."
        )
    elif metrics_present:
        status = "metrics_ok_rails_blocked"
        operator_action = (
            rails.get("operator_action")
            or "Fix anti-leak rails / provide models dir before staging train notebook."
        )
    else:
        status = "blocked_gaps"
        operator_action = (
            "GAP: missing measured metrics and/or anti-leak artifacts. "
            "Provide kaggle/kernel_output_v20/models or VISIONSETIL_MODELS_DIR; "
            "still keep product_unlock=false."
        )

    unlock_pkg = _load_json(REPORT_DIR / "operator_unlock_checklist.json")
    unlock_eligible = None
    if isinstance(unlock_pkg, dict):
        unlock_eligible = unlock_pkg.get("unlock_eligible_advisory")

    handoff: dict[str, Any] = {
        "generated_at": _utc_now(),
        "policy": POLICY,
        "product_unlock": False,
        "can_auto_unlock": False,
        "forage_permission": False,
        "consumption_permission": False,
        "lab_only": True,
        "kaggle_push": False,
        "auto_kaggle_push": False,
        "status": status,
        "can_stage_train_notebook": can_stage,
        "can_stage": can_stage,
        "operator_action": operator_action,
        "metrics_label": "[MEASURED]",
        "ssot_path": str(SSOT_PATH),
        "ssot_present": ssot is not None,
        "models_dir": str(models_dir) if models_dir else rails.get("models_dir"),
        "measured": {
            "test_map_at_3": measured.get("test_map_at_3"),
            "safety_recall_deadly_at_1": measured.get("safety_recall_deadly_at_1"),
            "safety_recall_deadly_at_3": measured.get("safety_recall_deadly_at_3"),
            "n_deadly_in_test": measured.get("n_deadly_in_test"),
            "test_accuracy": measured.get("test_accuracy"),
            "num_classes": measured.get("num_classes"),
            "num_train_obs": measured.get("num_train_obs"),
            "num_test_obs": measured.get("num_test_obs"),
            "version": (ssot or {}).get("version"),
            "eval_protocol": (ssot or {}).get("eval_protocol"),
            "test_domain": (ssot or {}).get("test_domain"),
            "train_domain": (ssot or {}).get("train_domain"),
        },
        "ece": {
            "primary": "train_published",
            "primary_value": ece.get("primary_value"),
            "posthoc_separate": True,
            "posthoc_value": ece.get("posthoc_value"),
            "temperature_train": ece.get("temperature_train"),
            "temperature_posthoc": ece.get("temperature_posthoc"),
            "note": ece.get("note"),
        },
        "soft_gates_advisory": soft,
        "rails": {
            "status": rails.get("status"),
            "can_stage_train_notebook": can_stage,
            "fail_reasons": rails.get("fail_reasons") or [],
            "gaps": rails.get("gaps") or [],
            "report_path": str(RAILS_OUT),
        },
        "unlock_advisory": {
            "unlock_eligible_advisory": unlock_eligible,
            "product_unlock": False,
            "note": (
                "Advisory eligibility from operator package is never an auto unlock. "
                "Human operator cycle required; orientation only."
            ),
        },
        "pipeline_next": [
            "1) verify_anti_leak_rails_for_train.py (this handoff embeds rails)",
            "2) E20b diagnose JSON always before any relaunch (≤1 auto if rails OK)",
            "3) E20c pull + post_train_suite + compare vs SSOT file",
            "4) Fresh loop_iter frictions (open-set / deadly@1 / hotspots / ECE dual)",
            "5) stage_train_notebook_if_rails_ok.py only if can_stage — no auto push",
        ],
        "never": [
            "auto product_unlock=true",
            "pick max(MAP) across kernels for serve gate",
            "contaminate GBIF ES holdout",
            "sell posthoc ECE as primary",
            "forage or consumption permission",
        ],
        "gaps": gaps,
        "honesty": {
            "metrics_from_ssot_only": True,
            "dual_ece_primary": "train_published",
            "open_set_honesty": True,
            "map_is_not_safety": True,
            "product_unlock_forced_false": True,
        },
        "note": (
            "Operator handoff for VisionSetil ML lab loop. "
            "Metrics cited only from E20_BASELINE_METRICS_TO_IMPROVE.json [MEASURED]. "
            "product_unlock remains false."
        ),
    }
    return handoff


def render_md(handoff: dict[str, Any]) -> str:
    m = handoff.get("measured") or {}
    e = handoff.get("ece") or {}
    r = handoff.get("rails") or {}
    soft = handoff.get("soft_gates_advisory") or {}
    lines = [
        "# Loop operator handoff (latest)",
        "",
        f"**Generated:** `{handoff.get('generated_at')}`  ",
        f"**Status:** `{handoff.get('status')}`  ",
        f"**Policy:** `{handoff.get('policy')}`  ",
        f"**product_unlock:** `{handoff.get('product_unlock')}` (forced false)  ",
        f"**can_stage_train_notebook:** `{handoff.get('can_stage_train_notebook')}`  ",
        f"**Lab only:** `{handoff.get('lab_only')}` · **kaggle_push:** `{handoff.get('kaggle_push')}`",
        "",
        "## Operator action",
        "",
        str(handoff.get("operator_action") or ""),
        "",
        "## Measured metrics (SSOT)",
        "",
        f"Source file: `{handoff.get('ssot_path')}`  ",
        f"Label: `{handoff.get('metrics_label')}` — copy values; do not invent / hardcode in PR titles.",
        "",
        "| Metric | [MEASURED] |",
        "|--------|------------|",
        f"| MAP@3 | {_fmt_pct(m.get('test_map_at_3'))} |",
        f"| deadly@1 | {_fmt_pct(m.get('safety_recall_deadly_at_1'))} |",
        f"| deadly@3 | {_fmt_pct(m.get('safety_recall_deadly_at_3'))} |",
        f"| n_deadly | {m.get('n_deadly_in_test')} |",
        f"| ECE primary (train-published) | {_fmt_pct(e.get('primary_value'))} |",
        f"| ECE posthoc (lab-only) | {_fmt_pct(e.get('posthoc_value'))} |",
        f"| version | `{m.get('version')}` |",
        f"| eval_protocol | `{m.get('eval_protocol')}` |",
        f"| test_domain | `{m.get('test_domain')}` |",
        "",
        "### Soft gates (advisory only)",
        "",
        f"- soft MAP@3 ≥ {SOFT_MAP}: `{soft.get('soft_map_pass')}`",
        f"- soft deadly@3 ≥ {SOFT_DEADLY}: `{soft.get('soft_deadly_at_3_pass')}`",
        f"- dual deadly keys: `{soft.get('dual_deadly_keys_present')}`",
        "",
        "> Soft gates never authorize product_unlock, forage, or consumption.",
        "",
        "## Dual ECE honesty",
        "",
        f"- **Primary:** train-published = `{_fmt_pct(e.get('primary_value'))}`",
        f"- **Posthoc (separate, no serve):** `{_fmt_pct(e.get('posthoc_value'))}`",
        f"- temperature_train: `{e.get('temperature_train')}` · temperature_posthoc: `{e.get('temperature_posthoc')}`",
        "",
        "## Anti-leak rails",
        "",
        f"- rails status: `{r.get('status')}`",
        f"- can_stage: `{r.get('can_stage_train_notebook')}`",
        f"- report: `{r.get('report_path')}`",
        f"- fail_reasons: `{', '.join(r.get('fail_reasons') or []) or 'none'}`",
        f"- gaps: `{', '.join(r.get('gaps') or []) or 'none'}`",
        "",
        "## Pipeline next",
        "",
    ]
    for step in handoff.get("pipeline_next") or []:
        lines.append(f"- {step}")
    lines.extend(
        [
            "",
            "## Never",
            "",
        ]
    )
    for n in handoff.get("never") or []:
        lines.append(f"- {n}")
    gaps = handoff.get("gaps") or []
    if gaps:
        lines.extend(["", "## GAPs", ""])
        for g in gaps:
            lines.append(f"- {g}")
    lines.extend(
        [
            "",
            "---",
            "",
            "_Orientation only · never consumption · product_unlock=false_",
            "",
        ]
    )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--models-dir", type=Path, default=None)
    ap.add_argument(
        "--skip-rails",
        action="store_true",
        help="Read existing anti_leak_rails_train_latest.json instead of re-running",
    )
    ap.add_argument(
        "--no-refresh-ssot",
        action="store_true",
        help="Do not overwrite SSOT when metrics.json is present (use existing SSOT if any)",
    )
    args = ap.parse_args(argv)

    mdir = resolve_models_dir(args.models_dir)

    if args.skip_rails:
        rails = _load_json(RAILS_OUT)
        if not isinstance(rails, dict):
            rails = evaluate_anti_leak_rails(models_dir=args.models_dir)
            write_rails_report(rails)
    else:
        rails = evaluate_anti_leak_rails(models_dir=args.models_dir)
        write_rails_report(rails)

    ssot, ssot_gaps = bootstrap_or_refresh_ssot(
        models_dir=args.models_dir,
        force_refresh=not args.no_refresh_ssot,
    )
    handoff = build_handoff(
        ssot=ssot,
        rails=rails,
        models_dir=mdir,
        ssot_gaps=ssot_gaps,
    )

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    HANDOFF_JSON.write_text(
        json.dumps(handoff, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    HANDOFF_MD.write_text(render_md(handoff), encoding="utf-8")

    print(f"Wrote {SSOT_PATH if ssot else '(SSOT missing)'}")
    print(f"Wrote {HANDOFF_JSON}")
    print(f"Wrote {HANDOFF_MD}")
    print(f"Wrote {RAILS_OUT}")
    print(
        f"status={handoff['status']} can_stage={handoff['can_stage_train_notebook']} "
        f"product_unlock={handoff['product_unlock']}"
    )
    if handoff.get("gaps"):
        print("gaps:", ", ".join(str(g) for g in handoff["gaps"]))

    # Handoff always succeeds as a report writer; rails exit semantics live in verify script.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
