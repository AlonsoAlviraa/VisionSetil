import os
from dataclasses import dataclass, field
from pathlib import Path

from app.core.config import settings, Settings
from app.core.logging import get_logger
from app.ml.fallbacks import MockVisualEmbedder
from app.ml.interfaces import ImageEmbedding, VisualEmbedder

logger = get_logger(__name__)


@dataclass
class DINOv3Embedder(VisualEmbedder):
    model_name: str
    model_path: str
    is_real: bool = False
    device: str = "cpu"
    model: object = None
    processor: object = None
    fallback: MockVisualEmbedder = field(default_factory=MockVisualEmbedder)

    @classmethod
    def from_settings(cls, config: Settings) -> "DINOv3Embedder":
        is_real = bool(config.use_real_dinov3 and (config.dino_model_name or config.dino_model_path))
        device = config.dino_device
        model = None
        processor = None

        if is_real:
            try:
                import torch
                from transformers import AutoImageProcessor, AutoModel

                if device == "auto":
                    device = "cuda" if torch.cuda.is_available() else "cpu"

                model_identifier = config.dino_model_path or config.dino_model_name or "facebook/dinov2-base"
                
                # Check if it's a local path and verify existence
                if config.dino_model_path and not Path(config.dino_model_path).exists():
                    raise FileNotFoundError(f"Local model path not found: {config.dino_model_path}")

                processor = AutoImageProcessor.from_pretrained(model_identifier)
                model = AutoModel.from_pretrained(model_identifier).to(device)
                model.eval()

                logger.info(f"DINOv3Embedder real model successfully loaded on {device}")
            except Exception as e:
                logger.warning(f"Failed to load real DINOv3Embedder, falling back to mock: {e}")
                is_real = False
                device = "cpu"

        if not is_real:
            logger.warning("DINOv3 real model not available, using fallback embedder")

        return cls(
            model_name=config.dino_model_name or "mock-dinov3",
            model_path=config.dino_model_path or "",
            is_real=is_real,
            device=device,
            model=model,
            processor=processor,
        )

    def embed_images(self, image_paths: list[str]) -> list[ImageEmbedding]:
        if not self.is_real or self.model is None or self.processor is None:
            # Adjust mock model_name to match backend expectations (mock_dinov3)
            embeddings = self.fallback.embed_images(image_paths)
            for emb in embeddings:
                emb.model_name = "mock_dinov3"
            return embeddings

        embeddings: list[ImageEmbedding] = []
        try:
            import torch
            from PIL import Image
            from app.services.embedding_cache import EmbeddingCache

            cache = EmbeddingCache()

            for path in image_paths:
                abs_path = path
                if path.startswith("/uploads"):
                    abs_path = str(settings.base_dir / path.lstrip("/"))

                image_hash = self._get_image_hash(abs_path)
                cached_vec = cache.get(image_hash, "real_dinov3")
                if cached_vec is not None:
                    embeddings.append(
                        ImageEmbedding(
                            source_path=path,
                            vector=cached_vec,
                            model_name="real_dinov3",
                        )
                    )
                    continue

                img = Image.open(abs_path).convert("RGB")
                inputs = self.processor(images=img, return_tensors="pt").to(self.device)

                with torch.no_grad():
                    outputs = self.model(**inputs)
                    if hasattr(outputs, "pooler_output") and outputs.pooler_output is not None:
                        features = outputs.pooler_output
                    else:
                        features = outputs.last_hidden_state[:, 0]

                    features = torch.nn.functional.normalize(features, p=2, dim=1)
                    vector = features[0].cpu().tolist()

                # Adjust or truncate vector to match config dimensions if needed
                # (e.g. if the model output is 768 but dino_embedding_dim says 1024, or vice versa,
                # we can pad or truncate, or just return the raw vector dimension and let config adapt)
                # Let's ensure the embedding dimension matches settings.dino_embedding_dim if possible.
                dim = settings.dino_embedding_dim
                if len(vector) != dim:
                    if len(vector) > dim:
                        vector = vector[:dim]
                    else:
                        vector = vector + [0.0] * (dim - len(vector))

                # Normalize the final vector again if padded
                # L2 norm of python list
                norm = sum(x*x for x in vector) ** 0.5
                if norm > 0:
                    vector = [round(x / norm, 4) for x in vector]

                cache.set(image_hash, "real_dinov3", vector)

                embeddings.append(
                    ImageEmbedding(
                        source_path=path,
                        vector=vector,
                        model_name="real_dinov3",
                    )
                )
            return embeddings
        except Exception as e:
            logger.warning(f"Error executing real DINOv3Embedder embed_images, falling back to mock: {e}")
            fallback_embs = self.fallback.embed_images(image_paths)
            for emb in fallback_embs:
                emb.model_name = "mock_dinov3"
            return fallback_embs

    def _get_image_hash(self, path: str) -> str:
        import hashlib
        try:
            with open(path, "rb") as f:
                return hashlib.md5(f.read()).hexdigest()
        except Exception:
            return hashlib.md5(path.encode()).hexdigest()
