from copy import deepcopy

from app.core.safety import FINAL_WARNING, ORIENTATION_ONLY_STATUS, PRIMARY_MESSAGE, UNSAFE_TO_CONSUME
from app.ml.interfaces import MushroomObservationMetadata
from app.services.poisonous_lookalikes import HIGH_RISK_GENERA


class SafetyLayer:
    def apply(
        self,
        candidates: list[dict],
        missing_evidence: list[str],
        metadata: MushroomObservationMetadata,
        quality_warnings: list[str],
    ) -> dict:
        safe_candidates = deepcopy(candidates)
        warnings = ["Identificacion orientativa.", "No consumir basandose en esta app.", "Consulta a un experto local."]
        if quality_warnings:
            warnings.extend(quality_warnings)
        if not metadata.habitat:
            missing_evidence.append("Informacion de habitat")
        if not metadata.substrate:
            missing_evidence.append("Informacion de sustrato")

        for candidate in safe_candidates:
            candidate["edibility_label"] = "dangerous_or_unknown"
            genus = candidate["taxon"].split()[0].lower()
            if genus in HIGH_RISK_GENERA:
                candidate["confidence"] = round(max(0.12, candidate["confidence"] - 0.08), 4)
                candidate["risk_level"] = "high"
                warnings.append("Algunos generos contienen especies mortales.")
            if missing_evidence:
                candidate["confidence"] = round(max(0.12, candidate["confidence"] - 0.04), 4)
                candidate["explanation"] = "La observacion requiere mas evidencias criticas y revision humana."

        safe_candidates.sort(
            key=lambda item: (item["risk_level"] in {"deadly", "high", "risky_lookalikes"}, item["confidence"]),
            reverse=True,
        )
        return {
            "status": ORIENTATION_ONLY_STATUS,
            "safety_level": UNSAFE_TO_CONSUME,
            "message": PRIMARY_MESSAGE,
            "warnings": list(dict.fromkeys(warnings)),
            "final_warning": FINAL_WARNING,
            "candidates": safe_candidates,
            "missing_evidence": list(dict.fromkeys(missing_evidence)),
        }
