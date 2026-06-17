from app.ml.interfaces import ImageEmbedding, ObservationRepresentation, TextEmbedding
from app.services.poisonous_lookalikes import elevate_risk_for_genus


class CandidateRanker:
    def rank(
        self,
        observation_representation: ObservationRepresentation,
        species_catalog: list[dict],
        species_text_embeddings: list[TextEmbedding],
        siglip_image_embeddings: list[ImageEmbedding],
        top_k: int = 5,
    ) -> list[dict]:
        ranked: list[dict] = []
        average_image_vector = observation_representation.text_component or [0.0] * 8
        metadata_factor = 1.0 - observation_representation.evidence_penalty
        for species, text_embedding in zip(species_catalog, species_text_embeddings, strict=False):
            visual_score = self._vector_similarity(average_image_vector, text_embedding.vector)
            metadata_score = self._metadata_score(species, observation_representation.metadata_vector.values)
            evidence_score = max(0.05, 1.0 - observation_representation.evidence_penalty)
            confidence = round(min(0.82, visual_score * 0.55 + metadata_score * 0.25 + evidence_score * 0.20), 4)
            risk_level, lookalikes = elevate_risk_for_genus(species["taxon"], species.get("lookalikes", []))
            ranked.append(
                {
                    "taxon": species["taxon"],
                    "rank": species["rank"],
                    "confidence": confidence,
                    "evidence_score": round(evidence_score, 4),
                    "metadata_score": round(metadata_score * metadata_factor, 4),
                    "visual_score": round(visual_score, 4),
                    "risk_level": species.get("risk_level", risk_level),
                    "edibility_label": species.get("edibility_label", "dangerous_or_unknown"),
                    "lookalikes": lookalikes,
                    "explanation": "Coincidencia visual orientativa, pero faltan rasgos diagnosticos." if observation_representation.evidence_penalty else "Coincidencia visual y contextual orientativa.",
                    "description": species.get("description", ""),
                }
            )
        ranked.sort(key=lambda item: (item["risk_level"] in {"deadly", "high"}, item["confidence"]), reverse=True)
        return ranked[:top_k]

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
