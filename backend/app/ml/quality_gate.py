"""Hard quality gate from on-disk training metrics (no invented numbers)."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.core.config import settings


def _repo_root() -> Path:
    return Path(getattr(settings, "repo_root", None) or Path(settings.base_dir).parent)


@lru_cache(maxsize=4)
def load_primary_metrics(repo_root: str | None = None) -> dict[str, Any] | None:
    """Load metrics for the quality gate.

    Prefer the **worst honest gate** among runs: if any production candidate is
    below threshold we must not claim acceptable. We pick the newest mtime
    metrics file that includes test_map_at_3 (usually the latest train run).
    """
    root = Path(repo_root) if repo_root else _repo_root()
    # Prefer metrics next to currently configured multi-view weights
    weights = Path(settings.multi_view_weights_path)
    sibling = weights.parent / "metrics.json"
    ordered: list[Path] = []
    if sibling.is_file():
        ordered.append(sibling)
    # Then industrial metrics if present
    ind = root / "data" / "industrial_v1" / "metrics.json"
    if ind.is_file():
        ordered.append(ind)
    # Then best MAP@3 among kernel outputs (honest best run)
    scored: list[tuple[float, Path, dict]] = []
    for path in root.glob("kaggle/kernel_output*/models/metrics.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, dict) and "test_map_at_3" in data:
                scored.append((float(data["test_map_at_3"]), path, data))
        except (OSError, json.JSONDecodeError, TypeError, ValueError):
            continue
    scored.sort(key=lambda t: t[0], reverse=True)
    for path in ordered:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, dict) and "test_map_at_3" in data:
                data = dict(data)
                data["_metrics_path"] = str(path)
                return data
        except (OSError, json.JSONDecodeError, TypeError):
            continue
    if scored:
        _map3, path, data = scored[0]
        data = dict(data)
        data["_metrics_path"] = str(path)
        return data
    return None


def clear_metrics_cache() -> None:
    load_primary_metrics.cache_clear()


def quality_gate_status() -> dict[str, Any]:
    """Return gate evaluation for dashboard / classify."""
    metrics = load_primary_metrics()
    min_map = float(getattr(settings, "model_min_acceptable_map_at_3", 0.20))
    block = bool(getattr(settings, "model_block_species_id_when_below_gate", True))
    map3 = None
    deadly = None
    path = None
    version = None
    if metrics:
        map3 = metrics.get("test_map_at_3")
        deadly = metrics.get("safety_recall_deadly")
        path = metrics.get("_metrics_path")
        version = metrics.get("version")
    map3_f = float(map3) if map3 is not None else None
    deadly_f = float(deadly) if deadly is not None else None
    map_ok = map3_f is not None and map3_f >= min_map
    deadly_ok = deadly_f is not None and deadly_f >= 0.90
    # Species ID only if BOTH map and deadly gates pass (when metrics exist)
    if map3_f is None:
        species_id_allowed = False
        reason = "no_metrics_on_disk"
    elif not map_ok:
        species_id_allowed = False
        reason = f"map_at_3={map3_f:.4f}<{min_map} (unacceptable)"
    elif not deadly_ok:
        species_id_allowed = False
        reason = f"safety_recall_deadly={deadly_f} < 0.90 (R7 blocker)"
    else:
        species_id_allowed = True
        reason = "gates_passed"

    if not block:
        species_id_allowed = True
        reason = f"gate_disabled ({reason})"

    return {
        "species_id_allowed": species_id_allowed,
        "block_enabled": block,
        "reason": reason,
        "test_map_at_3": map3_f,
        "safety_recall_deadly": deadly_f,
        "min_map_at_3": min_map,
        "min_deadly_recall": 0.90,
        "metrics_path": path,
        "version": version,
        "verdict": "ACCEPTABLE" if species_id_allowed else "UNACCEPTABLE",
    }


def apply_quality_gate_to_simple_result(simple: dict[str, Any]) -> dict[str, Any]:
    """Force reject + clear species claims when gate fails."""
    gate = quality_gate_status()
    if gate["species_id_allowed"]:
        simple["quality_gate"] = gate
        return simple

    # Hard block species identification
    simple["decision"] = "rejected"
    simple["rejection_reason"] = (
        "model_quality_gate_failed: "
        f"MAP@3={gate.get('test_map_at_3')} deadly_recall={gate.get('safety_recall_deadly')} "
        f"— identificación de especie BLOQUEADA"
    )
    simple["open_set_reason"] = simple["rejection_reason"]
    simple["recommend_human_review"] = True
    simple["safety_level"] = "unsafe_to_consume"
    # Do not return species predictions as valid IDs
    simple["predictions"] = []
    warnings = list(simple.get("warnings") or [])
    warnings.insert(
        0,
        "GATE DE CALIDAD: el modelo actual NO es aceptable para identificar especies "
        f"(MAP@3={gate.get('test_map_at_3')}, recall mortales={gate.get('safety_recall_deadly')}). "
        "Solo modo educativo / abstención. Consulta a un micólogo.",
    )
    simple["warnings"] = warnings
    notes = list(simple.get("ml_notes") or [])
    notes.insert(0, f"quality_gate={gate['verdict']}: {gate['reason']}")
    simple["ml_notes"] = notes
    simple["quality_gate"] = gate
    simple["final_warning"] = (
        "NO IDENTIFICACIÓN. El modelo no supera el umbral de calidad. "
        "Nunca consumas setas basándote en esta aplicación."
    )
    return simple
