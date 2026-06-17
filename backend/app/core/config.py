import os
from pathlib import Path

from pydantic import BaseModel


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
    yoloe_model_name: str = os.getenv("YOLOE_MODEL_NAME", "")
    yoloe_model_path: str = os.getenv("YOLOE_MODEL_PATH", "")
    dino_model_name: str = os.getenv("DINO_MODEL_NAME", "")
    dino_model_path: str = os.getenv("DINO_MODEL_PATH", "")
    siglip_model_name: str = os.getenv("SIGLIP_MODEL_NAME", "")
    siglip_model_path: str = os.getenv("SIGLIP_MODEL_PATH", "")
    required_views: tuple[str, ...] = (
        "cap_top",
        "gills_or_pores",
        "stem",
        "base",
        "cross_section",
        "environment",
    )


settings = Settings()
