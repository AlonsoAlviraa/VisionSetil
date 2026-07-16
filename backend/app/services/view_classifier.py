"""
View Classifier Service
========================

Classifies each mushroom photo into one of the canonical view types:
``gills``, ``front``, ``habitat``, ``detail`` (plus ``unknown`` for OOD).

When real weights are available (EfficientNet-B0 fine-tuned on a labelled
view dataset, per ML_IMPROVEMENT_PROMPT §3.2 [2]), this module loads them via
ONNX Runtime for fast CPU inference (<20 ms). If weights are missing, it
falls back to a heuristic filename-based classifier (same heuristic used in
``image_storage._guess_view_type``) and reports ``is_real = False``.

Safety guarantee: this service NEVER makes safety decisions — it only labels
the view type so downstream components can choose the right backbone adapter.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

import numpy as np

from app.core.config import settings

logger = logging.getLogger(__name__)

# Canonical 4-view taxonomy (ML_IMPROVEMENT_PROMPT §2.1).
CANONICAL_VIEWS: tuple[str, ...] = ("gills", "front", "habitat", "detail")
VIEW_TO_IDX: dict[str, int] = {v: i for i, v in enumerate(CANONICAL_VIEWS)}

# Default softmax confidence below which we emit "unknown".
_UNKNOWN_THRESHOLD = 0.5


@dataclass
class ViewPrediction:
    """Result of classifying a single image's view type."""

    view_type: str  # one of CANONICAL_VIEWS or "unknown"
    confidence: float
    is_real: bool
    all_probs: dict[str, float] | None = None


class ViewClassifier:
    """View-type classifier with graceful mock fallback.

    The real backend uses EfficientNet-B0 exported to ONNX. The fallback uses
    the filename heuristic so the pipeline stays functional during development
    and CI without trained weights.
    """

    def __init__(self, weights_path: str | None = None, *, device: str = "cpu") -> None:
        self.weights_path = weights_path or settings.view_classifier_model_path
        self.device = device
        self.is_real = False
        self._session = None
        self._input_name: str | None = None

        if self.weights_path and Path(self.weights_path).exists():
            try:
                import onnxruntime as ort  # type: ignore

                providers = ["CPUExecutionProvider"] if device == "cpu" else ["CUDAExecutionProvider"]
                self._session = ort.InferenceSession(self.weights_path, providers=providers)
                self._input_name = self._session.get_inputs()[0].name
                self.is_real = True
                logger.info("ViewClassifier loaded real ONNX weights from %s", self.weights_path)
            except Exception as exc:  # noqa: BLE001
                logger.warning("ViewClassifier failed to load ONNX (%s); using heuristic fallback", exc)
                self._session = None
                self.is_real = False
        else:
            logger.info("ViewClassifier: no weights found at %s; using heuristic fallback", self.weights_path)

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #
    def predict(self, image: np.ndarray, filename: str | None = None) -> ViewPrediction:
        """Classify a single image.

        Parameters
        ----------
        image
            RGB image as ``[H, W, 3]`` uint8 array.
        filename
            Optional filename, used by the heuristic fallback.
        """
        if self.is_real and self._session is not None and self._input_name is not None:
            return self._predict_real(image)
        return self._predict_heuristic(filename or "")

    def predict_batch(
        self, images: Sequence[np.ndarray], filenames: Sequence[str | None] | None = None
    ) -> list[ViewPrediction]:
        """Classify a batch of images (sequential; ONNX handles batching internally)."""
        names = list(filenames) if filenames else [None] * len(images)
        return [self.predict(img, name) for img, name in zip(images, names)]

    # ------------------------------------------------------------------ #
    # Real ONNX inference
    # ------------------------------------------------------------------ #
    def _predict_real(self, image: np.ndarray) -> ViewPrediction:
        preprocessed = self._preprocess(image)
        outputs = self._session.run(None, {self._input_name: preprocessed})  # type: ignore[union-attr]
        logits = outputs[0][0]  # [num_classes]
        probs = _softmax(logits)
        idx = int(np.argmax(probs))
        confidence = float(probs[idx])
        view = CANONICAL_VIEWS[idx]
        if confidence < _UNKNOWN_THRESHOLD:
            view = "unknown"
        return ViewPrediction(
            view_type=view,
            confidence=confidence,
            is_real=True,
            all_probs={CANONICAL_VIEWS[i]: float(probs[i]) for i in range(len(CANONICAL_VIEWS))},
        )

    @staticmethod
    def _preprocess(image: np.ndarray) -> np.ndarray:
        """Resize to 224×224, normalize with ImageNet stats, return ``[1, 3, 224, 224]``."""
        try:
            import cv2  # type: ignore

            resized = cv2.resize(image, (224, 224))
        except Exception:
            # Fallback: crude nearest-neighbour if cv2 is absent.
            h, w = image.shape[:2]
            ys = np.linspace(0, h - 1, 224).astype(int)
            xs = np.linspace(0, w - 1, 224).astype(int)
            resized = image[np.ix_(ys, xs)]

        resized = resized.astype(np.float32) / 255.0
        mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
        resized = (resized - mean) / std
        chw = resized.transpose(2, 0, 1)[None, ...]  # [1, 3, H, W]
        return chw

    # ------------------------------------------------------------------ #
    # Heuristic fallback (no weights)
    # ------------------------------------------------------------------ #
    @staticmethod
    def _predict_heuristic(filename: str) -> ViewPrediction:
        """Filename-based guess mirroring ``image_storage._guess_view_type``.

        Maps the legacy view vocabulary to the canonical 4-view taxonomy.
        """
        name = (filename or "").lower()
        legacy = _legacy_guess(name)
        mapping = {
            "gills_or_pores": "gills",
            "cap_top": "front",  # cap-top ≈ frontal view for the adapter selection
            "stem": "detail",
            "base": "detail",
            "cross_section": "detail",
            "environment": "habitat",
            None: "front",  # default to frontal adapter
        }
        view = mapping.get(legacy, "front")
        return ViewPrediction(
            view_type=view,
            confidence=0.5,  # low-confidence placeholder
            is_real=False,
            all_probs=None,
        )


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _legacy_guess(name: str) -> str | None:
    """Replicates ``image_storage._guess_view_type`` for the fallback path."""
    if "top" in name or "cap" in name or "sombrero" in name:
        return "cap_top"
    if "gill" in name or "lamina" in name or "poro" in name:
        return "gills_or_pores"
    if "stem" in name or "pie" in name:
        return "stem"
    if "base" in name or "volva" in name:
        return "base"
    if "cut" in name or "section" in name or "corte" in name:
        return "cross_section"
    if "context" in name or "entorno" in name or "habitat" in name or "substrate" in name:
        return "environment"
    return None


def _softmax(x: np.ndarray) -> np.ndarray:
    z = x - np.max(x)
    e = np.exp(z)
    return e / e.sum()