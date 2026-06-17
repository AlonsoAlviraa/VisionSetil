import os
from pathlib import Path

from pydantic import BaseModel

_cuda_compatible_cache: bool | None = None

def is_cuda_really_compatible() -> bool:
    global _cuda_compatible_cache
    if _cuda_compatible_cache is not None:
        return _cuda_compatible_cache
    try:
        import torch
        if not torch.cuda.is_available():
            _cuda_compatible_cache = False
            return False
        x = torch.ones(1, device="cuda")
        _ = x * 2.0
        torch.cuda.synchronize()
        _cuda_compatible_cache = True
    except Exception:
        _cuda_compatible_cache = False
    return _cuda_compatible_cache



class Settings(BaseModel):
    base_dir: Path = Path(__file__).resolve().parents[2]
    database_path: Path = Path(os.getenv("DATABASE_PATH", Path(__file__).resolve().parents[2] / "mushroom_photo_id.db"))
    upload_dir: Path = Path(os.getenv("UPLOAD_DIR", Path(__file__).resolve().parents[2] / "uploads"))
    poisonous_species_path: Path = Path(__file__).resolve().parents[1] / "data" / "poisonous_species.json"
    mock_species_catalog_path: Path = Path(__file__).resolve().parents[1] / "data" / "mock_species_catalog.json"
    metadata_schema_path: Path = Path(__file__).resolve().parents[1] / "data" / "metadata_schema.json"
    max_upload_size_bytes: int = int(os.getenv("MAX_IMAGE_MB", "10")) * 1024 * 1024
    allowed_extensions: set[str] = {"jpg", "jpeg", "png", "webp"}
    top_k_candidates: int = int(os.getenv("TOP_K_CANDIDATES", "5"))
    use_real_yoloe: bool = os.getenv("USE_REAL_YOLOE", "false").lower() == "true"
    use_real_dinov3: bool = os.getenv("USE_REAL_DINOV3", "false").lower() == "true"
    use_real_siglip2: bool = os.getenv("USE_REAL_SIGLIP2", "false").lower() == "true"
    allow_mock_fallbacks: bool = os.getenv("ALLOW_MOCK_FALLBACKS", "true").lower() == "true"
    yoloe_model_name: str = os.getenv("YOLOE_MODEL_NAME", "")
    yoloe_model_path: str = os.getenv("YOLOE_MODEL_PATH", "")
    dino_model_name: str = os.getenv("DINO_MODEL_NAME", "")
    dino_model_path: str = os.getenv("DINO_MODEL_PATH", "")
    siglip_model_name: str = os.getenv("SIGLIP_MODEL_NAME", "")
    siglip_model_path: str = os.getenv("SIGLIP_MODEL_PATH", "")
    yoloe_device: str = os.getenv("YOLOE_DEVICE", "auto")
    yoloe_conf_threshold: float = float(os.getenv("YOLOE_CONF_THRESHOLD", "0.25"))
    yoloe_iou_threshold: float = float(os.getenv("YOLOE_IOU_THRESHOLD", "0.7"))
    dino_device: str = os.getenv("DINO_DEVICE", "auto")
    dino_embedding_dim: int = int(os.getenv("DINO_EMBEDDING_DIM", "1024"))
    siglip_device: str = os.getenv("SIGLIP_DEVICE", "auto")
    siglip_embedding_dim: int = int(os.getenv("SIGLIP_EMBEDDING_DIM", "768"))
    open_set_min_confidence: float = float(os.getenv("OPEN_SET_MIN_CONFIDENCE", "0.55"))
    open_set_min_margin: float = float(os.getenv("OPEN_SET_MIN_MARGIN", "0.15"))
    open_set_reject_on_missing_critical_evidence: bool = os.getenv("OPEN_SET_REJECT_ON_MISSING_CRITICAL_EVIDENCE", "true").lower() == "true"
    open_set_reject_on_deadly_lookalikes: bool = os.getenv("OPEN_SET_REJECT_ON_DEADLY_LOOKALIKES", "true").lower() == "true"
    required_views: tuple[str, ...] = (
        "cap_top",
        "gills_or_pores",
        "stem",
        "base",
        "cross_section",
        "environment",
    )


settings = Settings()
