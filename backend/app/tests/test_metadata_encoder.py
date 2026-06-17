from app.ml.interfaces import MushroomObservationMetadata
from app.services.metadata_encoder import MetadataEncoder


def test_metadata_encoder_handles_null_fields():
    encoder = MetadataEncoder()
    vector = encoder.encode(MushroomObservationMetadata())
    assert len(vector.values) == len(vector.feature_names)
    assert all(value >= 0 for value in vector.values)
