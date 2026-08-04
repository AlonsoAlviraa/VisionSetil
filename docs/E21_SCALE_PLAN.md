# E21 — optional scale plan (orientation only)

**Status:** planning / readiness only — **not launched** (`e21_launched=false`, `kaggle_push=false`)  
**Guardrail:** `product_unlock` remains **false** until honest holdout dual deadly@3 + MAP soft gates are verified on the **new** run (same policy as E20).  
**Hard rule:** `PRODUCT_UNLOCK` / serve `product_unlock=true` **never** launches E21 or pushes Kaggle.

## Why E21 (optional)

E20 source-holdout (GBIF ES pure test) already passes soft gates:

| Metric | E20 honest | Soft gate |
|--------|------------|-----------|
| MAP@3 | ~0.860 | ≥ 0.25 |
| deadly@3 | ~0.927 | ≥ 0.90 |
| deadly@1 | ~0.788 | reported |
| n_deadly | 2580 | > 0 |

E21 is for **scale**, not for unlocking forage:

1. Expand beyond 40 allowlist classes when data quality allows  
2. Keep **source-holdout honesty** (train non-GBIF / FT packs; test pure GBIF ES)  
3. Preserve dual deadly keys (`safety_recall_deadly_at_1` / `_at_3`) with industrial deadly set  
4. Keep `_unwrap(model)` DataParallel freeze (never bare `.backbone` on DP)  
5. Re-run open-set calibration + S8/S9 after metrics land  

Soft MAP/deadly gates are **advisory orientation signals only** — they never authorize forage or consumption.

## Non-goals

- Auto `product_unlock=true` from any metric  
- Consumption / forage permission  
- Auto Kaggle push / silent E21 launch from `PRODUCT_UNLOCK` or metrics  
- Inflating MAP via mixed random splits (E19 lesson)  
- App Store launch as part of E21  

## Operator control (no free product flag)

| Surface | Meaning |
|---------|---------|
| `ready_for_e21_schedule` | Technical baseline green (E20 artifacts + soft gates) — **not** a launch |
| `E21_OPERATOR_APPROVED=true` | Marks `operator_schedule_approved` / schedule-authorization readiness only |
| `E21_ALLOW_KAGGLE_PUSH=true` | Third gate: schedule approval ≠ permission to push |
| `e21_launched` / `kaggle_push` | **Always false** on readiness / `/models/status` (fail-closed) |
| `auto_kaggle_push` | **Always false** |
| `PRODUCT_UNLOCK` | Serve Identify unlock only — **does not** set `e21_launched` or push Kaggle |
| `scripts/e21_operator_push.py` | Operator dual/triple-gate CLI (default dry-run) |

There is **no** automatic Kaggle push path from readiness scripts, metrics, `PRODUCT_UNLOCK`, or `/models/status`.

## Proposed protocol (when operator schedules GPU)

| Item | Proposal |
|------|----------|
| Kernel slug | `alonsoalviraaaa/visionsetil-exp-v21-scale-holdout` |
| Protocol | `source_holdout_e21` (inherit E20 split rules) |
| Allowlist | start 40; expand only with audited media + deadly labels |
| Freeze | `_unwrap(model).backbone` only |
| Dual deadly | industrial `deadly_set.json` ∩ label2idx |
| Serve | still prefer MAP peak unless deadly checkpoint ablate says otherwise |
| product_unlock | **forced false** until operator cycle on E21 holdout |

## Readiness command (no Kaggle push)

```bash
python scripts/e21_readiness.py
# optional write:
python scripts/e21_readiness.py --write

# Optional: mark schedule approval (still does NOT push Kaggle / set e21_launched)
# Windows PowerShell:
#   $env:E21_OPERATOR_APPROVED="true"; python scripts/e21_readiness.py
# bash:
#   E21_OPERATOR_APPROVED=true python scripts/e21_readiness.py
```

Report: `eval/reports/ml_experiments/e21_readiness.json`

Status block fields (fail-closed defaults):

- `product_unlock: false`
- `e21_launched: false`
- `kaggle_push: false`
- `auto_kaggle_push: false`
- `requires_operator_dual_gate: true`
- `product_unlock_does_not_push: true`
- `operator_push_cli: scripts/e21_operator_push.py`
- `forage_permission: false`
- `serve_product_unlock_does_not_launch_e21: true`
- `operator_prerequisites: [...]`

## Launch checklist (operator)

1. [ ] E20 artifacts local + soft gates PASS (`e21_readiness.py`)  
2. [ ] Dataset packs sized for new class count  
3. [ ] Notebook rebuilt from `build_exp_v20` lineage with safe DP freeze (place under `kaggle/push_e21/`)  
4. [ ] Optional: `E21_OPERATOR_APPROVED=true` for schedule-approval stamp only  
5. [ ] Push GPU kernel via **operator dual-gate CLI** (`scripts/e21_operator_push.py`) — never from PRODUCT_UNLOCK / metrics / readiness alone  
6. [ ] On COMPLETE: download → dual deadly honesty → open-set recalibrate → pro tester  
7. [ ] product_unlock stays false until operator runbook; forage/consumption stay false  

## Operator push (manual CLI)

**There is no auto Kaggle push without an operator.**  
`auto_kaggle_push: false` always. Readiness, soft gates, and `PRODUCT_UNLOCK` never call `kaggle kernels push`.

Staging dir: `kaggle/push_e21/` (metadata stub only until a real notebook is built — **do not invent fake training**).

### Dry-run (default — no network)

```bash
python scripts/e21_operator_push.py
# equivalent:
python scripts/e21_operator_push.py --dry-run
```

Prints the plan, gate matrix, and kernel GAP if `kaggle/push_e21/*.ipynb` is missing. Exit 0. Logs to `eval/reports/ml_experiments/e21_operator_actions.jsonl`.

### Real push (ALL gates required)

| Gate | Source |
|------|--------|
| 1. Schedule approval | `E21_OPERATOR_APPROVED=true` |
| 2. Push allow (third gate) | `E21_ALLOW_KAGGLE_PUSH=true` — schedule ≠ push |
| 3. CLI responsibility | `--i-accept-operator-responsibility` **or** `--confirm-push` |
| 4. Explicit execute | `--execute` (without this, always dry-run) |
| 5. Baseline green | `ready_for_e21_schedule` from `evaluate_e21_readiness` |
| 6. Real notebook | `kaggle/push_e21/*.ipynb` present |

```bash
# Windows PowerShell
$env:E21_OPERATOR_APPROVED="true"
$env:E21_ALLOW_KAGGLE_PUSH="true"
python scripts/e21_operator_push.py --i-accept-operator-responsibility --execute

# bash
E21_OPERATOR_APPROVED=true E21_ALLOW_KAGGLE_PUSH=true \
  python scripts/e21_operator_push.py --i-accept-operator-responsibility --execute
```

**Counter-examples (must NOT push):**

```bash
# PRODUCT_UNLOCK alone — blocked
$env:PRODUCT_UNLOCK="true"
python scripts/e21_operator_push.py --execute   # still dry-run / blocked_gates

# Schedule approval alone — blocked (no CLI responsibility, no allow-push, no --execute)
$env:E21_OPERATOR_APPROVED="true"
python scripts/e21_operator_push.py

# Readiness green alone — never network
python scripts/e21_readiness.py   # never calls kaggle
```

Action audit log: `eval/reports/ml_experiments/e21_operator_actions.jsonl`  
(fields: timestamp, dry_run, gates, who/env, kernel path). Never sets `product_unlock` / forage / consumption true.

### Related readiness fields

- `operator_push_cli` / `operator_push_command`
- `auto_kaggle_push: false`
- `requires_operator_dual_gate: true`
- `product_unlock_does_not_push: true`

## Residual product (parallel, no GPU)

- Grow S9 under real Identify traffic  
- Keep multiview diagnostic honesty on all surfaces  
- Beta deploy + cohort (GTM / hosting docs)  
