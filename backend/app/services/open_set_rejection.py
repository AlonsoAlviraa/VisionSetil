import math
from dataclasses import dataclass
from app.core.config import settings
from app.ml.interfaces import ObservationRepresentation
from app.services.poisonous_lookalikes import HIGH_RISK_GENERA
from app.services.species_catalog import list_poisonous_species


@dataclass
class OpenSetDecision:
    is_unknown_or_uncertain: bool
    reason: str
    top1_confidence: float
    top2_confidence: float
    margin: float
    entropy: float
    decision: str


class OpenSetRejectionService:
    def evaluate(
        self,
        candidates: list[dict],
        observation_representation: ObservationRepresentation,
        missing_evidence: list[str]
    ) -> OpenSetDecision:
        if not candidates:
            return OpenSetDecision(
                is_unknown_or_uncertain=True,
                reason="no_candidates",
                top1_confidence=0.0,
                top2_confidence=0.0,
                margin=0.0,
                entropy=0.0,
                decision="reject_to_unknown"
            )

        # 1. Gather confidences
        top1_conf = candidates[0].get("confidence", 0.0)
        top2_conf = candidates[1].get("confidence", 0.0) if len(candidates) > 1 else 0.0
        margin = round(top1_conf - top2_conf, 4)

        # Calculate Shannon entropy
        confidences = [c.get("confidence", 0.0) for c in candidates]
        total_conf = sum(confidences)
        if total_conf > 0:
            probs = [p / total_conf for p in confidences]
            entropy = round(-sum(p * math.log2(p) for p in probs if p > 0), 4)
        else:
            entropy = 0.0

        # 2. Check triggers
        is_unknown_or_uncertain = False
        reason = "none"
        decision = "accept"

        # Check critical evidence
        required_views = {"gills_or_pores", "base", "environment"}
        detected_views = set(observation_representation.detected_views)
        missing_critical = required_views.difference(detected_views)

        # Check high risk genus
        first_taxon = candidates[0].get("taxon", "")
        first_genus = first_taxon.split()[0].lower() if first_taxon else ""

        # Check deadly lookalikes
        has_deadly_lookalike = False
        if settings.open_set_reject_on_deadly_lookalikes:
            lookalikes = candidates[0].get("lookalikes", [])
            for lk in lookalikes:
                lk_genus = lk.split()[0].lower() if lk else ""
                if lk_genus in HIGH_RISK_GENERA:
                    has_deadly_lookalike = True
                    break

        if top1_conf < settings.open_set_min_confidence:
            is_unknown_or_uncertain = True
            reason = "low_top1_confidence"
            decision = "reject_to_genus_or_human_review"
        elif margin < settings.open_set_min_margin:
            is_unknown_or_uncertain = True
            reason = "low_margin"
            decision = "reject_to_genus_or_human_review"
        elif settings.open_set_reject_on_missing_critical_evidence and missing_critical:
            is_unknown_or_uncertain = True
            reason = "missing_critical_evidence"
            decision = "reject_to_unknown"
        elif first_genus in HIGH_RISK_GENERA:
            is_unknown_or_uncertain = True
            reason = "high_risk_genus"
            decision = "reject_to_genus_or_human_review"
        elif has_deadly_lookalike:
            is_unknown_or_uncertain = True
            reason = "deadly_lookalike_or_high_risk_genus"
            decision = "reject_to_genus_or_human_review"

        return OpenSetDecision(
            is_unknown_or_uncertain=is_unknown_or_uncertain,
            reason=reason,
            top1_confidence=top1_conf,
            top2_confidence=top2_conf,
            margin=margin,
            entropy=entropy,
            decision=decision
        )

    def degrade_candidates(self, candidates: list[dict], decision: OpenSetDecision) -> list[dict]:
        """
        Degrades the candidates based on open-set decision.
        """
        if not decision.is_unknown_or_uncertain or not candidates:
            return candidates

        degraded = []
        if decision.decision == "reject_to_unknown":
            # Completely degrade to unknown
            degraded.append({
                "taxon": "unknown_fungus",
                "rank": "unknown",
                "confidence": 0.0,
                "evidence_score": candidates[0].get("evidence_score", 0.0),
                "metadata_score": candidates[0].get("metadata_score", 0.0),
                "visual_score": candidates[0].get("visual_score", 0.0),
                "risk_level": "high",
                "edibility_label": "dangerous_or_unknown",
                "lookalikes": [],
                "explanation": "La observacion no contiene evidencias suficientes para una identificacion fiable.",
                "description": "Hongo no identificado debido a falta de vistas criticas."
            })
        else:
            # Degrade from species to genus
            top = candidates[0]
            taxon = top.get("taxon", "")
            genus = taxon.split()[0] if taxon else "Unknown"
            genus_name = f"{genus} sp."
            
            # Map genus to family
            genus_lower = genus.lower()
            family_map = {
                "amanita": "Amanitaceae",
                "galerina": "Hymenogastraceae",
                "cortinarius": "Cortinariaceae",
                "lepiota": "Agaricaceae",
                "gyromitra": "Discinaceae"
            }
            family_name = family_map.get(genus_lower, "Unknown Family")

            degraded.append({
                "taxon": genus_name,
                "rank": "genus",
                "confidence": round(top.get("confidence", 0.0) * 0.5, 4), # reduce confidence
                "evidence_score": top.get("evidence_score", 0.0),
                "metadata_score": top.get("metadata_score", 0.0),
                "visual_score": top.get("visual_score", 0.0),
                "risk_level": top.get("risk_level", "high"),
                "edibility_label": "dangerous_or_unknown",
                "lookalikes": top.get("lookalikes", []),
                "explanation": f"Identificacion degradada a genero '{genus_name}' debido a incertidumbre o riesgo.",
                "description": f"Pertenece al genero {genus} (Familia {family_name})."
            })
            
        return degraded
