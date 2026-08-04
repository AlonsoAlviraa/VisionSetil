"""E21 readiness — never launch from product_unlock; never auto Kaggle push."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.e21_readiness import evaluate_e21_readiness  # noqa: E402


def test_e21_readiness_fail_closed_defaults():
    out = evaluate_e21_readiness(operator_approved=False)
    assert out["product_unlock"] is False
    assert out["can_auto_unlock"] is False
    assert out["forage_permission"] is False
    assert out["consumption_permission"] is False
    assert out["e21_launched"] is False
    assert out["kaggle_push"] is False
    assert out["soft_gates_advisory_only"] is True
    assert out["serve_product_unlock_does_not_launch_e21"] is True
    assert isinstance(out.get("operator_prerequisites"), list)
    assert len(out["operator_prerequisites"]) >= 3
    assert out["operator_schedule_approved"] is False


def test_e21_operator_approved_does_not_launch(monkeypatch):
    """E21_OPERATOR_APPROVED marks schedule approval only — never e21_launched."""
    monkeypatch.setenv("E21_OPERATOR_APPROVED", "true")
    out = evaluate_e21_readiness()
    assert out["operator_schedule_approved"] is True
    assert out["e21_launched"] is False
    assert out["kaggle_push"] is False
    assert out["product_unlock"] is False
    assert out["forage_permission"] is False
    if out.get("ready_for_e21_schedule"):
        assert out["schedule_authorized"] is True
        assert out["status"] == "operator_approved_for_schedule"
    else:
        # Baseline blocked → still not launched even with operator env
        assert out["schedule_authorized"] is False
        assert out["e21_launched"] is False


def test_e21_never_launched_when_operator_approved_explicit():
    out = evaluate_e21_readiness(operator_approved=True)
    assert out["e21_launched"] is False
    assert out["kaggle_push"] is False
    assert out["product_unlock"] is False
    assert out["consumption_permission"] is False


def test_e21_write_report_keeps_fail_closed(tmp_path):
    from scripts.e21_readiness import write_report

    payload = evaluate_e21_readiness(operator_approved=True)
    path = write_report(payload, path=tmp_path / "e21_readiness.json")
    blob = json.loads(path.read_text(encoding="utf-8"))
    assert blob["e21_launched"] is False
    assert blob["kaggle_push"] is False
    assert blob["product_unlock"] is False
    assert blob["forage_permission"] is False
