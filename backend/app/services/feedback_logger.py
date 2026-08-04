"""Classification feedback logging for human review and active learning.

Logs classification results and optional user feedback to a structured
JSONL file. This data feeds the human review queue, S9 live reject monitor,
and active learning loops.

Log entries are written to data/feedback/classification_log.jsonl by default.
Each entry includes:
    - timestamp (UTC ISO with offset), request_id
    - image_hash, image_path
    - top predictions with scores
    - decision (accepted/rejected), rejection reason / open_set_reason
    - S9 fields: mode, view_coverage, n_views, product_unlock=false
    - user feedback (if provided: correct/incorrect, corrected_species)

Policy: orientation only — never forage/consumption permission.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_DEFAULT_LOG_DIR = Path("data/feedback")
_DEFAULT_LOG_FILE = _DEFAULT_LOG_DIR / "classification_log.jsonl"

# Canonical diagnostic slots (S9 multiview honesty)
_CANONICAL_VIEWS = frozenset({"gills", "front", "habitat", "detail"})


def utc_iso_now() -> str:
    """UTC timestamp with offset for S9 window parsing."""
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def normalize_view_coverage(raw: Any) -> list[str]:
    """Normalize view labels for S9 (canonical only, order-preserving, de-duped)."""
    if raw is None:
        return []
    if isinstance(raw, str):
        parts = [p.strip().lower() for p in raw.replace(";", ",").split(",") if p.strip()]
    elif isinstance(raw, (list, tuple)):
        parts = [str(v).strip().lower() for v in raw if str(v).strip()]
    else:
        return []
    out: list[str] = []
    seen: set[str] = set()
    for p in parts:
        # Accept free_N as non-canonical educational labels too (still counted as views)
        if p in seen:
            continue
        seen.add(p)
        out.append(p)
    return out


def build_s9_log_entry(
    *,
    request_id: str,
    decision: str,
    predictions: list[dict[str, Any]] | None = None,
    rejection_reason: str | None = None,
    open_set_reason: str | None = None,
    metadata: dict[str, Any] | None = None,
    image_hash: str = "",
    image_path: str = "",
    timestamp: str | None = None,
) -> dict[str, Any]:
    """Build a single S9-friendly classification log row (pure; never unlocks)."""
    meta = dict(metadata or {})
    # Force orientation policy stamps (hostile metadata cannot smuggle forage/unlock)
    meta["product_unlock"] = False
    meta["forage_permission"] = False
    meta["consumption_permission"] = False
    meta["can_auto_unlock"] = False
    meta["policy"] = "orientation_only_never_consume"

    view_cov = normalize_view_coverage(
        meta.get("view_coverage") or meta.get("view_types")
    )
    if view_cov:
        meta["view_coverage"] = view_cov
        meta["n_views"] = len(view_cov)
    else:
        meta.setdefault("n_views", 0)

    mode = str(meta.get("mode") or meta.get("classify_mode") or "unknown").strip().lower()
    if mode not in ("real", "mock", "blocked"):
        # keep unknown but still surface
        mode = mode or "unknown"
    meta["mode"] = mode

    open_reason = open_set_reason or rejection_reason
    if open_reason and not meta.get("open_set_reason"):
        meta["open_set_reason"] = open_reason

    entry: dict[str, Any] = {
        "timestamp": timestamp or utc_iso_now(),
        "request_id": request_id,
        "image_hash": image_hash,
        "image_path": image_path or "",
        "top_predictions": (predictions or [])[:5],
        "decision": decision,
        "rejection_reason": rejection_reason,
        # Top-level mirrors for S9 live_reject_monitor (windows + multiview + modes)
        "open_set_reason": open_reason,
        "mode": mode,
        "view_coverage": view_cov,
        "view_types": view_cov,
        "n_views": len(view_cov),
        "product_unlock": False,
        "forage_permission": False,
        "consumption_permission": False,
        "can_auto_unlock": False,
        "policy": "orientation_only_never_consume",
        "metadata": meta,
        "feedback": None,
    }
    return entry


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
        open_set_reason: str | None = None,
    ) -> None:
        """Log a classification event to the JSONL file (S9-friendly shape)."""
        if not self._enabled:
            return

        image_hash = ""
        if image_bytes:
            image_hash = hashlib.sha256(image_bytes).hexdigest()[:16]

        entry = build_s9_log_entry(
            request_id=request_id,
            decision=decision,
            predictions=predictions,
            rejection_reason=rejection_reason,
            open_set_reason=open_set_reason or rejection_reason,
            metadata=metadata,
            image_hash=image_hash,
            image_path=image_path or "",
        )

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
                        "feedback_timestamp": utc_iso_now(),
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
