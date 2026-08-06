#!/usr/bin/env python3
"""Stage next train notebook ONLY if anti-leak rails are green.

Writes:
  eval/reports/ml_experiments/stage_train_notebook_latest.json
  kaggle/push_e20/  (notebook + kernel-metadata.json) when staged

Insights (lookalike hotspots, deadly@1, hard-neg pairs) are OPTIONAL:
  recorded / copied as sidecars when present; never block staging alone.

NEVER auto-push Kaggle. product_unlock always false.
  --push is human-only and requires the triple gate:
  --push --i-accept-operator-responsibility --execute

Usage:
  python scripts/stage_train_notebook_if_rails_ok.py
  python scripts/stage_train_notebook_if_rails_ok.py --models-dir PATH
  python scripts/stage_train_notebook_if_rails_ok.py --rebuild-notebook
  # Human push only (still no product_unlock) — all three flags required:
  python scripts/stage_train_notebook_if_rails_ok.py \\
    --push --i-accept-operator-responsibility --execute
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
from typing import Any, Callable

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

KaggleRunner = Callable[[list[str]], dict[str, Any]]


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_json(path: Path) -> Any | None:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _in_repo_rel(path: Path | str | None) -> str | None:
    """Repo-relative POSIX path only; None when outside repo (unlike _repo_rel)."""
    if path is None:
        return None
    p = Path(path)
    try:
        return p.resolve().relative_to(ROOT.resolve()).as_posix()
    except (ValueError, OSError):
        return None


def _path_hygiene(path: Path | None, *, env_label: str = "env_or_explicit") -> dict[str, Any]:
    """Prefer repo-rel for portable keys; absolute only under *_resolved."""
    if path is None:
        return {
            "path": None,
            "path_resolved": None,
            "path_source": None,
            "in_repo": False,
        }
    rel = _in_repo_rel(path)
    try:
        resolved = str(path.resolve())
    except OSError:
        resolved = str(path)
    return {
        "path": rel,  # None when outside repo — not absolute workstation path
        "path_resolved": resolved,
        "path_source": "in_repo" if rel else env_label,
        "in_repo": rel is not None,
    }


def _hard_neg_candidates() -> list[tuple[Path, str]]:
    """Portable hard-neg paths with source labels.

    Returns (path, source_label) pairs. Layout assumption for models-dir sibling:
      VISIONSETIL_MODELS_DIR = <repo>/kaggle/kernel_output_*/models
    only then parents[2] is treated as repo root (parent.name chain ends .../kaggle/...).
    Prefer VISIONSETIL_DATA_DIR when set; never invent paths.
    """
    cands: list[tuple[Path, str]] = [
        (ROOT / "data" / "industrial_v1" / "hard_negative_pairs_e20.json", "in_repo"),
    ]
    data_env = (os.environ.get("VISIONSETIL_DATA_DIR") or "").strip()
    if data_env:
        cands.append(
            (
                Path(data_env) / "industrial_v1" / "hard_negative_pairs_e20.json",
                "VISIONSETIL_DATA_DIR",
            )
        )
    models_env = (os.environ.get("VISIONSETIL_MODELS_DIR") or "").strip()
    if models_env:
        md = Path(models_env)
        try:
            resolved = md.resolve()
            # Expected: <repo>/kaggle/kernel_output_*/models
            # parents[0]=kernel_output_*, [1]=kaggle, [2]=repo
            if (
                resolved.is_dir()
                and resolved.name == "models"
                and resolved.parent.parent.name == "kaggle"
            ):
                repo_guess = resolved.parents[2]
                cands.append(
                    (
                        repo_guess
                        / "data"
                        / "industrial_v1"
                        / "hard_negative_pairs_e20.json",
                        "models_dir_sibling_layout",
                    )
                )
        except (IndexError, OSError):
            pass
    return cands


def discover_optional_insights(report_dir: Path = REPORT_DIR) -> dict[str, Any]:
    """Find optional loop insights. Missing = optional_gaps only, not a block."""
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
                        "path": _in_repo_rel(p) or _repo_rel(p) or str(p),
                        "size_bytes": p.stat().st_size,
                    }
                )

    hard_neg_path: Path | None = None
    hard_neg_source: str | None = None
    for cand, source in _hard_neg_candidates():
        if cand.is_file():
            hard_neg_path = cand
            hard_neg_source = source
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

    optional_gaps: list[str] = []
    if not found:
        optional_gaps.append("loop_insight_jsons_absent_optional")
    if hard_neg_path is None:
        optional_gaps.append("hard_negative_pairs_absent_optional")

    hn_hygiene = _path_hygiene(
        hard_neg_path,
        env_label=hard_neg_source or "outside_repo",
    )

    return {
        "optional": True,
        "insights_present": bool(found) or hard_neg_path is not None,
        "insight_files": found,
        # Portable key: repo-rel only; absolute only under *_resolved
        "hard_negative_pairs_path": hn_hygiene["path"],
        "hard_negative_pairs_resolved": hn_hygiene["path_resolved"],
        "hard_negative_pairs_source": hard_neg_source,
        "hard_negative_pair_count": len(hard_neg_pairs),
        "hard_negative_pairs": hard_neg_pairs,
        "focus_taxa": focus_taxa,
        "gaps": optional_gaps,  # kept under insights only
        "optional_gaps": optional_gaps,
        "note": (
            "Insights optional for ML-07: stage proceeds on rails alone; "
            "hard_neg/focus used when present for sampler/boost sidecars."
        ),
    }


def ensure_notebook(*, rebuild: bool = False) -> tuple[Path | None, list[str]]:
    """Return notebook path or None + blocking gaps. Optional rebuild via build_exp_v20."""
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
            sidecars.append(_in_repo_rel(dest_hn) or str(dest_hn))

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
    sidecars.append(_in_repo_rel(focus_path) or str(focus_path))

    return {
        "staged": True,
        "staging_dir": _in_repo_rel(staging_dir) or str(staging_dir),
        "notebook": _in_repo_rel(dest_nb) or str(dest_nb),
        "kernel_metadata": _in_repo_rel(dest_meta) or str(dest_meta),
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
    kaggle_runner: KaggleRunner | None = None,
) -> dict[str, Any]:
    """Human-only push. Fail-closed without confirm+execute. Never product_unlock.

    Missing ``kaggle`` CLI is caught and returned as structured push_failed so the
    caller can still write stage_train_notebook_latest.json after staging.
    """
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

    cmd = ["kaggle", "kernels", "push", "-p", str(staging_dir)]
    print(" $", " ".join(cmd))

    if kaggle_runner is not None:
        try:
            result = kaggle_runner(cmd)
        except (FileNotFoundError, OSError) as exc:
            out.update(
                {
                    "attempted": True,
                    "dry_run": False,
                    "success": False,
                    "returncode": 127,
                    "status": "push_failed",
                    "error": "kaggle_cli_missing_or_os_error",
                    "output_tail": str(exc),
                    "cmd": cmd,
                    "monitor": f"https://www.kaggle.com/code/{KERNEL_SLUG}",
                    "note": "Kaggle CLI missing or OS error; report still written.",
                }
            )
            return out
        rc = int(result.get("returncode", 1))
        tail = str(result.get("output_tail") or "")[-4000:]
        out.update(
            {
                "attempted": True,
                "dry_run": False,
                "success": rc == 0,
                "returncode": rc,
                "output_tail": tail,
                "status": "pushed" if rc == 0 else "push_failed",
                "cmd": cmd,
                "monitor": f"https://www.kaggle.com/code/{KERNEL_SLUG}",
            }
        )
        return out

    try:
        r = subprocess.run(cmd, capture_output=True, text=True, cwd=str(ROOT))
    except FileNotFoundError as exc:
        # kaggle not on PATH — do not abort evaluate_and_stage / write_report
        msg = f"kaggle CLI not found on PATH: {exc}"
        print(msg, file=sys.stderr)
        out.update(
            {
                "attempted": True,
                "dry_run": False,
                "success": False,
                "returncode": 127,
                "status": "push_failed",
                "error": "kaggle_cli_not_found",
                "output_tail": msg,
                "cmd": cmd,
                "monitor": f"https://www.kaggle.com/code/{KERNEL_SLUG}",
                "note": (
                    "Install/authenticate Kaggle CLI before human push. "
                    "Staging already complete; SSOT report will still be written."
                ),
            }
        )
        return out
    except OSError as exc:
        msg = f"kaggle push OS error: {exc}"
        print(msg, file=sys.stderr)
        out.update(
            {
                "attempted": True,
                "dry_run": False,
                "success": False,
                "returncode": 1,
                "status": "push_failed",
                "error": "kaggle_push_os_error",
                "output_tail": msg,
                "cmd": cmd,
                "monitor": f"https://www.kaggle.com/code/{KERNEL_SLUG}",
                "note": "OS error during push; staging intact; report still written.",
            }
        )
        return out

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
    kaggle_runner: KaggleRunner | None = None,
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

    # Prefer sole explicit key; missing → false (no soft can_stage fallback)
    can_stage = bool(rails.get("can_stage_train_notebook"))
    insights = discover_optional_insights()

    # Split: optional insight gaps never land in top-level blocking list
    blocking_gaps: list[str] = list(rails.get("gaps") or [])
    optional_gaps: list[str] = list(insights.get("optional_gaps") or insights.get("gaps") or [])

    staged_info: dict[str, Any] | None = None
    notebook_gaps: list[str] = []
    push_info: dict[str, Any] | None = None
    operator_action = ""

    if can_stage:
        nb, notebook_gaps = ensure_notebook(rebuild=rebuild_notebook)
        blocking_gaps.extend(notebook_gaps)
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
                    kaggle_runner=kaggle_runner,
                )
                if push_info.get("success"):
                    status = "staged_and_human_pushed"
                elif push_info.get("attempted"):
                    status = "staged_push_failed"
                    blocking_gaps.append("human_push_failed")
                else:
                    # Stage OK; human gates missing — not a blocking failure for exit
                    status = "staged_push_blocked_gates"
                    optional_gaps.append("human_push_gates_missing_optional")
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

    # Path hygiene: models_dir portable key is repo-rel only
    models_hygiene = _path_hygiene(
        mdir,
        env_label=(
            "VISIONSETIL_MODELS_DIR_or_explicit"
            if mdir is not None
            else "missing"
        ),
    )
    # Prefer our hygiene; fall back to rails keys cleaned the same way
    rails_models_path = rails.get("models_dir")
    rails_models_resolved = rails.get("models_dir_resolved")
    if models_hygiene["path"] is None and rails_models_path:
        # rails may have stored absolute via _repo_rel — re-hygiene
        rails_hygiene = _path_hygiene(
            Path(rails_models_resolved or rails_models_path)
            if (rails_models_resolved or rails_models_path)
            else None,
            env_label="rails_report",
        )
        if mdir is None:
            models_hygiene = rails_hygiene

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
        "can_stage": can_stage,  # mirror explicit key only (same value)
        "staged": bool(staged_info and staged_info.get("staged")),
        "staging": staged_info,
        "insights": insights,
        "rails": {
            "status": rails.get("status"),
            "can_stage_train_notebook": can_stage,
            "fail_reasons": rails.get("fail_reasons") or [],
            "gaps": rails.get("gaps") or [],
            "report_path": _in_repo_rel(RAILS_OUT) or str(RAILS_OUT),
            # Portable: repo-rel only; absolute under models_dir_resolved
            "models_dir": models_hygiene["path"],
            "models_dir_resolved": models_hygiene["path_resolved"],
            "models_dir_source": models_hygiene["path_source"],
        },
        "models_dir": models_hygiene["path"],
        "models_dir_resolved": models_hygiene["path_resolved"],
        "models_dir_source": models_hygiene["path_source"],
        "push": push_info
        or {
            "requested": False,
            "attempted": False,
            "success": False,
            "auto_kaggle_push": False,
            "product_unlock": False,
            "note": "Default path is stage-only; no Kaggle push.",
        },
        # Top-level gaps = blocking only (optional never false-negatives green stage)
        "gaps": blocking_gaps,
        "blocking_gaps": blocking_gaps,
        "optional_gaps": optional_gaps,
        "operator_action": operator_action,
        "honesty": {
            "metrics_label": "[MEASURED]",
            "never_invent_metrics": True,
            "insights_optional": True,
            "never_auto_push": True,
            "product_unlock_forced_false": True,
            "gbif_es_holdout_must_stay_pure": True,
            "exit_nonzero_on_human_push_failure": True,
            "path_hygiene_absolute_only_under_resolved": True,
        },
        "note": (
            "ML-07 stage gate: rails required; insights optional. "
            "Never flips product_unlock. Never forages. Never auto Kaggle push. "
            "Exit non-zero if human push attempted and failed."
        ),
        "report_path": _in_repo_rel(OUT_JSON) or str(OUT_JSON),
    }
    return payload


def write_report(payload: dict[str, Any], path: Path | None = None) -> Path:
    out = path or OUT_JSON
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return out


def exit_code_for_payload(payload: dict[str, Any]) -> int:
    """Exit 0 only for successful stage without failed human push.

    - staged + no push attempt → 0
    - staged + push blocked on human gates (not attempted) → 0
    - staged + push attempted and failed → 1 (fail closed)
    - not staged → 1
    """
    push = payload.get("push") or {}
    if push.get("attempted") and not push.get("success"):
        return 1
    return 0 if payload.get("staged") else 1


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
        help="Opt-in out of dry-run for real kaggle kernels push (required with --push)",
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
    # Always write report — including after push CLI errors (caught in attempt_human_push)
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
    if payload.get("blocking_gaps"):
        print("blocking_gaps:", ", ".join(payload["blocking_gaps"]))
    if payload.get("optional_gaps"):
        print("optional_gaps:", ", ".join(payload["optional_gaps"]))
    print(f"operator_action: {payload.get('operator_action')}")

    return exit_code_for_payload(payload)


if __name__ == "__main__":
    raise SystemExit(main())
