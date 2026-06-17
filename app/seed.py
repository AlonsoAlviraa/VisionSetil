from app.config import DATA_DIR
from app.database import Base, engine
from app.services.catalog import load_species_seed, seed_species


def initialize_database(session) -> None:
    Base.metadata.create_all(bind=engine)
    records = load_species_seed(DATA_DIR / "dangerous_species.json")
    seed_species(session, records)
