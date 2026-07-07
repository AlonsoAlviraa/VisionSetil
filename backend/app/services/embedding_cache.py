import json
import sqlite3
from pathlib import Path

from app.core.config import settings


class EmbeddingCache:
    def __init__(self, db_path: Path | None = None):
        if db_path is None:
            db_path = settings.upload_dir / "embedding_cache.db"
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS cache (
                image_hash TEXT,
                model_name TEXT,
                vector TEXT,
                PRIMARY KEY (image_hash, model_name)
            )
        """
        )
        conn.commit()
        conn.close()

    def get(self, image_hash: str, model_name: str) -> list[float] | None:
        try:
            conn = sqlite3.connect(str(self.db_path))
            cursor = conn.cursor()
            cursor.execute(
                "SELECT vector FROM cache WHERE image_hash = ? AND model_name = ?",
                (image_hash, model_name),
            )
            row = cursor.fetchone()
            conn.close()
            if row:
                return json.loads(row[0])
        except Exception:
            pass
        return None

    def set(self, image_hash: str, model_name: str, vector: list[float]) -> None:
        try:
            conn = sqlite3.connect(str(self.db_path))
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR REPLACE INTO cache (image_hash, model_name, vector) VALUES (?, ?, ?)",
                (image_hash, model_name, json.dumps(vector)),
            )
            conn.commit()
            conn.close()
        except Exception:
            pass
