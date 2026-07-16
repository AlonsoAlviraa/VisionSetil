"""Foundation-model ensemble embedding pipeline for VisionSetil.

Based on the FungiCLEF 2025 1st-place solution (Jack-Etheredge):
    concatenate embeddings from DINOv2 + FungiTastic-BEiT (+ optional SAM/SigLIP).

This module is import-safe: torch/timm are only required when actually used,
so unit tests can import the data structures without GPU deps.

Usage:
    from kaggle.foundation_ensemble import FoundationEnsemble, FoundationConfig

    ensemble = FoundationEnsemble(FoundationConfig(models=["dinov2_base", "beit_fungi"]))
    embedding = ensemble.embed_image(image_tensor)   # [D_total]

The concatenated embedding is the input to the prototype classifier
(``PrototypeClassifier``), which does cosine similarity against per-class
centroids — enabling open-set rejection without retraining.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Sequence

# ---------------------------------------------------------------------------
# Model registry — foundation models known to work well for fungi.
# License compatibility verified: all Apache-2.0 or MIT.
# ---------------------------------------------------------------------------
FOUNDATION_MODELS: dict[str, dict[str, Any]] = {
    # DINOv2 — self-supervised, excellent for fine-grained visual features.
    "dinov2_small": {
        "timm_name": "vit_small_patch14_dinov2.lvd142m",
        "dim": 384,
        "license": "Apache-2.0",
        "type": "vit",
    },
    "dinov2_base": {
        "timm_name": "vit_base_patch14_dinov2.lvd142m",
        "dim": 768,
        "license": "Apache-2.0",
        "type": "vit",
    },
    "dinov2_large": {
        "timm_name": "vit_large_patch14_dinov2.lvd142m",
        "dim": 1024,
        "license": "Apache-2.0",
        "type": "vit",
    },
    # FungiTastic-BEiT — BEiT fine-tuned on Danish Fungi (domain-specific).
    # Available on HuggingFace:_pwawra/fungitastic-beit-base
    "beit_fungi": {
        "hf_name": "pwawra/fungitastic-beit-base",
        "dim": 768,
        "license": "MIT",
        "type": "beit",
    },
    # SigLIP — for text-image alignment (used in prototype text matching).
    "siglip_base": {
        "timm_name": "vit_base_patch16_siglip_384",
        "dim": 768,
        "license": "Apache-2.0",
        "type": "vit",
    },
    # ConvNeXt-V2 — strong CNN baseline (general ImageNet).
    "convnextv2_base": {
        "timm_name": "convnextv2_base.fcmae_ft_in22k_in1k",
        "dim": 1024,
        "license": "MIT",
        "type": "cnn",
    },
}


@dataclass
class FoundationConfig:
    """Configuration for the foundation-model ensemble.

    Args:
        models: list of keys in FOUNDATION_MODELS to ensemble.
        device: "cuda", "cpu", or "mps".
        image_size: input resolution (DINOv2 uses 518; BEiT uses 224).
        use_amp: mixed-precision for speed.
        normalize_each: L2-normalize each model's embedding before concat
            (recommended — prevents one model from dominating).
    """

    models: tuple[str, ...] = ("dinov2_base", "beit_fungi")
    device: str = "cuda"
    image_size: int = 518
    use_amp: bool = True
    normalize_each: bool = True

    @property
    def total_dim(self) -> int:
        return sum(FOUNDATION_MODELS[m]["dim"] for m in self.models)

    def validate(self) -> None:
        for m in self.models:
            if m not in FOUNDATION_MODELS:
                raise ValueError(
                    f"Unknown foundation model '{m}'. "
                    f"Available: {sorted(FOUNDATION_MODELS.keys())}"
                )


# ---------------------------------------------------------------------------
# Prototype Classifier (post-foundation-embedding)
# ---------------------------------------------------------------------------
@dataclass
class PrototypeClassifier:
    """Cosine-similarity classifier over per-class centroid embeddings.

    After foundation-model embedding, compute the mean embedding per class
    (the "prototype"). Classification = argmax cosine similarity.
    Open-set rejection = max cosine < threshold.

    This is exactly the FungiCLEF winning approach: no fine-tuning needed
    for a strong baseline; prototypes can be updated incrementally.
    """

    prototypes: dict[str, list[float]] = field(default_factory=dict)
    label2idx: dict[str, int] = field(default_factory=dict)
    idx2label: list[str] = field(default_factory=list)
    open_set_threshold: float = 0.55  # tuned on val; lower = more rejects

    def fit(self, embeddings: dict[str, list[list[float]]]) -> None:
        """Compute prototypes from per-class lists of embeddings.

        Args:
            embeddings: species_name → list of embedding vectors.
        """
        self.idx2label = sorted(embeddings.keys())
        self.label2idx = {l: i for i, l in enumerate(self.idx2label)}
        self.prototypes = {}
        for label in self.idx2label:
            embs = embeddings[label]
            if not embs:
                continue
            # Average then L2-normalize.
            import numpy as np

            mean = np.mean(embs, axis=0)
            norm = np.linalg.norm(mean)
            if norm > 0:
                mean = mean / norm
            self.prototypes[label] = mean.tolist()

    @property
    def num_classes(self) -> int:
        return len(self.prototypes)

    def predict(
        self, embedding: list[float], top_k: int = 3
    ) -> list[tuple[str, float]]:
        """Return top-k (species, cosine_similarity) pairs.

        If top-1 similarity < open_set_threshold, caller should treat as unknown.
        """
        import numpy as np

        emb = np.array(embedding, dtype=np.float32)
        norm = np.linalg.norm(emb)
        if norm > 0:
            emb = emb / norm

        scores: list[tuple[str, float]] = []
        for label, proto in self.prototypes.items():
            p = np.array(proto, dtype=np.float32)
            cos = float(np.dot(emb, p))
            scores.append((label, cos))

        scores.sort(key=lambda x: x[1], reverse=True)
        return scores[:top_k]

    def is_open_set(self, top_score: float) -> bool:
        """True if the top score is below the open-set rejection threshold."""
        return top_score < self.open_set_threshold

    def save(self, path: Path) -> None:
        Path(path).write_text(
            json.dumps(
                {
                    "prototypes": self.prototypes,
                    "label2idx": self.label2idx,
                    "idx2label": self.idx2label,
                    "open_set_threshold": self.open_set_threshold,
                },
                indent=2,
            ),
            encoding="utf-8",
        )

    @classmethod
    def load(cls, path: Path) -> "PrototypeClassifier":
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        clf = cls(open_set_threshold=data.get("open_set_threshold", 0.55))
        clf.prototypes = data["prototypes"]
        clf.label2idx = data["label2idx"]
        clf.idx2label = data["idx2label"]
        return clf


# ---------------------------------------------------------------------------
# Lazy-loading ensemble wrapper
# ---------------------------------------------------------------------------
class FoundationEnsemble:
    """Loads multiple foundation models and concatenates their embeddings.

    Models are loaded lazily (only when first embed_* call happens) to avoid
    importing torch on module import.
    """

    def __init__(self, cfg: FoundationConfig) -> None:
        cfg.validate()
        self.cfg = cfg
        self._models: dict[str, Any] = {}  # lazy
        self._transforms: dict[str, Any] = {}
        self._loaded = False

    def _load(self) -> None:
        if self._loaded:
            return
        import torch
        import timm
        from torchvision import transforms

        for name in self.cfg.models:
            spec = FOUNDATION_MODELS[name]
            if "timm_name" in spec:
                model = timm.create_model(
                    spec["timm_name"], pretrained=True, num_classes=0
                )
            elif "hf_name" in spec:
                from transformers import AutoModel

                model = AutoModel.from_pretrained(spec["hf_name"])
            model.eval()
            if self.cfg.device != "cpu":
                model = model.to(self.cfg.device)
            self._models[name] = model

            # Per-model input size & normalization.
            if spec["type"] == "vit" and "dinov2" in name:
                size = 518
            elif spec["type"] == "beit":
                size = 224
            else:
                size = self.cfg.image_size
            self._transforms[name] = transforms.Compose(
                [
                    transforms.Resize((size, size)),
                    transforms.ToTensor(),
                    transforms.Normalize(
                        mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]
                    ),
                ]
            )
        self._loaded = True

    def embed_image(self, image: Any) -> list[float]:
        """Embed a PIL image → concatenated foundation embedding.

        Args:
            image: PIL.Image or path.
        Returns:
            list[float] of length cfg.total_dim.
        """
        self._load()
        import torch
        from PIL import Image

        if isinstance(image, (str, Path)):
            image = Image.open(image).convert("RGB")

        parts: list[torch.Tensor] = []
        with torch.inference_mode():
            for name in self.cfg.models:
                spec = FOUNDATION_MODELS[name]
                tensor = self._transforms[name](image).unsqueeze(0)
                if self.cfg.device != "cpu":
                    tensor = tensor.to(self.cfg.device)
                if self.cfg.use_amp and self.cfg.device != "cpu":
                    with torch.autocast(self.cfg.device):
                        emb = self._models[name](tensor)
                else:
                    emb = self._models[name](tensor)
                emb = emb.squeeze(0).float().cpu()
                if self.cfg.normalize_each:
                    emb = torch.nn.functional.normalize(emb, dim=-1)
                parts.append(emb)

        concatenated = torch.cat(parts, dim=-1)
        return concatenated.tolist()

    def embed_batch(self, images: Sequence[Any]) -> list[list[float]]:
        """Embed a batch of images."""
        return [self.embed_image(img) for img in images]


# ---------------------------------------------------------------------------
# Embedding cache builder (for pre-computing prototypes)
# ---------------------------------------------------------------------------
def compute_perceptual_hash(image_path: Path, hash_size: int = 8) -> str:
    """Compute a perceptual hash for deduplication (anti-leak).

    Uses a simple average-hash implementation (no external dependency).
    """
    from PIL import Image

    img = Image.open(image_path).convert("L").resize((hash_size, hash_size), Image.LANCZOS)
    pixels = list(img.getdata())
    avg = sum(pixels) / len(pixels)
    bits = "".join("1" if p > avg else "0" for p in pixels)
    # Convert bit string to hex.
    return format(int(bits, 2), f"0{(hash_size * hash_size) // 4}x")


def file_md5(path: Path, chunk: int = 65536) -> str:
    """Compute MD5 hash of a file (for exact dedup)."""
    h = hashlib.md5()
    with open(path, "rb") as f:
        while True:
            data = f.read(chunk)
            if not data:
                break
            h.update(data)
    return h.hexdigest()