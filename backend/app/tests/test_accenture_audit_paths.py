"""Contract tests for accenture audit orchestrator report shape (shipped script)."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
SCRIPT = REPO / "scripts" / "run_accenture_audit.py"
REPORT_DIR = REPO / "eval" / "reports" / "accenture_audit"


def _load_audit_module():
    spec = importlib.util.spec_from_file_location("run_accenture_audit", SCRIPT)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_rel_repo_never_emits_absolute_temp_under_repo_files():
    mod = _load_audit_module()
    p = REPO / "eval" / "reports" / "accenture_audit" / "accenture_games.log"
    rel = mod.rel_repo(p)
    assert not rel.startswith("C:")
    assert "grok-goal-" not in rel
    assert rel.replace("\\", "/").startswith("eval/reports/accenture_audit/")


def test_area_result_skip_is_not_pass_true():
    mod = _load_audit_module()
    skipped = mod.area_result(
        "e2e_browser",
        passed=None,
        evidence="skipped",
        gating=False,
        status="SKIPPED",
    )
    assert skipped["pass"] is None
    assert skipped["status"] == "SKIPPED"
    assert skipped["gating"] is False


@pytest.mark.skipif(
    not (REPORT_DIR / "accenture_audit_report.json").is_file(),
    reason="report not generated yet — run scripts/run_accenture_audit.py",
)
def test_durable_report_has_relative_evidence_and_honest_e2e():
    data = json.loads((REPORT_DIR / "accenture_audit_report.json").read_text(encoding="utf-8"))
    assert data.get("product_unlock") is False
    assert data.get("overall_pass") is True or data.get("overall_pass") is False
    for row in data.get("matrix") or []:
        ev = str(row.get("evidence") or "")
        assert "grok-goal-" not in ev
        assert "AppData\\Local\\Temp" not in ev
        assert "AppData/Local/Temp" not in ev
        if row.get("area") == "e2e_browser":
            assert row.get("status") == "SKIPPED"
            assert row.get("pass") is None
            assert row.get("gating") is False
