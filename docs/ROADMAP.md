# ROADMAP — VisionSetil

> Documento vivo. **Canon de estado:** `.grok/graph-engineering/STATE.md`.  
> Última alineación: **2026-07-29** · graph **`v1.9.9-s9-log-schema`** (+ process sync docs).  
> Policy forever: `orientation_only` · **product_unlock = false** hasta ciclo operador humano.

---

## 0. Norte actual (léeme primero)

| Campo | Valor |
|-------|--------|
| **Graph version** | `v1.9.9` (S9 log schema shipped) |
| **ML serve protocol** | E20 source-holdout · MultiView v8 · 40 classes |
| **Soft gates E20** | MAP@3 ≈ **0.860** PASS · deadly@3 ≈ **0.927** PASS |
| **product_unlock** | **false** (`unlock_eligible_advisory` only) |
| **Producto** | Beta-ready en código · residual **operador** (deploy + form + cohorte) |
| **E21** | Readiness only · **no lanzado** |

### Métricas E20 honestas (no inventar otras en docs)

| Key | Value |
|-----|------:|
| test_map_at_3 | ~0.860 |
| safety_recall_deadly_at_1 | ~0.788 |
| safety_recall_deadly_at_3 | ~0.927 |
| n_deadly | 2580 |
| ECE | ~0.188 (band **high**) |
| Field holdout MAP@3 1→4 | ~0.85 → ~0.92 (deadly subset flat caveat) |

Fuentes: `kaggle/kernel_output_v20/models/metrics.json` (local), `eval/reports/ml_experiments/e20_unlock_eval.json`, `field_multiview_holdout.json`.

### Residual priorizado

| # | Item | Owner | Doc |
|---|------|-------|-----|
| O1 | Deploy preview HTTPS (Path A Caddy) | **Operador** | `HOSTING_DEPLOY_BETA.md` |
| O2 | `VITE_PUBLIC_APP_URL` + `VITE_BETA_FEEDBACK_URL` | **Operador** | `GTM_BETA_COHORT.md` |
| O3 | Smoke Identify real en URL pública | **Operador** | `OPERATOR_BETA_CHECKLIST.md` |
| O4 | Cohorte 20–40 (try ~10 min) | **Operador** | `GTM_BETA_COHORT.md` |
| O5 | Unlock decision (si aplica; sigue orientation-only) | **Operador** | `OPERATOR_UNLOCK_RUNBOOK.md` |
| O6 | Kew / CSV oficial IF (opcional) | **Operador** | `INDEX_FUNGORUM.md` |
| M1 | Crecer S9 con tráfico Identify real | Producto + ops | schema v1.9.9 listo |
| M4 | Holdout view-slots etiquetados | ML | necesita FT media local |
| E21 | Scale holdout opcional | Operador GPU | `E21_SCALE_PLAN.md` |

Checklist ejecutable: **`docs/OPERATOR_BETA_CHECKLIST.md`**.

---

## 1. Graph Engineering — qué está shipped (v1.0 → v1.9.9)

Resumen por franja (detalle en `.grok/graph-engineering/graph_evolution.md`):

| Rango | Entrega |
|-------|---------|
| **v1.0–1.3** | Workflows, lookalike SSOT, dual deadly honesty, E20 complete + postprocess + serve path |
| **v1.3.x** | Open-set calibrado, ArcFace centroids, S8/S9, dashboard v20, feedback JSONL |
| **v1.4.x** | Multiview bench, LOO field, deadly diagnostic map, ResultCard critical_views |
| **v1.5.x** | Beta try-first, GTM kit, hosting decision, operator unlock package, multiview honesty global |
| **v1.6–1.8** | Traits, soft coach, GPS pins, camera framing, community consensus, capture density |
| **v1.9.x** | Index Fungorum, model card Kew, ECE chrome Identify, field holdout M3, S9 schema |

**No reabrir** como “próximo sprint” lo que ya figura SHIPPED en STATE/BACKLOG (P15–P19, M2–M3, ECE, S9 schema).

---

## 2. Fases históricas (cerradas — no “active”)

### Phase E — Quality + AuthZ (shipped / closeout)

| Campo | Valor |
|-------|--------|
| **Estado** | **Cerrada en árbol de producto** (CI, AuthZ, encyc, media honesty base) |
| **Doc** | `docs/PHASE_E_QUALITY_AUTHZ.md` |
| **Nota** | Residual E-08 cookies sigue opt-in; no bloquea beta orientation |

### Phase D — Features + belleza (shipped)

| Campo | Valor |
|-------|--------|
| **Estado** | **W1–W4 entregado** |
| **Doc** | `docs/PHASE_D_30D_FEATURES_AND_BEAUTY.md` |

### Phase B/C y “Fase 7” legacy

Documentadas en sus PHASE_*.md. Las métricas antiguas (MAP@3 ~0.07, Identify “blocked”) **ya no son el baseline** — superadas por E20 + quality gate ACCEPTABLE en métricas.

### Sprints N+1…N+4 (texto legacy)

Los ítems genéricos “scaffold frontend / rate limit / MLflow…” del roadmap 2026-07 están **superados o reencuadrados**:

| Legacy | Estado 2026-07-29 |
|--------|-------------------|
| FE multi-vista + PWA | **Shipped** (+ soft coach, density, ECE) |
| Rate limit / API key / security headers | **Shipped** |
| Modelos reales en serve | **E20 real path** (40 clases) |
| Calibración open-set | **Shipped** (E20 holdout thr) |
| MLflow / K8s multi-tenant | **Backlog lejano** (no bloquea beta) |

---

## 3. Próximos tracks (solo residual real)

### Track A — Closed beta operador (P0)

1. Completar `OPERATOR_BETA_CHECKLIST.md`  
2. No blast cohorte sin HTTPS estable  
3. No reclamar forage / edible en invites  

### Track B — Live honesty (P1)

1. Tráfico Identify → S9 windows 24h/7d/30d con `traffic_depth` > sparse  
2. Revisar reject reasons + multiview coverage en dashboard  
3. Mantener ECE high → sin % engañosos en ResultCard  

### Track C — ML scale opcional (P2)

1. `python scripts/e21_readiness.py` (advisory)  
2. Solo operador lanza GPU E21  
3. Nuevo holdout dual deadly + open-set re-calib; unlock sigue false  

### Track D — Product polish autónomo (P3)

Solo si residual operador no bloquea: residual FE i18n parity, a11y, perf.  
**Autónomo NUNCA:** deploy prod, form secrets, flip unlock, push E21.

---

## 4. Principios de priorización

1. Seguridad y honesty de métricas primero  
2. Fail-closed unlock y language de orientación  
3. Tráfico real S9 > features cosméticas  
4. Un ciclo graph = un ship medible + tests + append `graph_evolution.md`  
5. Docs canónicos (VISION / MEMORY / ROADMAP / STATE) sin time-travel  

---

## 5. Riesgos actuales

| Riesgo | Mitigación |
|--------|------------|
| Docs desfasados confunden agents | STATE SSOT + este ROADMAP alineado |
| ECE high → falsa confianza UI | `eceHonesty` hide % |
| Deadly multiview flat | Lookalikes + open-set + never forage |
| Unlock malentendido | Runbook + checklist + `product_unlock=false` forzado |
| Cohorte sin hosting | Checklist O1–O3 gate invites |

---

## 6. Referencias rápidas

- `.grok/graph-engineering/PROCESS.md` — proceso del bucle  
- `.grok/graph-engineering/BACKLOG.md` — backlog corto  
- `MEMORY.md` — decisiones y lecciones (bitácora)  
- `VISION.md` — misión y límites  
- `docs/MODEL_CARD.md` — intended use  

---

_Última actualización: 2026-07-29 — Graph Engineering process sync (anti time-travel)._
