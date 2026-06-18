from math import log1p

from app.ml.interfaces import ImageEmbedding, ObservationRepresentation, TextEmbedding
from app.services.poisonous_lookalikes import elevate_risk_for_genus


class CandidateRankerV2:
    version = "candidate_ranker_v2"
    similarity_metric = "cosine"
    improvement_version = "taxonomic_prototype_ensemble_v1"

    def rank(
        self,
        observation_representation: ObservationRepresentation,
        species_catalog: list[dict],
        species_text_embeddings: list[TextEmbedding] | None = None,
        siglip_image_embeddings: list[ImageEmbedding] | None = None,
        top_k: int = 5,
    ) -> list[dict]:
        ranked: list[dict] = []
        metadata_factor = 1.0 - observation_representation.evidence_penalty

        for idx, species in enumerate(species_catalog):
            text_embedding = species_text_embeddings[idx] if (species_text_embeddings and idx < len(species_text_embeddings)) else None
            species_scores = self._score_prototype_level(
                observation_representation=observation_representation,
                dino_ref=species.get("dino_reference_embedding") or species.get("dino_prototype") or [],
                siglip_ref=species.get("siglip_reference_embedding") or species.get("siglip_prototype") or [],
                siglip_text_ref=species.get("siglip_text_embedding") or species.get("siglip_text_prototype") or [],
                fallback_text_embedding=text_embedding,
            )
            genus_scores = self._score_prototype_level(
                observation_representation=observation_representation,
                dino_ref=species.get("genus_dino_prototype") or [],
                siglip_ref=species.get("genus_siglip_prototype") or [],
                siglip_text_ref=species.get("genus_siglip_text_prototype") or [],
                fallback_text_embedding=None,
            )
            family_scores = self._score_prototype_level(
                observation_representation=observation_representation,
                dino_ref=species.get("family_dino_prototype") or [],
                siglip_ref=species.get("family_siglip_prototype") or [],
                siglip_text_ref=species.get("family_siglip_text_prototype") or [],
                fallback_text_embedding=None,
            )

            species_visual_score = self._combine_modalities(species_scores)
            genus_visual_score = self._combine_modalities(genus_scores)
            family_visual_score = self._combine_modalities(family_scores)
            taxonomic_score = round(
                self._weighted_mean(
                    [
                        (species_visual_score, 0.72),
                        (genus_visual_score, 0.20),
                        (family_visual_score, 0.08),
                    ]
                ),
                4,
            )
            prototype_quality = self._prototype_quality(species, species_scores)
            metadata_score = round(
                self._metadata_score(species, observation_representation.metadata_vector.values) * metadata_factor,
                4,
            )
            evidence_score = max(0.05, 1.0 - observation_representation.evidence_penalty)
            fusion_score = round(
                taxonomic_score * 0.72
                + metadata_score * 0.10
                + evidence_score * 0.10
                + prototype_quality * 0.08,
                4,
            )
            fusion_score = self._cap_score_without_real_visual_evidence(fusion_score, taxonomic_score, prototype_quality)
            confidence = round(min(0.95, max(0.0, fusion_score)), 4)

            risk_level, lookalikes = elevate_risk_for_genus(species["taxon"], species.get("lookalikes", []))
            risk_level = species.get("risk_level", risk_level)

            ranked.append(
                {
                    "taxon": species["taxon"],
                    "rank": species.get("rank", "species"),
                    "confidence": confidence,
                    "evidence_score": round(evidence_score, 4),
                    "metadata_score": metadata_score,
                    "visual_score": taxonomic_score,
                    "species_visual_score": species_visual_score,
                    "genus_visual_score": genus_visual_score,
                    "family_visual_score": family_visual_score,
                    "taxonomic_score": taxonomic_score,
                    "prototype_quality": prototype_quality,
                    "dino_visual_score": round(species_scores["dino_visual_score"], 4),
                    "siglip_image_text_score": round(species_scores["siglip_image_text_score"], 4),
                    "siglip_visual_score": round(species_scores["siglip_visual_score"], 4),
                    "risk_score": round(self._risk_score(risk_level), 4),
                    "fusion_score": fusion_score,
                    "risk_level": risk_level,
                    "edibility_label": species.get("edibility_label", "dangerous_or_unknown"),
                    "lookalikes": lookalikes,
                    "explanation": "Ranking v2 con ensemble especie-genero-familia, prototipos visuales/textuales y coseno L2.",
                    "description": species.get("description", ""),
                    "ranker_version": self.version,
                    "similarity_metric": self.similarity_metric,
                    "ml_improvement_version": self.improvement_version,
                }
            )

        ranked.sort(key=lambda item: item["confidence"], reverse=True)
        for position, item in enumerate(ranked):
            next_score = ranked[position + 1]["confidence"] if position + 1 < len(ranked) else 0.0
            item["ranker_margin_to_next"] = round(item["confidence"] - next_score, 4)
        return ranked[:top_k]

    def _score_prototype_level(
        self,
        observation_representation: ObservationRepresentation,
        dino_ref: list[float],
        siglip_ref: list[float],
        siglip_text_ref: list[float],
        fallback_text_embedding: TextEmbedding | None,
    ) -> dict:
        siglip_image_text_score = self._cosine_similarity(
            observation_representation.text_component,
            siglip_text_ref,
        )
        if siglip_image_text_score == 0.0 and fallback_text_embedding is not None:
            siglip_image_text_score = self._cosine_similarity(
                observation_representation.text_component,
                fallback_text_embedding.vector,
            )
        return {
            "dino_visual_score": self._cosine_similarity(observation_representation.visual_component, dino_ref),
            "siglip_visual_score": self._cosine_similarity(observation_representation.text_component, siglip_ref),
            "siglip_image_text_score": siglip_image_text_score,
        }

    def _combine_modalities(self, scores: dict) -> float:
        return round(
            self._weighted_mean(
                [
                    (scores["dino_visual_score"], 0.45),
                    (scores["siglip_visual_score"], 0.30),
                    (scores["siglip_image_text_score"], 0.25),
                ]
            ),
            4,
        )

    def _weighted_mean(self, weighted_scores: list[tuple[float, float]]) -> float:
        weighted_total = 0.0
        total_weight = 0.0
        for score, weight in weighted_scores:
            if score <= 0.0 or weight <= 0.0:
                continue
            weighted_total += score * weight
            total_weight += weight
        if total_weight <= 0.0:
            return 0.0
        return weighted_total / total_weight

    def _prototype_quality(self, species: dict, species_scores: dict) -> float:
        available_modalities = sum(
            1
            for key in ("dino_visual_score", "siglip_visual_score", "siglip_image_text_score")
            if species_scores.get(key, 0.0) > 0.0
        )
        if available_modalities == 0:
            return 0.0

        image_count = float(species.get("image_count") or species.get("reference_count") or 0.0)
        image_factor = min(1.0, log1p(max(image_count, 0.0)) / log1p(8.0)) if image_count > 0.0 else 0.25
        taxonomy_bonus = 0.0
        if int(species.get("genus_species_count") or 0) > 1:
            taxonomy_bonus += 0.10
        if int(species.get("family_species_count") or 0) > 2:
            taxonomy_bonus += 0.05

        modality_factor = available_modalities / 3.0
        return round(min(1.0, modality_factor * 0.62 + image_factor * 0.28 + taxonomy_bonus), 4)

    def _cap_score_without_real_visual_evidence(
        self,
        fusion_score: float,
        taxonomic_score: float,
        prototype_quality: float,
    ) -> float:
        if taxonomic_score <= 0.0 and prototype_quality <= 0.0:
            return min(fusion_score, 0.24)
        if prototype_quality < 0.35:
            return min(fusion_score, 0.45)
        return fusion_score

    def _cosine_similarity(self, left: list[float], right: list[float]) -> float:
        if not left or not right or len(left) != len(right):
            return 0.0
        left_norm = self._l2_normalize(left)
        right_norm = self._l2_normalize(right)
        if not left_norm or not right_norm:
            return 0.0
        dot = sum(a * b for a, b in zip(left_norm, right_norm))
        return max(0.0, min(1.0, round(dot, 4)))

    def _l2_normalize(self, vector: list[float]) -> list[float]:
        norm = sum(value * value for value in vector) ** 0.5
        if norm <= 0.0:
            return []
        return [value / norm for value in vector]

    def _metadata_score(self, species: dict, metadata_values: list[float]) -> float:
        habitats = species.get("habitats", [])
        substrates = species.get("substrates", [])
        score = 0.12
        if habitats and len(metadata_values) > 2:
            score += metadata_values[2] * 0.25
        if substrates and len(metadata_values) > 3:
            score += metadata_values[3] * 0.25
        if len(metadata_values) > 8 and metadata_values[8] > 0:
            score += 0.1
        return min(score, 0.9)

    def _risk_score(self, risk_level: str) -> float:
        return {
            "deadly": 1.0,
            "high": 0.8,
            "high_or_unknown": 0.6,
            "risky_lookalikes": 0.5,
            "unknown": 0.3,
            "low": 0.0,
        }.get(risk_level, 0.3)
