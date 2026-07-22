"""
Multi-View Mushroom Classifier (Production)
============================================

Replaces ``MockMushroomClassifier`` with the full multi-view pipeline
(ML_IMPROVEMENT_PROMPT §5.1):

    1. Detect ROI per image (YOLOv8 / YOLOE).
    2. Auto-classify view type if not user-provided.
    3. Generate view-conditioned embeddings.
    4. Encode metadata.
    5. Attention fusion → observation embedding.
    6. ArcFace → logits.
    7. Temperature calibration → calibrated probabilities.
    8. Open-set rejection (cosine vs centroids).
    9. Safety layer (deadly-species hard flagging).

Design constraints (§12 hard rules):
    - NEVER relaxes the Safety Policy.
    - Falls back to ``MockMushroomClassifier`` when weights are absent
      (``settings.model_fallback_to_mock``), and logs a WARNING so /readyz
      can report "mock" status. We do NOT claim "real" when running mock.
    - Inference budget: <500 ms CPU / <150 ms GPU for 4 images.
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any

import numpy as np

from app.core.config import settings
from app.db.models import Observation, ObservationImage
from app.db.schemas import (
    CandidateResult,
    ClassificationResponse,
    HumanReviewResponse,
    ModelStackResponse,
    OpenSetResponse,
    QualityAssessmentResponse,
    TraceResponse,
)
from app.services.classifier import MockMushroomClassifier
from app.services.quality_validation import ImageQualityValidationService
from app.services.safety_explanation import SafetyExplanationService
from app.services.species_catalog import list_mock_species_catalog, list_poisonous_species
from app.services.view_classifier import CANONICAL_VIEWS, ViewClassifier

logger = logging.getLogger(__name__)


class MultiViewMushroomClassifier:
    """Production multi-view classifier with mock fallback.

    Follows the ``MushroomClassifier`` protocol (``classify(observation, images)``)
    so it is a drop-in replacement for ``MockMushroomClassifier``.
    """

    def __init__(self, *, device: str | None = None) -> None:
        self.device = device or settings.model_device
        self.is_real = False
        self.weights_discovered = False
        self.labels_loaded = False
        self.load_error: str | None = None
        self.resolved_weights_path: str | None = None
        self.label2idx: dict[str, int] = {}
        self.idx2label: dict[int, str] = {}
        self.class_centroids: np.ndarray | None = None
        self._torch_model = None  # loaded lazily
        self._mock_fallback: MockMushroomClassifier | None = None
        self._checkpoint: dict[str, Any] | None = None
        self._arch_info: dict[str, Any] | None = None
        self._metadata_vocab: dict[str, dict[str, int]] = {}
        # Transparency fields read by /classify mapper
        self.last_view_coverage: list[str] = []
        self.last_confidence_margin: float | None = None
        self.last_ml_notes: list[str] = []
        self._deadly_idx: set[int] = set()
        self._deadly_names: set[str] = set()

        # Shared services (same as mock for the safety layer).
        self.catalog = list_mock_species_catalog()
        self.poisonous = list_poisonous_species()
        self.safety_service = SafetyExplanationService()
        self.quality_service = ImageQualityValidationService()
        self.view_classifier = ViewClassifier(device=self.device)

        self._try_load_weights()
        self._rebuild_deadly_index()

    # ------------------------------------------------------------------ #
    # Weight loading
    # ------------------------------------------------------------------ #
    def _try_load_weights(self) -> None:
        """Discover + load real multi-view weights. Fall back to mock on failure."""
        from app.ml.weight_discovery import resolve_multiview_weights_path

        weights_path = resolve_multiview_weights_path(
            configured=settings.multi_view_weights_path,
            repo_root=getattr(settings, "repo_root", None) or settings.base_dir.parent,
        )
        if weights_path is None:
            self.load_error = f"no_checkpoint_found (configured={settings.multi_view_weights_path})"
            if settings.model_fallback_to_mock:
                logger.warning(
                    "MultiViewMushroomClassifier: no weights found — "
                    "falling back to MockMushroomClassifier (NOT production-real). %s",
                    self.load_error,
                )
                self._mock_fallback = MockMushroomClassifier()
            else:
                raise FileNotFoundError(self.load_error)
            return

        self.weights_discovered = True
        self.resolved_weights_path = str(weights_path)

        try:
            import torch  # type: ignore

            checkpoint = torch.load(weights_path, map_location=self.device, weights_only=False)
            if not isinstance(checkpoint, dict):
                raise TypeError(f"Unexpected checkpoint type: {type(checkpoint)}")

            self._checkpoint = checkpoint
            raw_l2i = checkpoint.get("label2idx") or {}
            # label2idx may map str->int
            self.label2idx = {str(k): int(v) for k, v in raw_l2i.items()}
            self.idx2label = {v: k for k, v in self.label2idx.items()}
            self.labels_loaded = bool(self.label2idx)
            # metadata vocab maps str->idx from training
            raw_mv = checkpoint.get("metadata_vocab") or {}
            self._metadata_vocab = {}
            if isinstance(raw_mv, dict):
                for field, mapping in raw_mv.items():
                    if isinstance(mapping, dict):
                        self._metadata_vocab[str(field)] = {
                            str(k): int(v) for k, v in mapping.items()
                        }

            centroids_path = Path(weights_path).parent / "class_centroids.npy"
            if centroids_path.exists():
                self.class_centroids = np.load(centroids_path)

            species_index_path = Path(weights_path).parent / "species_index.npz"
            if species_index_path.exists():
                self._species_index = np.load(species_index_path)
                logger.info(
                    "MultiViewMushroomClassifier: loaded species index from %s",
                    species_index_path,
                )

            self._torch_model = self._load_torch_model(checkpoint)
            # Real ONLY if torch model bound, labels present, and no load_error
            self.is_real = bool(
                self._torch_model is not None
                and self.labels_loaded
                and not self.load_error
            )
            if self.is_real:
                logger.info(
                    "MultiViewMushroomClassifier loaded REAL weights from %s (%d classes)",
                    weights_path,
                    len(self.label2idx),
                )
            else:
                self.load_error = self.load_error or "torch_model_not_built"
                logger.warning(
                    "Weights found at %s but torch model not fully built (%s) — hybrid/mock path",
                    weights_path,
                    self.load_error,
                )
                if settings.model_fallback_to_mock and self._mock_fallback is None:
                    self._mock_fallback = MockMushroomClassifier()
        except Exception as exc:  # noqa: BLE001
            self.load_error = f"{exc.__class__.__name__}: {exc}"
            logger.warning(
                "MultiViewMushroomClassifier failed to load weights (%s) — falling back to mock",
                exc,
            )
            self.is_real = False
            self._torch_model = None
            if settings.model_fallback_to_mock:
                self._mock_fallback = MockMushroomClassifier()
            else:
                raise

    def _load_torch_model(self, checkpoint: dict[str, Any]) -> Any:
        """Instantiate architecture matching checkpoint and load state_dict.

        Prefers Kaggle v8 arch (kernel_output_v9). Falls back to kaggle
        multi_view_model.py only when checkpoint shape matches. Never returns
        a model after a failed state_dict load (sets load_error and returns None).
        """
        state_dict = (
            checkpoint.get("model_state")
            or checkpoint.get("model_state_dict")
            or checkpoint.get("state_dict")
            or checkpoint
        )
        if not isinstance(state_dict, dict):
            self.load_error = "state_dict_not_a_dict"
            return None

        # --- Primary: v8 checkpoint (best.pt / swa.pt from kernel_output_v9) ---
        try:
            from app.ml.multiview_v8 import detect_v8_checkpoint, load_v8_from_checkpoint

            if detect_v8_checkpoint(state_dict):
                model, info = load_v8_from_checkpoint(checkpoint, device=self.device)
                self._arch_info = info
                logger.info(
                    "Loaded multiview_v8: hparams=%s missing=%d unexpected=%d",
                    info.get("hparams"),
                    len(info.get("missing") or []),
                    len(info.get("unexpected") or []),
                )
                # Clear any previous soft error
                self.load_error = None
                return model
        except Exception as exc:  # noqa: BLE001
            logger.warning("v8 load path failed: %s", exc)
            self.load_error = f"v8_load: {exc.__class__.__name__}: {exc}"

        # --- Secondary: newer multi_view_model.py (Mega v5 style) ---
        try:
            import sys

            repo_root = Path(
                getattr(settings, "repo_root", None) or Path(settings.base_dir).parent
            )
            kaggle_dir = repo_root / "kaggle"
            if kaggle_dir.is_dir() and str(repo_root) not in sys.path:
                sys.path.insert(0, str(repo_root))
            if kaggle_dir.is_dir() and str(kaggle_dir) not in sys.path:
                sys.path.insert(0, str(kaggle_dir))

            from multi_view_model import (  # type: ignore
                MultiViewConfig,
                MultiViewModel,
            )

            model_cfg = checkpoint.get("config") or {}
            num_classes = len(self.label2idx) or int(model_cfg.get("num_classes") or 1000)
            d_model = int(model_cfg.get("d_model") or model_cfg.get("embed_dim") or 512)
            lora_rank = int(model_cfg.get("lora_rank") or 16)
            metadata_dim = int(
                model_cfg.get("metadata_dim") or model_cfg.get("metadata_embed_dim") or 64
            )
            cfg = MultiViewConfig(
                d_model=d_model,
                lora_rank=lora_rank,
                metadata_embed_dim=metadata_dim,
            )
            model = MultiViewModel(cfg, num_classes=num_classes)
            missing, unexpected = model.load_state_dict(state_dict, strict=False)
            logger.info(
                "v5-style state_dict load: missing=%d unexpected=%d",
                len(missing),
                len(unexpected),
            )
            # Reject if critical modules missing (wrong arch)
            critical_miss = [
                m
                for m in missing
                if m.startswith(("backbone.backbone.", "head.", "arcface."))
            ]
            if critical_miss:
                self.load_error = f"v5_load: missing critical {critical_miss[:5]}"
                return None
            model.to(self.device)
            model.eval()
            self.load_error = None
            self._arch_info = {"arch": "multiview_v5", "missing": list(missing)}
            return model
        except Exception as exc:  # noqa: BLE001
            logger.warning("v5-style load failed: %s", exc)
            prev = self.load_error or ""
            self.load_error = (
                f"{prev}; v5_load: {exc.__class__.__name__}: {exc}".strip("; ")
            )
            return None

    @staticmethod
    def _build_minimal_model(num_classes: int, embed_dim: int, backbone_name: str):
        """Build a minimal model fallback when the full architecture is unavailable.

        Uses timm to create a backbone + linear ArcFace head. This supports
        inference even if ``kaggle/multi_view_model.py`` is not importable.
        """
        import torch.nn as nn  # type: ignore
        import timm  # type: ignore

        class MinimalMultiView(nn.Module):
            def __init__(self):
                super().__init__()
                self.backbone = timm.create_model(
                    backbone_name, pretrained=False, num_classes=0, global_pool="avg"
                )
                feat_dim = self.backbone.num_features
                self.view_embed = nn.Embedding(4, feat_dim)
                self.proj = nn.Linear(feat_dim, embed_dim)
                self.arcface = nn.Linear(embed_dim, num_classes)

            def forward(self, images, view_idx=None):
                features = self.backbone(images)
                if view_idx is not None:
                    features = features + self.view_embed(view_idx.clamp(0, 3))
                emb = self.proj(features)
                logits = self.arcface(emb)
                return logits, emb

        return MinimalMultiView()

    def get_status(self) -> dict[str, Any]:
        """Status dict consumed by /readyz, /models/status, and ML dashboard."""
        from app.ml.weight_discovery import describe_weight_discovery

        discovery = describe_weight_discovery(
            configured=settings.multi_view_weights_path,
            repo_root=getattr(settings, "repo_root", None) or settings.base_dir.parent,
        )
        arch = (self._arch_info or {}).get("arch") if self._arch_info else None
        return {
            "backend": (
                f"real_{arch or 'multiview'}" if self.is_real else "mock_fallback"
            ),
            "loaded": self.is_real,
            "weights_discovered": self.weights_discovered,
            "labels_loaded": self.labels_loaded,
            "device": self.device,
            "weights_path": self.resolved_weights_path
            or str(settings.multi_view_weights_path),
            "configured_weights_path": str(settings.multi_view_weights_path),
            "num_classes": len(self.label2idx),
            "view_classifier_real": getattr(self.view_classifier, "is_real", False),
            "open_set_threshold": settings.model_open_set_threshold,
            "load_error": self.load_error,
            "mock_fallback_active": self._mock_fallback is not None and not self.is_real,
            "discovery": discovery,
            "arch": arch,
            "arch_hparams": (self._arch_info or {}).get("hparams") if self._arch_info else None,
            "honesty": (
                "real_weights_loaded"
                if self.is_real
                else (
                    "weights_found_but_mock_inference"
                    if self.weights_discovered
                    else "mock_no_weights"
                )
            ),
        }

    # ------------------------------------------------------------------ #
    # Public classify (protocol-compatible)
    # ------------------------------------------------------------------ #
    def classify(
        self,
        observation: Observation,
        images: list[ObservationImage],
        view_types: list[str] | None = None,
    ) -> ClassificationResponse:
        """Run the full multi-view pipeline.

        Parameters
        ----------
        observation
            The observation ORM object with metadata.
        images
            List of stored observation images.
        view_types
            Optional user-provided view labels (one per image). If None or
            shorter than ``images``, the view classifier auto-labels the rest.
        """
        if not self.is_real and self._mock_fallback is not None:
            # Pass view_types so mock multi-view scoring is honest about coverage
            result = self._mock_fallback.classify(
                observation, images, view_types=view_types
            )
            # Never claim real backends when on mock fallback
            result.model_stack = ModelStackResponse(
                detector="mock_yoloe_fallback",
                visual_embedder="mock_dinov3_fallback",
                image_text_embedder="mock_siglip2_fallback",
                metadata_encoder="mock_metadata_encoder",
            )
            if result.trace:
                result.trace.classifier_strategy = (
                    result.trace.classifier_strategy or "mock_multiview_ranker_v2_open_set"
                )
                result.trace.pipeline_version = "mvp-safety-v3-multiview-mock-path"
            # Propagate transparency from mock classifier if present
            self.last_view_coverage = list(
                getattr(self._mock_fallback, "last_view_coverage", []) or []
            )
            self.last_confidence_margin = getattr(
                self._mock_fallback, "last_confidence_margin", None
            )
            notes = list(getattr(self._mock_fallback, "last_ml_notes", []) or [])
            if self.weights_discovered:
                notes = [
                    f"Pesos en disco pero inferencia mock ({self.load_error or 'arch mismatch'})."
                ] + notes
            else:
                notes = ["Sin checkpoint multi-view resuelto — modo demo."] + notes
            self.last_ml_notes = notes
            return result

        start = time.perf_counter()

        # Step 1: Determine view types (user-provided or auto-classified).
        resolved_views = self._resolve_view_types(images, view_types)

        # Step 2: Load image arrays.
        image_arrays = [self._load_image_array(img) for img in images]

        # Step 3–7: Real torch forward when v8/v5 model is bound
        if self.is_real and self._torch_model is not None and getattr(
            self._torch_model, "arch", None
        ) == "multiview_v8":
            logits, obs_embedding = self._forward_v8(
                image_arrays, resolved_views, observation
            )
            calibrated_probs = self._apply_temperature(logits, resolved_views)
            is_unknown, cosine_score = self._open_set_check(
                obs_embedding, probs=calibrated_probs
            )
        else:
            embeddings = self._compute_embeddings(image_arrays, resolved_views)
            metadata_emb = self._encode_metadata(observation)
            obs_embedding = self._fuse(embeddings, resolved_views, metadata_emb)
            logits = self._arcface_logits(obs_embedding)
            calibrated_probs = self._apply_temperature(logits, resolved_views)
            is_unknown, cosine_score = self._open_set_check(
                obs_embedding, probs=calibrated_probs
            )

        # Safety: surface deadly taxa if they appear in top-K raw ranks
        calibrated_probs = self._boost_deadly_visibility(calibrated_probs)

        # Step 8–9: Build candidates + safety layer.
        candidates = self._build_candidates(
            calibrated_probs, observation, images, resolved_views
        )
        if is_unknown:
            # Degrade: lower confidences, force human review messaging
            candidates = self._degrade_for_open_set(candidates)

        elapsed_ms = int((time.perf_counter() - start) * 1000)
        logger.info(
            "MultiView classify completed in %d ms (real=%s unknown=%s)",
            elapsed_ms,
            self.is_real,
            is_unknown,
        )

        # Transparency for /classify mapper
        confs = [c.confidence for c in candidates]
        self.last_view_coverage = list(resolved_views)
        self.last_confidence_margin = (
            round(max(0.0, confs[0] - confs[1]), 4)
            if len(confs) >= 2
            else (round(confs[0], 4) if confs else None)
        )
        arch = (self._arch_info or {}).get("arch", "unknown")
        self.last_ml_notes = [
            f"Inferencia real multi-view ({arch}).",
            f"Clases en checkpoint: {len(self.label2idx)}.",
            f"Open-set abstención: {'SÍ' if is_unknown else 'no'} (score={cosine_score:.3f}).",
            f"Vistas usadas: {', '.join(resolved_views) or 'ninguna'}.",
            "Calidad del checkpoint actual es few-shot — no confiar en top-1.",
            "Resultado orientativo — no autoriza consumo.",
        ]

        return self._build_response(
            observation,
            images,
            candidates,
            resolved_views,
            is_unknown,
            cosine_score,
            elapsed_ms,
            probs=calibrated_probs,
        )

    def _forward_v8(
        self,
        images: list[np.ndarray],
        views: list[str],
        observation: Observation,
    ) -> tuple[np.ndarray, np.ndarray]:
        """Run full MultiViewModelV8 forward → (logits [C], obs_emb [D])."""
        import torch  # type: ignore

        if not images:
            images = [np.zeros((224, 224, 3), dtype=np.uint8)]
            views = views or ["front"]

        tensors = [self._preprocess_for_backbone(img) for img in images]
        # [1, N, 3, 224, 224]
        batch = torch.stack(tensors, dim=0).unsqueeze(0).to(self.device)
        view_idx = torch.tensor(
            [
                [
                    CANONICAL_VIEWS.index(v) if v in CANONICAL_VIEWS else 1
                    for v in views[: len(images)]
                ]
            ],
            dtype=torch.long,
            device=self.device,
        )
        if view_idx.shape[1] < batch.shape[1]:
            pad = batch.shape[1] - view_idx.shape[1]
            view_idx = torch.cat(
                [view_idx, torch.ones(1, pad, dtype=torch.long, device=self.device)],
                dim=1,
            )
        attention_mask = torch.ones(1, batch.shape[1], dtype=torch.bool, device=self.device)
        meta = self._metadata_indices_torch(observation, device=self.device)

        with torch.inference_mode():
            logits, emb = self._torch_model(
                batch, view_idx, attention_mask, meta, labels=None
            )
        return (
            logits.squeeze(0).detach().cpu().numpy().astype(np.float32),
            emb.squeeze(0).detach().cpu().numpy().astype(np.float32),
        )

    def _metadata_indices_torch(self, observation: Observation, *, device: str):
        """Map observation metadata strings → index tensors using training vocab."""
        import torch  # type: ignore

        fields = {
            "habitat": (observation.habitat or "unknown").lower(),
            "substrate": (observation.substrate or "unknown").lower(),
            "smell": (observation.smell or "unknown").lower(),
            "country": (observation.country or "unknown").lower(),
        }
        out: dict[str, Any] = {}
        for name, val in fields.items():
            mapping = self._metadata_vocab.get(name) or {}
            # try exact, then lower keys
            idx = mapping.get(val)
            if idx is None:
                # case-insensitive lookup
                lower_map = {str(k).lower(): int(v) for k, v in mapping.items()}
                idx = lower_map.get(val, lower_map.get("unknown", 0))
            out[name] = torch.tensor([int(idx)], dtype=torch.long, device=device)
        return out

    # ------------------------------------------------------------------ #
    # Pipeline steps
    # ------------------------------------------------------------------ #
    def _resolve_view_types(
        self, images: list[ObservationImage], view_types: list[str] | None
    ) -> list[str]:
        """Determine the canonical view type for each image.

        User-provided labels take priority; missing/unlabeled images go through
        the view classifier.
        """
        resolved: list[str] = []
        for i, img in enumerate(images):
            user_label = view_types[i] if view_types and i < len(view_types) else None
            # Trust the user if the label is canonical.
            if user_label and user_label in CANONICAL_VIEWS:
                resolved.append(user_label)
                continue

            # Also honor the legacy view_type stored on the image record.
            if img.view_type and img.view_type in CANONICAL_VIEWS:
                resolved.append(img.view_type)
                continue

            # Auto-classify.
            arr = self._load_image_array(img)
            pred = self.view_classifier.predict(arr, filename=img.original_name)
            resolved.append(pred.view_type if pred.view_type in CANONICAL_VIEWS else "front")
        return resolved

    @staticmethod
    def _load_image_array(img: ObservationImage) -> np.ndarray:
        """Load an image as ``[H, W, 3]`` uint8 RGB array."""
        try:
            from PIL import Image  # type: ignore

            # Resolve the absolute path.
            path = img.stored_path or ""
            if path.startswith("/uploads/"):
                path = str(settings.upload_dir / Path(path).name)
            if not path or not Path(path).exists():
                # Synthetic placeholder for CI (no real image files).
                return np.zeros((224, 224, 3), dtype=np.uint8)
            pil_img = Image.open(path).convert("RGB")
            return np.asarray(pil_img, dtype=np.uint8)
        except Exception:  # noqa: BLE001
            return np.zeros((224, 224, 3), dtype=np.uint8)

    def _compute_embeddings(
        self, images: list[np.ndarray], views: list[str]
    ) -> list[np.ndarray]:
        """Run the view-conditioned backbone. Returns list of [D] arrays."""
        if not self.is_real or self._torch_model is None:
            # Placeholder embeddings (deterministic from image hash).
            return [
                np.random.default_rng(abs(hash(views[i])) % (2**32)).standard_normal(1024).astype(np.float32)
                for i in range(len(images))
            ]

        import torch  # type: ignore

        tensors = [self._preprocess_for_backbone(img) for img in images]
        view_indices = torch.tensor(
            [CANONICAL_VIEWS.index(v) if v in CANONICAL_VIEWS else 1 for v in views],
            device=self.device,
        )
        with torch.inference_mode():
            embs = self._torch_model.backbone(torch.stack(tensors).to(self.device), view_indices)
        return [e.cpu().numpy() for e in embs]

    @staticmethod
    def _preprocess_for_backbone(image: np.ndarray):
        """Resize + normalize to ``[1, 3, 224, 224]`` torch tensor."""
        import torch  # type: ignore

        try:
            import cv2  # type: ignore

            resized = cv2.resize(image, (224, 224))
        except Exception:
            h, w = image.shape[:2]
            ys = np.linspace(0, h - 1, 224).astype(int)
            xs = np.linspace(0, w - 1, 224).astype(int)
            resized = image[np.ix_(ys, xs)]

        arr = resized.astype(np.float32) / 255.0
        mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
        arr = (arr - mean) / std
        return torch.from_numpy(arr.transpose(2, 0, 1))

    def _encode_metadata(self, observation: Observation) -> np.ndarray:
        """Encode habitat/substrate/smell/country into a dense vector."""
        if not settings.model_enable_metadata_fusion:
            return np.zeros(64, dtype=np.float32)
        # Lightweight hashing-based encoding (real model uses learned embeddings).
        fields = [
            observation.habitat or "",
            observation.substrate or "",
            observation.smell or "",
            observation.country or "",
            observation.region or "",
        ]
        emb = np.zeros(64, dtype=np.float32)
        for field in fields:
            if field:
                h = hash(field.lower()) % 64
                emb[h] += 1.0
        norm = np.linalg.norm(emb)
        return emb / norm if norm > 0 else emb

    def _fuse(
        self,
        embeddings: list[np.ndarray],
        views: list[str],
        metadata_emb: np.ndarray,
    ) -> np.ndarray:
        """Attention fusion of N view embeddings + metadata → 1 observation vector."""
        if not embeddings:
            return np.concatenate([np.zeros(1024, dtype=np.float32), metadata_emb])

        # Simple attention: weight each view by a learned-or-heuristic score.
        view_weights = {
            "gills": 1.3,
            "front": 1.0,
            "habitat": 0.8,
            "detail": 0.9,
            "unknown": 0.5,
        }
        weights = np.array([view_weights.get(v, 1.0) for v in views], dtype=np.float32)
        weights = weights / weights.sum()

        stacked = np.stack(embeddings)  # [N, D]
        fused_visual = (stacked * weights[:, None]).sum(axis=0)  # [D]

        if settings.model_enable_metadata_fusion:
            return np.concatenate([fused_visual, metadata_emb])
        return np.concatenate([fused_visual, np.zeros_like(metadata_emb)])

    def _arcface_logits(self, embedding: np.ndarray) -> np.ndarray:
        """Compute ArcFace logits. If torch model present, use it; else heuristic."""
        if self.is_real and self._torch_model is not None:
            import torch  # type: ignore

            with torch.inference_mode():
                t = torch.from_numpy(embedding).unsqueeze(0).to(self.device)
                logits = self._torch_model.arcface(t)
                return logits.squeeze(0).cpu().numpy()

        # Heuristic fallback: dot product with mock catalog centroids.
        num_classes = max(len(self.catalog), 3)
        rng = np.random.default_rng(abs(hash(embedding.tobytes())) % (2**32))
        logits = rng.standard_normal(num_classes).astype(np.float32) * 0.5
        return logits

    def _rebuild_deadly_index(self) -> None:
        """Map poisonous/critical taxa onto checkpoint label indices."""
        names: set[str] = set()
        for p in self.poisonous or []:
            if isinstance(p, dict):
                n = (p.get("latin_name") or p.get("taxon") or "").strip().lower()
                if n:
                    names.add(n)
            elif isinstance(p, str):
                names.add(p.strip().lower())
        # Always track absolute critical taxa even if catalog lags
        names.update(
            {
                "amanita phalloides",
                "amanita virosa",
                "amanita bisporigera",
                "amanita verna",
                "galerina marginata",
                "lepiota brunneoincarnata",
                "cortinarius orellanus",
                "cortinarius rubellus",
            }
        )
        self._deadly_names = names
        self._deadly_idx = set()
        for sp, idx in self.label2idx.items():
            if sp.strip().lower() in names:
                self._deadly_idx.add(int(idx))

    def _apply_temperature(self, logits: np.ndarray, views: list[str]) -> np.ndarray:
        """Apply temperature scaling. Uses recommended T for weak multi-view v9."""
        T = float(
            getattr(settings, "multiview_temperature_recommended", None)
            or settings.model_temperature
            or 1.5
        )
        scaled = logits / max(T, 0.1)
        z = scaled - np.max(scaled)
        exp = np.exp(z)
        return exp / exp.sum()

    def _open_set_check(
        self, embedding: np.ndarray, probs: np.ndarray | None = None
    ) -> tuple[bool, float]:
        """Reject when weak evidence — conf/margin first, then centroids.

        With the v9 few-shot checkpoint (MAP@3~0.08), confidence/margin open-set
        is mandatory: never pretend high certainty.
        """
        conf_thr = float(
            getattr(settings, "multiview_open_set_conf_thr", None)
            or settings.open_set_min_confidence
        )
        margin_thr = float(
            getattr(settings, "multiview_open_set_margin_thr", None)
            or settings.open_set_min_margin
        )

        score = 0.0
        if probs is not None and len(probs) >= 2:
            order = np.argsort(probs)[::-1]
            top1 = float(probs[order[0]])
            top2 = float(probs[order[1]])
            margin = top1 - top2
            score = top1
            if top1 < conf_thr or margin < margin_thr:
                return True, score
            # Also reject if max conf is still tiny (flat distribution)
            if top1 < 0.15:
                return True, score

        if self.class_centroids is not None and len(self.class_centroids) > 0:
            emb_norm = embedding / (np.linalg.norm(embedding) + 1e-8)
            # Cosine only on first visual dims if emb is fused+meta
            d = self.class_centroids.shape[1]
            e = emb_norm[:d] if emb_norm.shape[0] >= d else emb_norm
            c_norm = self.class_centroids / (
                np.linalg.norm(self.class_centroids, axis=1, keepdims=True) + 1e-8
            )
            if e.shape[0] == c_norm.shape[1]:
                max_cos = float(np.max(c_norm @ e))
                score = max(score, max_cos)
                if max_cos < settings.model_open_set_threshold:
                    return True, score

        return False, score

    # ------------------------------------------------------------------ #
    # Candidate building + response (preserves safety policy)
    # ------------------------------------------------------------------ #
    def _boost_deadly_visibility(self, probs: np.ndarray) -> np.ndarray:
        """If any deadly class is in top-20, lift it into top-k for safety UX.

        Does not invent probability mass from nowhere: only reorders by giving a
        small additive bump so dangerous taxa are not buried when already plausible.
        """
        if not self._deadly_idx or probs is None or len(probs) == 0:
            return probs
        out = probs.copy()
        top20 = set(int(i) for i in np.argsort(out)[::-1][:20])
        for di in self._deadly_idx:
            if di in top20:
                # Additive bump relative to current max so it surfaces
                out[di] = out[di] + 0.05 * float(out.max())
        # renormalize
        s = float(out.sum())
        if s > 0:
            out = out / s
        return out

    @staticmethod
    def _degrade_for_open_set(candidates: list[CandidateResult]) -> list[CandidateResult]:
        """Lower displayed confidence and annotate when abstaining."""
        degraded: list[CandidateResult] = []
        for c in candidates:
            notes = list(c.danger_notes or [])
            notes.insert(
                0,
                "Modelo en abstención (open-set): evidencia insuficiente para especie.",
            )
            degraded.append(
                c.model_copy(
                    update={
                        "confidence": round(min(float(c.confidence), 0.25) * 0.5, 4),
                        "danger_notes": notes,
                        "explanation": (
                            "Abstención orientativa — no usar como identificación. "
                            + (c.explanation or "")
                        ),
                    }
                )
            )
        return degraded

    def _build_candidates(
        self,
        probs: np.ndarray,
        observation: Observation,
        images: list[ObservationImage],
        views: list[str],
    ) -> list[CandidateResult]:
        """Build top-k candidates from calibrated probabilities.

        Maps probability indices to the mock catalog taxa (the real model uses
        ``self.idx2label``; the fallback uses catalog ordering).
        """
        top_k = min(settings.top_k_candidates, len(probs))
        top_indices = np.argsort(probs)[::-1][:top_k]

        candidates: list[CandidateResult] = []
        for rank, idx in enumerate(top_indices):
            # Map to taxon name.
            if self.is_real and self.idx2label:
                taxon = self.idx2label.get(int(idx), f"species_{idx}")
                is_deadly = int(idx) in self._deadly_idx or taxon.strip().lower() in self._deadly_names
                risk = "critical" if is_deadly else "unknown"
                warning = (
                    "ESPECIE DE ALTO RIESGO / potencialmente mortal. No manipular ni consumir."
                    if is_deadly
                    else "Validacion experta requerida. Nunca consumir por esta app."
                )
                candidate = {
                    "taxon": taxon,
                    "rank": "species",
                    "risk_level": risk,
                    "warning": warning,
                    "lookalikes": [],
                }
            else:
                catalog_idx = int(idx) % len(self.catalog)
                candidate = self.catalog[catalog_idx]

            confidence = float(probs[idx])
            # Honest ceiling: weak few-shot model must never show high confidence.
            # Removed artificial floor of 0.12 (that greenwashed uncertainty).
            confidence = min(confidence, 0.45)

            candidates.append(
                CandidateResult(
                    taxon=candidate["taxon"],
                    rank=candidate.get("rank", "species"),
                    confidence=round(confidence, 4),
                    evidence_score=self._evidence_score(views),
                    metadata_score=0.0,
                    visual_score=round(confidence, 4),
                    risk_level=candidate.get("risk_level", "unknown"),
                    reasoning=self._reasoning(views, observation),
                    danger_notes=self._danger_notes(candidate, images),
                    lookalikes=candidate.get("lookalikes", []),
                    explanation="Clasificacion multi-vista orientativa; requiere validacion experta.",
                )
            )
        return candidates

    @staticmethod
    def _evidence_score(views: list[str]) -> float:
        """Higher when more canonical views are present."""
        present = {v for v in views if v in CANONICAL_VIEWS}
        score = 0.3 + 0.175 * len(present)
        return round(min(score, 1.0), 4)

    @staticmethod
    def _reasoning(views: list[str], observation: Observation) -> list[str]:
        reasoning: list[str] = []
        if "gills" in views:
            reasoning.append("Vista de laminas disponible para rasgos diagnosticos.")
        else:
            reasoning.append("Falta vista inferior (laminas/poros).")
        if "front" in views:
            reasoning.append("Vista frontal/perfil disponible.")
        if "habitat" in views:
            reasoning.append("Vista de habitat disponible.")
        if observation.habitat:
            reasoning.append(f"Habitat declarado: {observation.habitat}.")
        return reasoning[:4]

    def _danger_notes(self, candidate: dict, images: list[ObservationImage]) -> list[str]:
        notes = [
            candidate.get("warning")
            or candidate.get("description", "La coincidencia requiere validacion experta.")
        ]
        if candidate["taxon"].startswith("Amanita"):
            notes.append("El genero contiene especies mortales.")
        return notes

    def _build_response(
        self,
        observation: Observation,
        images: list[ObservationImage],
        candidates: list[CandidateResult],
        views: list[str],
        is_unknown: bool,
        cosine_score: float,
        elapsed_ms: int,
        probs: np.ndarray | None = None,
    ) -> ClassificationResponse:
        """Assemble the final ClassificationResponse (safety-intact)."""
        quality = self.quality_service.evaluate(images)
        primary = candidates[0] if candidates else None

        explanation = self.safety_service.build(
            observation=observation,
            images=images,
            lookalikes=primary.lookalikes if primary else [],
            classifier_warning=primary.danger_notes[0] if primary and primary.danger_notes else "",
            quality=quality,
        )

        arch = (self._arch_info or {}).get("arch", "multiview")
        if self.is_real:
            model_stack = ModelStackResponse(
                detector="disabled_roi_passthrough",
                visual_embedder=f"real_{arch}_convnextv2_tiny_lora",
                image_text_embedder="real_attention_fusion",
                metadata_encoder="real_metadata_encoder_v8",
            )
            pipeline_version = f"multiview-real-{arch}"
            strategy = "multi_view_v8_attention_fusion_arcface_open_set"
        else:
            model_stack = ModelStackResponse(
                detector="mock_yoloe_fallback",
                visual_embedder="mock_dinov3_fallback",
                image_text_embedder="mock_siglip2_fallback",
                metadata_encoder="mock_metadata_encoder",
            )
            pipeline_version = "mvp-safety-v3-multiview-mock-path"
            strategy = "mock_multiview_ranker"

        top1 = float(primary.confidence) if primary else 0.0
        top2 = float(candidates[1].confidence) if len(candidates) > 1 else 0.0
        margin = max(0.0, top1 - top2)
        open_set = OpenSetResponse(
            is_unknown_or_uncertain=bool(is_unknown),
            reason=(
                "low_confidence_or_margin_multiview_few_shot"
                if is_unknown
                else "accepted_with_orientation_only"
            ),
            top1_confidence=top1,
            top2_confidence=top2,
            margin=margin,
            entropy=None,
            decision="reject" if is_unknown else "accept_orientation_only",
            reasons=[
                f"score={cosine_score:.4f}",
                f"conf_thr={getattr(settings, 'multiview_open_set_conf_thr', None)}",
                "checkpoint_quality=few_shot_unacceptable_for_species_id",
            ],
            thresholds_status="multiview_calibrated_v9_battery",
        )
        human_review = HumanReviewResponse(
            recommended=True,
            priority="high" if is_unknown or (primary and primary.risk_level in ("critical", "high", "deadly")) else "medium",
            reason=(
                "Modelo multi-view en régimen few-shot (MAP@3~0.08) — revisión humana obligatoria."
            ),
        )
        warnings = list(explanation.warnings or [])
        warnings.insert(
            0,
            "Calidad del modelo actual INACEPTABLE para identificación de especie "
            "(MAP@3 test ~7.6%). Solo orientación; abstenerse de decisiones de campo.",
        )
        if any((c.risk_level or "") in ("critical", "deadly", "high") for c in candidates):
            warnings.insert(
                0,
                "Hay candidatos de alto riesgo/mortales en la lista — tratar como peligro hasta experto.",
            )

        return ClassificationResponse(
            observation_id=observation.id,
            status="orientation_only",
            safety_level="unsafe_to_consume",
            risk_state=explanation.risk_state,
            message="Resultado orientativo. NO consumir basado en esta clasificacion.",
            model_stack=model_stack,
            candidates=candidates,
            top_candidates=candidates,
            missing_evidence=explanation.missing_evidence,
            explanation=explanation.explanation,
            questions_for_user=explanation.questions_for_user,
            warnings=warnings,
            dangerous_lookalikes=primary.lookalikes if primary else [],
            open_set=open_set,
            human_review=human_review,
            quality_assessment=QualityAssessmentResponse(
                sharpness_ok=quality.sharpness_ok,
                lighting_ok=quality.lighting_ok,
                mushroom_large_enough=quality.mushroom_large_enough,
                has_lower_view=quality.has_lower_view,
                has_base_view=quality.has_base_view,
                has_environment_view=quality.has_environment_view,
                possible_multiple_species=quality.possible_multiple_species,
                obstruction_detected=quality.obstruction_detected,
                heavy_compression_or_blur=quality.heavy_compression_or_blur,
                quality_warnings=quality.quality_warnings,
            ),
            trace=TraceResponse(
                pipeline_version=pipeline_version,
                classifier_strategy=strategy,
                segmentation_strategy="passthrough_or_yolov8_roi",
                visual_backbone_plan=[
                    "ConvNeXtV2-tiny + VectorizedLoRA (gills/front/habitat/detail)",
                    "Attention fusion + metadata token",
                    "ArcFace metric head + temperature scaling",
                ],
                metadata_fusion_plan="attention_pooling_with_metadata_token",
                open_set_strategy=(
                    f"cosine_vs_centroids (threshold={settings.model_open_set_threshold}, "
                    f"max_cosine={cosine_score:.3f}, unknown={is_unknown})"
                ),
                human_review_path="expert_review_for_high_risk_or_low_evidence_cases",
            ),
            final_warning="ADVERTENCIA: Esta identificacion es SOLO orientativa. "
            "Nunca consumas una seta basandote unicamente en esta app.",
        )


# --------------------------------------------------------------------------- #
# Lazy singleton accessor
# --------------------------------------------------------------------------- #
_classifier_instance: MultiViewMushroomClassifier | None = None


def get_multi_view_classifier() -> MultiViewMushroomClassifier:
    """Lazy singleton — avoids importing torch at module load time."""
    global _classifier_instance
    if _classifier_instance is None:
        _classifier_instance = MultiViewMushroomClassifier()
    return _classifier_instance


def reset_multi_view_classifier() -> None:
    """Reset the singleton (used in tests)."""
    global _classifier_instance
    _classifier_instance = None