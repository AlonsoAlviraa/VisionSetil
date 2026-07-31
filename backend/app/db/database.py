from collections.abc import Generator

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import Session, declarative_base, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings

# Align SQLAlchemy connect timeout (seconds) with SQLite busy_timeout (ms).
_SQLITE_BUSY_SECONDS = 30
_SQLITE_BUSY_MS = _SQLITE_BUSY_SECONDS * 1000

# StaticPool for file-SQLite: shares a single connection to avoid cross-connection
# locking surprises (audit fix). check_same_thread=False allows the async worker
# to use it. WAL mode handles concurrent readers.
engine = create_engine(
    f"sqlite:///{settings.database_path}",
    connect_args={"check_same_thread": False, "timeout": _SQLITE_BUSY_SECONDS},
    poolclass=StaticPool,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


@event.listens_for(engine, "connect")
def _sqlite_on_connect(dbapi_connection, connection_record) -> None:  # noqa: ARG001
    """Enable WAL + busy timeout for concurrent classify/upload writers."""
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute(f"PRAGMA busy_timeout={_SQLITE_BUSY_MS}")
        cursor.execute("PRAGMA synchronous=NORMAL")
    finally:
        cursor.close()


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
        # E-05 user roles
        ("users", "role", "VARCHAR(40) DEFAULT 'user'"),
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
    except Exception as exc:
        # Audit fix: log migration failures so they're not invisible.
        import logging

        logging.getLogger(__name__).warning("Lightweight migration failed: %s", exc)


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
