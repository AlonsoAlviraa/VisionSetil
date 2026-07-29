# Graph Engineering Process — VisionSetil

**Purpose:** keep product + ML honesty evolving without metric time-travel, forage claims, or monoblock commits.  
**Canon state file:** `STATE.md` · **Changelog:** `graph_evolution.md` · **Queue:** `BACKLOG.md`

---

## 1. Roles

| Role | May do | Must not |
|------|--------|----------|
| **Autonomous cycle** (agent / scheduler) | FE polish, ML honesty code, tests, catalog SSOT wire, docs sync, eval reports | Deploy prod, flip `product_unlock`, push E21 GPU, set form secrets, forage language |
| **Operator (human)** | Deploy preview, env URLs, cohort invites, unlock decision, Kew reply, E21 launch | Treat advisory metrics as forage OK |
| **Canon docs** | MEMORY / VISION / ROADMAP / STATE must agree on ML snapshot | MEMORY must not claim MAP~0.07 or Identify permanently blocked after E20 |

---

## 2. Cycle ritual (every autonomous fire)

1. **Read** `STATE.md` + `BACKLOG.md` (+ this PROCESS if first fire in session).  
2. **Skip** operator-only items (O1–O6 style).  
3. **Pick one** solid ship: FE honesty/UX **or** ML honesty **or** catalog/nomenclature — with tests.  
4. **Verify** (targeted pytest/vitest; pro tester if ML surface).  
5. **Append** `graph_evolution.md` (version bump narrative).  
6. **Update** `STATE.md` version + residual; trim `BACKLOG.md`.  
7. **Never** set `product_unlock=true` or edible green lights.

### Standing policy lines (copy into product copy)

- orientation only · never consumption / forage permission  
- multi-foto without diagnostic views ≠ safer to eat  
- open-set reject is a feature  

---

## 3. Versioning

- Format: `vMAJOR.MINOR.PATCH-slug` (e.g. `v1.9.9-s9-log-schema`).  
- **MAJOR/MINOR:** product or ML protocol shift.  
- **PATCH:** residual honesty/UX under same protocol (E20).  
- STATE `Active graph version` is the only “current version” agents should cite.

---

## 4. Metrics SSOT (anti time-travel)

| Claim type | Read from |
|------------|-----------|
| E20 MAP / deadly / ECE | `kaggle/kernel_output_v20/models/metrics.json` + dual-key honesty scripts |
| Unlock eligibility | `evaluate_product_unlock_criteria` / `e20_unlock_eval.json` |
| Open-set thr | `eval/reports/open_set_thresholds.json` |
| Field multiview | `field_multiview_holdout.json` |
| Live reject | S9 JSONL + `live_reject_monitor` |
| Product residual | `BACKLOG.md` + `docs/OPERATOR_BETA_CHECKLIST.md` |

**Forbidden:** citing Phase-E-era MAP~0.07 or “Identify blocked forever” as current baseline after E20 soft gates PASS.

Canon narrative docs:

| Doc | Role |
|-----|------|
| `VISION.md` | Mission + limits + high-level E20 snapshot |
| `docs/ROADMAP.md` | Priorities + residual + archived phases |
| `MEMORY.md` | Decisions/bugs/lessons — **not** live metrics table |
| `STATE.md` | Live version + residual next |

---

## 5. Release snapshot (git)

Prefer **thematic commits**, not one monoblock:

1. `ml` — honesty gates, open-set, E20 scripts, kaggle/ml_qa, eval reports  
2. `catalog` — SSOT lookalikes, synonyms, Index Fungorum  
3. `frontend` — Identify / multiview / beta surfaces  
4. `docs` — VISION/MEMORY/ROADMAP/STATE/operator checklists  
5. `ops` — deploy Caddy, smoke scripts, GTM (no secrets)

Never commit: `*.pt`, `data/industrial_v1/`, full `media/species/**` (except fixtures), `.env`, credentials, root `node_modules/`.

---

## 6. Operator handoff

When residual is operator-owned, stop autonomous feature thrash and point to:

- `docs/OPERATOR_BETA_CHECKLIST.md` (deploy + form + smoke Identify + cohort)  
- `docs/HOSTING_DEPLOY_BETA.md`  
- `docs/GTM_BETA_COHORT.md`  
- `docs/OPERATOR_UNLOCK_RUNBOOK.md`  

Autonomous work may still: grow S9 fixtures/schema, fix honesty bugs, i18n parity — **not** replace deploy.

---

## 7. Stop conditions (autonomous windows)

- Wall clock / user cancel scheduler  
- Blocked only on operator secrets or GPU launch  
- Safety policy conflict → fail closed, document in MEMORY  

---

*Process sync 2026-07-29 · product_unlock remains false.*
