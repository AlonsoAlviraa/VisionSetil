"""Operator PRODUCT_UNLOCK serve flag — fail-closed default; never forage."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.product_unlock import apply_operator_serve_unlock, stamp_product_unlock_false


def _eligible_package() -> dict:
    return {
        "product_unlock": False,
        "can_auto_unlock": False,
        "unlock_eligible_advisory": True,
        "eligible_but_locked": True,
        "forage_permission": False,
        "consumption_permission": False,
        "policy": "orientation_only_never_consume",
        "residual_lock_reasons": [
            "policy_orientation_only_never_consume",
            "no_auto_unlock_from_metrics_alone",
            "all_checks_pass_but_product_unlock_forced_false_until_operator_cycle",
            "human_operator_must_explicitly_approve_unlock",
        ],
        "operator_action": "eligible_but_locked",
    }


def test_apply_serve_flag_default_locked():
    out = apply_operator_serve_unlock(_eligible_package(), serve_flag=False)
    assert out["product_unlock"] is False
    assert out["can_auto_unlock"] is False
    assert out["forage_permission"] is False
    assert out["consumption_permission"] is False
    assert out["eligible_but_locked"] is True
    assert out["soft_gates_advisory_only"] is True
    assert out["metrics_authorize_forage"] is False
    residual = out["residual_lock_reasons"]
    assert "policy_orientation_only_never_consume" in residual
    assert "metrics_never_authorize_forage_or_consumption" in residual
    assert "soft_map_deadly_gates_advisory_only" in residual


def test_apply_serve_flag_true_when_eligible():
    out = apply_operator_serve_unlock(_eligible_package(), serve_flag=True, require_eligible=True)
    assert out["product_unlock"] is True
    assert out["can_auto_unlock"] is False
    assert out["forage_permission"] is False
    assert out["consumption_permission"] is False
    assert out["eligible_but_locked"] is False
    assert out["soft_gates_advisory_only"] is True
    assert out["metrics_authorize_forage"] is False
    assert "operator_serve_flag_active" in out["residual_lock_reasons"]
    assert "policy_orientation_only_never_consume" in out["residual_lock_reasons"]
    assert "metrics_never_authorize_forage_or_consumption" in out["residual_lock_reasons"]


def test_apply_serve_flag_never_sets_forage_true():
    """Hostile package with forage true still forced false after serve unlock."""
    hostile = _eligible_package()
    hostile["forage_permission"] = True
    hostile["consumption_permission"] = True
    hostile["can_auto_unlock"] = True
    out = apply_operator_serve_unlock(hostile, serve_flag=True, require_eligible=True)
    assert out["product_unlock"] is True
    assert out["forage_permission"] is False
    assert out["consumption_permission"] is False
    assert out["can_auto_unlock"] is False


def test_apply_serve_flag_ignored_when_not_eligible():
    pkg = _eligible_package()
    pkg["unlock_eligible_advisory"] = False
    pkg["eligible_but_locked"] = False
    out = apply_operator_serve_unlock(pkg, serve_flag=True, require_eligible=True)
    assert out["product_unlock"] is False
    assert "serve_flag_set_but_not_eligible" in out["residual_lock_reasons"]
    assert out["forage_permission"] is False
    assert out["consumption_permission"] is False


def test_stamp_product_unlock_false_forces_forage():
    stamped = stamp_product_unlock_false(
        {
            "product_unlock": True,
            "forage_permission": True,
            "consumption_permission": True,
            "can_auto_unlock": True,
        }
    )
    assert stamped["product_unlock"] is False
    assert stamped["forage_permission"] is False
    assert stamped["consumption_permission"] is False
    assert stamped["can_auto_unlock"] is False
    assert stamped["soft_gates_advisory_only"] is True
    assert stamped["metrics_authorize_forage"] is False


def test_models_status_default_product_unlock_false(client: TestClient, monkeypatch):
    """Default serve flag off — even if developer .env has PRODUCT_UNLOCK=true."""
    from app.core import config as config_mod

    monkeypatch.setattr(config_mod.settings, "product_unlock", False)
    r = client.get("/models/status")
    assert r.status_code == 200
    data = r.json()
    summary = data["summary"]
    assert summary["product_unlock"] is False
    assert summary["forage_permission"] is False
    assert summary["consumption_permission"] is False
    assert summary["can_auto_unlock"] is False
    assert summary["soft_gates_advisory_only"] is True
    assert summary["metrics_authorize_forage"] is False
    unlock = data["product_unlock_eval"]
    assert unlock["product_unlock"] is False
    assert unlock["can_auto_unlock"] is False
    assert unlock["forage_permission"] is False
    assert unlock["consumption_permission"] is False
    assert unlock.get("soft_gates_advisory_only") is True


def test_models_status_product_unlock_true_via_settings(client: TestClient, monkeypatch):
    """Operator cycle: PRODUCT_UNLOCK=true + eligible → summary product_unlock true."""
    from app.core import config as config_mod

    monkeypatch.setattr(config_mod.settings, "product_unlock", True)
    monkeypatch.setattr(config_mod.settings, "product_unlock_require_eligible", True)

    r = client.get("/models/status")
    assert r.status_code == 200
    data = r.json()
    unlock = data["product_unlock_eval"]
    # Only true if local E20 package is advisory-eligible
    if unlock.get("unlock_eligible_advisory"):
        assert data["summary"]["product_unlock"] is True
        assert unlock["product_unlock"] is True
        assert unlock["eligible_but_locked"] is False
        assert data["operator_unlock_ops"]["product_unlock"] is True
    else:
        assert data["summary"]["product_unlock"] is False
        assert "serve_flag_set_but_not_eligible" in (unlock.get("residual_lock_reasons") or [])
    # Hard policy always — serve unlock never grants forage
    assert unlock["can_auto_unlock"] is False
    assert unlock["forage_permission"] is False
    assert unlock["consumption_permission"] is False
    assert data["summary"]["forage_permission"] is False
    assert data["summary"]["consumption_permission"] is False
    # E21 never launches from PRODUCT_UNLOCK
    e21 = data.get("e21_readiness") or {}
    assert e21.get("e21_launched") is False
    assert e21.get("kaggle_push") is False
    assert e21.get("product_unlock") is False
    assert data["summary"].get("e21_launched") is False
    # S9 never unlocks alone
    live = data.get("live_reject_monitor") or {}
    if live:
        assert live.get("product_unlock") is False
        assert live.get("forage_permission") is False
