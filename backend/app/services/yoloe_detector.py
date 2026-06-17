import os
from dataclasses import dataclass, field
from pathlib import Path

from app.core.config import settings, Settings
from app.core.logging import get_logger
from app.ml.fallbacks import MockMushroomDetector
from app.ml.interfaces import BoundingBox, DetectedMushroomCrop, MushroomDetector

logger = get_logger(__name__)


@dataclass
class YOLOEDetector(MushroomDetector):
    model_name: str
    model_path: str
    is_real: bool = False
    device: str = "cpu"
    model: object = None
    fallback: MockMushroomDetector = field(default_factory=MockMushroomDetector)

    @classmethod
    def from_settings(cls, config: Settings) -> "YOLOEDetector":
        is_real = bool(config.use_real_yoloe and (config.yoloe_model_name or config.yoloe_model_path))
        device = config.yoloe_device
        model = None
        
        if is_real:
            try:
                from ultralytics import YOLO
                import torch
                
                if device == "auto":
                    device = "cuda" if torch.cuda.is_available() else "cpu"
                
                if config.yoloe_model_path and Path(config.yoloe_model_path).exists():
                    model = YOLO(config.yoloe_model_path)
                elif config.yoloe_model_name:
                    model = YOLO(config.yoloe_model_name)
                else:
                    raise ValueError("Neither valid model_path nor model_name provided")
                
                logger.info(f"YOLOEDetector real model successfully loaded on {device}")
            except Exception as e:
                logger.warning(f"Failed to load real YOLOEDetector, falling back to mock: {e}")
                is_real = False
                device = "cpu"

        if not is_real:
            logger.warning("YOLOE real model not available, using fallback detector")

        return cls(
            model_name=config.yoloe_model_name or "mock-yoloe-26",
            model_path=config.yoloe_model_path or "",
            is_real=is_real,
            device=device,
            model=model,
        )

    def detect_and_crop(self, image_paths: list[str]) -> list[DetectedMushroomCrop]:
        if not self.is_real or self.model is None:
            return self.fallback.detect_and_crop(image_paths)

        detections: list[DetectedMushroomCrop] = []
        try:
            from PIL import Image, ImageDraw
            
            for path in image_paths:
                results = self.model(
                    path,
                    conf=settings.yoloe_conf_threshold,
                    iou=settings.yoloe_iou_threshold,
                    device=self.device,
                    verbose=False
                )
                
                best_box = None
                best_score = -1.0
                best_mask = None
                
                for r in results:
                    boxes = r.boxes
                    masks = r.masks
                    for idx, box in enumerate(boxes):
                        score = float(box.conf[0])
                        if score > best_score:
                            best_score = score
                            xyxy = box.xyxy[0].tolist()
                            best_box = BoundingBox(x1=xyxy[0], y1=xyxy[1], x2=xyxy[2], y2=xyxy[3])
                            if masks is not None and len(masks) > idx:
                                best_mask = masks[idx].xy[0]

                if best_box is not None:
                    img = Image.open(path)
                    width, height = img.size
                    
                    x1 = max(0, int(best_box.x1))
                    y1 = max(0, int(best_box.y1))
                    x2 = min(width, int(best_box.x2))
                    y2 = min(height, int(best_box.y2))
                    
                    crop_img = img.crop((x1, y1, x2, y2))
                    
                    filename = Path(path).name
                    obs_id_str = filename.split('-')[0]
                    
                    obs_dir = settings.upload_dir / "observations" / obs_id_str
                    crops_dir = obs_dir / "crops"
                    masks_dir = obs_dir / "masks"
                    
                    crops_dir.mkdir(parents=True, exist_ok=True)
                    crop_path_on_disk = crops_dir / f"crop-{filename}"
                    crop_img.save(crop_path_on_disk)
                    
                    mask_url = None
                    if best_mask is not None:
                        masks_dir.mkdir(parents=True, exist_ok=True)
                        mask_path_on_disk = masks_dir / f"mask-{filename}.png"
                        
                        mask_img = Image.new("L", (width, height), 0)
                        draw = ImageDraw.Draw(mask_img)
                        polygon_coords = [tuple(p) for p in best_mask]
                        if len(polygon_coords) >= 3:
                            draw.polygon(polygon_coords, fill=255)
                            
                        crop_mask = mask_img.crop((x1, y1, x2, y2))
                        crop_mask.save(mask_path_on_disk)
                        mask_url = f"/uploads/observations/{obs_id_str}/masks/mask-{filename}.png"
                    
                    crop_url = f"/uploads/observations/{obs_id_str}/crops/crop-{filename}"
                    
                    lower = Path(path).name.lower()
                    if "gill" in lower or "lamina" in lower or "poro" in lower:
                        view = "gills_or_pores"
                    elif "base" in lower or "volva" in lower:
                        view = "base"
                    elif "stem" in lower or "pie" in lower:
                        view = "stem"
                    elif "cut" in lower or "corte" in lower or "section" in lower:
                        view = "cross_section"
                    elif "context" in lower or "entorno" in lower or "habitat" in lower:
                        view = "environment"
                    elif "cap" in lower or "top" in lower or "sombrero" in lower:
                        view = "cap_top"
                    else:
                        view = "unknown"
                        
                    detections.append(
                        DetectedMushroomCrop(
                            source_path=path,
                            crop_path=crop_url,
                            mask_path=mask_url,
                            bounding_box=best_box,
                            score=best_score,
                            estimated_view_type=view,
                        )
                    )
                else:
                    detections.append(
                        DetectedMushroomCrop(
                            source_path=path,
                            crop_path=path,
                            mask_path=None,
                            bounding_box=BoundingBox(x1=0, y1=0, x2=1, y2=1),
                            score=0.0,
                            estimated_view_type="unknown",
                        )
                    )
            return detections
        except Exception as e:
            logger.warning(f"Error executing real detect_and_crop, falling back to mock: {e}")
            return self.fallback.detect_and_crop(image_paths)
