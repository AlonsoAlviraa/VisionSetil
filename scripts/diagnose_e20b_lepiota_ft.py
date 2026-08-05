#!/usr/bin/env python3
"""E20b Lepiota FT diagnose (ML-02).

Decision tree: status → logs → classify → diagnose first →
  COMPLETE suite OR ≤1 relaunch if rails OK else continue baseline.

Always writes:
  eval/reports/ml_experiments/e20b_diagnose_lepiota_ft.json
  eval/reports/ml_experiments/e20b_diagnose_lepiota_ft.md

Never auto product_unlock. Never auto Kaggle push. Lab / orientation only.
Dual ECE: primary = train_published; posthoc is separate lab sidecar.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REPORT_DIR = ROOT / "eval" / "reports" / "ml_experiments"
OUT_JSON = REPORT_DIR / "e20b_diagnose_lepiota_ft.json"
OUT_MD = REPORT_DIR / "e20b_diagnose_lepiota_ft.md"
SSOT = REPORT_DIR / "E20_BASELINE_METRICS_TO_IMPROVE.json"
RAILS = REPORT_DIR / "anti_leak_rails_train_latest.json"
HANDOFF = REPORT_DIR / "loop_operator_handoff_latest.json"

KERNEL_SLUG = "alonsoalviraaaa/visionsetil-exp-v20b-lepiota-ft"
BASELINE_SLUG = "alonsoalviraaaa/visionsetil-exp-v20-source-holdout"
WEIGHTS_DATASET = "alonsoalviraaaa/visionsetil-e20-weights"

# Prefer main-repo artifacts, then worktree-local
_DEFAULT_MODELS = [
    Path(r"C:\Users\Mariano\Documents\ALONSOO\VISIONSETIL\kaggle\kernel_output_v20\models"),
    ROOT / "kaggle" / "kernel_output_v20" / "models",
]
_DEFAULT_E20B_OUT = [
    Path(r"C:\Users\Mariano\Documents\ALONSOO\VISIONSETIL\kaggle\kernel_output_v20b"),
    ROOT / "kaggle" / "kernel_output_v20b",
]
_DEFAULT_PUSH = [
    # Tracked notebook lives next to other exp notebooks; push_e* is gitignored
    ROOT / "kaggle",
    ROOT / "kaggle" / "push_e20b",
    Path(r"C:\Users\Mariano\Documents\ALONSOO\VISIONSETIL\kaggle\push_e20b"),
]

POLICY = "orientation_only_never_consume"
LEPIOTA_FOCUS = ("Lepiota castanea", "Lepiota cristata", "Lepiota subincarnata")


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_json(path: Path | None) -> dict[str, Any] | None:
    if not path or not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def _first_existing(paths: list[Path]) -> Path | None:
    for p in paths:
        if p.exists():
            return p
    return None


def _run_kaggle(args: list[str], timeout: int = 60) -> tuple[int, str]:
    try:
        r = subprocess.run(
            ["kaggle", *args],
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=str(ROOT),
        )
        out = (r.stdout or "") + (r.stderr or "")
        return r.returncode, out.strip()
    except FileNotFoundError:
        return 127, "kaggle CLI not found"
    except subprocess.TimeoutExpired:
        return 124, "kaggle CLI timeout"
    except OSError as e:
        return 1, f"kaggle CLI error: {e}"


def _parse_kernel_status(text: str) -> str:
    t = text or ""
    m = re.search(r"KernelWorkerStatus\.([A-Z_]+)", t)
    if m:
        return m.group(1)
    for token in ("COMPLETE", "ERROR", "CANCELLED", "RUNNING", "QUEUED", "PENDING"):
        if re.search(rf"\b{token}\b", t, re.I):
            return token.upper()
    if "403" in t or "401" in t or "credentials" in t.lower():
        return "AUTH_GAP"
    if "404" in t or "not found" in t.lower():
        return "NOT_FOUND"
    if not t:
        return "UNKNOWN"
    return "UNKNOWN"


def _read_log_text(e20b_out: Path | None) -> str:
    if not e20b_out:
        return ""
    candidates = list(e20b_out.glob("*.log")) + list(e20b_out.rglob("*.log"))
    if not candidates:
        return ""
    # Prefer named log
    ranked = sorted(
        candidates,
        key=lambda p: (0 if "v20b" in p.name or "lepiota" in p.name else 1, -p.stat().st_mtime),
    )
    try:
        return ranked[0].read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def _extract_log_lines(log_text: str) -> list[str]:
    """Kaggle logs may be JSONL of stream events or plain text."""
    lines: list[str] = []
    if not log_text:
        return lines
    # JSON array of stream events
    stripped = log_text.strip()
    if stripped.startswith("[") or stripped.startswith("{"):
        try:
            # Sometimes whole file is one JSON list; sometimes line-delimited
            if stripped.startswith("["):
                events = json.loads(stripped)
                if isinstance(events, list):
                    for ev in events:
                        if isinstance(ev, dict) and "data" in ev:
                            lines.append(str(ev["data"]).rstrip("\n"))
                    return lines
        except json.JSONDecodeError:
            pass
        for raw in log_text.splitlines():
            raw = raw.strip().rstrip(",")
            if not raw:
                continue
            try:
                ev = json.loads(raw)
                if isinstance(ev, dict) and "data" in ev:
                    lines.append(str(ev["data"]).rstrip("\n"))
                    continue
            except json.JSONDecodeError:
                pass
            lines.append(raw)
        return lines
    return log_text.splitlines()


def _classify_from_log(lines: list[str], kernel_status: str) -> dict[str, Any]:
    blob = "\n".join(lines)
    findings: list[dict[str, Any]] = []
    classification = "unknown"
    blocking = False

    # SyntaxError: commas swallowed by end-of-line comments in _HARD_NEG
    if "SyntaxError" in blob and (
        "lepiota subincarnata" in blob or "forgot a comma" in blob or "_HARD_NEG" in blob
    ):
        findings.append(
            {
                "id": "syntax_hard_neg_commas",
                "severity": "blocking",
                "summary": (
                    "SyntaxError in In[17] _HARD_NEG dict: trailing commas lived inside "
                    "comments after values (e.g. `28.0  # E20b FT boost,`), so the next "
                    "key was a SyntaxError."
                ),
                "evidence": "PapermillExecutionError / SyntaxError: invalid syntax. Perhaps you forgot a comma?",
            }
        )
        classification = "launch_script_bug"
        blocking = True

    if "no pretrained best.pt found" in blob:
        findings.append(
            {
                "id": "missing_pretrained_weights_path",
                "severity": "high",
                "summary": (
                    "E20b FT resume did not find best.pt. Dataset "
                    f"{WEIGHTS_DATASET} may be mounted under "
                    "/kaggle/input/datasets/<owner>/<slug>/ while notebook only probed "
                    "/kaggle/input/visionsetil-e20-weights/."
                ),
                "evidence": "E20b FT WARNING: no pretrained best.pt found",
            }
        )
        if classification == "unknown":
            classification = "weights_mount_miss"

    if "mush215" in blob and "Loaded: 0 images" in blob:
        findings.append(
            {
                "id": "mush215_optional_empty",
                "severity": "low",
                "summary": "Optional mush215 source loaded 0 images (non-blocking; FT train still fungitastic).",
                "evidence": "Loaded: 0 images from 'mush215'",
            }
        )

    if re.search(r"protocol=source_holdout_e20b_lepiota_ft pass=True", blob):
        findings.append(
            {
                "id": "split_rails_pass_before_crash",
                "severity": "info",
                "summary": "Source-holdout split artifacts written and pass=True before crash.",
                "evidence": "protocol=source_holdout_e20b_lepiota_ft pass=True",
            }
        )

    metrics_present = False
    # no metrics in failed run typically
    if "FINAL TEST EVALUATION" in blob and "MAP@3" in blob:
        metrics_present = True

    if kernel_status == "COMPLETE" and metrics_present:
        classification = "complete_ready_for_suite"
        blocking = False
    elif kernel_status == "ERROR" and blocking:
        pass  # keep launch_script_bug
    elif kernel_status == "ERROR" and classification == "unknown":
        classification = "runtime_error_unclassified"
        blocking = True
    elif kernel_status in ("RUNNING", "QUEUED", "PENDING"):
        classification = "in_flight"
    elif kernel_status in ("AUTH_GAP", "NOT_FOUND", "UNKNOWN"):
        classification = f"status_{kernel_status.lower()}"
        blocking = True

    return {
        "classification": classification,
        "blocking": blocking,
        "findings": findings,
        "metrics_emitted": metrics_present,
    }


def _map_at_3(probs, labels) -> float:
    import numpy as np

    top3 = np.argsort(-probs, axis=1)[:, :3]
    score = 0.0
    for i, lab in enumerate(labels):
        if lab in top3[i]:
            rank = list(top3[i]).index(lab)
            score += 1.0 / (rank + 1)
    return float(score / max(len(labels), 1))


def _lepiota_baseline_metrics(models_dir: Path | None) -> dict[str, Any]:
    out: dict[str, Any] = {
        "available": False,
        "models_dir": str(models_dir) if models_dir else None,
        "species": {},
        "split_counts": {},
        "note": "Measured from E20 baseline test_predictions.npz when present; not E20b (failed).",
    }
    if not models_dir:
        return out
    pred_path = models_dir / "test_predictions.npz"
    l2i_path = models_dir / "label2idx.json"
    if not pred_path.is_file() or not l2i_path.is_file():
        out["gaps"] = ["missing test_predictions.npz or label2idx.json"]
        return out
    try:
        import numpy as np
    except ImportError:
        out["gaps"] = ["numpy not installed in this environment"]
        return out

    l2i = json.loads(l2i_path.read_text(encoding="utf-8"))
    i2l = {int(v): k for k, v in l2i.items()}
    z = np.load(pred_path, allow_pickle=True)
    probs, preds, labels = z["probs"], z["preds"], z["labels"]

    species_block: dict[str, Any] = {}
    for name in LEPIOTA_FOCUS:
        if name not in l2i:
            species_block[name] = {"n": 0, "gap": "not_in_label2idx"}
            continue
        idx = int(l2i[name])
        m = labels == idx
        n = int(m.sum())
        if n == 0:
            species_block[name] = {"n": 0}
            continue
        conf: Counter[str] = Counter()
        for pr in preds[m]:
            conf[i2l.get(int(pr), str(int(pr)))] += 1
        top_conf = [
            {"species": s, "count": c, "rate": c / n}
            for s, c in conf.most_common(5)
        ]
        species_block[name] = {
            "n": n,
            "top1": float((preds[m] == labels[m]).mean()),
            "map_at_3": _map_at_3(probs[m], labels[m]),
            "true_in_top3": float(
                np.mean(
                    [
                        lab in np.argsort(-probs[m], axis=1)[i, :3]
                        for i, lab in enumerate(labels[m])
                    ]
                )
            ),
            "top_pred_confusions": top_conf,
            "deadly": name.lower()
            in {"lepiota castanea", "lepiota subincarnata"},
        }
    out["species"] = species_block
    out["available"] = True

    # split counts
    split_counts: dict[str, Any] = {}
    for split in ("train_obs", "val_obs", "test_obs"):
        sp = models_dir / f"{split}.json"
        if not sp.is_file():
            continue
        try:
            obs = json.loads(sp.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(obs, dict) and "observations" in obs:
            obs = obs["observations"]
        c: Counter[str] = Counter()
        for o in obs:
            if not isinstance(o, dict):
                continue
            spn = o.get("species") or o.get("label") or o.get("scientific_name")
            if spn and "lepiota" in str(spn).lower():
                c[str(spn)] += 1
        split_counts[split] = dict(c)
    out["split_counts"] = split_counts

    # Friction summary
    sub = species_block.get("Lepiota subincarnata") or {}
    out["friction"] = {
        "subincarnata_top1_collapse": bool(sub.get("n") and sub.get("top1", 1) == 0.0),
        "subincarnata_train_obs": (split_counts.get("train_obs") or {}).get(
            "Lepiota subincarnata"
        ),
        "primary_confuser": "Lepiota cristata",
        "rationale": (
            "Deadly L. subincarnata collapses to L. cristata on GBIF-ES holdout; "
            "tiny train n drives E20b hard-neg FT design. Orientation only."
        ),
    }
    return out


def _notebook_fix_status(push_dir: Path | None) -> dict[str, Any]:
    info: dict[str, Any] = {
        "push_dir": str(push_dir) if push_dir else None,
        "notebook_present": False,
        "syntax_fix_present": False,
        "weight_path_fix_present": False,
    }
    if not push_dir:
        return info
    # Accept tracked paths under kaggle/ or gitignored push_e20b/
    candidates = [
        push_dir / "visionsetil_exp_v20b_lepiota_ft.ipynb",
        ROOT / "kaggle" / "visionsetil_exp_v20b_lepiota_ft.ipynb",
        push_dir / "push_e20b" / "visionsetil_exp_v20b_lepiota_ft.ipynb",
    ]
    meta_candidates = [
        ROOT / "kaggle" / "kernel-metadata-exp-v20b.json",
        push_dir / "kernel-metadata-exp-v20b.json",
        push_dir / "kernel-metadata.json",
        push_dir / "push_e20b" / "kernel-metadata.json",
    ]
    nb = next((p for p in candidates if p.is_file()), None)
    meta = next((p for p in meta_candidates if p.is_file()), None)
    info["notebook_path"] = str(nb) if nb else None
    info["metadata_path"] = str(meta) if meta else None
    info["notebook_present"] = nb is not None
    info["metadata_present"] = meta is not None
    if not nb:
        return info
    text = nb.read_text(encoding="utf-8", errors="replace")
    info["syntax_fix_present"] = (
        "'lepiota subincarnata': 28.0,  # E20b FT boost" in text
        and "'lepiota subincarnata': 28.0  # E20b FT boost," not in text
    )
    info["weight_path_fix_present"] = (
        "datasets/alonsoalviraaaa/visionsetil-e20-weights" in text
    )
    return info


def decide(
    *,
    kernel_status: str,
    classification: str,
    rails_can_stage: bool | None,
    notebook_ok: bool,
    metrics_emitted: bool,
) -> dict[str, Any]:
    """Decision tree → suite / relaunch(≤1) / continue baseline. Never auto push."""
    if kernel_status == "COMPLETE" and metrics_emitted:
        return {
            "decision": "COMPLETE_SUITE",
            "relaunch_allowed": False,
            "relaunch_executed": False,
            "continue_baseline": False,
            "operator_action": (
                "E20b COMPLETE with metrics — run post_train_suite + compare vs "
                "E20_BASELINE_METRICS_TO_IMPROVE.json SSOT. Dual ECE honesty. "
                "product_unlock stays false."
            ),
        }

    if classification == "launch_script_bug" and rails_can_stage and notebook_ok:
        return {
            "decision": "RELAUNCH_PATH_DOCUMENTED_NOT_EXECUTED",
            "relaunch_allowed": True,
            "relaunch_budget_remaining": 1,
            "relaunch_executed": False,
            "continue_baseline": True,
            "operator_action": (
                "Rails green + SyntaxError+weight-path fixed in kaggle/push_e20b. "
                "≤1 safe relaunch is allowed AFTER human operator explicit push "
                "(scripts/push_kaggle_e20b.py --execute ...). This diagnose run "
                "does NOT push. Continue E20 baseline SSOT until e20b COMPLETE."
            ),
            "relaunch_checklist": [
                "Confirm anti-leak rails still green (verify_anti_leak_rails_for_train.py)",
                "Confirm visionsetil-e20-weights has best.pt on Kaggle",
                "Confirm notebook syntax_fix_present + weight_path_fix_present",
                "Human: python scripts/push_kaggle_e20b.py --dry-run  (inspect)",
                "Human: python scripts/push_kaggle_e20b.py --execute --i-accept-operator-responsibility",
                "No blind epoch bumps; keep 12-epoch FT + hard-neg weights design",
                "Never product_unlock; dual ECE primary=train_published",
            ],
        }

    if classification == "launch_script_bug" and not notebook_ok:
        return {
            "decision": "CONTINUE_BASELINE_FIX_NOTEBOOK_FIRST",
            "relaunch_allowed": False,
            "relaunch_executed": False,
            "continue_baseline": True,
            "operator_action": (
                "E20b ERROR is a notebook SyntaxError; fixed notebook not present "
                "in worktree. Continue E20 baseline; do not relaunch until fix lands."
            ),
        }

    if rails_can_stage is False:
        return {
            "decision": "CONTINUE_BASELINE_RAILS_RED",
            "relaunch_allowed": False,
            "relaunch_executed": False,
            "continue_baseline": True,
            "operator_action": "Rails not green — no relaunch. Continue baseline only.",
        }

    return {
        "decision": "CONTINUE_BASELINE",
        "relaunch_allowed": False,
        "relaunch_executed": False,
        "continue_baseline": True,
        "operator_action": (
            f"status={kernel_status} classification={classification}. "
            "Diagnose-first complete; no COMPLETE suite. Continue E20 baseline SSOT. "
            "No auto push. product_unlock=false."
        ),
    }


def build_report(
    *,
    models_dir: Path | None = None,
    e20b_out: Path | None = None,
    push_dir: Path | None = None,
    skip_kaggle: bool = False,
) -> dict[str, Any]:
    models_dir = models_dir or _first_existing(_DEFAULT_MODELS)
    e20b_out = e20b_out or _first_existing(_DEFAULT_E20B_OUT)
    push_dir = push_dir or _first_existing(_DEFAULT_PUSH)

    gaps: list[str] = []
    kaggle_rc, kaggle_out = (1, "skipped")
    if skip_kaggle:
        kernel_status = "SKIPPED"
        gaps.append("kaggle_status_skipped")
    else:
        kaggle_rc, kaggle_out = _run_kaggle(["kernels", "status", KERNEL_SLUG])
        kernel_status = _parse_kernel_status(kaggle_out)
        if kaggle_rc != 0 and kernel_status in ("UNKNOWN", "AUTH_GAP"):
            gaps.append(f"kaggle_status_rc={kaggle_rc}")

    log_text = _read_log_text(e20b_out)
    if not log_text:
        gaps.append("e20b_log_missing")
    lines = _extract_log_lines(log_text)
    classified = _classify_from_log(lines, kernel_status)

    # Artifacts from failed/complete run
    e20b_models = (e20b_out / "models") if e20b_out else None
    e20b_metrics = _load_json(e20b_models / "metrics.json") if e20b_models else None
    e20b_manifest = _load_json(e20b_models / "split_manifest.json") if e20b_models else None
    if e20b_metrics is None:
        gaps.append("e20b_metrics_json_missing")
    if e20b_manifest is None:
        gaps.append("e20b_split_manifest_missing_or_unread")

    ssot = _load_json(SSOT) or {}
    rails = _load_json(RAILS) or {}
    handoff = _load_json(HANDOFF) or {}
    rails_can_stage = rails.get("can_stage_train_notebook")
    if rails_can_stage is None:
        rails_can_stage = handoff.get("can_stage_train_notebook")

    nb_info = _notebook_fix_status(push_dir)
    lepiota = _lepiota_baseline_metrics(models_dir)

    decision = decide(
        kernel_status=kernel_status,
        classification=classified["classification"],
        rails_can_stage=bool(rails_can_stage) if rails_can_stage is not None else None,
        notebook_ok=bool(
            nb_info.get("notebook_present")
            and nb_info.get("syntax_fix_present")
            and nb_info.get("weight_path_fix_present")
        ),
        metrics_emitted=bool(classified.get("metrics_emitted") or e20b_metrics),
    )

    # Dual ECE from SSOT only (never invent)
    ece_ssot = (ssot.get("ece") if isinstance(ssot, dict) else None) or {}
    measured = (ssot.get("measured") if isinstance(ssot, dict) else None) or {}

    report: dict[str, Any] = {
        "generated_at": _utc_now(),
        "pr": "pr-10 / ML-02",
        "title": "ml(e20b): diagnose Lepiota FT; suite or one safe relaunch",
        "policy": POLICY,
        "lab_only": True,
        "product_unlock": False,
        "can_auto_unlock": False,
        "forage_permission": False,
        "consumption_permission": False,
        "kaggle_push": False,
        "auto_kaggle_push": False,
        "relaunch_executed": False,
        "kernel": {
            "slug": KERNEL_SLUG,
            "baseline_slug": BASELINE_SLUG,
            "weights_dataset": WEIGHTS_DATASET,
            "status": kernel_status,
            "status_raw": kaggle_out[-2000:] if kaggle_out else "",
            "status_rc": kaggle_rc,
        },
        "decision_tree": {
            "steps": ["status", "logs", "classify", "diagnose_first", "suite_or_relaunch_or_baseline"],
            "status": kernel_status,
            "classification": classified["classification"],
            "blocking": classified["blocking"],
            "findings": classified["findings"],
            "decision": decision,
        },
        "artifacts": {
            "e20b_output_dir": str(e20b_out) if e20b_out else None,
            "e20b_metrics_present": e20b_metrics is not None,
            "e20b_split_manifest": {
                "present": e20b_manifest is not None,
                "protocol": (e20b_manifest or {}).get("protocol"),
                "pass": (e20b_manifest or {}).get("pass"),
                "n_train_obs": (e20b_manifest or {}).get("n_train_obs"),
                "n_val_obs": (e20b_manifest or {}).get("n_val_obs"),
                "n_test_obs": (e20b_manifest or {}).get("n_test_obs"),
            },
            "push_dir": nb_info,
            "baseline_models_dir": str(models_dir) if models_dir else None,
        },
        "baseline_ssot": {
            "path": "eval/reports/ml_experiments/E20_BASELINE_METRICS_TO_IMPROVE.json",
            "present": bool(ssot),
            "version": ssot.get("version"),
            "eval_protocol": ssot.get("eval_protocol"),
            "test_domain": ssot.get("test_domain"),
            "measured": {
                "test_map_at_3": measured.get("test_map_at_3"),
                "safety_recall_deadly_at_1": measured.get("safety_recall_deadly_at_1"),
                "safety_recall_deadly_at_3": measured.get("safety_recall_deadly_at_3"),
                "n_deadly_in_test": measured.get("n_deadly_in_test"),
            },
            "ece_dual": {
                "primary": ece_ssot.get("primary") or "train_published",
                "primary_value": ece_ssot.get("primary_value"),
                "primary_source": ece_ssot.get("primary_source"),
                "claim_train_published": ece_ssot.get("claim_train_published"),
                "posthoc_separate": True,
                "posthoc_value": ece_ssot.get("posthoc_value"),
                "temperature_train": ece_ssot.get("temperature_train"),
                "temperature_posthoc": ece_ssot.get("temperature_posthoc"),
                "note": (
                    "Primary ECE is train-published only. Posthoc is lab-only sidecar; "
                    "never sell as primary; never unlock from ECE."
                ),
            },
            "product_unlock": False,
        },
        "rails": {
            "can_stage_train_notebook": rails_can_stage,
            "status": (
                rails.get("status")
                or (
                    (handoff.get("rails") or {}).get("status")
                    if isinstance(handoff.get("rails"), dict)
                    else None
                )
            ),
            "report_path": "eval/reports/ml_experiments/anti_leak_rails_train_latest.json",
        },
        "lepiota_baseline_holdout": lepiota,
        "root_cause": {
            "primary": (
                "SyntaxError in _HARD_NEG class-weight dict (commas inside comments)"
                if classified["classification"] == "launch_script_bug"
                else classified["classification"]
            ),
            "secondary": [
                f["id"]
                for f in classified["findings"]
                if f.get("id") != "syntax_hard_neg_commas"
            ],
            "not_a_training_quality_failure": classified["classification"]
            == "launch_script_bug",
            "no_blind_epoch_bump": True,
        },
        "suite": {
            "ran": False,
            "reason": (
                "E20b not COMPLETE with metrics — suite deferred. "
                "Continue baseline SSOT; suite only after successful e20b COMPLETE."
            ),
        },
        "gaps": gaps,
        "honesty": {
            "metrics_from_ssot_or_measured_only": True,
            "dual_ece_primary": "train_published",
            "product_unlock_forced_false": True,
            "no_auto_kaggle_push": True,
            "map_is_not_safety": True,
            "diagnose_before_relaunch": True,
            "max_auto_relaunch": 1,
            "relaunch_requires_human_operator": True,
        },
        "never": [
            "auto product_unlock=true",
            "auto kaggle push without operator gates",
            "blind epoch bumps",
            "sell posthoc ECE as primary",
            "forage or consumption permission",
            "contaminate GBIF ES holdout",
        ],
        "note": (
            "ML-02 E20b diagnose artifact. Orientation only — never consumption. "
            "product_unlock=false. If credentials/artifacts missing, gaps list is honest."
        ),
    }
    return report


def render_md(report: dict[str, Any]) -> str:
    k = report.get("kernel") or {}
    dt = report.get("decision_tree") or {}
    dec = dt.get("decision") or {}
    base = report.get("baseline_ssot") or {}
    ece = base.get("ece_dual") or {}
    meas = base.get("measured") or {}
    lep = report.get("lepiota_baseline_holdout") or {}
    species = lep.get("species") or {}
    rails = report.get("rails") or {}
    root = report.get("root_cause") or {}
    arts = report.get("artifacts") or {}
    nb = arts.get("push_dir") or {}

    lines = [
        "# E20b diagnose — Lepiota FT (ML-02)",
        "",
        f"**Generated:** `{report.get('generated_at')}`  ",
        f"**Kernel:** `{k.get('slug')}`  ",
        f"**Kaggle status:** `{k.get('status')}`  ",
        f"**Classification:** `{dt.get('classification')}`  ",
        f"**Decision:** `{dec.get('decision')}`  ",
        f"**product_unlock:** `{report.get('product_unlock')}` (forced false)  ",
        f"**Lab only:** `{report.get('lab_only')}` · **kaggle_push:** `{report.get('kaggle_push')}`  ",
        f"**Policy:** `{report.get('policy')}`",
        "",
        "> Diagnose-first. No blind epoch bumps. Dual ECE: primary=train_published; posthoc separate. Orientation only — never consumption.",
        "",
        "## Decision tree",
        "",
        "1. **status** → " + str(k.get("status")),
        "2. **logs** → parsed kernel log (if present)",
        "3. **classify** → " + str(dt.get("classification")),
        "4. **diagnose first** → this artifact",
        "5. **suite OR ≤1 relaunch OR continue baseline** → " + str(dec.get("decision")),
        "",
        f"**Operator action:** {dec.get('operator_action')}",
        "",
    ]

    findings = dt.get("findings") or []
    if findings:
        lines += ["## Findings", ""]
        for f in findings:
            lines.append(
                f"- **{f.get('id')}** ({f.get('severity')}): {f.get('summary')}"
            )
        lines.append("")

    lines += [
        "## Root cause",
        "",
        f"- **Primary:** {root.get('primary')}",
        f"- **Secondary:** {', '.join(root.get('secondary') or []) or 'none'}",
        f"- **Training quality failure?** `{not root.get('not_a_training_quality_failure')}`",
        f"- **Blind epoch bump?** `{not root.get('no_blind_epoch_bump')}` (must stay false)",
        "",
        "## Rails + notebook fix readiness",
        "",
        f"- rails can_stage: `{rails.get('can_stage_train_notebook')}` status=`{rails.get('status')}`",
        f"- notebook present: `{nb.get('notebook_present')}`",
        f"- syntax fix present: `{nb.get('syntax_fix_present')}`",
        f"- weight path fix present: `{nb.get('weight_path_fix_present')}`",
        f"- relaunch_allowed: `{dec.get('relaunch_allowed')}` executed=`{dec.get('relaunch_executed')}`",
        "",
    ]

    if dec.get("relaunch_checklist"):
        lines += ["### ≤1 relaunch checklist (human only — not executed here)", ""]
        for item in dec["relaunch_checklist"]:
            lines.append(f"- [ ] {item}")
        lines.append("")

    lines += [
        "## Baseline SSOT (continue until e20b COMPLETE)",
        "",
        f"Source: `{base.get('path')}` · version=`{base.get('version')}` · protocol=`{base.get('eval_protocol')}`",
        "",
        "| Metric | [MEASURED] |",
        "|--------|------------|",
        f"| MAP@3 | {meas.get('test_map_at_3')} |",
        f"| deadly@1 | {meas.get('safety_recall_deadly_at_1')} |",
        f"| deadly@3 | {meas.get('safety_recall_deadly_at_3')} |",
        f"| n_deadly | {meas.get('n_deadly_in_test')} |",
        f"| ECE primary (train_published) | {ece.get('primary_value')} |",
        f"| ECE posthoc (lab-only) | {ece.get('posthoc_value')} |",
        "",
        "### Dual ECE honesty",
        "",
        f"- primary label: `{ece.get('primary')}` claim_train_published=`{ece.get('claim_train_published')}`",
        f"- posthoc separate: `{ece.get('posthoc_separate')}` — never serve as primary",
        f"- T_train=`{ece.get('temperature_train')}` · T_posthoc=`{ece.get('temperature_posthoc')}`",
        "",
        "## Lepiota holdout friction (E20 baseline GBIF-ES — why FT was designed)",
        "",
    ]

    if not lep.get("available"):
        lines.append("_Baseline per-species metrics unavailable (GAP)._")
        lines.append("")
    else:
        lines += [
            "| Species | n_test | top1 | MAP@3 | true@3 | deadly | top confusions |",
            "|---------|-------:|-----:|------:|-------:|:------:|----------------|",
        ]
        for name in LEPIOTA_FOCUS:
            s = species.get(name) or {}
            conf = s.get("top_pred_confusions") or []
            conf_s = ", ".join(
                f"{c.get('species')}={c.get('count')}" for c in conf[:3]
            )
            lines.append(
                f"| {name} | {s.get('n')} | {s.get('top1')} | {s.get('map_at_3')} | "
                f"{s.get('true_in_top3')} | {s.get('deadly')} | {conf_s} |"
            )
        lines.append("")
        sc = lep.get("split_counts") or {}
        lines.append(f"- train Lepiota obs: `{sc.get('train_obs')}`")
        lines.append(f"- val Lepiota obs: `{sc.get('val_obs')}`")
        lines.append(f"- test Lepiota obs: `{sc.get('test_obs')}`")
        fr = lep.get("friction") or {}
        lines.append(f"- friction: `{fr}`")
        lines.append("")

    sm = (arts.get("e20b_split_manifest") or {})
    lines += [
        "## E20b run artifacts",
        "",
        f"- metrics.json present: `{arts.get('e20b_metrics_present')}`",
        f"- split_manifest: protocol=`{sm.get('protocol')}` pass=`{sm.get('pass')}` "
        f"n_train/val/test=`{sm.get('n_train_obs')}/{sm.get('n_val_obs')}/{sm.get('n_test_obs')}`",
        f"- suite ran: `{(report.get('suite') or {}).get('ran')}` — {(report.get('suite') or {}).get('reason')}",
        "",
        "## Gaps",
        "",
    ]
    gaps = report.get("gaps") or []
    if gaps:
        for g in gaps:
            lines.append(f"- {g}")
    else:
        lines.append("- none")

    lines += [
        "",
        "## Never",
        "",
    ]
    for n in report.get("never") or []:
        lines.append(f"- {n}")

    lines += [
        "",
        "---",
        "",
        "_Orientation only · never consumption · product_unlock=false · dual ECE honesty_",
        "",
    ]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--models-dir", type=Path, default=None)
    ap.add_argument("--e20b-out", type=Path, default=None)
    ap.add_argument("--push-dir", type=Path, default=None)
    ap.add_argument("--skip-kaggle", action="store_true")
    args = ap.parse_args(argv)

    report = build_report(
        models_dir=args.models_dir,
        e20b_out=args.e20b_out,
        push_dir=args.push_dir,
        skip_kaggle=args.skip_kaggle,
    )
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    OUT_MD.write_text(render_md(report), encoding="utf-8")

    dec = (report.get("decision_tree") or {}).get("decision") or {}
    print(
        f"wrote {OUT_JSON} status={report['kernel']['status']} "
        f"class={report['decision_tree']['classification']} "
        f"decision={dec.get('decision')} product_unlock={report['product_unlock']}"
    )
    print(f"wrote {OUT_MD}")
    # Non-gating diagnose exit 0 unless catastrophic missing both ssot and status
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
