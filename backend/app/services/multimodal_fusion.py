from app.ml.interfaces import ImageEmbedding, MetadataVector, ObservationRepresentation


class MultimodalFusionService:
    VIEW_WEIGHTS = {
        "gills_or_pores": 1.4,
        "base": 1.35,
        "cross_section": 1.15,
        "stem": 1.05,
        "cap_top": 1.0,
        "environment": 0.9,
        "unknown": 0.7,
    }

    def fuse(
        self,
        dino_embeddings: list[ImageEmbedding],
        siglip_image_embeddings: list[ImageEmbedding],
        metadata_vector: MetadataVector,
        detected_views: list[str],
    ) -> ObservationRepresentation:
        weighted_visual = self._weighted_mean(dino_embeddings, detected_views)
        weighted_text = self._weighted_mean(siglip_image_embeddings, detected_views)
        evidence_penalty = self._evidence_penalty(detected_views)
        vector = weighted_visual + weighted_text + metadata_vector.values + [evidence_penalty]
        return ObservationRepresentation(
            vector=vector,
            detected_views=detected_views,
            evidence_penalty=evidence_penalty,
            metadata_vector=metadata_vector,
            visual_component=weighted_visual,
            text_component=weighted_text,
        )

    def _weighted_mean(self, embeddings: list[ImageEmbedding], views: list[str]) -> list[float]:
        if not embeddings:
            return [0.0] * 8
        totals = [0.0] * len(embeddings[0].vector)
        total_weight = 0.0
        for embedding, view in zip(embeddings, views, strict=False):
            weight = self.VIEW_WEIGHTS.get(view, 0.7)
            for index, value in enumerate(embedding.vector):
                totals[index] += value * weight
            total_weight += weight
        return [round(value / total_weight, 4) for value in totals]

    def _evidence_penalty(self, views: list[str]) -> float:
        required = {"gills_or_pores", "base", "environment"}
        missing = len(required.difference(set(views)))
        return round(min(missing * 0.18, 0.54), 4)
