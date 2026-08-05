#!/usr/bin/env python3
"""Post-train suite for a finished kernel models dir (E20c / E20b / E20).

Reads measured metrics + split artifacts only — never invents MAP/deadly/ECE.
Always product_unlock=false. Dual ECE: primary = train-published when proven.

Writes:
  eval/reports/ml_experiments/loop_post_train_suite_latest.json
  eval/reports/ml_experiments/loop_post_train_suite_latest.md
  eval/reports/ml_experiments/e20c_metrics_snapshot.json  (when --run-id e20c)

Exit:
  0 when suite status is suite_ok or suite_ok_with_gaps (lab continues)
  1 when critical artifacts missing and --gate (default non-gating exit 0)

Usage:
  python scripts/loop_ml_post_train_suite.py --models-dir kaggle/kernel_output_v20c/models
  python scripts/loop_ml_post_train_suite.py --models-dir PATH --run-id e20c
  python scripts/loop_ml_post_train_suite.py --gate
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.verify_anti_leak_rails_for_train import (  # noqa: E402
    check_code_rails_present,
    check_obs_disjoint_runtime,
    check_source_domains_runtime,
    check_split_manifest,
    _repo_rel,
)

POLICY = "orientation_only_never_consume"
REPORT_DIR = ROOT / "eval" / "reports" / "ml_experiments"
OUT_JSON = REPORT_DIR / "loop_post_train_suite_latest.json"
OUT_MD = REPORT_DIR / "loop_post_train_suite_latest.md"

# Prefer in-repo E20c then env-style candidates (no invented metrics if missing)
DEFAULT_MODELS_CANDIDATES = (
    ROOT / "kaggle" / "kernel_output_v20c" / "models",
    ROOT / "kaggle" / "kernel_output_v20b" / "models",
    ROOT / "kaggle" / "kernel_output_v20" / "models",
)

SOFT_MAP = 0.25
SOFT_DEADLY = 0.90
_ECE_TRAIN_PUB_FLAG = "ece_primary_is_train_published"


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


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )


def resolve_models_dir(explicit: Path | None) -> Path | None:
    if explicit is not None:
        p = Path(explicit)
        if p.is_dir():
            return p
        # allow pointing at kernel_output_v20c root
        if (p / "models").is_dir():
            return p / "models"
        return None
    for c in DEFAULT_MODELS_CANDIDATES:
        if c.is_dir():
            return c
    return None


def _obs_source_counts(blob: Any) -> dict[str, int]:
    rows: list[Any]
    if isinstance(blob, list):
        rows = blob
    elif isinstance(blob, dict):
        for key in ("observations", "rows", "data", "observation_ids"):
            if isinstance(blob.get(key), list):
                rows = blob[key]
                break
        else:
            rows = []
    else:
        rows = []
    ctr: Counter[str] = Counter()
    for r in rows:
        if isinstance(r, dict):
            s = r.get("source_db") or r.get("source") or "unknown"
            ctr[str(s).lower()] += 1
        else:
            ctr["non_dict_row"] += 1
    return dict(sorted(ctr.items()))


def resolve_ece_primary(
    metrics: dict[str, Any],
    *,
    from_kernel_train_publish: bool,
) -> dict[str, Any]:
    """Dual ECE honesty — posthoc never becomes primary.

    For a fresh kernel metrics.json (no posthoc keys), bare test_ece IS the
    train-published value (what the notebook wrote at train time). We only claim
    train_published when:
      - test_ece_train_published is set, or
      - ece_primary_is_train_published flag, or
      - from_kernel_train_publish=True and bare test_ece present with no posthoc
        already standing as primary (kernel pull path).
    """
    ece_train_pub = _f(metrics.get("test_ece_train_published"))
    ece_raw = _f(metrics.get("test_ece"))
    ece_posthoc = _f(metrics.get("test_ece_posthoc"))
    flagged = bool(metrics.get(_ECE_TRAIN_PUB_FLAG))
    gaps: list[str] = []

    if ece_train_pub is not None:
        primary_value = ece_train_pub
        primary_label = "train_published"
        primary_source = "test_ece_train_published"
        claim = True
    elif flagged and ece_raw is not None:
        primary_value = ece_raw
        primary_label = "train_published"
        primary_source = "test_ece_flagged_train_published"
        claim = True
    elif from_kernel_train_publish and ece_raw is not None:
        # Kernel train-time metrics.json: test_ece is train-published
        primary_value = ece_raw
        primary_label = "train_published"
        primary_source = "kernel_metrics_test_ece_as_train_published"
        claim = True
    elif ece_raw is not None:
        primary_value = ece_raw
        primary_label = "test_ece_unspecified"
        primary_source = "test_ece_fallback"
        claim = False
        gaps.append("ece_primary_provenance_unspecified")
    else:
        primary_value = None
        primary_label = "missing"
        primary_source = None
        claim = False
        gaps.append("ece_primary_missing")

    temp_train = _f(metrics.get("temperature_train"))
    temp_train_source = "temperature_train" if temp_train is not None else None
    if temp_train is None:
        temp_train = _f(metrics.get("temperature"))
        temp_train_source = "temperature" if temp_train is not None else None

    # S1 honesty: never synthesize test_ece_train_published when kernel lacked the key.
    # claim_train_published + primary_source carry kernel-path provenance instead.
    return {
        "primary": primary_label,
        "primary_value": primary_value,
        "primary_source": primary_source,
        "claim_train_published": claim,
        "test_ece": ece_raw,
        "test_ece_train_published": ece_train_pub,  # only if present on metrics; never backfill
        "posthoc_separate": True,
        "posthoc_value": ece_posthoc,
        "test_ece_posthoc": ece_posthoc,
        "temperature_train": temp_train,
        "temperature_train_source": temp_train_source,
        "temperature_posthoc": _f(metrics.get("temperature_posthoc")),
        "gaps": gaps,
        "note": (
            "Primary ECE is train-published only with explicit provenance "
            "(test_ece_train_published, flag, or kernel train metrics pull via primary_source). "
            "test_ece_train_published is never synthesized when absent from metrics.json. "
            "Posthoc temperature search is lab-only and must not replace primary."
        ),
    }


# Known MO / iNat source aliases (exact token match after normalize; N1)
_MO_INAT_SOURCE_ALIASES = frozenset(
    {
        "mo",
        "mushroom_observer",
        "mushroom-observer",
        "inat",
        "inaturalist",
        "i_naturalist",
        "i-naturalist",
    }
)


def _normalize_source_token(s: str) -> str:
    return str(s).strip().lower().replace("-", "_").replace(" ", "_")


def is_mo_inat_source(source_key: str) -> bool:
    """True iff source_key is a known MO/iNat alias (exact token, not substring)."""
    tok = _normalize_source_token(source_key)
    if tok in _MO_INAT_SOURCE_ALIASES:
        return True
    # allow dotted / path-ish keys ending with a known alias (e.g. train.mo)
    parts = [p for p in tok.replace(".", "_").split("_") if p]
    if not parts:
        return False
    # require last segment or full rejoin of last two in alias set — avoid "demo" / "common"
    if parts[-1] in _MO_INAT_SOURCE_ALIASES:
        return True
    if len(parts) >= 2 and f"{parts[-2]}_{parts[-1]}" in _MO_INAT_SOURCE_ALIASES:
        return True
    return False


def runtime_train_domain_label(train_src: dict[str, int]) -> str | None:
    """Derive runtime train domain from observation source counts (measured reality)."""
    if not train_src:
        return None
    # drop non-count noise
    keys = sorted(k for k, n in train_src.items() if k != "non_dict_row" and int(n or 0) > 0)
    if not keys:
        return None
    if len(keys) == 1:
        return f"{keys[0]}_only"
    return "+".join(keys)


def _artifact_presence(models_dir: Path) -> dict[str, Any]:
    keys = {
        "metrics.json": models_dir / "metrics.json",
        "label2idx.json": models_dir / "label2idx.json",
        "split_manifest.json": models_dir / "split_manifest.json",
        "train_obs.json": models_dir / "train_obs.json",
        "val_obs.json": models_dir / "val_obs.json",
        "test_obs.json": models_dir / "test_obs.json",
        "test_predictions.npz": models_dir / "test_predictions.npz",
        "training_history.json": models_dir / "training_history.json",
        "best.pt": models_dir / "best.pt",
        "best_deadly.pt": models_dir / "best_deadly.pt",
        "temperature_scaler.pt": models_dir / "temperature_scaler.pt",
    }
    present = {k: p.is_file() for k, p in keys.items()}
    sizes = {
        k: (keys[k].stat().st_size if present[k] else None) for k in keys
    }
    required = ("metrics.json", "label2idx.json", "split_manifest.json")
    required_ok = all(present[k] for k in required)
    return {
        "present": present,
        "sizes_bytes": sizes,
        "required_ok": required_ok,
        "required": list(required),
    }


def run_suite(
    *,
    models_dir: Path | None,
    run_id: str,
    kernel_slug: str | None,
) -> dict[str, Any]:
    gaps: list[str] = []
    checks: dict[str, Any] = {}

    if models_dir is None:
        gaps.append("models_dir_missing")
        return {
            "generated_at": _utc_now(),
            "run_id": run_id,
            "status": "GAP_no_kernel_output",
            "suite_ok": False,
            "policy": POLICY,
            "product_unlock": False,
            "can_auto_unlock": False,
            "forage_permission": False,
            "consumption_permission": False,
            "lab_only": True,
            "metrics_label": "[MEASURED]",
            "gaps": gaps,
            "checks": checks,
            "operator_action": (
                "GAP: no models dir. Pull with "
                "`kaggle kernels output <slug> -p kaggle/kernel_output_v20c` "
                "or pass --models-dir. Continue lab on E20 baseline SSOT; "
                "never auto product_unlock."
            ),
            "honesty": {
                "metrics_from_ssot_files_only": True,
                "dual_ece_primary": "train_published_when_proven",
                "product_unlock_forced_false": True,
                "no_invented_metrics": True,
            },
        }

    art = _artifact_presence(models_dir)
    checks["artifacts"] = art
    if not art["required_ok"]:
        gaps.append("required_artifacts_missing")

    metrics_path = models_dir / "metrics.json"
    metrics = _load_json(metrics_path)
    if not isinstance(metrics, dict):
        gaps.append("metrics_json_unreadable")
        metrics = {}

    # Kernel train publish path: metrics.json from Kaggle output is train-time
    ece = resolve_ece_primary(metrics, from_kernel_train_publish=True)
    gaps.extend(ece.get("gaps") or [])

    map3 = _f(metrics.get("test_map_at_3"))
    d1 = _f(metrics.get("safety_recall_deadly_at_1"))
    d3 = _f(metrics.get("safety_recall_deadly_at_3"))
    if d3 is None:
        d3 = _f(metrics.get("safety_recall_deadly"))
    n_deadly = metrics.get("n_deadly_in_test")
    if n_deadly is None:
        n_deadly = metrics.get("n_deadly_eval")

    soft_map_pass = map3 is not None and map3 >= SOFT_MAP
    soft_deadly_pass = d3 is not None and d3 >= SOFT_DEADLY
    dual_deadly = d1 is not None and d3 is not None
    if not dual_deadly:
        gaps.append("dual_deadly_keys_incomplete")

    version = metrics.get("version")
    eval_protocol = metrics.get("eval_protocol")
    if not version:
        gaps.append("version_unknown")
    if not eval_protocol:
        gaps.append("eval_protocol_unknown")

    measured = {
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
        "best_epoch": metrics.get("best_epoch"),
        "best_val_map3": _f(metrics.get("best_val_map3")),
        "databases_used": metrics.get("databases_used"),
        "datasets_mounted": metrics.get("datasets_mounted"),
    }

    # Split / anti-leak
    manifest = _load_json(models_dir / "split_manifest.json")
    train_blob = _load_json(models_dir / "train_obs.json")
    val_blob = _load_json(models_dir / "val_obs.json")
    test_blob = _load_json(models_dir / "test_obs.json")

    split_check = check_split_manifest(manifest if isinstance(manifest, dict) else None)
    checks["split_manifest"] = split_check
    if not split_check.get("pass"):
        gaps.append(f"split_manifest_{split_check.get('status', 'FAIL').lower()}")

    disjoint = check_obs_disjoint_runtime(train_blob, val_blob, test_blob)
    checks["obs_disjoint"] = disjoint
    if not disjoint.get("pass"):
        gaps.append(f"obs_disjoint_{disjoint.get('status', 'FAIL').lower()}")

    domains = check_source_domains_runtime(
        train_blob, test_blob, manifest=manifest if isinstance(manifest, dict) else None
    )
    checks["source_domains"] = domains
    if not domains.get("pass"):
        gaps.append(f"source_domains_{domains.get('status', 'FAIL').lower()}")

    code_rails = check_code_rails_present(ROOT)
    checks["code_rails"] = code_rails
    if not code_rails.get("pass"):
        gaps.append("code_rails_incomplete")

    train_src = _obs_source_counts(train_blob)
    val_src = _obs_source_counts(val_blob)
    test_src = _obs_source_counts(test_blob)
    checks["source_counts"] = {
        "train": train_src,
        "val": val_src,
        "test": test_src,
    }

    # E20c-specific honesty: MO+iNat claimed but may be empty in train (exact aliases; N1)
    train_keys = set(train_src.keys())
    mo_inat_in_train = sorted(k for k in train_keys if is_mo_inat_source(k))
    claimed_mo_inat = False
    sc = metrics.get("subsample_config") if isinstance(metrics.get("subsample_config"), dict) else {}
    sources_train = sc.get("sources_train") if isinstance(sc.get("sources_train"), list) else []
    if any(is_mo_inat_source(str(s)) for s in sources_train):
        claimed_mo_inat = True
    # protocol / version markers use underscore or hyphen form (not bare substring "mo")
    proto_l = str(eval_protocol or "").lower()
    ver_l = str(version or "").lower()
    if "mo_inat" in proto_l or "mo-inat" in proto_l or "mo_inat" in ver_l or "mo-inat" in ver_l:
        claimed_mo_inat = True
    train_mo_inat_obs = sum(int(train_src.get(k, 0) or 0) for k in mo_inat_in_train)
    if claimed_mo_inat and train_mo_inat_obs == 0:
        gaps.append("mo_inat_claimed_but_zero_train_obs")
    checks["mo_inat"] = {
        "claimed_in_protocol_or_config": claimed_mo_inat,
        "train_source_keys_matching": mo_inat_in_train,
        "train_mo_inat_obs": train_mo_inat_obs,
        "note": (
            "If claimed but zero, suite still runs on available FT+GBIF metrics; "
            "do not invent MO+iNat uplift."
        ),
    }

    # S3: dual-write claimed vs runtime train domain (do not let claim string look measured)
    train_domain_claimed = metrics.get("train_domain")
    train_domain_runtime = runtime_train_domain_label(train_src)
    checks["train_domain"] = {
        "claimed": train_domain_claimed,
        "runtime": train_domain_runtime,
        "source_counts_train": train_src,
    }
    if (
        train_domain_claimed
        and train_domain_runtime
        and "mo" in str(train_domain_claimed).lower()
        and train_domain_runtime == "fungitastic_only"
    ):
        # informative only; mo_inat gap already covers uplift honesty
        if "train_domain_claim_vs_runtime_mismatch" not in gaps:
            gaps.append("train_domain_claim_vs_runtime_mismatch")

    leak_hits = 0
    for block in (split_check.get("leaks") or {}, disjoint.get("leaks") or {}):
        if isinstance(block, dict):
            for v in block.values():
                try:
                    leak_hits += int(v or 0)
                except (TypeError, ValueError):
                    pass
    checks["leak_hits_total"] = leak_hits
    if leak_hits > 0:
        gaps.append("leak_hits_nonzero")

    suite_core_ok = (
        art["required_ok"]
        and map3 is not None
        and d3 is not None
        and leak_hits == 0
        and bool(split_check.get("pass"))
        and bool(disjoint.get("pass"))
    )
    # Domain check fail is hard FAIL; GAP on missing fields already in split_check
    hard_fail = (
        leak_hits > 0
        or (disjoint.get("status") == "FAIL")
        or (split_check.get("status") == "FAIL")
        or (domains.get("status") == "FAIL")
    )

    if hard_fail:
        status = "suite_fail"
        suite_ok = False
    elif suite_core_ok and not gaps:
        status = "suite_ok"
        suite_ok = True
    elif suite_core_ok:
        status = "suite_ok_with_gaps"
        suite_ok = True
    else:
        status = "suite_incomplete"
        suite_ok = False

    soft = {
        "soft_map_threshold": SOFT_MAP,
        "soft_deadly_at_3_threshold": SOFT_DEADLY,
        "soft_map_pass": soft_map_pass,
        "soft_deadly_at_3_pass": soft_deadly_pass,
        "dual_deadly_keys_present": dual_deadly,
        "note": "Advisory only — never unlock Identify from soft gates alone.",
    }

    operator_action = (
        "Post-train suite complete. Compare vs E20 SSOT with "
        "loop_ml_compare_to_baseline.py. product_unlock remains false. "
        "Do not auto-unlock; continue lab frictions (open-set / deadly@1 / ECE dual)."
    )
    if "mo_inat_claimed_but_zero_train_obs" in gaps:
        operator_action += (
            " GAP: MO+iNat claimed in protocol but train_obs has zero MO/iNat rows — "
            "metrics reflect FT-only train (same family as E20); investigate dataset mount."
        )
    if hard_fail:
        operator_action = (
            "Suite FAIL: leak or domain rails failed. Do not stage/serve from this run. "
            "product_unlock=false. Fall back to E20 baseline SSOT."
        )
    if not art["required_ok"]:
        operator_action = (
            "Suite incomplete: required artifacts missing under models dir. "
            "Re-pull kernel output; product_unlock=false."
        )

    report: dict[str, Any] = {
        "generated_at": _utc_now(),
        "run_id": run_id,
        "kernel_slug": kernel_slug,
        "status": status,
        "suite_ok": suite_ok,
        "policy": POLICY,
        "product_unlock": False,
        "can_auto_unlock": False,
        "forage_permission": False,
        "consumption_permission": False,
        "lab_only": True,
        "metrics_label": "[MEASURED]",
        "models_dir": _repo_rel(models_dir) or str(models_dir),
        "models_dir_resolved": str(models_dir.resolve()),
        "source_metrics_path": _repo_rel(metrics_path) or str(metrics_path),
        "version": version,
        "eval_protocol": eval_protocol,
        "test_domain": metrics.get("test_domain"),
        # keep kernel claim for provenance, but dual-write runtime (S3)
        "train_domain": train_domain_claimed,
        "train_domain_claimed": train_domain_claimed,
        "train_domain_runtime": train_domain_runtime,
        "measured": measured,
        "ece": {
            "primary": ece["primary"],
            "primary_value": ece["primary_value"],
            "primary_source": ece["primary_source"],
            "claim_train_published": ece["claim_train_published"],
            "test_ece": ece["test_ece"],
            # null when kernel lacked the key — do not synthesize (S1)
            "test_ece_train_published": ece["test_ece_train_published"],
            "posthoc_separate": True,
            "posthoc_value": ece["posthoc_value"],
            "test_ece_posthoc": ece["test_ece_posthoc"],
            "temperature_train": ece["temperature_train"],
            "temperature_train_source": ece["temperature_train_source"],
            "temperature_posthoc": ece["temperature_posthoc"],
            "note": ece["note"],
        },
        "soft_gates_advisory": soft,
        "checks": checks,
        "gaps": gaps,
        "operator_action": operator_action,
        "honesty": {
            "metrics_from_ssot_files_only": True,
            "dual_ece_primary": (
                "train_published" if ece["claim_train_published"] else ece["primary"]
            ),
            "posthoc_never_primary": True,
            "product_unlock_forced_false": True,
            "no_invented_metrics": True,
            "map_is_not_safety": True,
            "open_set_honesty": True,
        },
        "never": [
            "auto product_unlock=true",
            "sell posthoc ECE as primary",
            "forage or consumption permission",
            "invent MAP/deadly/ECE/version",
            "pick max(MAP) across kernels for serve gate",
        ],
        "citation_rule": (
            "Copy full-precision [MEASURED] values from this JSON or kernel metrics.json; "
            "do not round in PR titles."
        ),
        "note": (
            "Post-train suite for VisionSetil ML lab. Orientation only. "
            "Kernel weights under kaggle/kernel_output* are gitignored — "
            "suite + snapshot JSON are the durable lab artifacts."
        ),
    }
    return report


def render_md(report: dict[str, Any]) -> str:
    m = report.get("measured") or {}
    e = report.get("ece") or {}
    soft = report.get("soft_gates_advisory") or {}
    gaps = report.get("gaps") or []
    lines = [
        "# Loop post-train suite (latest)",
        "",
        f"**Generated:** `{report.get('generated_at')}`  ",
        f"**Run id:** `{report.get('run_id')}`  ",
        f"**Status:** `{report.get('status')}`  ",
        f"**suite_ok:** `{report.get('suite_ok')}`  ",
        f"**product_unlock:** `{report.get('product_unlock')}` (forced false)  ",
        f"**Policy:** `{report.get('policy')}`",
        "",
        f"> Cite **[MEASURED]** full precision from JSON SSOT / this report. Never invent.",
        "",
        "## Operator action",
        "",
        str(report.get("operator_action") or ""),
        "",
        "## Measured metrics",
        "",
        f"Source: `{report.get('source_metrics_path')}`  ",
        f"version: `{report.get('version')}` · protocol: `{report.get('eval_protocol')}`  ",
        f"train_domain_claimed: `{report.get('train_domain_claimed')}`  ",
        f"train_domain_runtime: `{report.get('train_domain_runtime')}`  ",
        f"test_domain: `{report.get('test_domain')}`",
        "",
        "| Metric | [MEASURED] |",
        "|--------|------------|",
        f"| MAP@3 | {json.dumps(m.get('test_map_at_3')) if m.get('test_map_at_3') is not None else 'n/a'} |",
        f"| deadly@1 | {json.dumps(m.get('safety_recall_deadly_at_1')) if m.get('safety_recall_deadly_at_1') is not None else 'n/a'} |",
        f"| deadly@3 | {json.dumps(m.get('safety_recall_deadly_at_3')) if m.get('safety_recall_deadly_at_3') is not None else 'n/a'} |",
        f"| n_deadly | {m.get('n_deadly_in_test')} |",
        f"| ECE primary ({e.get('primary')}) | {json.dumps(e.get('primary_value')) if e.get('primary_value') is not None else 'n/a'} |",
        f"| ECE posthoc (lab-only) | {json.dumps(e.get('posthoc_value')) if e.get('posthoc_value') is not None else 'n/a'} |",
        f"| claim_train_published | `{e.get('claim_train_published')}` |",
        f"| primary_source | `{e.get('primary_source')}` |",
        f"| test_ece_train_published (kernel key only) | {json.dumps(e.get('test_ece_train_published')) if e.get('test_ece_train_published') is not None else 'null'} |",
        "",
        "### Soft gates (advisory only)",
        "",
        f"- soft MAP@3 ≥ {SOFT_MAP}: `{soft.get('soft_map_pass')}`",
        f"- soft deadly@3 ≥ {SOFT_DEADLY}: `{soft.get('soft_deadly_at_3_pass')}`",
        f"- dual deadly keys: `{soft.get('dual_deadly_keys_present')}`",
        "",
        "## Dual ECE honesty",
        "",
        f"- **Primary:** `{e.get('primary')}` = `{e.get('primary_value')}` "
        f"(source=`{e.get('primary_source')}`, claim_train_published=`{e.get('claim_train_published')}`)",
        f"- **test_ece_train_published key:** `{json.dumps(e.get('test_ece_train_published'))}` "
        f"(null unless present on kernel metrics.json — never backfilled)",
        f"- **Posthoc (separate, no serve):** `{e.get('posthoc_value')}`",
        "",
        "## Checks",
        "",
        f"- leak_hits_total: `{(report.get('checks') or {}).get('leak_hits_total')}`",
        f"- split_manifest: `{(report.get('checks') or {}).get('split_manifest', {}).get('status')}`",
        f"- obs_disjoint: `{(report.get('checks') or {}).get('obs_disjoint', {}).get('status')}`",
        f"- source_domains: `{(report.get('checks') or {}).get('source_domains', {}).get('status')}`",
        f"- mo_inat: `{json.dumps((report.get('checks') or {}).get('mo_inat'), ensure_ascii=False)}`",
        "",
    ]
    if gaps:
        lines.extend(["## GAPs", ""])
        for g in gaps:
            lines.append(f"- `{g}`")
        lines.append("")
    lines.extend(
        [
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
        "--run-id",
        default="e20c",
        help="Lab run id label (default e20c)",
    )
    ap.add_argument(
        "--kernel-slug",
        default="alonsoalviraaaa/visionsetil-exp-v20c-mo-inat",
        help="Kaggle kernel slug for provenance (no network call)",
    )
    ap.add_argument(
        "--gate",
        action="store_true",
        help="Exit 1 when suite_ok is false (default non-gating exit 0)",
    )
    ap.add_argument(
        "--out-json",
        type=Path,
        default=OUT_JSON,
    )
    ap.add_argument(
        "--out-md",
        type=Path,
        default=OUT_MD,
    )
    args = ap.parse_args(argv)

    models = resolve_models_dir(args.models_dir)
    report = run_suite(
        models_dir=models,
        run_id=args.run_id,
        kernel_slug=args.kernel_slug,
    )

    out_json = Path(args.out_json)
    out_md = Path(args.out_md)
    _write_json(out_json, report)
    out_md.parent.mkdir(parents=True, exist_ok=True)
    out_md.write_text(render_md(report), encoding="utf-8")

    # Durable metrics snapshot for e20c (kernel_output is gitignored)
    if args.run_id == "e20c" and models is not None:
        snap_path = REPORT_DIR / "e20c_metrics_snapshot.json"
        metrics = _load_json(models / "metrics.json") or {}
        snap = {
            "generated_at": report["generated_at"],
            "run_id": "e20c",
            "kernel_slug": args.kernel_slug,
            "models_dir": report.get("models_dir"),
            "metrics_label": "[MEASURED]",
            "product_unlock": False,
            "can_auto_unlock": False,
            "forage_permission": False,
            "consumption_permission": False,
            "policy": POLICY,
            "lab_only": True,
            "version": metrics.get("version") if isinstance(metrics, dict) else None,
            "eval_protocol": metrics.get("eval_protocol") if isinstance(metrics, dict) else None,
            "test_domain": metrics.get("test_domain") if isinstance(metrics, dict) else None,
            "train_domain": report.get("train_domain"),
            "train_domain_claimed": report.get("train_domain_claimed"),
            "train_domain_runtime": report.get("train_domain_runtime"),
            "measured": report.get("measured"),
            "ece": report.get("ece"),
            "soft_gates_advisory": report.get("soft_gates_advisory"),
            "source_counts": (report.get("checks") or {}).get("source_counts"),
            "mo_inat": (report.get("checks") or {}).get("mo_inat"),
            "leak_hits_total": (report.get("checks") or {}).get("leak_hits_total"),
            "suite_status": report.get("status"),
            "suite_ok": report.get("suite_ok"),
            "gaps": report.get("gaps"),
            "note": (
                "Snapshot of E20c kernel metrics for git-durable SSOT. "
                "Full weights under kaggle/kernel_output_v20c are gitignored. "
                "Primary ECE claimed train-published via primary_source; "
                "test_ece_train_published is null unless kernel wrote that key. "
                "Never auto unlock. train_domain_runtime is measured from obs counts."
            ),
        }
        _write_json(snap_path, snap)
        print(f"wrote {_repo_rel(snap_path) or snap_path}")

    print(f"wrote {_repo_rel(out_json) or out_json}")
    print(f"wrote {_repo_rel(out_md) or out_md}")
    print(
        f"status={report.get('status')} suite_ok={report.get('suite_ok')} "
        f"product_unlock={report.get('product_unlock')} gaps={report.get('gaps')}"
    )

    if args.gate and not report.get("suite_ok"):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
