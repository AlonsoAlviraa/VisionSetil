"""Hard quality gate from on-disk training metrics (no invented numbers).

D-B12 (metrics path SSOT): serve gate uses metrics sibling to the multi-view
weights that are actually resolved for serve — never max-MAP across kernels.
D-B15 (dual signals): metrics_acceptable is raw MAP/deadly only; species_id_allowed
is policy (respects block_enabled); verdict tracks metrics only.
"""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING, Any

from app.core.config import settings, warn_if_quality_gate_block_disabled

if TYPE_CHECKING:
    from app.db.schemas import QualityGatePayload

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from app.db.schemas import QualityGatePayload


def _repo_root() -> Path:
    return Path(getattr(settings, "repo_root", None) or Path(settings.base_dir).parent)


def _read_metrics_file(path: Path) -> dict[str, Any] | None:
    """Read metrics.json; attach full metrics path (D-B23)."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, TypeError):
        return None
    if not isinstance(data, dict) or "test_map_at_3" not in data:
        return None
    out = dict(data)
    # Always full path (absolute when resolvable)
    try:
        out["_metrics_path"] = str(path.resolve())
    except OSError:
        out["_metrics_path"] = str(path)
    return out


def _resolve_serve_weights_path(
    loaded_weights_path: str | Path | None = None,
) -> Path | None:
    """Path of multi-view weights used for serve metrics SSOT, or None if none."""
    if loaded_weights_path is not None:
        p = Path(loaded_weights_path)
        # Explicit path (tests / caller): treat as the serve checkpoint identity
        # even if the file is missing — sibling lookup still uses parent/.
        return p

    from app.ml.weight_discovery import resolve_multiview_weights_path

    return resolve_multiview_weights_path(
        configured=settings.multi_view_weights_path,
        repo_root=_repo_root(),
    )


def load_primary_metrics(
    repo_root: str | None = None,
    *,
    loaded_weights_path: str | Path | None = None,
) -> dict[str, Any] | None:
    """Load metrics for the quality gate (D-B12 SSOT).

    Algorithm:
      1) Sibling of actually resolved multi-view weights path.
      2) If weights path is known but no sibling metrics.json → None (no_metrics).
         Do **not** fall through to other kernels.
      3) No weights resolved (mock / discovery path): reporting-only fallback —
         prefer settings.multi_view_weights_path parent/metrics.json, then
         data/industrial_v1/metrics.json, then mtime-newest candidate among
         remaining kernel metrics. **Never** select max-MAP across kernels.
    """
    root = Path(repo_root) if repo_root else _repo_root()
    weights = _resolve_serve_weights_path(loaded_weights_path)

    # --- Serve path: sibling of loaded/resolved weights only ---
    if weights is not None:
        # Only treat as "weights known" when the checkpoint file exists, OR when
        # the caller passed an explicit loaded_weights_path (tests / inject).
        weights_known = loaded_weights_path is not None or weights.is_file()
        if weights_known:
            sibling = weights.parent / "metrics.json"
            if sibling.is_file():
                return _read_metrics_file(sibling)
            # Weights identity known but no sibling → hard no_metrics
            return None

    # --- No weights resolved: reporting-only discovery (mock path) ---
    return _discovery_metrics_for_status(root)


def _discovery_metrics_for_status(root: Path) -> dict[str, Any] | None:
    """Fallback metrics when no serve weights are resolved (status / mock).

    Prefer configured multi_view_weights_path sibling, then industrial_v1,
    then mtime-newest among kernel metrics — never max-MAP.
    """
    ordered: list[Path] = []

    configured = Path(settings.multi_view_weights_path)
    conf_sibling = configured.parent / "metrics.json"
    if conf_sibling.is_file():
        ordered.append(conf_sibling)

    ind = root / "data" / "industrial_v1" / "metrics.json"
    if ind.is_file() and ind not in ordered:
        ordered.append(ind)

    for path in ordered:
        data = _read_metrics_file(path)
        if data is not None:
            return data

    # Remaining candidates: mtime-newest with test_map_at_3 (NOT max MAP)
    scored: list[tuple[float, Path]] = []
    for path in root.glob("kaggle/kernel_output*/models/metrics.json"):
        if path in ordered:
            continue
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(raw, dict) and "test_map_at_3" in raw:
                scored.append((path.stat().st_mtime, path))
        except (OSError, json.JSONDecodeError, TypeError):
            continue
    if not scored:
        return None
    scored.sort(key=lambda t: t[0], reverse=True)
    return _read_metrics_file(scored[0][1])


# Cache only the default (no explicit weights) path — explicit paths bypass cache.
@lru_cache(maxsize=4)
def _load_primary_metrics_cached(repo_root: str | None) -> dict[str, Any] | None:
    return load_primary_metrics(repo_root)


def clear_metrics_cache() -> None:
    _load_primary_metrics_cached.cache_clear()


def quality_gate_status(
    *,
    loaded_weights_path: str | Path | None = None,
    repo_root: str | None = None,
) -> dict[str, Any]:
    """Return dual-signal gate evaluation for dashboard / classify (D-B15)."""
    if loaded_weights_path is not None or repo_root is not None:
        metrics = load_primary_metrics(
            repo_root, loaded_weights_path=loaded_weights_path
        )
    else:
        metrics = _load_primary_metrics_cached(None)

    min_map = float(getattr(settings, "model_min_acceptable_map_at_3", 0.20))
    min_deadly = 0.90
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
    deadly_ok = deadly_f is not None and deadly_f >= min_deadly

    # Raw metrics signal — NEVER forced true by disable (D-B15)
    if map3_f is None:
        metrics_acceptable = False
        reason_code = "no_metrics"
        reason = "no_metrics_on_disk"
    elif not map_ok:
        metrics_acceptable = False
        reason_code = "map_below"
        reason = f"map_at_3={map3_f:.4f}<{min_map} (unacceptable)"
    elif not deadly_ok:
        metrics_acceptable = False
        reason_code = "deadly_below"
        reason = f"safety_recall_deadly={deadly_f} < {min_deadly} (R7 blocker)"
    else:
        metrics_acceptable = True
        reason_code = "gates_passed"
        reason = "gates_passed"

    # Policy signal: respect block_enabled
    if not block:
        species_id_allowed = True
        # When gate disabled, surface policy bypass explicitly
        reason_code = "gate_disabled"
        reason = f"gate_disabled ({reason})"
    else:
        species_id_allowed = metrics_acceptable

    # verdict tracks metrics only — not disable bypass
    verdict = "ACCEPTABLE" if metrics_acceptable else "UNACCEPTABLE"

    # Normalize version to str | None for stable QualityGatePayload contract
    version_s: str | None
    if version is None:
        version_s = None
    elif isinstance(version, str):
        version_s = version
    else:
        version_s = str(version)

    return {
        "species_id_allowed": species_id_allowed,
        "metrics_acceptable": metrics_acceptable,
        "block_enabled": block,
        "reason": reason,
        "reason_code": reason_code,
        "test_map_at_3": map3_f,
        "safety_recall_deadly": deadly_f,
        "min_map_at_3": min_map,
        "min_deadly_recall": min_deadly,
        "metrics_path": path,
        "version": version_s,
        "verdict": verdict,
    }


# Stable machine reason_code set (D-B11 / D-B15). Endpoint + classify share this.
REASON_CODES = frozenset(
    {
        "no_metrics",
        "map_below",
        "deadly_below",
        "gates_passed",
        "gate_disabled",
        "unset",
    }
)


def quality_gate_payload(
    *,
    loaded_weights_path: str | Path | None = None,
    repo_root: str | None = None,
) -> QualityGatePayload:
    """Validate gate status into the stable ``QualityGatePayload`` contract.

    Used by ``GET /models/quality-gate`` so OpenAPI + preflight always see the
    dual-signal fields (``metrics_acceptable``, ``species_id_allowed``,
    ``reason_code``, ``verdict`` metrics-only).
    """
    from app.db.schemas import QualityGatePayload as _QualityGatePayload

    data = quality_gate_status(
        loaded_weights_path=loaded_weights_path,
        repo_root=repo_root,
    )
    return _QualityGatePayload(**data)


def apply_quality_gate_to_simple_result(
    simple: dict[str, Any],
    *,
    loaded_weights_path: str | Path | None = None,
) -> dict[str, Any]:
    """Force reject + clear species claims when gate policy denies species ID.

    Always attaches dual-signal ``quality_gate`` (pass and fail).

    When ``loaded_weights_path`` is provided (serve path), metrics SSOT uses the
    sibling of that checkpoint (D-B12 — actually loaded weights).
    """
    gate = quality_gate_status(loaded_weights_path=loaded_weights_path)
    simple["quality_gate"] = gate

    if gate["species_id_allowed"]:
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
    simple["final_warning"] = (
        "NO IDENTIFICACIÓN. El modelo no supera el umbral de calidad. "
        "Nunca consumas setas basándote en esta aplicación."
    )
    return simple
