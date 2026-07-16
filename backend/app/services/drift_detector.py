"""Data and concept drift detection service (Sprint N+3 — MO-3).

Monitors the distribution of incoming observations against the training set
baseline to detect:

* **Covariate shift** in visual embeddings (DINOv3 feature space).
* **Prior shift** in predicted species distribution.
* **Confidence collapse** — gradual degradation of model confidence.

The service is intentionally lightweight: it uses the Maximum Mean Discrepancy
(MMD) on a sample of recent embeddings vs. a stored baseline, plus simple
KL-divergence on the predicted-class histogram.

Usage (from a periodic Celery task or cron)::

    from app.services.drift_detector import get_drift_detector

    detector = get_drift_detector()
    report = detector.evaluate_recent(
        recent_embeddings=recent_embs,
        recent_predictions=recent_preds,
    )
    if report.is_drifted:
        # Trigger alert / model retrain.
        ...

Design constraints (§12 hard rules):
* No synthetic data for baselines — baselines are loaded from the training
  artifact produced by ``scripts/build_species_index.py``.
* All thresholds are configurable via JSON config for reproducibility.
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np

from app.core.config import settings

logger = logging.getLogger(__name__)


@dataclass
class DriftReport:
    """Structured result of a drift evaluation."""

    timestamp: str
    is_drifted: bool
    mmd_score: float
    mmd_threshold: float
    kl_divergence: float
    kl_threshold: float
    mean_confidence: float
    confidence_floor: float
    sample_size: int
    baseline_size: int
    drifted_dimensions: list[str] = field(default_factory=list)
    recommendation: str = "none"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class DriftDetector:
    """Detect covariate and prior shift using MMD + KL-divergence.

    Parameters
    ----------
    baseline_path
        Path to an ``.npz`` file containing ``embeddings`` and ``labels``
        from the training set (produced by the species index builder).
    mmd_threshold
        MMD² above this value → covariate drift.
    kl_threshold
        KL-divergence above this value → prior drift.
    min_sample_size
        Minimum number of recent samples required before evaluating.
    """

    def __init__(
        self,
        baseline_path: str | Path | None = None,
        mmd_threshold: float = 0.05,
        kl_threshold: float = 0.5,
        min_sample_size: int = 100,
        confidence_floor: float = 0.25,
    ) -> None:
        self.baseline_path = Path(
            baseline_path or settings.upload_dir / "drift_baseline.npz"
        )
        self.mmd_threshold = mmd_threshold
        self.kl_threshold = kl_threshold
        self.min_sample_size = min_sample_size
        self.confidence_floor = confidence_floor

        self._baseline_embeddings: np.ndarray | None = None
        self._baseline_label_dist: np.ndarray | None = None
        self._load_baseline()

    # ------------------------------------------------------------------ #
    # Baseline management
    # ------------------------------------------------------------------ #
    def _load_baseline(self) -> None:
        """Load the reference baseline from disk (if available)."""
        if not self.baseline_path.exists():
            logger.info(
                "DriftDetector: baseline not found at %s — drift checks will skip MMD.",
                self.baseline_path,
            )
            return

        try:
            data = np.load(self.baseline_path, allow_pickle=True)
            self._baseline_embeddings = data.get("embeddings")
            labels = data.get("labels", [])
            if len(labels) > 0:
                uniq, counts = np.unique(labels, return_counts=True)
                self._baseline_label_dist = counts / counts.sum()
            logger.info(
                "DriftDetector: baseline loaded (%d samples, %d classes)",
                len(self._baseline_embeddings) if self._baseline_embeddings is not None else 0,
                len(uniq) if self._baseline_label_dist is not None else 0,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("DriftDetector: failed to load baseline: %s", exc)

    def has_baseline(self) -> bool:
        return self._baseline_embeddings is not None

    def set_baseline(self, embeddings: np.ndarray, labels: np.ndarray | None = None) -> None:
        """Set (and persist) a new baseline from training data."""
        self._baseline_embeddings = embeddings.astype(np.float32)
        if labels is not None and len(labels) > 0:
            uniq, counts = np.unique(labels, return_counts=True)
            self._baseline_label_dist = counts / counts.sum()

        self.baseline_path.parent.mkdir(parents=True, exist_ok=True)
        np.savez(
            self.baseline_path,
            embeddings=self._baseline_embeddings,
            labels=labels if labels is not None else np.array([]),
        )
        logger.info(
            "DriftDetector: baseline saved to %s (%d samples)",
            self.baseline_path,
            len(self._baseline_embeddings),
        )

    # ------------------------------------------------------------------ #
    # Core metrics
    # ------------------------------------------------------------------ #
    @staticmethod
    def _mmd_squared(x: np.ndarray, y: np.ndarray, gamma: float | None = None) -> float:
        """Unbiased MMD² with a Gaussian RBF kernel.

        Uses the median-heuristic for ``gamma`` when not provided.
        """
        if x.ndim == 1:
            x = x.reshape(-1, 1)
        if y.ndim == 1:
            y = y.reshape(-1, 1)

        if gamma is None:
            # Median heuristic.
            all_data = np.vstack([x, y])
            from scipy.spatial.distance import pdist  # type: ignore

            try:
                dists = pdist(all_data)
                median_dist = np.median(dists[dists > 0]) if len(dists) > 0 else 1.0
                gamma = 1.0 / (2.0 * median_dist**2 + 1e-8)
            except Exception:
                gamma = 0.1

        def _rbf(a: np.ndarray, b: np.ndarray) -> np.ndarray:
            sq = (
                np.sum(a**2, axis=1)[:, None]
                + np.sum(b**2, axis=1)[None, :]
                - 2.0 * a @ b.T
            )
            return np.exp(-gamma * np.maximum(sq, 0))

        m = len(x)
        n = len(y)
        kxx = _rbf(x, x)
        kyy = _rbf(y, y)
        kxy = _rbf(x, y)

        # Unbiased estimator.
        np.fill_diagonal(kxx, 0)
        np.fill_diagonal(kyy, 0)
        mmd2 = kxx.sum() / (m * (m - 1)) + kyy.sum() / (n * (n - 1)) - 2 * kxy.mean()
        return float(max(mmd2, 0.0))

    @staticmethod
    def _kl_divergence(p: np.ndarray, q: np.ndarray, eps: float = 1e-8) -> float:
        """KL(p || q) for discrete distributions."""
        p = p + eps
        q = q + eps
        p = p / p.sum()
        q = q / q.sum()
        return float(np.sum(p * np.log(p / q)))

    # ------------------------------------------------------------------ #
    # Public evaluation
    # ------------------------------------------------------------------ #
    def evaluate_recent(
        self,
        recent_embeddings: np.ndarray | None = None,
        recent_predictions: np.ndarray | None = None,
        recent_confidences: np.ndarray | None = None,
    ) -> DriftReport:
        """Evaluate drift on a batch of recent observations.

        Parameters
        ----------
        recent_embeddings
            ``[N, D]`` array of DINOv3 embeddings from recent inferences.
        recent_predictions
            ``[N]`` array of predicted class indices.
        recent_confidences
            ``[N]`` array of top-1 confidence scores.
        """
        ts = datetime.now(UTC).isoformat()

        # Defaults.
        mmd_score = 0.0
        kl_div = 0.0
        mean_conf = 1.0
        drifted_dims: list[str] = []
        recommendation = "none"

        sample_size = (
            len(recent_embeddings)
            if recent_embeddings is not None
            else len(recent_predictions)
            if recent_predictions is not None
            else 0
        )

        # MMD on embeddings.
        if (
            recent_embeddings is not None
            and self._baseline_embeddings is not None
            and len(recent_embeddings) >= self.min_sample_size
        ):
            # Subsample baseline to keep compute bounded.
            max_baseline = min(len(self._baseline_embeddings), 1000)
            rng = np.random.default_rng(42)
            baseline_sample = self._baseline_embeddings[
                rng.choice(len(self._baseline_embeddings), max_baseline, replace=False)
            ]
            mmd_score = self._mmd_squared(
                recent_embeddings[:1000].astype(np.float32),
                baseline_sample,
            )
            if mmd_score > self.mmd_threshold:
                drifted_dims.append("visual_embeddings")
                recommendation = "retrain_visual_backbone"

        # KL-divergence on predictions.
        if (
            recent_predictions is not None
            and self._baseline_label_dist is not None
            and len(recent_predictions) >= self.min_sample_size
        ):
            uniq, counts = np.unique(recent_predictions, return_counts=True)
            recent_dist = np.zeros(len(self._baseline_label_dist))
            for u, c in zip(uniq, counts, strict=False):
                if u < len(recent_dist):
                    recent_dist[u] = c
            recent_dist = recent_dist / (recent_dist.sum() + 1e-8)
            kl_div = self._kl_divergence(recent_dist, self._baseline_label_dist)
            if kl_div > self.kl_threshold:
                drifted_dims.append("class_prior")
                if recommendation == "none":
                    recommendation = "recalibrate_thresholds"

        # Confidence collapse.
        if recent_confidences is not None and len(recent_confidences) > 0:
            mean_conf = float(np.mean(recent_confidences))
            if mean_conf < self.confidence_floor:
                drifted_dims.append("confidence_collapse")
                recommendation = "investigate_data_quality"

        is_drifted = len(drifted_dims) > 0

        return DriftReport(
            timestamp=ts,
            is_drifted=is_drifted,
            mmd_score=round(mmd_score, 6),
            mmd_threshold=self.mmd_threshold,
            kl_divergence=round(kl_div, 6),
            kl_threshold=self.kl_threshold,
            mean_confidence=round(mean_conf, 4),
            confidence_floor=self.confidence_floor,
            sample_size=sample_size,
            baseline_size=len(self._baseline_embeddings) if self._baseline_embeddings is not None else 0,
            drifted_dimensions=drifted_dims,
            recommendation=recommendation,
        )

    def save_report(self, report: DriftReport, output_dir: Path | None = None) -> Path:
        """Persist a drift report to disk for audit trail."""
        output_dir = output_dir or (settings.upload_dir / "drift_reports")
        output_dir.mkdir(parents=True, exist_ok=True)
        filename = f"drift_{report.timestamp.replace(':', '-')}.json"
        path = output_dir / filename
        path.write_text(json.dumps(report.to_dict(), indent=2), encoding="utf-8")
        return path


# --------------------------------------------------------------------------- #
# Lazy singleton
# --------------------------------------------------------------------------- #
_detector_instance: DriftDetector | None = None


def get_drift_detector() -> DriftDetector:
    global _detector_instance
    if _detector_instance is None:
        _detector_instance = DriftDetector()
    return _detector_instance


def reset_drift_detector() -> None:
    global _detector_instance
    _detector_instance = None
