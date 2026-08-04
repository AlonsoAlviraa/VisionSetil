"""Operator product_unlock serve flag — fail-closed by default.

Metrics / gate_eval **never** set product_unlock=true by themselves.
A human operator may set env ``PRODUCT_UNLOCK=true`` (or Settings) after
reviewing the operator checklist. Even then:

- ``can_auto_unlock`` stays False
- ``forage_permission`` / ``consumption_permission`` stay False
- soft MAP/deadly gates remain advisory only (never forage go-ahead)
- policy remains ``orientation_only_never_consume``
- when ``PRODUCT_UNLOCK_REQUIRE_ELIGIBLE=true`` (default), advisory eligibility
  must pass or the serve flag is ignored (still locked)
- PRODUCT_UNLOCK never launches E21 / Kaggle
"""

from __future__ import annotations

from typing import Any

POLICY = "orientation_only_never_consume"

# Residual reasons that always remain (metrics ≠ forage; soft gates advisory)
_ALWAYS_RESIDUAL = (
    "policy_orientation_only_never_consume",
    "metrics_never_authorize_forage_or_consumption",
    "soft_map_deadly_gates_advisory_only",
)

# Residual reasons removed when operator serve unlock is active
_OPERATOR_LOCK_REASONS = frozenset(
    {
        "all_checks_pass_but_product_unlock_forced_false_until_operator_cycle",
        "human_operator_must_explicitly_approve_unlock",
        "no_auto_unlock_from_metrics_alone",
    }
)


def serve_product_unlock_requested() -> bool:
    """True when Settings / env asks for product unlock (not metrics)."""
    try:
        from app.core.config import settings

        return bool(getattr(settings, "product_unlock", False))
    except Exception:  # noqa: BLE001
        return False


def require_eligible_for_serve_unlock() -> bool:
    try:
        from app.core.config import settings

        return bool(getattr(settings, "product_unlock_require_eligible", True))
    except Exception:  # noqa: BLE001
        return True


def _ensure_policy_residuals(residual: list[str]) -> list[str]:
    out = list(residual)
    for r in _ALWAYS_RESIDUAL:
        if r not in out:
            out.append(r)
    return out


def apply_operator_serve_unlock(
    unlock_eval: dict[str, Any] | None,
    *,
    serve_flag: bool | None = None,
    require_eligible: bool | None = None,
) -> dict[str, Any]:
    """Merge metrics advisory package with optional human serve flag.

    Parameters
    ----------
    unlock_eval:
        Package from ``evaluate_e20_local_artifacts`` / gate_eval (or empty dict).
    serve_flag:
        Explicit override; default reads Settings.product_unlock.
    require_eligible:
        If True (default Settings), serve_flag only applies when
        ``unlock_eligible_advisory`` is True.

    Absolute invariants (even when product_unlock serve becomes True):
    - can_auto_unlock is always False
    - forage_permission / consumption_permission are always False
    - soft MAP/deadly gates never authorize forage
    - never sets e21_launched / kaggle_push
    """
    out: dict[str, Any] = dict(unlock_eval or {})
    # Hostile inputs cannot smuggle forage/consume or auto-unlock
    out["product_unlock"] = False
    out["can_auto_unlock"] = False
    out["forage_permission"] = False
    out["consumption_permission"] = False
    out["policy"] = POLICY
    out["soft_gates_advisory_only"] = True
    out["metrics_authorize_forage"] = False
    residual = _ensure_policy_residuals(list(out.get("residual_lock_reasons") or []))

    flag = serve_product_unlock_requested() if serve_flag is None else bool(serve_flag)
    need_elig = (
        require_eligible_for_serve_unlock()
        if require_eligible is None
        else bool(require_eligible)
    )
    eligible = bool(out.get("unlock_eligible_advisory"))

    out["serve_flag_requested"] = flag
    out["serve_flag_require_eligible"] = need_elig
    out["serve_flag_source"] = "settings.PRODUCT_UNLOCK" if flag else None

    if flag and (eligible or not need_elig):
        out["product_unlock"] = True
        out["eligible_but_locked"] = False
        residual = [r for r in residual if r not in _OPERATOR_LOCK_REASONS]
        residual = _ensure_policy_residuals(residual)
        if "operator_serve_flag_active" not in residual:
            residual.append("operator_serve_flag_active")
        out["operator_action"] = (
            "product_unlock=true via PRODUCT_UNLOCK env/Settings after operator cycle; "
            "still orientation_only — never forage/consumption; soft gates remain advisory"
        )
        out["note"] = (
            "Human operator serve flag active. Metrics did not auto-unlock. "
            "unlock_eligible_advisory is not forage permission. "
            "forage_permission and consumption_permission remain false. "
            "Soft MAP/deadly gates are advisory only and never authorize forage."
        )
    elif flag and need_elig and not eligible:
        out["product_unlock"] = False
        out["eligible_but_locked"] = bool(out.get("eligible_but_locked"))
        if "serve_flag_set_but_not_eligible" not in residual:
            residual.append("serve_flag_set_but_not_eligible")
        out["operator_action"] = (
            "PRODUCT_UNLOCK=true but unlock_eligible_advisory=false — still locked; "
            "fix failing checklist checks then re-run gate_eval"
        )
    else:
        # Default fail-closed: keep eligible_but_locked from metrics package
        if out.get("unlock_eligible_advisory") and not out.get("product_unlock"):
            out["eligible_but_locked"] = True
            for r in (
                "no_auto_unlock_from_metrics_alone",
                "all_checks_pass_but_product_unlock_forced_false_until_operator_cycle",
                "human_operator_must_explicitly_approve_unlock",
            ):
                if r not in residual:
                    residual.append(r)

    # Absolute: never auto, never forage/consume (re-assert after all branches)
    out["can_auto_unlock"] = False
    out["forage_permission"] = False
    out["consumption_permission"] = False
    out["soft_gates_advisory_only"] = True
    out["metrics_authorize_forage"] = False
    out["residual_lock_reasons"] = residual
    return out


def stamp_product_unlock_false(meta: dict[str, Any] | None) -> dict[str, Any]:
    """Force orientation stamps on auxiliary payloads (open-set, e21, live)."""
    out = dict(meta or {})
    out["product_unlock"] = False
    out["can_auto_unlock"] = False
    out["forage_permission"] = False
    out["consumption_permission"] = False
    out["soft_gates_advisory_only"] = True
    out["metrics_authorize_forage"] = False
    out["policy"] = POLICY
    return out
