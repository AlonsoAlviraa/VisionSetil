"""A/B testing framework for model variants (Sprint N+3 — MO-5).

Allows routing a percentage of traffic to a challenger model variant while
the control model serves the rest. Results are logged for offline analysis.

Usage::

    from app.services.ab_testing import get_ab_router

    router = get_ab_router()
    variant = router.assign(observation_id=42)
    # variant.name == "control" or "challenger_v6"
    # variant.model_config gives the config path to load

Design constraints:
* Assignment is deterministic by observation_id hash → same observation always
  gets the same variant (avoids flip-flopping within a session).
* Safety layer is NEVER bypassed — both variants go through the full safety
  pipeline.
* All experiments are logged with IC 95% in mind for offline analysis.
"""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)


@dataclass
class ExperimentVariant:
    """A single variant in an A/B experiment."""

    name: str
    traffic_percentage: float  # 0.0 to 1.0
    model_config: str  # path to config JSON
    description: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class ExperimentConfig:
    """Full experiment definition."""

    experiment_id: str
    name: str
    variants: list[ExperimentVariant]
    start_date: str
    end_date: str | None = None
    primary_metric: str = "top1_accuracy"
    safety_recall_metric: str = "safety_recall_deadly"
    min_safety_recall: float = 1.0  # Hard rule: safety recall deadly = 100%
    is_active: bool = True

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class AssignmentResult:
    """Result of assigning an observation to a variant."""

    experiment_id: str
    variant_name: str
    model_config: str
    assignment_hash: str
    timestamp: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class ABTestRouter:
    """Routes observations to model variants based on experiment config.

    Configurations are loaded from ``settings.upload_dir / "experiments"``.
    """

    def __init__(self, experiments_dir: str | Path | None = None) -> None:
        self.experiments_dir = Path(
            experiments_dir or settings.upload_dir / "experiments"
        )
        self._experiments: dict[str, ExperimentConfig] = {}
        self._load_experiments()

    def _load_experiments(self) -> None:
        """Load all experiment configs from disk."""
        if not self.experiments_dir.exists():
            logger.info(
                "ABTestRouter: no experiments dir at %s — A/B testing inactive",
                self.experiments_dir,
            )
            return

        for config_path in self.experiments_dir.glob("*.json"):
            try:
                data = json.loads(config_path.read_text(encoding="utf-8"))
                variants = [
                    ExperimentVariant(**v) for v in data.get("variants", [])
                ]
                exp = ExperimentConfig(
                    experiment_id=data["experiment_id"],
                    name=data["name"],
                    variants=variants,
                    start_date=data["start_date"],
                    end_date=data.get("end_date"),
                    primary_metric=data.get("primary_metric", "top1_accuracy"),
                    min_safety_recall=data.get("min_safety_recall", 1.0),
                    is_active=data.get("is_active", True),
                )
                self._experiments[exp.experiment_id] = exp
                logger.info(
                    "ABTestRouter: loaded experiment '%s' with %d variants",
                    exp.name,
                    len(exp.variants),
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("ABTestRouter: failed to load %s: %s", config_path, exc)

    def list_experiments(self) -> list[dict[str, Any]]:
        """List all registered experiments."""
        return [exp.to_dict() for exp in self._experiments.values()]

    def get_active_experiment(self) -> ExperimentConfig | None:
        """Return the currently active experiment (if any)."""
        now = datetime.now(UTC).isoformat()
        for exp in self._experiments.values():
            if not exp.is_active:
                continue
            if exp.end_date and now > exp.end_date:
                continue
            if now < exp.start_date:
                continue
            # Validate traffic percentages sum to ~1.0.
            total = sum(v.traffic_percentage for v in exp.variants)
            if abs(total - 1.0) > 0.01:
                logger.warning(
                    "ABTestRouter: experiment '%s' traffic sums to %.2f (expected 1.0)",
                    exp.name,
                    total,
                )
            return exp
        return None

    def assign(self, observation_id: int) -> AssignmentResult:
        """Deterministically assign an observation to a variant.

        Uses a hash of ``observation_id`` so the same observation always lands
        in the same bucket.
        """
        exp = self.get_active_experiment()
        if exp is None:
            # No active experiment → always control.
            return AssignmentResult(
                experiment_id="none",
                variant_name="control",
                model_config=getattr(settings, "multi_view_weights_path", ""),
                assignment_hash="no_experiment",
                timestamp=datetime.now(UTC).isoformat(),
            )

        # Deterministic hash-based assignment.
        hash_input = f"{exp.experiment_id}:{observation_id}"
        hash_val = int(hashlib.sha256(hash_input.encode()).hexdigest(), 16)
        bucket = (hash_val % 10000) / 10000.0  # 0.0 to 0.9999

        # Walk through variants to find which bucket this falls in.
        cumulative = 0.0
        selected = exp.variants[0] if exp.variants else None
        for variant in exp.variants:
            cumulative += variant.traffic_percentage
            if bucket < cumulative:
                selected = variant
                break

        if selected is None:
            selected = ExperimentVariant(
                name="control",
                traffic_percentage=1.0,
                model_config=getattr(settings, "multi_view_weights_path", ""),
            )

        return AssignmentResult(
            experiment_id=exp.experiment_id,
            variant_name=selected.name,
            model_config=selected.model_config,
            assignment_hash=hash_input,
            timestamp=datetime.now(UTC).isoformat(),
        )

    def log_result(
        self,
        assignment: AssignmentResult,
        result: dict[str, Any],
        log_dir: Path | None = None,
    ) -> Path:
        """Log an A/B test result for offline analysis.

        Parameters
        ----------
        assignment
            The assignment returned by ``assign()``.
        result
            The classification result dict (must include top1_confidence,
            is_unknown, candidates, etc.).
        log_dir
            Directory to write logs to.
        """
        log_dir = log_dir or (settings.upload_dir / "ab_results")
        log_dir.mkdir(parents=True, exist_ok=True)

        entry = {
            "experiment_id": assignment.experiment_id,
            "variant": assignment.variant_name,
            "timestamp": assignment.timestamp,
            "top1_confidence": result.get("top1_confidence"),
            "is_unknown": result.get("is_unknown"),
            "num_candidates": len(result.get("candidates", [])),
            "safety_level": result.get("safety_level"),
            "primary_taxon": (
                result.get("candidates", [{}])[0].get("taxon")
                if result.get("candidates")
                else None
            ),
        }

        date_str = datetime.now(UTC).strftime("%Y-%m-%d")
        log_path = log_dir / f"ab_{date_str}.jsonl"
        with log_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry, default=str) + "\n")

        return log_path

    def create_experiment(
        self,
        experiment_id: str,
        name: str,
        variants: list[dict[str, Any]],
        start_date: str,
        primary_metric: str = "top1_accuracy",
    ) -> Path:
        """Create and persist a new experiment config.

        Parameters
        ----------
        experiment_id
            Unique identifier for the experiment.
        name
            Human-readable name.
        variants
            List of variant dicts with keys: name, traffic_percentage,
            model_config, description.
        start_date
            ISO date string.
        primary_metric
            Metric to optimize.
        """
        self.experiments_dir.mkdir(parents=True, exist_ok=True)

        config = {
            "experiment_id": experiment_id,
            "name": name,
            "variants": variants,
            "start_date": start_date,
            "primary_metric": primary_metric,
            "min_safety_recall": 1.0,  # Hard rule
            "is_active": True,
        }

        path = self.experiments_dir / f"{experiment_id}.json"
        path.write_text(json.dumps(config, indent=2), encoding="utf-8")

        # Reload.
        self._load_experiments()
        return path


# --------------------------------------------------------------------------- #
# Lazy singleton
# --------------------------------------------------------------------------- #
_router_instance: ABTestRouter | None = None


def get_ab_router() -> ABTestRouter:
    global _router_instance
    if _router_instance is None:
        _router_instance = ABTestRouter()
    return _router_instance


def reset_ab_router() -> None:
    global _router_instance
    _router_instance = None