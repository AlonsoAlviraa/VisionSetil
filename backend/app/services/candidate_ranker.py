from app.ml.interfaces import ImageEmbedding, ObservationRepresentation, TextEmbedding
from app.services.poisonous_lookalikes import elevate_risk_for_genus


class CandidateRanker:
    def rank(
        self,
        observation_representation: ObservationRepresentation,
        species_catalog: list[dict],
        species_text_embeddings: list[TextEmbedding] = None,
        siglip_image_embeddings: list[ImageEmbedding] = None,
        top_k: int = 5,
    ) -> list[dict]:
        ranked: list[dict] = []
        metadata_factor = 1.0 - observation_representation.evidence_penalty
        
        for idx, species in enumerate(species_catalog):
            text_embedding = species_text_embeddings[idx] if (species_text_embeddings and idx < len(species_text_embeddings)) else None
            
            # Check if vectors are zero-filled (mock fallback)
            dino_ref = species.get("dino_reference_embedding", [])
            siglip_text_ref = species.get("siglip_text_embedding", [])
            
            if not dino_ref or all(x == 0.0 for x in dino_ref):
                # Fallback for mock/local tests
                dino_visual_score = 0.5
                average_image_vector = observation_representation.text_component or [0.0] * 8
                text_vector = text_embedding.vector if text_embedding else (siglip_text_ref if siglip_text_ref else [0.0] * 8)
                siglip_image_text_score = self._vector_similarity(average_image_vector, text_vector)
            else:
                dino_visual_score = self._cosine_similarity(
                    observation_representation.visual_component,
                    dino_ref
                )
                siglip_image_text_score = self._cosine_similarity(
                    observation_representation.text_component,
                    siglip_text_ref
                )
            
            visual_score = round(dino_visual_score * 0.5 + siglip_image_text_score * 0.5, 4)
            metadata_score = self._metadata_score(species, observation_representation.metadata_vector.values)
            evidence_score = max(0.05, 1.0 - observation_representation.evidence_penalty)
            
            fusion_score = round(visual_score * 0.55 + metadata_score * 0.25 + evidence_score * 0.20, 4)
            confidence = round(min(0.82, fusion_score), 4)
            
            RISK_LEVEL_TO_SCORE = {
                "deadly": 1.0,
                "high": 0.8,
                "high_or_unknown": 0.6,
                "risky_lookalikes": 0.5,
                "unknown": 0.3,
                "low": 0.0,
            }
            risk_level, lookalikes = elevate_risk_for_genus(species["taxon"], species.get("lookalikes", []))
            risk_score = RISK_LEVEL_TO_SCORE.get(species.get("risk_level", risk_level), 0.3)
            
            ranked.append(
                {
                    "taxon": species["taxon"],
                    "rank": species["rank"],
                    "confidence": confidence,
                    "evidence_score": round(evidence_score, 4),
                    "metadata_score": round(metadata_score * metadata_factor, 4),
                    "visual_score": round(visual_score, 4),
                    "dino_visual_score": round(dino_visual_score, 4),
                    "siglip_image_text_score": round(siglip_image_text_score, 4),
                    "risk_score": round(risk_score, 4),
                    "fusion_score": round(fusion_score, 4),
                    "risk_level": species.get("risk_level", risk_level),
                    "edibility_label": species.get("edibility_label", "dangerous_or_unknown"),
                    "lookalikes": lookalikes,
                    "explanation": "Coincidencia visual orientativa, pero faltan rasgos diagnosticos." if observation_representation.evidence_penalty else "Coincidencia visual y contextual orientativa.",
                    "description": species.get("description", ""),
                }
            )
        
        ranked.sort(key=lambda item: (item["risk_level"] in {"deadly", "high"}, item["confidence"]), reverse=True)
        return ranked[:top_k]

    def _cosine_similarity(self, left: list[float], right: list[float]) -> float:
        if not left or not right or len(left) != len(right):
            return 0.0
        # Dot product since vectors are already L2-normalized
        dot = sum(a * b for a, b in zip(left, right))
        return max(0.0, min(1.0, round(dot, 4)))

    def _vector_similarity(self, left: list[float], right: list[float]) -> float:
        if not left or not right:
            return 0.0
        total = sum(abs(a - b) for a, b in zip(left, right))
        return max(0.05, round(1.0 - total / len(left), 4))

    def _metadata_score(self, species: dict, metadata_values: list[float]) -> float:
        habitats = species.get("habitats", [])
        substrates = species.get("substrates", [])
        score = 0.12
        if habitats:
            score += metadata_values[2] * 0.25
        if substrates:
            score += metadata_values[3] * 0.25
        if metadata_values[8] > 0:
            score += 0.1
        return min(score, 0.9)
