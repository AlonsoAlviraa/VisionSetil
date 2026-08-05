#!/usr/bin/env python3
"""Stage next train notebook ONLY if anti-leak rails are green.

Writes:
  eval/reports/ml_experiments/stage_train_notebook_latest.json
  kaggle/push_e20/  (notebook + kernel-metadata.json) when staged

Insights (lookalike hotspots, deadly@1, hard-neg pairs) are OPTIONAL:
  recorded / copied as sidecars when present; never block staging alone.

NEVER auto-push Kaggle. product_unlock always false.
  --push is human-only and requires --i-accept-operator-responsibility.

Usage:
  python scripts/stage_train_notebook_if_rails_ok.py
  python scripts/stage_train_notebook_if_rails_ok.py --models-dir PATH
  python scripts/stage_train_notebook_if_rails_ok.py --rebuild-notebook
  # Human push only (still no product_unlock):
  python scripts/stage_train_notebook_if_rails_ok.py --push --i-accept-operator-responsibility
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.verify_anti_leak_rails_for_train import (  # noqa: E402
    OUT_JSON as RAILS_OUT,
    _repo_rel,
    evaluate_anti_leak_rails,
    resolve_models_dir,
    write_report as write_rails_report,
)

POLICY = "orientation_only_never_consume"
REPORT_DIR = ROOT / "eval" / "reports" / "ml_experiments"
OUT_JSON = REPORT_DIR / "stage_train_notebook_latest.json"

KAGGLE_DIR = ROOT / "kaggle"
STAGING_DIR = KAGGLE_DIR / "push_e20"
NOTEBOOK_NAME = "visionsetil_exp_v20_source_holdout.ipynb"
NOTEBOOK_SRC = KAGGLE_DIR / NOTEBOOK_NAME
META_SRC = KAGGLE_DIR / "kernel-metadata-exp-v20.json"
BUILD_SCRIPT = KAGGLE_DIR / "build_exp_v20_source_holdout.py"
KERNEL_SLUG = "alonsoalviraaaa/visionsetil-exp-v20-source-holdout"
FT_DATASET = "picekl/fungitastic"
GBIF_DATASET = "alonsoalviraaaa/visionsetil-gbif-es-allowlist40"

def _hard_neg_candidates() -> list[Path]:
    """Portable hard-neg paths (in-repo + optional VISIONSETIL_DATA_DIR)."""
    cands = [ROOT / "data" / "industrial_v1" / "hard_negative_pairs_e20.json"]
    data_env = (os.environ.get("VISIONSETIL_DATA_DIR") or "").strip()
    if data_env:
        cands.append(Path(data_env) / "industrial_v1" / "hard_negative_pairs_e20.json")
    # Sibling of models dir when VISIONSETIL_MODELS_DIR points at .../kernel_output_v20/models
    models_env = (os.environ.get("VISIONSETIL_MODELS_DIR") or "").strip()
    if models_env:
        md = Path(models_env)
        # .../VISIONSETIL/kaggle/kernel_output_v20/models → .../VISIONSETIL/data/industrial_v1
        try:
            repo_guess = md.resolve().parents[2]  # up from models → kernel_output → kaggle → repo
            cands.append(repo_guess / "data" / "industrial_v1" / "hard_negative_pairs_e20.json")
        except (IndexError, OSError):
            pass
    return cands

# Optional insight globs under eval/reports/ml_experiments (not hard deps)
INSIGHT_GLOBS = (
    "loop_iter*hotspot*.json",
    "loop_iter*deadly*.json",
    "*lookalike_hotspot*.json",
    "*deadly_at1*.json",
    "e20_pair_metrics.json",
    "dual_deadly_honest_recompute.json",
    "*lepiota*inventory*.json",
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_json(path: Path) -> Any | None:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def discover_optional_insights(report_dir: Path = REPORT_DIR) -> dict[str, Any]:
    """Find optional loop insights. Missing = GAP note, not a block."""
    found: list[dict[str, Any]] = []
    seen: set[str] = set()
    if report_dir.is_dir():
        for pattern in INSIGHT_GLOBS:
            for p in sorted(report_dir.glob(pattern)):
                if not p.is_file():
                    continue
                key = p.name
                if key in seen:
                    continue
                seen.add(key)
                found.append(
                    {
                        "name": key,
                        "path": _repo_rel(p) or str(p),
                        "size_bytes": p.stat().st_size,
                    }
                )

    hard_neg_path: Path | None = None
    for cand in _hard_neg_candidates():
        if cand and cand.is_file():
            hard_neg_path = cand
            break

    hard_neg_payload = _load_json(hard_neg_path) if hard_neg_path else None
    focus_taxa: list[str] = []
    hard_neg_pairs: list[dict[str, Any]] = []
    if isinstance(hard_neg_payload, dict):
        pairs = hard_neg_payload.get("pairs") or []
        if isinstance(pairs, list):
            for pair in pairs:
                if not isinstance(pair, dict):
                    continue
                hard_neg_pairs.append(
                    {
                        "id": pair.get("id"),
                        "taxa": pair.get("taxa"),
                        "priority": pair.get("priority"),
                    }
                )
                for t in pair.get("taxa") or []:
                    if isinstance(t, str) and t not in focus_taxa:
                        focus_taxa.append(t)

    gaps: list[str] = []
    if not found:
        gaps.append("loop_insight_jsons_absent_optional")
    if hard_neg_path is None:
        gaps.append("hard_negative_pairs_absent_optional")

    return {
        "optional": True,
        "insights_present": bool(found) or hard_neg_path is not None,
        "insight_files": found,
        "hard_negative_pairs_path": (
            _repo_rel(hard_neg_path) if hard_neg_path else None
        ),
        "hard_negative_pairs_resolved": (
            str(hard_neg_path.resolve()) if hard_neg_path else None
        ),
        "hard_negative_pair_count": len(hard_neg_pairs),
        "hard_negative_pairs": hard_neg_pairs,
        "focus_taxa": focus_taxa,
        "gaps": gaps,
        "note": (
            "Insights optional for ML-07: stage proceeds on rails alone; "
            "hard_neg/focus used when present for sampler/boost sidecars."
        ),
    }


def ensure_notebook(*, rebuild: bool = False) -> tuple[Path | None, list[str]]:
    """Return notebook path or None + gaps. Optional rebuild via build_exp_v20."""
    gaps: list[str] = []
    if rebuild or not NOTEBOOK_SRC.is_file():
        if not BUILD_SCRIPT.is_file():
            gaps.append("build_exp_v20_script_missing")
            return None, gaps
        print(" $", sys.executable, str(BUILD_SCRIPT))
        r = subprocess.run(
            [sys.executable, str(BUILD_SCRIPT)],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
        )
        if r.stdout:
            print(r.stdout[-2000:] if len(r.stdout) > 2000 else r.stdout)
        if r.stderr:
            print(r.stderr[-1000:] if len(r.stderr) > 1000 else r.stderr, file=sys.stderr)
        if r.returncode != 0:
            gaps.append("notebook_rebuild_failed")
            return None, gaps
    if not NOTEBOOK_SRC.is_file():
        gaps.append("notebook_source_missing")
        return None, gaps
    if not META_SRC.is_file():
        gaps.append("kernel_metadata_source_missing")
        return None, gaps
    return NOTEBOOK_SRC, gaps


def build_kernel_metadata() -> dict[str, Any]:
    meta = json.loads(META_SRC.read_text(encoding="utf-8"))
    meta["code_file"] = NOTEBOOK_NAME
    meta["id"] = KERNEL_SLUG
    meta["enable_gpu"] = True
    ds = list(meta.get("dataset_sources") or [])
    if FT_DATASET not in ds:
        ds.insert(0, FT_DATASET)
    if GBIF_DATASET not in ds:
        ds.append(GBIF_DATASET)
    meta["dataset_sources"] = ds
    return meta


def stage_notebook(
    notebook: Path,
    insights: dict[str, Any],
    *,
    staging_dir: Path = STAGING_DIR,
) -> dict[str, Any]:
    """Copy notebook + metadata into kaggle/push_e20. Never push."""
    if staging_dir.exists():
        shutil.rmtree(staging_dir)
    staging_dir.mkdir(parents=True)

    meta = build_kernel_metadata()
    dest_nb = staging_dir / NOTEBOOK_NAME
    dest_meta = staging_dir / "kernel-metadata.json"
    shutil.copy2(notebook, dest_nb)
    dest_meta.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")

    sidecars: list[str] = []
    # Optional hard-neg sidecar for operator / future notebook inject
    hn_resolved = insights.get("hard_negative_pairs_resolved")
    if hn_resolved:
        src = Path(hn_resolved)
        if src.is_file():
            dest_hn = staging_dir / "hard_negative_pairs_e20.json"
            shutil.copy2(src, dest_hn)
            sidecars.append(_repo_rel(dest_hn) or str(dest_hn))

    # Focus summary for human operator (lab only)
    focus_path = staging_dir / "stage_focus_sidecar.json"
    focus_payload = {
        "generated_at": _utc_now(),
        "policy": POLICY,
        "product_unlock": False,
        "forage_permission": False,
        "consumption_permission": False,
        "focus_taxa": insights.get("focus_taxa") or [],
        "hard_negative_pairs": insights.get("hard_negative_pairs") or [],
        "insight_files": insights.get("insight_files") or [],
        "note": (
            "Optional focus/hard-neg for next train. Orientation only — "
            "never consumption. Not auto-injected into training loops."
        ),
    }
    focus_path.write_text(
        json.dumps(focus_payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    sidecars.append(_repo_rel(focus_path) or str(focus_path))

    return {
        "staged": True,
        "staging_dir": _repo_rel(staging_dir) or str(staging_dir),
        "notebook": _repo_rel(dest_nb) or str(dest_nb),
        "kernel_metadata": _repo_rel(dest_meta) or str(dest_meta),
        "kernel_slug": KERNEL_SLUG,
        "notebook_bytes": dest_nb.stat().st_size,
        "sidecars": sidecars,
        "dataset_sources": meta.get("dataset_sources"),
        "enable_gpu": True,
    }


def attempt_human_push(
    staging_dir: Path,
    *,
    confirm: bool,
    execute: bool,
) -> dict[str, Any]:
    """Human-only push. Fail-closed without confirm+execute. Never product_unlock."""
    out: dict[str, Any] = {
        "requested": True,
        "attempted": False,
        "success": False,
        "auto_kaggle_push": False,
        "product_unlock": False,
        "dry_run": True,
        "missing": [],
        "returncode": None,
        "output_tail": "",
    }
    if not confirm:
        out["missing"].append("--i-accept-operator-responsibility")
    if not execute:
        out["missing"].append("--execute")
    if not staging_dir.is_dir():
        out["missing"].append("staging_dir")
    if not (staging_dir / "kernel-metadata.json").is_file():
        out["missing"].append("kernel-metadata.json")
    if not any(staging_dir.glob("*.ipynb")):
        out["missing"].append("notebook")

    if out["missing"]:
        out["status"] = "blocked_human_gates"
        out["note"] = (
            "Push is human-only. Require --push --i-accept-operator-responsibility "
            "--execute. Default stage path never pushes."
        )
        return out

    # Even with flags, this PR path defaults dry unless --execute (already gated)
    cmd = ["kaggle", "kernels", "push", "-p", str(staging_dir)]
    print(" $", " ".join(cmd))
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=str(ROOT))
    tail = ((r.stdout or "") + (r.stderr or ""))[-4000:]
    out.update(
        {
            "attempted": True,
            "dry_run": False,
            "success": r.returncode == 0,
            "returncode": r.returncode,
            "output_tail": tail,
            "status": "pushed" if r.returncode == 0 else "push_failed",
            "cmd": cmd,
            "monitor": f"https://www.kaggle.com/code/{KERNEL_SLUG}",
        }
    )
    if r.stdout:
        print(r.stdout[-2000:] if len(r.stdout) > 2000 else r.stdout)
    if r.stderr:
        print(r.stderr[-1000:] if len(r.stderr) > 1000 else r.stderr, file=sys.stderr)
    return out


def evaluate_and_stage(
    *,
    models_dir: Path | None = None,
    rebuild_notebook: bool = False,
    want_push: bool = False,
    push_confirm: bool = False,
    push_execute: bool = False,
    skip_rails_refresh: bool = False,
) -> dict[str, Any]:
    """Core pipeline. product_unlock always false. Stage-only by default."""
    mdir = resolve_models_dir(models_dir)

    if skip_rails_refresh and RAILS_OUT.is_file():
        rails = _load_json(RAILS_OUT)
        if not isinstance(rails, dict):
            rails = evaluate_anti_leak_rails(models_dir=models_dir)
            write_rails_report(rails)
    else:
        rails = evaluate_anti_leak_rails(models_dir=models_dir)
        write_rails_report(rails)

    can_stage = bool(
        rails.get("can_stage_train_notebook") or rails.get("can_stage")
    )
    insights = discover_optional_insights()
    gaps: list[str] = list(rails.get("gaps") or []) + list(insights.get("gaps") or [])

    staged_info: dict[str, Any] | None = None
    notebook_gaps: list[str] = []
    push_info: dict[str, Any] | None = None

    if can_stage:
        nb, notebook_gaps = ensure_notebook(rebuild=rebuild_notebook)
        gaps.extend(notebook_gaps)
        if nb is not None:
            staged_info = stage_notebook(nb, insights)
            status = "staged_rails_green"
            operator_action = (
                "Notebook staged under kaggle/push_e20. "
                "Review sidecars; push only with human --push "
                "--i-accept-operator-responsibility --execute. "
                "Never auto product_unlock."
            )
            if want_push:
                push_info = attempt_human_push(
                    STAGING_DIR,
                    confirm=push_confirm,
                    execute=push_execute,
                )
                if push_info.get("success"):
                    status = "staged_and_human_pushed"
                elif push_info.get("attempted"):
                    status = "staged_push_failed"
                    gaps.append("human_push_failed")
                else:
                    status = "staged_push_blocked_gates"
                    gaps.append("human_push_gates_missing")
        else:
            status = "rails_green_notebook_gap"
            operator_action = (
                "Rails green but notebook source/build missing — cannot stage. "
                "Run kaggle/build_exp_v20_source_holdout.py then re-run this script."
            )
    else:
        status = "blocked_rails_or_gap"
        operator_action = (
            rails.get("operator_action")
            or "Anti-leak rails not green — do not stage train notebook. "
            "Fix rails / provide E20 models dir first."
        )

    payload: dict[str, Any] = {
        "generated_at": _utc_now(),
        "policy": POLICY,
        "product_unlock": False,
        "can_auto_unlock": False,
        "forage_permission": False,
        "consumption_permission": False,
        "lab_only": True,
        "kaggle_push": bool(push_info and push_info.get("success")),
        "auto_kaggle_push": False,
        "status": status,
        "can_stage_train_notebook": can_stage,
        "can_stage": can_stage,
        "staged": bool(staged_info and staged_info.get("staged")),
        "staging": staged_info,
        "insights": insights,
        "rails": {
            "status": rails.get("status"),
            "can_stage_train_notebook": can_stage,
            "fail_reasons": rails.get("fail_reasons") or [],
            "gaps": rails.get("gaps") or [],
            "report_path": _repo_rel(RAILS_OUT) or str(RAILS_OUT),
            "models_dir": rails.get("models_dir"),
            "models_dir_resolved": rails.get("models_dir_resolved"),
        },
        "models_dir": _repo_rel(mdir) if mdir else rails.get("models_dir"),
        "models_dir_resolved": (
            str(mdir.resolve()) if mdir else rails.get("models_dir_resolved")
        ),
        "push": push_info
        or {
            "requested": False,
            "attempted": False,
            "auto_kaggle_push": False,
            "note": "Default path is stage-only; no Kaggle push.",
        },
        "gaps": gaps,
        "operator_action": operator_action,
        "honesty": {
            "metrics_label": "[MEASURED]",
            "never_invent_metrics": True,
            "insights_optional": True,
            "never_auto_push": True,
            "product_unlock_forced_false": True,
            "gbif_es_holdout_must_stay_pure": True,
        },
        "note": (
            "ML-07 stage gate: rails required; insights optional. "
            "Never flips product_unlock. Never forages. Never auto Kaggle push."
        ),
        "report_path": _repo_rel(OUT_JSON) or str(OUT_JSON),
    }
    return payload


def write_report(payload: dict[str, Any], path: Path | None = None) -> Path:
    out = path or OUT_JSON
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--models-dir",
        type=Path,
        default=None,
        help="E20 models dir for rails check (metrics + split artifacts)",
    )
    ap.add_argument(
        "--out",
        type=Path,
        default=OUT_JSON,
        help="Output stage_train_notebook_latest.json path",
    )
    ap.add_argument(
        "--rebuild-notebook",
        action="store_true",
        help="Rebuild notebook via build_exp_v20_source_holdout.py before staging",
    )
    ap.add_argument(
        "--skip-rails-refresh",
        action="store_true",
        help="Reuse existing anti_leak_rails_train_latest.json if present",
    )
    ap.add_argument(
        "--push",
        action="store_true",
        help="Request human push after stage (still needs confirm + execute)",
    )
    ap.add_argument(
        "--i-accept-operator-responsibility",
        action="store_true",
        help="Human operator responsibility gate for --push",
    )
    ap.add_argument(
        "--execute",
        action="store_true",
        help="Opt-in out of dry-run for real kaggle kernels push",
    )
    args = ap.parse_args(argv)

    # Models resolution: --models-dir → in-repo → VISIONSETIL_MODELS_DIR (via resolve)
    models_dir = args.models_dir

    payload = evaluate_and_stage(
        models_dir=models_dir,
        rebuild_notebook=args.rebuild_notebook,
        want_push=bool(args.push),
        push_confirm=bool(args.i_accept_operator_responsibility),
        push_execute=bool(args.execute),
        skip_rails_refresh=bool(args.skip_rails_refresh),
    )
    out_path = write_report(payload, args.out)

    print(f"Wrote {out_path}")
    print(
        f"status={payload['status']} staged={payload['staged']} "
        f"can_stage={payload['can_stage_train_notebook']} "
        f"product_unlock={payload['product_unlock']} "
        f"auto_kaggle_push={payload['auto_kaggle_push']}"
    )
    if payload.get("staging"):
        print(f"staging_dir={payload['staging'].get('staging_dir')}")
        print(f"notebook={payload['staging'].get('notebook')}")
    if payload.get("gaps"):
        print("gaps:", ", ".join(payload["gaps"]))
    print(f"operator_action: {payload.get('operator_action')}")

    # Exit 0 only when staged (rails green + notebook written)
    return 0 if payload.get("staged") else 1


if __name__ == "__main__":
    raise SystemExit(main())
