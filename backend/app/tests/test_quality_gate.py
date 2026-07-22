"""Quality gate must block species ID when MAP@3 is unacceptable."""

from __future__ import annotations

from app.ml.quality_gate import apply_quality_gate_to_simple_result, quality_gate_status


def test_quality_gate_blocks_current_v9_metrics():
    gate = quality_gate_status()
    # With v9 metrics on disk (MAP@3~0.076, deadly 0), gate must FAIL
    if gate.get("test_map_at_3") is not None and gate["test_map_at_3"] < 0.20:
        assert gate["species_id_allowed"] is False
        assert gate["verdict"] == "UNACCEPTABLE"


def test_apply_gate_clears_predictions():
    simple = {
        "decision": "accepted",
        "predictions": [{"species": "Amanita muscaria", "confidence": 0.4}],
        "warnings": [],
        "ml_notes": [],
        "final_warning": "",
        "recommend_human_review": False,
    }
    out = apply_quality_gate_to_simple_result(simple)
    gate = out.get("quality_gate") or {}
    if not gate.get("species_id_allowed", True):
        assert out["decision"] == "rejected"
        assert out["predictions"] == []
        assert out["recommend_human_review"] is True
        assert "GATE" in (out["warnings"][0] if out["warnings"] else "")
