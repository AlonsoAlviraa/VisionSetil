"""E21 operator push — dual/triple gate; never silent auto Kaggle push."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.e21_operator_push import (  # noqa: E402
    build_plan,
    evaluate_gates,
    main as operator_main,
    run_kaggle_push,
    run_operator_push,
)
from scripts.e21_readiness import evaluate_e21_readiness  # noqa: E402


def _ready_payload(**overrides):
    """Minimal readiness dict with green baseline."""
    base = {
        "ready_for_e21_schedule": True,
        "status": "ready_for_operator_schedule",
        "product_unlock": False,
        "e21_launched": False,
        "kaggle_push": False,
        "forage_permission": False,
        "consumption_permission": False,
        "can_auto_unlock": False,
    }
    base.update(overrides)
    return base


def test_dry_run_default_never_calls_kaggle(tmp_path, monkeypatch):
    """Default path is dry-run — no subprocess kaggle."""
    calls: list = []

    def fake_runner(cmd):
        calls.append(cmd)
        return {"returncode": 0, "cmd": cmd, "output_tail": ""}

    rc, result = run_operator_push(
        confirm_cli=False,
        execute=False,
        readiness=_ready_payload(),
        operator_approved=False,
        allow_kaggle_push=False,
        product_unlock_env=False,
        log_path=tmp_path / "actions.jsonl",
        kaggle_runner=fake_runner,
    )
    assert rc == 0
    assert result["dry_run"] is True
    assert result["kaggle_push_attempted"] is False
    assert result["auto_kaggle_push"] is False
    assert result["product_unlock"] is False
    assert result["forage_permission"] is False
    assert result["e21_launched"] is False
    assert calls == []


def test_missing_env_no_push(tmp_path):
    """Without E21_OPERATOR_APPROVED / E21_ALLOW_KAGGLE_PUSH → no push."""
    calls: list = []

    def fake_runner(cmd):
        calls.append(cmd)
        return {"returncode": 0, "cmd": cmd, "output_tail": "ok"}

    rc, result = run_operator_push(
        confirm_cli=True,
        execute=True,
        readiness=_ready_payload(),
        operator_approved=False,
        allow_kaggle_push=False,
        product_unlock_env=False,
        log_path=tmp_path / "actions.jsonl",
        kaggle_runner=fake_runner,
    )
    assert rc != 0
    assert result["kaggle_push_attempted"] is False
    assert result["status"] in ("blocked_gates", "blocked_kernel_gap")
    assert "E21_OPERATOR_APPROVED" in result["missing_for_real_push"]
    assert calls == []


def test_product_unlock_alone_does_not_allow_push(tmp_path, monkeypatch):
    """PRODUCT_UNLOCK=true alone never authorizes kaggle push."""
    monkeypatch.setenv("PRODUCT_UNLOCK", "true")
    calls: list = []

    def fake_runner(cmd):
        calls.append(cmd)
        return {"returncode": 0, "cmd": cmd, "output_tail": "ok"}

    rc, result = run_operator_push(
        confirm_cli=False,
        execute=True,
        readiness=_ready_payload(),
        operator_approved=False,
        allow_kaggle_push=False,
        product_unlock_env=True,
        log_path=tmp_path / "actions.jsonl",
        kaggle_runner=fake_runner,
    )
    assert rc != 0
    assert result["kaggle_push_attempted"] is False
    assert result["gates"]["product_unlock_env_set"] is True
    assert result["gates"]["product_unlock_does_not_authorize_push"] is True
    assert result["product_unlock"] is False
    assert result["product_unlock_does_not_push"] is True
    assert calls == []


def test_dual_gate_without_execute_stays_dry_run(tmp_path):
    """Operator env + CLI confirm without --execute → dry-run only."""
    calls: list = []

    def fake_runner(cmd):
        calls.append(cmd)
        return {"returncode": 0, "cmd": cmd, "output_tail": "ok"}

    rc, result = run_operator_push(
        confirm_cli=True,
        execute=False,
        readiness=_ready_payload(),
        operator_approved=True,
        allow_kaggle_push=True,
        product_unlock_env=False,
        log_path=tmp_path / "actions.jsonl",
        kaggle_runner=fake_runner,
    )
    assert rc == 0
    assert result["dry_run"] is True
    assert result["dual_gate_ok"] is True
    assert result["triple_gate_ok"] is True
    assert result["kaggle_push_attempted"] is False
    assert calls == []


def test_all_gates_with_mock_may_attempt_push(tmp_path, monkeypatch):
    """Dual + third gate + execute + readiness + notebook → mock push only."""
    # Point KERNEL_DIR discovery at a temp dir with a fake notebook
    fake_kernel = tmp_path / "push_e21"
    fake_kernel.mkdir()
    nb = fake_kernel / "visionsetil_exp_v21_scale_holdout.ipynb"
    nb.write_text(
        json.dumps({"cells": [], "metadata": {}, "nbformat": 4, "nbformat_minor": 5}),
        encoding="utf-8",
    )
    (fake_kernel / "kernel-metadata.json").write_text("{}", encoding="utf-8")

    import scripts.e21_operator_push as mod

    monkeypatch.setattr(mod, "KERNEL_DIR", fake_kernel)

    calls: list = []

    def fake_runner(cmd):
        calls.append(list(cmd))
        return {"returncode": 0, "cmd": cmd, "output_tail": "Kernel version pushed"}

    rc, result = run_operator_push(
        confirm_cli=True,
        execute=True,
        readiness=_ready_payload(),
        operator_approved=True,
        allow_kaggle_push=True,
        product_unlock_env=False,
        log_path=tmp_path / "actions.jsonl",
        kaggle_runner=fake_runner,
    )
    assert rc == 0
    assert result["kaggle_push_attempted"] is True
    assert result["status"] == "push_submitted"
    assert result["kaggle_push_submitted"] is True
    # Product surfaces remain fail-closed even after successful mock push
    assert result["product_unlock"] is False
    assert result["forage_permission"] is False
    assert result["consumption_permission"] is False
    assert result["e21_launched"] is False
    assert result["kaggle_push"] is False
    assert result["auto_kaggle_push"] is False
    assert len(calls) == 1
    assert calls[0][:3] == ["kaggle", "kernels", "push"]

    # Action log written
    log_lines = (tmp_path / "actions.jsonl").read_text(encoding="utf-8").strip().splitlines()
    assert len(log_lines) == 1
    row = json.loads(log_lines[0])
    assert row["dry_run"] is False
    assert row["kaggle_push_attempted"] is True
    assert row["product_unlock"] is False


def test_execute_with_kernel_gap_exits_nonzero(tmp_path, monkeypatch):
    """Real push path with no notebook → non-zero + clear status."""
    empty = tmp_path / "empty_push_e21"
    empty.mkdir()
    import scripts.e21_operator_push as mod

    monkeypatch.setattr(mod, "KERNEL_DIR", empty)

    calls: list = []

    def fake_runner(cmd):
        calls.append(cmd)
        return {"returncode": 0, "cmd": cmd, "output_tail": ""}

    rc, result = run_operator_push(
        confirm_cli=True,
        execute=True,
        readiness=_ready_payload(),
        operator_approved=True,
        allow_kaggle_push=True,
        log_path=tmp_path / "actions.jsonl",
        kaggle_runner=fake_runner,
    )
    assert rc == 2
    assert result["status"] == "blocked_kernel_gap"
    assert result["kaggle_push_attempted"] is False
    assert calls == []


def test_dry_run_documents_kernel_gap_exit_zero(tmp_path, monkeypatch):
    empty = tmp_path / "empty_push_e21"
    empty.mkdir()
    import scripts.e21_operator_push as mod

    monkeypatch.setattr(mod, "KERNEL_DIR", empty)

    rc, result = run_operator_push(
        confirm_cli=False,
        execute=False,
        readiness=_ready_payload(),
        operator_approved=False,
        allow_kaggle_push=False,
        log_path=tmp_path / "actions.jsonl",
        kaggle_runner=lambda cmd: (_ for _ in ()).throw(AssertionError("no kaggle")),
    )
    assert rc == 0
    assert result["dry_run"] is True
    assert result["kernel_gap"] is True
    plan = result["plan"]
    assert any("GAP" in n for n in plan.get("gap_notes") or [])


def test_cli_main_default_dry_run(tmp_path, monkeypatch, capsys):
    """CLI with no args is dry-run (exit 0), never spawns kaggle."""
    monkeypatch.setattr(
        "scripts.e21_operator_push.run_kaggle_push",
        MagicMock(side_effect=AssertionError("must not push")),
    )
    # avoid polluting repo action log during test
    monkeypatch.setattr(
        "scripts.e21_operator_push.ACTIONS_LOG",
        tmp_path / "actions.jsonl",
    )
    rc = operator_main([])
    assert rc == 0
    out = capsys.readouterr().out
    assert "dry_run" in out


def test_evaluate_gates_product_unlock_insufficient():
    g = evaluate_gates(
        confirm_cli=False,
        execute=True,
        readiness=_ready_payload(),
        operator_approved=False,
        allow_kaggle_push=False,
        product_unlock_env=True,
    )
    assert g["all_push_gates_ok"] is False
    assert g["dry_run"] is True
    assert g["gates"]["product_unlock_env_set"] is True
    assert g["auto_kaggle_push"] is False


def test_readiness_documents_operator_push_surface():
    out = evaluate_e21_readiness(operator_approved=False)
    assert out["auto_kaggle_push"] is False
    assert out["requires_operator_dual_gate"] is True
    assert out["product_unlock_does_not_push"] is True
    assert "e21_operator_push" in out["operator_push_cli"]
    assert "e21_operator_push" in out["operator_push_command"]
    assert out["e21_launched"] is False
    assert out["kaggle_push"] is False
    assert out["product_unlock"] is False
    assert out["forage_permission"] is False


def test_run_kaggle_push_uses_runner():
    seen = {}

    def runner(cmd):
        seen["cmd"] = cmd
        return {"returncode": 99, "cmd": cmd, "output_tail": "mock"}

    out = run_kaggle_push(Path("/tmp/fake"), runner=runner)
    assert out["returncode"] == 99
    assert seen["cmd"][0] == "kaggle"


def test_build_plan_includes_no_auto_note():
    g = evaluate_gates(
        confirm_cli=False,
        execute=False,
        readiness=_ready_payload(ready_for_e21_schedule=False),
        operator_approved=False,
        allow_kaggle_push=False,
    )
    plan = build_plan(g)
    assert plan["auto_kaggle_push"] is False
    assert "PRODUCT_UNLOCK" in plan["note"] or "auto" in plan["note"].lower()
