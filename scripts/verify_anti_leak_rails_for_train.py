#!/usr/bin/env python3
"""Verify anti-leak rails before any train notebook staging.

Writes:
  eval/reports/ml_experiments/anti_leak_rails_train_latest.json

Exit code:
  0 only when can_stage_train_notebook is true
  1 otherwise (rails fail or critical GAP)

Never sets product_unlock true. Never pushes Kaggle. Lab only.
Orientation only — never forage / consumption permission.

Models dir resolution (portable, fail-closed):
  1. --models-dir
  2. in-repo kaggle/kernel_output_v20/models
  3. env VISIONSETIL_MODELS_DIR
  (no hardcoded workstation paths)

Usage:
  python scripts/verify_anti_leak_rails_for_train.py
  python scripts/verify_anti_leak_rails_for_train.py --models-dir PATH
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

POLICY = "orientation_only_never_consume"
REPORT_DIR = ROOT / "eval" / "reports" / "ml_experiments"
OUT_JSON = REPORT_DIR / "anti_leak_rails_train_latest.json"
DEFAULT_MODELS = ROOT / "kaggle" / "kernel_output_v20" / "models"

# Protocols that satisfy E20-style source holdout (must contain source_holdout semantics)
_SOURCE_HOLDOUT_MARKERS = ("source_holdout",)

TRAIN_DOMAIN_FORBIDDEN_TEST = frozenset({"gbif", "gbif_es"})
TEST_DOMAIN_EXPECTED = frozenset({"gbif", "gbif_es"})


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _repo_rel(path: Path | str | None) -> str | None:
    """Prefer repo-relative POSIX paths; keep absolute only when outside repo."""
    if path is None:
        return None
    p = Path(path)
    try:
        return p.resolve().relative_to(ROOT.resolve()).as_posix()
    except (ValueError, OSError):
        return str(p)


def _load_json(path: Path) -> Any | None:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def resolve_models_dir(explicit: Path | None = None) -> Path | None:
    """Prefer in-repo E20 models; then env VISIONSETIL_MODELS_DIR. No hardcoded user paths."""
    if explicit is not None:
        p = Path(explicit)
        return p if p.is_dir() else None
    if DEFAULT_MODELS.is_dir():
        return DEFAULT_MODELS
    env = (os.environ.get("VISIONSETIL_MODELS_DIR") or "").strip()
    if env:
        p = Path(env)
        if p.is_dir():
            return p
    return None


def _obs_id_set(blob: Any) -> set[str]:
    """Extract observation_id set from list or {observation_ids: [...]} shapes."""
    out: set[str] = set()
    if blob is None:
        return out
    if isinstance(blob, dict):
        ids = blob.get("observation_ids")
        if isinstance(ids, list):
            return {str(x) for x in ids}
        for key in ("observations", "rows", "data"):
            if isinstance(blob.get(key), list):
                blob = blob[key]
                break
        else:
            return out
    if isinstance(blob, list):
        for row in blob:
            if isinstance(row, dict):
                oid = row.get("observation_id") or row.get("obs_id") or row.get("id")
                if oid is not None:
                    out.add(str(oid))
            else:
                out.add(str(row))
    return out


def _source_set(blob: Any) -> set[str]:
    srcs: set[str] = set()
    if not isinstance(blob, list):
        return srcs
    for row in blob:
        if isinstance(row, dict) and row.get("source_db") is not None:
            srcs.add(str(row["source_db"]).lower())
    return srcs


def check_code_rails_present(repo: Path = ROOT) -> dict[str, Any]:
    """Static presence of anti-leak code paths (does not prove runtime)."""
    paths = {
        "anti_leak_splitter": repo / "kaggle" / "anti_leak_splitter.py",
        "leak_invariants": repo / "kaggle" / "ml_qa" / "leak_invariants.py",
        "industrial_anti_leak_split": repo / "scripts" / "industrial_anti_leak_split.py",
        "e19_leak_audit_script": repo / "scripts" / "audit_e19_leak.py",
    }
    present = {k: p.is_file() for k, p in paths.items()}
    return {
        "pass": all(present.values()),
        "files": {k: _repo_rel(p) for k, p in paths.items()},
        "present": present,
    }


def _protocol_is_source_holdout(protocol: str) -> bool:
    """Require source_holdout semantics; bare 'e20' substring is not enough."""
    p = (protocol or "").strip().lower()
    if not p:
        return False
    return any(m in p for m in _SOURCE_HOLDOUT_MARKERS)


def check_split_manifest(manifest: dict[str, Any] | None) -> dict[str, Any]:
    if not manifest or not isinstance(manifest, dict):
        return {
            "pass": False,
            "status": "GAP",
            "detail": "split_manifest.json missing or unreadable",
        }
    leaks = manifest.get("leaks") or {}
    if not isinstance(leaks, dict):
        leaks = {}
    sm = manifest.get("split_meta") if isinstance(manifest.get("split_meta"), dict) else {}
    near = sm.get("n_shared_near_dup_keys_post_split")
    cross = sm.get("cross_domain_oids")
    protocol = str(manifest.get("protocol") or sm.get("protocol") or "")
    leak_ok = (
        int(leaks.get("train_val") or 0) == 0
        and int(leaks.get("train_test") or 0) == 0
        and int(leaks.get("val_test") or 0) == 0
    )
    manifest_pass_flag = bool(manifest.get("pass", leak_ok))
    protocol_ok = _protocol_is_source_holdout(protocol)

    # Missing near-dup / cross-domain keys are GAP for source-holdout (not silent pass)
    near_missing = near is None
    cross_missing = cross is None
    if near_missing:
        near_ok = False
        near_status = "GAP"
    else:
        near_ok = int(near) == 0
        near_status = "PASS" if near_ok else "FAIL"
    if cross_missing:
        cross_ok = False
        cross_status = "GAP"
    else:
        cross_ok = int(cross) == 0
        cross_status = "PASS" if cross_ok else "FAIL"

    ok = (
        leak_ok
        and manifest_pass_flag
        and near_ok
        and cross_ok
        and protocol_ok
    )
    if not ok and (near_missing or cross_missing or not protocol):
        status = "GAP" if leak_ok and not any(
            int(leaks.get(k) or 0) > 0 for k in ("train_val", "train_test", "val_test")
        ) else ("FAIL" if not leak_ok or not near_ok or not cross_ok else "GAP")
        # Prefer FAIL when leak or non-zero near/cross; GAP when fields missing
        if not leak_ok or (not near_missing and not near_ok) or (not cross_missing and not cross_ok):
            status = "FAIL"
        elif near_missing or cross_missing or not protocol_ok:
            status = "GAP"
        else:
            status = "FAIL"
    else:
        status = "PASS" if ok else "FAIL"

    return {
        "pass": ok,
        "status": status,
        "protocol": protocol,
        "protocol_requires_source_holdout": True,
        "protocol_ok": protocol_ok,
        "leaks": {
            "train_val": int(leaks.get("train_val") or 0),
            "train_test": int(leaks.get("train_test") or 0),
            "val_test": int(leaks.get("val_test") or 0),
        },
        "manifest_pass_flag": manifest_pass_flag,
        "n_shared_near_dup_keys_post_split": near,
        "near_dup_status": near_status,
        "cross_domain_oids": cross,
        "cross_domain_status": cross_status,
        "n_train_obs": manifest.get("n_train_obs"),
        "n_val_obs": manifest.get("n_val_obs"),
        "n_test_obs": manifest.get("n_test_obs"),
        "test_domain": sm.get("test_domain") or manifest.get("test_domain"),
        "orientation_only": bool(manifest.get("orientation_only", True)),
        "policy": manifest.get("policy"),
        "detail": (
            "split_manifest source_holdout rails OK"
            if ok
            else (
                "split_manifest GAP/FAIL: require protocol source_holdout, "
                "leaks=0, near_dup keys present=0, cross_domain_oids present=0"
            )
        ),
    }


def check_obs_disjoint_runtime(
    train_blob: Any,
    val_blob: Any,
    test_blob: Any,
) -> dict[str, Any]:
    train = _obs_id_set(train_blob)
    val = _obs_id_set(val_blob)
    test = _obs_id_set(test_blob)
    if not train or not val or not test:
        return {
            "pass": False,
            "status": "GAP",
            "detail": "train/val/test observation lists missing or empty — cannot re-verify offline",
            "n_train": len(train),
            "n_val": len(val),
            "n_test": len(test),
            "runtime_ids_reverified": False,
        }
    tv = train & val
    tt = train & test
    vt = val & test
    ok = len(tv) == 0 and len(tt) == 0 and len(vt) == 0
    return {
        "pass": ok,
        "status": "PASS" if ok else "FAIL",
        "n_train": len(train),
        "n_val": len(val),
        "n_test": len(test),
        "leaks": {
            "train_val": len(tv),
            "train_test": len(tt),
            "val_test": len(vt),
        },
        "runtime_ids_reverified": True,
        "detail": (
            "observation_id sets disjoint across train/val/test"
            if ok
            else "LEAK: observation_id overlap across splits"
        ),
    }


def check_source_domains_runtime(
    train_blob: Any,
    test_blob: Any,
    *,
    manifest: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Train must not include pure GBIF-ES test domain; test should be GBIF-ES."""
    train_src = _source_set(train_blob)
    test_src = _source_set(test_blob)
    if train_src or test_src:
        train_polluted = bool(train_src & TRAIN_DOMAIN_FORBIDDEN_TEST)
        test_ok = bool(test_src) and test_src.issubset(TEST_DOMAIN_EXPECTED)
        train_ok = bool(train_src) and not train_polluted
        ok = train_ok and test_ok
        return {
            "pass": ok,
            "status": "PASS" if ok else "FAIL",
            "train_sources": sorted(train_src),
            "test_sources": sorted(test_src),
            "train_polluted_with_test_domain": train_polluted,
            "detail": (
                "source domains respect E20 holdout (train≠gbif_es pure test)"
                if ok
                else "source domain violation (train polluted or test not gbif_es)"
            ),
            "source": "runtime_obs",
        }
    sm = (manifest or {}).get("split_meta") if isinstance(manifest, dict) else None
    if not isinstance(sm, dict):
        sm = {}
    tr_counts = sm.get("train_source_counts") or {}
    te_counts = sm.get("test_source_counts") or {}
    if not tr_counts and not te_counts:
        return {
            "pass": False,
            "status": "GAP",
            "detail": "no source_db on obs rows and no train/test_source_counts in manifest",
            "source": "none",
        }
    train_src = {str(k).lower() for k in tr_counts}
    test_src = {str(k).lower() for k in te_counts}
    train_polluted = bool(train_src & TRAIN_DOMAIN_FORBIDDEN_TEST)
    test_ok = bool(test_src) and test_src.issubset(TEST_DOMAIN_EXPECTED)
    ok = (not train_polluted) and test_ok
    return {
        "pass": ok,
        "status": "PASS" if ok else "FAIL",
        "train_sources": sorted(train_src),
        "test_sources": sorted(test_src),
        "train_polluted_with_test_domain": train_polluted,
        "detail": "domains from split_manifest source_counts",
        "source": "split_manifest",
    }


def evaluate_anti_leak_rails(
    *,
    models_dir: Path | None = None,
    repo: Path = ROOT,
) -> dict[str, Any]:
    """Full rails package. product_unlock always false."""
    mdir = resolve_models_dir(models_dir)
    gaps: list[str] = []
    checks: dict[str, Any] = {}

    code = check_code_rails_present(repo)
    checks["code_rails_present"] = code

    if mdir is None:
        gaps.append("models_dir_missing")
        checks["models_dir"] = {
            "pass": False,
            "status": "GAP",
            "path": None,
            "detail": (
                "No E20 models dir (kaggle/kernel_output_v20/models). "
                "Set --models-dir or VISIONSETIL_MODELS_DIR."
            ),
        }
        manifest = None
        train_blob = val_blob = test_blob = None
    else:
        checks["models_dir"] = {
            "pass": True,
            "status": "PASS",
            "path": _repo_rel(mdir),
            "path_resolved": str(mdir.resolve()),
        }
        manifest = _load_json(mdir / "split_manifest.json")
        if not isinstance(manifest, dict):
            gaps.append("split_manifest_missing")
            manifest = None
        train_blob = _load_json(mdir / "train_obs.json")
        val_blob = _load_json(mdir / "val_obs.json")
        test_blob = _load_json(mdir / "test_obs.json")
        if train_blob is None:
            gaps.append("train_obs_missing")
        if val_blob is None:
            gaps.append("val_obs_missing")
        if test_blob is None:
            gaps.append("test_obs_missing")

    checks["split_manifest"] = check_split_manifest(manifest if isinstance(manifest, dict) else None)
    checks["obs_disjoint_runtime"] = check_obs_disjoint_runtime(train_blob, val_blob, test_blob)
    checks["source_domains"] = check_source_domains_runtime(
        train_blob, test_blob, manifest=manifest if isinstance(manifest, dict) else None
    )

    metrics = _load_json(mdir / "metrics.json") if mdir else None
    if isinstance(metrics, dict):
        arts = metrics.get("split_artifacts") or []
        checks["metrics_split_artifacts"] = {
            "pass": bool(arts),
            "status": "PASS" if arts else "GAP",
            "split_artifacts": arts,
            "eval_protocol": metrics.get("eval_protocol"),
            "version": metrics.get("version"),
        }
    else:
        checks["metrics_split_artifacts"] = {
            "pass": False,
            "status": "GAP",
            "detail": "metrics.json missing beside models dir",
        }
        if mdir is not None:
            gaps.append("metrics_json_missing")

    # Surface GAP reasons from split_manifest field absence
    sm_check = checks.get("split_manifest") or {}
    if sm_check.get("near_dup_status") == "GAP":
        gaps.append("near_dup_keys_missing_in_manifest")
    if sm_check.get("cross_domain_status") == "GAP":
        gaps.append("cross_domain_oids_missing_in_manifest")
    if sm_check.get("protocol_ok") is False and sm_check.get("status") != "GAP":
        gaps.append("protocol_not_source_holdout")

    critical_ok = bool(
        checks["code_rails_present"]["pass"]
        and checks.get("split_manifest", {}).get("pass")
        and checks.get("obs_disjoint_runtime", {}).get("pass")
        and checks.get("source_domains", {}).get("pass")
    )
    soft_metrics = checks.get("metrics_split_artifacts", {}).get("pass", False)

    can_stage = bool(critical_ok)
    if can_stage and not soft_metrics:
        gaps.append("metrics_json_advisory_gap")

    fail_reasons = [
        name
        for name, block in checks.items()
        if isinstance(block, dict) and not block.get("pass")
    ]

    if can_stage:
        status = "rails_green_can_stage"
        operator_action = (
            "anti-leak rails PASS — may stage train notebook "
            "(scripts/stage_train_notebook_if_rails_ok.py); "
            "never auto push Kaggle; never auto product_unlock"
        )
    elif gaps and not any(
        checks.get(k, {}).get("status") == "FAIL"
        for k in ("obs_disjoint_runtime", "source_domains", "split_manifest")
    ):
        status = "blocked_on_gap"
        operator_action = (
            "GAP: missing split artifacts or models dir — cannot certify rails; "
            "do not stage train notebook until E20 models/split files available"
        )
    else:
        status = "rails_failed"
        operator_action = (
            "anti-leak rails FAIL — fix observation leak / domain pollution "
            "before any train staging; never contaminate GBIF-ES holdout"
        )

    out: dict[str, Any] = {
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
        "models_dir": _repo_rel(mdir) if mdir else None,
        "models_dir_resolved": str(mdir.resolve()) if mdir else None,
        "checks": checks,
        "fail_reasons": fail_reasons,
        "gaps": gaps,
        "operator_action": operator_action,
        "honesty": {
            "metrics_label": "[MEASURED]",
            "never_invent_metrics": True,
            "gbif_es_holdout_must_stay_pure": True,
            "primary_ece": "train_published",
            "posthoc_separate": True,
        },
        "note": (
            "Anti-leak gate for train staging only. "
            "Never flips product_unlock. Never forages. Exit 0 iff can_stage_train_notebook."
        ),
    }
    return out


def write_report(payload: dict[str, Any], path: Path | None = None) -> Path:
    out = path or OUT_JSON
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--models-dir",
        type=Path,
        default=None,
        help="Path to E20 models dir (metrics + split artifacts)",
    )
    ap.add_argument(
        "--out",
        type=Path,
        default=OUT_JSON,
        help="Output JSON path",
    )
    args = ap.parse_args(argv)

    payload = evaluate_anti_leak_rails(models_dir=args.models_dir)
    out_path = write_report(payload, args.out)
    print(f"Wrote {out_path}")
    print(f"status={payload['status']} can_stage_train_notebook={payload['can_stage_train_notebook']}")
    print(f"product_unlock={payload['product_unlock']} (forced false)")
    if payload.get("gaps"):
        print("gaps:", ", ".join(payload["gaps"]))
    if payload.get("fail_reasons"):
        print("fail_reasons:", ", ".join(payload["fail_reasons"]))

    return 0 if payload["can_stage_train_notebook"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
