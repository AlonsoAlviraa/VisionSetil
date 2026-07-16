from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from app.core.config import settings

engine = create_engine(
    f"sqlite:///{settings.database_path}",
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


def _run_lightweight_migrations() -> None:
    """Add missing columns to existing SQLite tables (no Alembic needed).

    This is intentionally simple: it checks each known table/column pair and
    runs ``ALTER TABLE ... ADD COLUMN`` if the column is absent.  This handles
    the common case of pulling new code without deleting the dev database.

    For production, use Alembic migrations.
    """
    # Column definitions: (table, column_name, column_ddl)
    migrations: list[tuple[str, str, str]] = [
        # Multi-tenant organization scoping (Sprint N+4)
        ("observations", "organization_id", "VARCHAR(80) DEFAULT 'default'"),
        ("human_review_requests", "organization_id", "VARCHAR(80) DEFAULT 'default'"),
        ("classification_jobs", "organization_id", "VARCHAR(80) DEFAULT 'default'"),
        # Human review enhancements (Sprint N+3)
        ("human_review_requests", "priority", "VARCHAR(40) DEFAULT 'low'"),
        ("human_review_requests", "assigned_to", "VARCHAR(120)"),
        ("human_review_requests", "reviewer_notes", "TEXT"),
        ("human_review_requests", "reviewer_taxon", "VARCHAR(160)"),
        ("human_review_requests", "reviewer_confidence", "FLOAT"),
    ]

    try:
        insp = inspect(engine)
        with engine.begin() as conn:
            for table, column, ddl in migrations:
                if not insp.has_table(table):
                    continue
                existing_columns = {col["name"] for col in insp.get_columns(table)}
                if column not in existing_columns:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
    except Exception:
        # Migrations are best-effort during development; don't crash startup
        pass


def init_db() -> None:
    """Create tables (if missing) and run lightweight column migrations."""
    # Import models so they register with Base.metadata
    import app.db.models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _run_lightweight_migrations()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()