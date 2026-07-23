"""Unit matrix for derive_classify_mode (B-02 / D-B1 / D-B4).

Stack × gate → mode. Assert is_mock_stack is an independent input and is
never inferred from mode.
"""

from __future__ import annotations

import pytest

from app.db.schemas import ClassifyMode
from app.ml.classify_mode import derive_classify_mode


# Normative matrix (Appendix A / B-02): is_mock_stack × species_id_allowed → mode
_MODE_MATRIX = [
    # (is_mock_stack, species_id_allowed, expected_mode)
    (False, False, ClassifyMode.blocked),  # real + blocked
    (True, False, ClassifyMode.blocked),  # mock + blocked
    (True, True, ClassifyMode.mock),  # mock + allowed
    (False, True, ClassifyMode.real),  # real + allowed
]


@pytest.mark.parametrize(
    "is_mock_stack,species_id_allowed,expected",
    _MODE_MATRIX,
    ids=[
        "real+blocked",
        "mock+blocked",
        "mock+allowed",
        "real+allowed",
    ],
)
def test_derive_classify_mode_matrix(
    is_mock_stack: bool,
    species_id_allowed: bool,
    expected: ClassifyMode,
) -> None:
    mode = derive_classify_mode(
        is_mock_stack=is_mock_stack,
        species_id_allowed=species_id_allowed,
    )
    assert mode == expected
    assert mode.value == expected.value
    # str, Enum serializes to product string
    assert str(mode.value) in ("real", "mock", "blocked")


def test_is_mock_stack_not_inferred_from_mode() -> None:
    """is_mock_stack is stack truth input; mode must not imply a single stack.

    real+blocked and mock+blocked both yield blocked — stack flag stays free.
    """
    mode_real_blocked = derive_classify_mode(
        is_mock_stack=False, species_id_allowed=False
    )
    mode_mock_blocked = derive_classify_mode(
        is_mock_stack=True, species_id_allowed=False
    )
    assert mode_real_blocked == ClassifyMode.blocked
    assert mode_mock_blocked == ClassifyMode.blocked
    # Same mode, opposite stack inputs → independence
    assert mode_real_blocked == mode_mock_blocked

    # Reconstructing "would is_mock_stack be True?" from mode alone is impossible
    # when mode is blocked: both stacks produce blocked.
    stack_for_blocked = {
        derive_classify_mode(is_mock_stack=s, species_id_allowed=False)
        for s in (True, False)
    }
    assert stack_for_blocked == {ClassifyMode.blocked}

    # When mode is mock, is_mock_stack was True; when real, False — but that is
    # because we *passed* stack as input, not because mode wrote it back.
    mock_mode = derive_classify_mode(is_mock_stack=True, species_id_allowed=True)
    real_mode = derive_classify_mode(is_mock_stack=False, species_id_allowed=True)
    assert mock_mode == ClassifyMode.mock
    assert real_mode == ClassifyMode.real
    # Explicit: function has no reverse map mode → is_mock_stack
    assert not hasattr(derive_classify_mode, "infer_is_mock_stack")


def test_derive_classify_mode_keyword_only() -> None:
    """API is keyword-only (prevents arg-order bugs)."""
    with pytest.raises(TypeError):
        derive_classify_mode(False, True)  # type: ignore[misc]
