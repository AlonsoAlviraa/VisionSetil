# VisionSetil Graph Engineering — STATE

**Mode:** Graph Engineering  
**Updated:** 2026-08-04  
**Goal:** Product UX reliability · orientation only

## Active graph version

`v1.68.0-ency-window-t5`

## HEAD

T5 encyclopedia DOM window (loop-engineering design→implement).

## Tasks

| Item | Status |
|------|--------|
| Tracks A/B/C lookalike + SPA + checklist | **SHIPPED** `1d3ed44` |
| Operator unlock + metrics anti-forage + E21 operator push | **SHIPPED** |
| **T5 encyclopedia virtualization** | **SHIPPED** (zero-dep window 48, first paint 12) |
| Design | `docs/design/ENCYCLOPEDIA_VIRTUALIZATION_T5.md` |
| forage / consumption permission | **always false** |

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
