"""ECE residual honesty (M2) — advisory calibration residual for product UI.

Reads published metrics (e.g. E20 ``test_ece``) and classifies residual severity.
Never unlocks Identify. Never forage / consumption permission.

Bands (orientation-only heuristics for mycological multi-class):
  - good:     ECE < 0.05  — confidence roughly trustworthy for ranking chrome
  - moderate: ECE < 0.12  — show confidence only with de-emphasis
  - high:     ECE ≥ 0.12  — hide or heavily de-emphasize confidence on Identify
  - unknown:  missing metric

E20 source-holdout published ECE ≈ 0.188 → **high** residual (soft gates on MAP/deadly
can still PASS while confidence chrome must stay humble).
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

POLICY = "orientation_only_never_consume"
PRODUCT_UNLOCK = False

# Advisory bands — never product gates for unlock
ECE_GOOD_MAX = 0.05
ECE_MODERATE_MAX = 0.12

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_METRICS = ROOT / "kaggle" / "kernel_output_v20" / "models" / "metrics.json"
DEFAULT_OUT = ROOT / "eval" / "reports" / "ml_experiments" / "e20_ece_residual.json"


def classify_ece_band(ece: float | None) -> str:
    if ece is None:
        return "unknown"
    try:
        v = float(ece)
    except (TypeError, ValueError):
        return "unknown"
    if v != v:  # NaN
        return "unknown"
    if v < 0:
        return "unknown"
    if v < ECE_GOOD_MAX:
        return "good"
    if v < ECE_MODERATE_MAX:
        return "moderate"
    return "high"


def ece_product_guidance(band: str) -> dict[str, Any]:
    """What Identify/product should do — never edible clearance."""
    if band == "good":
        return {
            "show_confidence": True,
            "deemphasize_confidence": False,
            "prefer_open_set_abstain": True,
            "summary_es": "ECE bajo: confianza usable con cautela · sigue sin permiso de consumo.",
            "summary_en": "Low ECE: confidence usable with caution · still never consumption permission.",
        }
    if band == "moderate":
        return {
            "show_confidence": True,
            "deemphasize_confidence": True,
            "prefer_open_set_abstain": True,
            "summary_es": "ECE moderado: de-enfatizar % en UI · open-set y multi-vista mandan.",
            "summary_en": "Moderate ECE: de-emphasize % in UI · open-set and multi-view lead.",
        }
    if band == "high":
        return {
            "show_confidence": False,  # product may still gate via shouldShowConfidence
            "deemphasize_confidence": True,
            "prefer_open_set_abstain": True,
            "summary_es": (
                "ECE alto (residual): no confiar en % del modelo. "
                "Abstención open-set + multi-vista + revisión humana. "
                "Nunca permiso de consumo."
            ),
            "summary_en": (
                "High ECE residual: do not trust model %. "
                "Open-set abstain + multi-view + human review. "
                "Never consumption permission."
            ),
        }
    return {
        "show_confidence": False,
        "deemphasize_confidence": True,
        "prefer_open_set_abstain": True,
        "summary_es": "ECE desconocido: fall-closed — no mostrar confianza como certeza.",
        "summary_en": "Unknown ECE: fail-closed — do not show confidence as certainty.",
    }


def residual_actions(band: str, ece: float | None, temperature: float | None) -> list[str]:
    actions = [
        "Keep product_unlock=false until operator cycle (orientation only).",
        "Never treat confidence as edible clearance or forage permission.",
    ]
    if band == "high":
        actions.extend(
            [
                "De-emphasize or hide Identify confidence chrome (shouldShowConfidence soft path).",
                "Prefer open-set reject / needs_review over forced top-1 display.",
                "Optional: re-temperature on holdout logits if test_predictions.npz available.",
                "Grow multi-view same-specimen holdout before trusting confidence UI.",
            ]
        )
    elif band == "moderate":
        actions.extend(
            [
                "Show confidence only with orientation disclaimer.",
                "Monitor ECE after next training loop; do not relax open-set thr for chrome.",
            ]
        )
    elif band == "good":
        actions.append("Still keep deadly@3 + open-set gates ahead of confidence chrome.")
    else:
        actions.append("Publish test_ece on next eval artifact for residual tracking.")
    if temperature is not None:
        try:
            t = float(temperature)
            if t > 1.2:
                actions.append(
                    f"Temperature already scaled (T={t:.3f}); residual ECE may remain high on domain shift."
                )
        except (TypeError, ValueError):
            pass
    if ece is not None:
        try:
            actions.append(f"Recorded ECE={float(ece):.4f} band={band}.")
        except (TypeError, ValueError):
            pass
    return actions


def build_ece_residual_from_metrics(
    metrics: dict[str, Any] | None,
    *,
    source: str = "metrics.json",
) -> dict[str, Any]:
    metrics = metrics or {}
    ece_raw = metrics.get("test_ece")
    if ece_raw is None:
        ece_raw = metrics.get("ece")
    try:
        ece = float(ece_raw) if ece_raw is not None else None
    except (TypeError, ValueError):
        ece = None
    band = classify_ece_band(ece)
    guidance = ece_product_guidance(band)
    temp = metrics.get("temperature")
    try:
        temperature = float(temp) if temp is not None else None
    except (TypeError, ValueError):
        temperature = None

    map3 = metrics.get("test_map_at_3")
    deadly3 = metrics.get("safety_recall_deadly_at_3") or metrics.get("safety_recall_deadly")

    return {
        "product_unlock": PRODUCT_UNLOCK,
        "can_auto_unlock": False,
        "forage_permission": False,
        "consumption_permission": False,
        "policy": POLICY,
        "source": source,
        "test_ece": ece,
        "band": band,
        "bands": {
            "good_max": ECE_GOOD_MAX,
            "moderate_max": ECE_MODERATE_MAX,
            "note": "Advisory only — not unlock gates",
        },
        "temperature": temperature,
        "test_map_at_3": map3,
        "safety_recall_deadly_at_3": deadly3,
        "eval_protocol": metrics.get("eval_protocol"),
        "test_domain": metrics.get("test_domain"),
        "guidance": guidance,
        "residual_actions": residual_actions(band, ece, temperature),
        "honesty": (
            "Soft MAP/deadly gates can PASS while ECE remains high (domain shift). "
            "Confidence UI must stay humble. Orientation only."
        ),
        "generated": datetime.now(timezone.utc).isoformat(),
    }


def load_metrics_json(path: Path | None = None) -> tuple[dict[str, Any] | None, Path]:
    p = Path(path) if path else DEFAULT_METRICS
    if not p.is_file():
        return None, p
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None, p
    except (OSError, json.JSONDecodeError):
        return None, p


def build_ece_residual_report(metrics_path: Path | None = None) -> dict[str, Any]:
    metrics, path = load_metrics_json(metrics_path)
    if metrics is None:
        out = build_ece_residual_from_metrics(None, source=str(path))
        out["status"] = "missing_metrics"
        out["metrics_path"] = str(path)
        out["exists"] = path.is_file()
        return out
    out = build_ece_residual_from_metrics(metrics, source=str(path))
    out["status"] = "ok"
    out["metrics_path"] = str(path)
    out["exists"] = True
    out["version"] = metrics.get("version")
    return out


def write_ece_residual_report(
    repo: Path | None = None,
    *,
    metrics_path: Path | None = None,
    out_dir: Path | None = None,
) -> dict[str, Any]:
    repo = Path(repo or ROOT)
    report = build_ece_residual_report(metrics_path)
    dest_dir = Path(out_dir) if out_dir else repo / "eval" / "reports" / "ml_experiments"
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / "e20_ece_residual.json"
    dest.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    report["report_path"] = str(dest)
    return report


if __name__ == "__main__":
    r = write_ece_residual_report()
    print(json.dumps({k: r[k] for k in ("status", "test_ece", "band", "product_unlock", "report_path") if k in r}, indent=2))
