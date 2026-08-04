# Operator Unlock Runbook (fail-closed)

**Audience:** human operators reviewing Identify product readiness.  
**Policy:** `orientation_only_never_consume` · **product_unlock always false** until an explicit human decision.  
**Never:** forage permission · consumption permission · edible green lights · auto-flip from metrics.

This runbook is machine-aligned with:

- `kaggle/ml_qa/gate_eval.py` → `evaluate_product_unlock_criteria`, `evaluate_e20_local_artifacts`, `build_operator_unlock_package`, `write_operator_unlock_package`
- S9 `kaggle/ml_qa/live_reject_monitor.py`
- Live ops surfaces: `GET /models/status` → `product_unlock_eval` + `live_reject_monitor` + `summary` + `operator_unlock_ops`

### Metrics SSOT for eligibility

Operator eligibility (status dashboard **and** regenerated package) uses the same path:

| Item | Value |
|------|--------|
| Metrics file | `kaggle/kernel_output_v20/models/metrics.json` |
| Eval helper | `evaluate_e20_local_artifacts(repo)` |
| Extra signals | `pro_tester_pass` + `safe_dp_freeze` from `professional_tester_latest.json` when present |

**Do not** use training “primary” discovery alone for unlock eligibility — a newer `kernel_output_v*` must not silently diverge from the operator package. Status exposes the evaluated path on `operator_unlock_ops.metrics_path_evaluated` / `metrics_ssot_path`.

---

## 1. Current product posture

| Flag | Meaning |
|------|---------|
| `product_unlock` | **false** (hard policy until operator cycle) |
| `unlock_eligible_advisory` | Metrics/checklist *recommendation only* — not a serve flip |
| `eligible_but_locked` | All metric checks green **and** still locked by policy |
| `can_auto_unlock` | **always false** |
| `forage_permission` / `consumption_permission` | **always false** |

Metrics never set `product_unlock=true`. The dashboard and gate helpers re-assert fail-closed.

---

## 2. Eligible-but-locked vs not eligible

### Eligible-but-locked (`unlock_eligible_advisory=true`, `eligible_but_locked=true`)

All checklist criteria pass (E20 identity, dual deadly, soft MAP/deadly, pro tester, safe_dp, orientation_only).  
Residual locks still include:

- `policy_orientation_only_never_consume`
- `no_auto_unlock_from_metrics_alone`
- `all_checks_pass_but_product_unlock_forced_false_until_operator_cycle`
- `human_operator_must_explicitly_approve_unlock`

**Operator action (typical):** review checklist, S9 live reject, open-set thr; only then decide unlock — still orientation-only, never consumption.

### Not eligible (`unlock_eligible_advisory=false`)

One or more checks fail (missing metrics, not E20, dual deadly missing, soft MAP/deadly fail, vacuous n_deadly, pro tester / safe_dp when supplied, etc.).

**Operator action:** `fix_failing_checks_then_re_run_operator_package`.

---

## 3. Regenerate the operator checklist

From the repo root:

```bash
python -m kaggle.ml_qa.gate_eval
```

Optional path argument (defaults to repo root of the module):

```bash
python -m kaggle.ml_qa.gate_eval .
```

### Artifacts written

| File | Role |
|------|------|
| `eval/reports/ml_experiments/operator_unlock_checklist.json` | Machine package |
| `eval/reports/ml_experiments/operator_unlock_checklist.md` | Human checklist |

Package fields always include: `product_unlock=false`, residual lock reasons, checklist rows, S9 live snapshot, `forage_permission=false`, `consumption_permission=false`.

---

## 4. Checklist criteria (aligned with gate_eval)

| # | Criterion id | Pass means |
|---|--------------|------------|
| 1 | `metrics_present` | E20 (or supplied) metrics blob exists |
| 2 | `e20_experiment` | Version/path identity matches E20 / source-holdout markers |
| 3 | `dual_deadly_keys` | Both `safety_recall_deadly_at_1` and `_at_3` present |
| 4 | `n_deadly_nonzero` | Deadly eval set non-vacuous |
| 5 | `soft_map` | `test_map_at_3 ≥ 0.25` (soft industrial bar) |
| 6 | `soft_deadly_at_3` | `safety_recall_deadly_at_3 ≥ 0.90` |
| 7 | `pro_tester_pass` | Professional tester overall PASS (when report present) |
| 8 | `safe_dp_freeze` | Notebook/DataParallel freeze uses `_unwrap(model).backbone` |
| 9 | `orientation_only_policy` | Always enforced: product_unlock forced false; never forage/consumption |

Honest industrial dual deadly at_1 / at_3 is required for advisory eligibility. Soft MAP@3 / deadly@3 are **advisory** gates only — they never auto-unlock Identify.

---

## 5. S9 live reject interpretation

Source: `data/feedback/classification_log.jsonl` (or `FEEDBACK_LOG_PATH`).  
Suite: professional tester **S9** + `/models/status.live_reject_monitor`.

| Log condition | `status` | Suite | Interpretation |
|---------------|----------|-------|----------------|
| Path missing | `no_log` | **SKIP** | No traffic yet — not a failure |
| File empty / zero parseable lines | `empty` | **SKIP** | Empty monitor — not a failure |
| Populated entries | `ok` | **PASS** | Ops health + `reject_rate` + reason histogram |
| I/O failure | `read_error` | **FAIL** | Fix log path / permissions |

Rules for operators:

- **SKIP (empty / no_log)** is expected early; do **not** treat as unlock blocker by itself, and do **not** treat as proof of production stability.
- **PASS with histogram** means the monitor works and shows reject reasons (e.g. `high_entropy`). Small `n_entries` (e.g. fixture n=1) is **not** enough live evidence alone.
- S9 **never unlocks** (`product_unlock=false` always on the live block).

Fixture for local ops/tests: `data/feedback/fixtures/s9_mixed_reject.jsonl`.

---

## 6. Explicit human operator decision gate

**Never auto-flip `product_unlock`.**

1. Regenerate checklist (`python -m kaggle.ml_qa.gate_eval`).
2. Confirm `unlock_eligible_advisory` and residual locks on JSON/MD + ML dashboard.
3. Review S9 live reject (prefer real Identify traffic, not only fixture).
4. Review open-set thr / holdout notes (`docs/OPEN_SET_CALIBRATION_NOTES.md`).
5. Confirm multi-view honesty (deadly multi-view caveats; pair critical_views coach).
6. **Only a human** may decide to change serve policy elsewhere (config/flag owners).  
   Metrics, scripts, and `/models/status` **must not** set `product_unlock=true`.

Residual reason codes that encode this gate:

- `all_checks_pass_but_product_unlock_forced_false_until_operator_cycle`
- `human_operator_must_explicitly_approve_unlock`
- `no_auto_unlock_from_metrics_alone`

---

## 7. What unlock does **NOT** mean

Even if an operator later flips a product serve flag in a controlled deploy:

| Never granted | Why |
|---------------|-----|
| Forage permission | Field collection is out of scope |
| Consumption permission | Food safety is never claimed by the model |
| Edible green lights | UI/copy stay orientation-only |
| Research-grade / iNat-style certainty | Provisional orientation only |
| Auto-approve of deadly lookalikes | Open-set + human review remain required |

Policy string: **orientation only — never consumption.**

---

## 8. Explicit serve unlock (PRODUCT_UNLOCK env)

After checklist eligibility (`unlock_eligible_advisory=true`), a human may enable the **serve flag**:

| Env | Default | Effect |
|-----|---------|--------|
| `PRODUCT_UNLOCK` | `false` | When `true` **and** eligible (if require flag on), `/models/status` `summary.product_unlock` → **true** |
| `PRODUCT_UNLOCK_REQUIRE_ELIGIBLE` | `true` | If true, env alone cannot unlock without advisory eligibility |

Implementation: `backend/app/core/product_unlock.py` → `apply_operator_serve_unlock`.  
Approval log: [`docs/OPERATOR_UNLOCK_APPROVAL.md`](./OPERATOR_UNLOCK_APPROVAL.md).

### Post-decision steps

1. Document who approved, when, and which checklist artifact was reviewed (**approval log**).
2. Set `PRODUCT_UNLOCK=true` in **deploy environment** (never commit live secrets).
3. Keep `forage_permission=false` and `consumption_permission=false` everywhere.
4. Keep Identify copy: orientation only; no edible green lights.
5. Watch S9 under real traffic (grow beyond fixture n=1).
6. Keep quality-gate dual signals and open-set thr honest on `/models/status`.
7. Do **not** treat unlock as GTM form readiness (see §9).

**Gate helpers (`gate_eval`) still return `product_unlock=false` from metrics alone.**  
**Serve flag is the only deliberate path to `product_unlock=true` on status.**

---

## 9. Residual GTM form (separate from unlock)

Product unlock ≠ beta cohort / form invite.

- GTM plan: [`docs/GTM_30_DAY_TRY_PLAN.md`](./GTM_30_DAY_TRY_PLAN.md)
- Residual operator task: set a real form URL in `VITE_BETA_FEEDBACK_URL` before inviting the beta cohort
- Home/footer already use `betaFeedbackHref()` (env form or mailto fallback)

**Do not** block or enable unlock based on the feedback form URL. They are independent residual items.

---

## 10. Dashboard / status map for operators

| Surface | Where |
|---------|--------|
| `summary.product_unlock` | Always `false` |
| `summary.unlock_eligible_advisory` | Advisory eligibility |
| `product_unlock_eval` | Full checklist, residual_lock_reasons, operator_action |
| `live_reject_monitor` | S9 status / n_entries / reject_rate / reasons |
| `operator_unlock_ops` | Static paths + regenerate command |
| Frontend | `/ml` ML dashboard — Operator unlock panel |

Regenerate command (also shown on dashboard):

```text
python -m kaggle.ml_qa.gate_eval
```

---

## Related docs

- `docs/OPEN_SET_CALIBRATION_NOTES.md` — S8 thr + S9 + operator package pointers
- `docs/SAFETY_POLICY.md` — orientation-only product policy
- `docs/GTM_30_DAY_TRY_PLAN.md` — try-first beta (form URL residual)
- `docs/ML_WEIGHTS_RUNBOOK.md` — weights / quality-gate ops
- `.grok/graph-engineering/STATE.md` — live graph posture (product_unlock false)

---

*Last aligned with gate_eval residual lock + S9 SKIP/PASS semantics. Orientation only — never consumption.*
