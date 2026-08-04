# Operator unlock checklist (fail-closed)

- **Generated:** 2026-08-04T10:16:46.436012+00:00
- **Policy:** `orientation_only_never_consume`
- **product_unlock:** **False** (always false from package)
- **unlock_eligible_advisory:** True
- **eligible_but_locked:** True
- **operator_cycle_required:** True
- **can_auto_unlock:** False
- **forage_permission / consumption_permission:** false / false

## Residual lock reasons

- `policy_orientation_only_never_consume`
- `no_auto_unlock_from_metrics_alone`
- `all_checks_pass_but_product_unlock_forced_false_until_operator_cycle`
- `human_operator_must_explicitly_approve_unlock`

## Checklist

| Criterion | Status | Detail |
|---|---|---|
| `metrics_present` | **PASS** | Metrics blob present |
| `e20_experiment` | **PASS** | Must be E20 / source-holdout experiment identity |
| `dual_deadly_keys` | **PASS** | Both safety_recall_deadly_at_1 and _at_3 required |
| `n_deadly_nonzero` | **PASS** | Deadly eval set must be non-vacuous |
| `soft_map` | **PASS** | test_map_at_3 >= 0.25 |
| `soft_deadly_at_3` | **PASS** | safety_recall_deadly_at_3 >= 0.9 |
| `pro_tester_pass` | **PASS** | Professional tester overall PASS |
| `safe_dp_freeze` | **PASS** | Notebook/DataParallel freeze uses _unwrap(model).backbone |
| `orientation_only_policy` | **PASS** | product_unlock forced false; never forage/consumption permission |

## Operator action

eligible_but_locked: review checklist, S9 live reject, open-set thr; only then decide unlock (still orientation-only, never consumption)

## Live reject monitor (S9 snapshot)

- status: `ok`
- n_entries: `4`
- reject_rate: `0.25`
- reasons: `{'high_entropy': 1}`

## Operator runbook

- path: `docs/OPERATOR_UNLOCK_RUNBOOK.md`
- regenerate: `python -m kaggle.ml_qa.gate_eval`

## Note

Fail-closed: product_unlock stays false until a human operator cycle. Metrics eligibility is advisory only — never forage/consumption permission.

Orientation only — never consumption.
