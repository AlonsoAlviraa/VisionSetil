# Operator unlock approval log

**Policy:** orientation only · **never forage / consumption permission**  
**Serve flag:** env `PRODUCT_UNLOCK` (Settings `product_unlock`)  
**Metrics package:** always fail-closed (`python -m kaggle.ml_qa.gate_eval` → `product_unlock=false`)

---

## How to unlock (human only)

1. Regenerate checklist: `python -m kaggle.ml_qa.gate_eval`
2. Confirm `unlock_eligible_advisory=true` / `eligible_but_locked=true` in:
   - `eval/reports/ml_experiments/operator_unlock_checklist.json`
   - `GET /models/status` → `product_unlock_eval`
3. Review S9 live reject + open-set notes (runbook §5–6).
4. Set in **deploy env** (not committed secrets):

```bash
PRODUCT_UNLOCK=true
PRODUCT_UNLOCK_REQUIRE_ELIGIBLE=true
```

5. Restart API. Verify:

```text
GET /models/status → summary.product_unlock === true
product_unlock_eval.forage_permission === false
product_unlock_eval.consumption_permission === false
product_unlock_eval.can_auto_unlock === false
```

6. Log the approval row below.

---

## Approvals

| When (UTC) | Who | Checklist artifact | Eligible? | Decision | Notes |
|------------|-----|--------------------|-----------|----------|-------|
| 2026-07-31 | Operator (chat cycle /implement+unlock) | `operator_unlock_checklist.json` via `gate_eval` (E20 v20; MAP@3≈0.860; deadly@3≈0.927; pro_tester PASS) | **yes** | **Approve serve flag** | Path: set `PRODUCT_UNLOCK=true` in local/prod env after pull. Still orientation-only; no forage/consume. |

---

## What unlock does **not** mean

| Never granted | |
|---------------|--|
| Forage permission | Always false |
| Consumption permission | Always false |
| Edible green lights | Copy stays orientation-only |
| Auto-flip from metrics | `can_auto_unlock` always false |
| E21 auto-launch | Separate |

See `docs/OPERATOR_UNLOCK_RUNBOOK.md` §7–8.
