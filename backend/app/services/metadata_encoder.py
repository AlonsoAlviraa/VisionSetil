from datetime import date

from app.ml.interfaces import MetadataVector, MushroomObservationMetadata


class MetadataEncoder:
    def encode(self, metadata: MushroomObservationMetadata) -> MetadataVector:
        observed = metadata.observed_at or date(2000, 1, 1)
        month = observed.month / 12
        season = self._season_bucket(observed.month)
        habitat = self._hash_feature(metadata.habitat)
        substrate = self._hash_feature(metadata.substrate)
        country = self._hash_feature(metadata.country)
        region = self._hash_feature(metadata.region)
        smell = self._hash_feature(metadata.smell)
        color_change = self._hash_feature(metadata.color_change_on_cut)
        nearby_tree_count = min(len(metadata.nearby_trees), 5) / 5
        altitude = min((metadata.altitude_m or 0.0) / 3000, 1.0)
        has_geo = 1.0 if metadata.latitude is not None and metadata.longitude is not None else 0.0
        has_notes = 1.0 if metadata.user_notes else 0.0
        vector = [
            country,
            region,
            habitat,
            substrate,
            smell,
            color_change,
            month,
            season,
            nearby_tree_count,
            altitude,
            has_geo,
            has_notes,
        ]
        features = [
            "country_hash",
            "region_hash",
            "habitat_hash",
            "substrate_hash",
            "smell_hash",
            "color_change_hash",
            "month_norm",
            "season_bucket",
            "nearby_tree_count",
            "altitude_norm",
            "has_geo",
            "has_notes",
        ]
        return MetadataVector(values=vector, feature_names=features)

    def _hash_feature(self, value: str | None) -> float:
        if not value:
            return 0.0
        return round((sum(ord(char) for char in value.lower()) % 100) / 100, 4)

    def _season_bucket(self, month: int) -> float:
        if month in (12, 1, 2):
            return 0.25
        if month in (3, 4, 5):
            return 0.5
        if month in (6, 7, 8):
            return 0.75
        return 1.0
