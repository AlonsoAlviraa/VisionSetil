from dataclasses import dataclass

from app.db.models import ObservationImage


@dataclass
class QualityAssessment:
    sharpness_ok: bool
    lighting_ok: bool
    mushroom_large_enough: bool
    has_lower_view: bool
    has_base_view: bool
    has_environment_view: bool
    possible_multiple_species: bool
    obstruction_detected: bool
    heavy_compression_or_blur: bool
    quality_warnings: list[str]


class ImageQualityValidationService:
    def evaluate(self, images: list[ObservationImage]) -> QualityAssessment:
        names = " ".join(image.original_name.lower() for image in images)
        sizes = [image.size_bytes for image in images]
        has_lower_view = any(image.view_type == "gills_or_pores" for image in images)
        has_base_view = any(image.view_type == "base" for image in images)
        has_environment_view = any(
            token in names for token in ("context", "environment", "habitat", "entorno", "substrate")
        )
        heavy_compression = bool(sizes) and min(sizes) < 12
        obstruction = any(token in names for token in ("hand", "mano", "finger", "dedo"))
        multiple_species = any(token in names for token in ("mixed", "grupo", "cluster", "multiple"))
        sharpness_ok = not any(token in names for token in ("blur", "blurry", "borrosa"))
        lighting_ok = not any(token in names for token in ("dark", "shadow", "night", "oscura"))
        mushroom_large_enough = len(images) >= 2 or any(size > 30 for size in sizes)

        warnings: list[str] = []
        if not sharpness_ok:
            warnings.append("La imagen puede estar borrosa y reducir la fiabilidad.")
        if not lighting_ok:
            warnings.append("La iluminacion parece insuficiente para ver rasgos diagnosticos.")
        if not mushroom_large_enough:
            warnings.append("La seta puede ocupar demasiado poco espacio en la imagen.")
        if not has_lower_view:
            warnings.append("Falta vista inferior con laminas o poros.")
        if not has_base_view:
            warnings.append("Falta vista de la base del pie.")
        if not has_environment_view:
            warnings.append("Falta foto de entorno o sustrato.")
        if multiple_species:
            warnings.append("Podria haber varias especies mezcladas en la misma observacion.")
        if obstruction:
            warnings.append("Hay posible obstruccion de rasgos por manos u objetos.")
        if heavy_compression:
            warnings.append("La compresion o resolucion puede ser demasiado agresiva.")

        return QualityAssessment(
            sharpness_ok=sharpness_ok,
            lighting_ok=lighting_ok,
            mushroom_large_enough=mushroom_large_enough,
            has_lower_view=has_lower_view,
            has_base_view=has_base_view,
            has_environment_view=has_environment_view,
            possible_multiple_species=multiple_species,
            obstruction_detected=obstruction,
            heavy_compression_or_blur=heavy_compression or not sharpness_ok,
            quality_warnings=warnings,
        )
