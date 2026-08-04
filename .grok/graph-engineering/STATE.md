# VisionSetil Graph Engineering — STATE

**Mode:** Graph Engineering  
**Updated:** 2026-07-31  
**Goal:** Operator unlock path + orientation-only product

## Active graph version

`v1.67.0-operator-unlock-serve`

## HEAD

Tracks A/B/C @ **1d3ed44** + operator unlock serve flag (this cycle).

## Tasks

| Item | Status |
|------|--------|
| Tracks A/B/C lookalike + SPA + checklist | **SHIPPED** `1d3ed44` |
| Operator unlock cycle (PRODUCT_UNLOCK env) | **SHIPPED** code path |
| gate_eval checklist regenerate | **DONE** |
| Approval log | `docs/OPERATOR_UNLOCK_APPROVAL.md` |
| forage / consumption permission | **always false** |
| T5 encyclopedia virtualization | **DEFERRED** |

### product_unlock

| Surface | Value |
|---------|--------|
| Metrics / `gate_eval` package | **always false** |
| Serve (after operator env) | **`PRODUCT_UNLOCK=true`** when eligible |
| Default Settings | **false** (fail-closed) |
| forage / consumption | **always false** |
| Policy | orientation_only_never_consume |

To enable serve unlock locally/prod:

```bash
# after review of operator_unlock_checklist + APPROVAL log
export PRODUCT_UNLOCK=true
export PRODUCT_UNLOCK_REQUIRE_ELIGIBLE=true
```
