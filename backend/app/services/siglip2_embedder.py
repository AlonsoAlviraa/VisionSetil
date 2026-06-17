import os
from dataclasses import dataclass, field
from pathlib import Path

from app.core.config import settings, Settings
from app.core.logging import get_logger
from app.ml.fallbacks import MockImageTextEmbedder
from app.ml.interfaces import ImageEmbedding, ImageTextEmbedder, TextEmbedding

logger = get_logger(__name__)


@dataclass
class SigLIP2Embedder(ImageTextEmbedder):
    model_name: str
    model_path: str
    is_real: bool = False
    device: str = "cpu"
    model: object = None
    processor: object = None
    fallback: MockImageTextEmbedder = field(default_factory=MockImageTextEmbedder)

    @classmethod
    def from_settings(cls, config: Settings) -> "SigLIP2Embedder":
        is_real = bool(config.use_real_siglip2)
        device = config.siglip_device
        model = None
        processor = None
        model_name = config.siglip_model_name or "google/siglip-base-patch16-224"
        model_path = config.siglip_model_path or ""

        if is_real:
            try:
                import torch
                from transformers import AutoProcessor, AutoModel

                if device == "auto":
                    device = "cuda" if torch.cuda.is_available() else "cpu"

                model_identifier = model_path if (model_path and Path(model_path).exists()) else model_name
                
                if config.siglip_model_path and not Path(config.siglip_model_path).exists():
                    raise FileNotFoundError(f"Local model path not found: {config.siglip_model_path}")

                processor = AutoProcessor.from_pretrained(model_identifier)
                model = AutoModel.from_pretrained(model_identifier).to(device)
                model.eval()

                logger.info(f"SigLIP2Embedder real model successfully loaded on {device}")
            except Exception as e:
                logger.warning(f"Failed to load real SigLIP2Embedder on {device}, trying on cpu: {e}")
                try:
                    import torch
                    from transformers import AutoProcessor, AutoModel
                    processor = AutoProcessor.from_pretrained(model_identifier)
                    model = AutoModel.from_pretrained(model_identifier).to("cpu")
                    model.eval()
                    device = "cpu"
                    logger.info("SigLIP2Embedder real model successfully loaded on cpu as fallback")
                except Exception as e2:
                    logger.warning(f"Failed to load real SigLIP2Embedder on cpu: {e2}")
                    is_real = False
                    if not config.allow_mock_fallbacks:
                        raise RuntimeError(f"SigLIP2Embedder real model failed to load (allow_mock_fallbacks is False): {e2}") from e2
                    device = "cpu"

        if not is_real:
            if not config.allow_mock_fallbacks:
                raise RuntimeError("SigLIP2Embedder real model failed to load (allow_mock_fallbacks is False).")
            logger.warning("SigLIP 2 real model not available, using fallback image-text embedder")

        return cls(
            model_name=config.siglip_model_name or ("google/siglip-base-patch16-224" if config.use_real_siglip2 else "mock-siglip2"),
            model_path=model_path,
            is_real=is_real,
            device=device,
            model=model,
            processor=processor,
        )

    def embed_images(self, image_paths: list[str]) -> list[ImageEmbedding]:
        if not self.is_real or self.model is None or self.processor is None:
            if not settings.allow_mock_fallbacks:
                raise RuntimeError("SigLIP2Embedder real model is required but not loaded.")
            embeddings = self.fallback.embed_images(image_paths)
            for emb in embeddings:
                emb.model_name = "mock_siglip2"
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
                cached_vec = cache.get(image_hash, "real_siglip2")
                if cached_vec is not None:
                    embeddings.append(
                        ImageEmbedding(
                            source_path=path,
                            vector=cached_vec,
                            model_name="real_siglip2",
                        )
                    )
                    continue

                img = Image.open(abs_path).convert("RGB")
                inputs = self.processor(images=img, return_tensors="pt").to(self.device)

                with torch.no_grad():
                    image_features = self.model.get_image_features(**inputs)
                    image_features = torch.nn.functional.normalize(image_features, p=2, dim=-1)
                    vector = image_features[0].cpu().tolist()

                dim = settings.siglip_embedding_dim
                if len(vector) != dim:
                    if len(vector) > dim:
                        vector = vector[:dim]
                    else:
                        vector = vector + [0.0] * (dim - len(vector))

                norm = sum(x*x for x in vector) ** 0.5
                if norm > 0:
                    vector = [round(x / norm, 4) for x in vector]

                cache.set(image_hash, "real_siglip2", vector)

                embeddings.append(
                    ImageEmbedding(
                        source_path=path,
                        vector=vector,
                        model_name="real_siglip2",
                    )
                )
            return embeddings
        except Exception as e:
            logger.warning(f"Error in real SigLIP2Embedder embed_images: {e}")
            if not settings.allow_mock_fallbacks:
                raise RuntimeError(f"SigLIP2Embedder failed at runtime inside embed_images: {e}") from e
            fallback_embs = self.fallback.embed_images(image_paths)
            for emb in fallback_embs:
                emb.model_name = "mock_siglip2"
            return fallback_embs

    def embed_texts(self, texts: list[str]) -> list[TextEmbedding]:
        if not self.is_real or self.model is None or self.processor is None:
            if not settings.allow_mock_fallbacks:
                raise RuntimeError("SigLIP2Embedder real model is required but not loaded.")
            embeddings = self.fallback.embed_texts(texts)
            for emb in embeddings:
                emb.model_name = "mock_siglip2"
            return embeddings

        embeddings: list[TextEmbedding] = []
        try:
            import torch

            inputs = self.processor(text=texts, padding="max_length", return_tensors="pt").to(self.device)

            with torch.no_grad():
                text_features = self.model.get_text_features(**inputs)
                text_features = torch.nn.functional.normalize(text_features, p=2, dim=-1)
                vectors = text_features.cpu().tolist()

            dim = settings.siglip_embedding_dim
            for text, vector in zip(texts, vectors, strict=False):
                if len(vector) != dim:
                    if len(vector) > dim:
                        vector = vector[:dim]
                    else:
                        vector = vector + [0.0] * (dim - len(vector))

                norm = sum(x*x for x in vector) ** 0.5
                if norm > 0:
                    vector = [round(x / norm, 4) for x in vector]

                embeddings.append(
                    TextEmbedding(
                        source_text=text,
                        vector=vector,
                        model_name="real_siglip2",
                    )
                )
            return embeddings
        except Exception as e:
            logger.warning(f"Error in real SigLIP2Embedder embed_texts: {e}")
            if not settings.allow_mock_fallbacks:
                raise RuntimeError(f"SigLIP2Embedder failed at runtime inside embed_texts: {e}") from e
            fallback_embs = self.fallback.embed_texts(texts)
            for emb in fallback_embs:
                emb.model_name = "mock_siglip2"
            return fallback_embs

    def similarity(self, image_embedding: ImageEmbedding, text_embedding: TextEmbedding) -> float:
        left = image_embedding.vector
        right = text_embedding.vector
        if not left or not right or len(left) != len(right):
            return 0.0
        dot = sum(a * b for a, b in zip(left, right))
        return round(max(0.0, dot), 4)

    def _get_image_hash(self, path: str) -> str:
        import hashlib
        try:
            with open(path, "rb") as f:
                return hashlib.md5(f.read()).hexdigest()
        except Exception:
            return hashlib.md5(path.encode()).hexdigest()
