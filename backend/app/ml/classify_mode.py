"""Pure derivation of product honesty mode (Phase B / D-B1, D-B4).

``mode`` is product-facing honesty; ``is_mock_stack`` is stack truth (weights/
backends loaded). The two are independent: never overwrite ``is_mock_stack``
from ``mode``, and never infer stack truth from mode.
"""

from __future__ import annotations

from app.db.schemas import ClassifyMode


def derive_classify_mode(*, is_mock_stack: bool, species_id_allowed: bool) -> ClassifyMode:
    """Derive classify mode from gate policy × stack truth.

    Order: gate > mock > real (D-B4).

    - not species_id_allowed → blocked (regardless of stack)
    - species_id_allowed + is_mock_stack → mock
    - species_id_allowed + not is_mock_stack → real

    ``is_mock_stack`` is an input only; this function never mutates or infers it.
    """
    if not species_id_allowed:
        return ClassifyMode.blocked
    if is_mock_stack:
        return ClassifyMode.mock
    return ClassifyMode.real
