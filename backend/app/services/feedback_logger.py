"""Classification feedback logging for human review and active learning.

Logs classification results and optional user feedback to a structured
JSONL file. This data feeds the human review queue and enables active
learning loops to improve the species index over time.

Log entries are written to data/feedback/classification_log.jsonl by default.
Each entry includes:
    - timestamp, request_id
    - image_hash, image_path
    - top predictions with scores
    - decision (accepted/rejected), rejection reason
    - user feedback (if provided: correct/incorrect, corrected_species)
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_DEFAULT_LOG_DIR = Path("data/feedback")
_DEFAULT_LOG_FILE = _DEFAULT_LOG_DIR / "classification_log.jsonl"


class FeedbackLogger:
    """Append-only JSONL logger for classification feedback data."""

    def __init__(self, log_path: Path | None = None) -> None:
        env_path = os.getenv("FEEDBACK_LOG_PATH")
        self.log_path = Path(env_path) if env_path else (log_path or _DEFAULT_LOG_FILE)
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        self._enabled = os.getenv("FEEDBACK_LOG_ENABLED", "true").lower() != "false"

    @property
    def enabled(self) -> bool:
        return self._enabled

    def log_classification(
        self,
        request_id: str,
        image_path: str | None,
        image_bytes: bytes | None,
        predictions: list[dict[str, Any]],
        decision: str,
        rejection_reason: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Log a classification event to the JSONL file."""
        if not self._enabled:
            return

        image_hash = ""
        if image_bytes:
            image_hash = hashlib.sha256(image_bytes).hexdigest()[:16]

        entry = {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "request_id": request_id,
            "image_hash": image_hash,
            "image_path": image_path or "",
            "top_predictions": predictions[:5],
            "decision": decision,
            "rejection_reason": rejection_reason,
            "metadata": metadata or {},
            "feedback": None,
        }

        try:
            with open(self.log_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        except Exception as e:
            logger.warning(f"Failed to log classification feedback: {e}")

    def log_feedback(
        self,
        request_id: str,
        feedback_type: str,
        correct_species: str | None = None,
        notes: str | None = None,
    ) -> bool:
        """Append user feedback to an existing log entry by request_id.

        Returns True if the entry was found and updated.
        """
        if not self._enabled or not self.log_path.exists():
            return False

        try:
            lines = self.log_path.read_text(encoding="utf-8").strip().split("\n")
            updated = False
            new_lines: list[str] = []

            for line in lines:
                if not line.strip():
                    continue
                entry = json.loads(line)
                if entry.get("request_id") == request_id:
                    entry["feedback"] = {
                        "type": feedback_type,
                        "correct_species": correct_species,
                        "notes": notes,
                        "feedback_timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
                    }
                    updated = True
                new_lines.append(json.dumps(entry, ensure_ascii=False))

            if updated:
                self.log_path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")

            return updated
        except Exception as e:
            logger.warning(f"Failed to update feedback: {e}")
            return False

    def get_pending_review(
        self, limit: int = 50, only_rejected: bool = True
    ) -> list[dict[str, Any]]:
        """Retrieve entries that need human review (no feedback yet)."""
        if not self.log_path.exists():
            return []

        results: list[dict[str, Any]] = []
        try:
            with open(self.log_path, encoding="utf-8") as f:
                for line in f:
                    if len(results) >= limit:
                        break
                    entry = json.loads(line.strip())
                    if entry.get("feedback") is not None:
                        continue
                    if only_rejected and entry.get("decision") != "rejected":
                        continue
                    results.append(entry)
        except Exception as e:
            logger.warning(f"Failed to read pending review: {e}")

        return results


# Singleton instance
feedback_logger = FeedbackLogger()
