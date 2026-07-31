# Mega-auditoría industrial VisionSetil — v1.66.0

**Fecha:** 2026-07-31  
**HEAD base auditado:** `e5ba81e` (tras push de regresión AuthZ/lookalikes)  
**HEAD post-fix P0 (este cycle):** path normalizer `/api` dual-mount  
**Política:** orientation only · **`product_unlock=false`** · never forage / consume permission  
**Método:** 4 lanes adversariales en paralelo (Security · Frontend · Data · Backend honesty) + gates locales FE/BE  

---

## 1. Resumen ejecutivo

| Dimensión | Verdict | Notas |
|-----------|---------|--------|
| **product_unlock** | **PASS fail-closed** | No hay path runtime que asigne `true`; metrics advisory puede ser elegible pero sigue locked |
| **Consumo / forage copy** | **PASS** | Frases prohibidas solo en deny-lists / tests hostiles |
| **AuthZ scopes (bare paths)** | **PASS** (previo) | `/observations/{id}/classify(-advanced)` → admin |
| **AuthZ dual-mount `/api/*`** | **P0 encontrado → FIXED** | `normalize_request_path` en scopes + middleware + rate-limit |
| **FE safety surfaces** | **PASS** | Stickies, sin FoodQuality en Identify, media policy T1–T7 |
| **FE tests** | **608/608** | tsc clean (cycle previo) |
| **BE honesty classify/open-set** | **PASS** | mock no miente stack; safety_level unsafe_to_consume |
| **Catalog lookalikes v2** | **PASS core** | 0 aristas asimétricas; deadly con LA no vacíos |
| **Drift snapshots / synonyms** | **P0–P1 residual** | xanthodermus vs xanthoderma; dual satanas; expanded FE/BE lag |
| **BE suite amplia** | **5 fails residuales** | catalog count 523≠520; training metrics 40≠500; jobs envelope; human-review `detail` key |

### Verdict global

| | |
|--|--|
| **GO product orientation-only** | Sí — no unlock, no forage grant |
| **GO merge post P0 AuthZ** | Sí tras fix dual-mount `/api` |
| **GO production hard** | Condicional — residual DATABASE_URL SQLite, SPA index name, expanded catalog lag |
| **Autonomous next** | Tickets P1 catalog drift + SPA shell + stale BE tests |

---

## 2. Gates medidos

| Suite | Resultado |
|-------|-----------|
| Frontend `vitest run` | **73 files · 608 tests · PASS** |
| Backend security_scopes + security + authz | **PASS** (post-fix dual-mount) |
| Backend lookalike_normalize + species_index_join + catalog_join | **PASS** |
| Backend honesty (classification_safety, classify_honesty, safety_layer, identify_lookalike, quality_gate, multiview_mock) | **PASS** |
| Backend full `app/tests` (sin e20 smoke / large_dataset) | **5 FAILED** (ver §6) |

### product_unlock scan

- Hits “true-ish” en repo: docs, hostile tests, force-false comments — **ninguna asignación live a true**.
- Forbidden consume phrases: solo en blacklists (`safety_i18n`, `communitySafety`, `riskLabels`) y asserts de tests.

---

## 3. Lane A — Security / AuthZ / Safety policy

### P0 (fixed this cycle)

| ID | Hallazgo | Fix |
|----|----------|-----|
| **S-01** | `required_scope_for_path("/api/metrics") → None` y `/api/observations/…/classify-advanced → None` — dual-mount en `main.py` sin normalizar path | `normalize_request_path()` strip `/api` + trailing slash; usado en scopes + APIKeyMiddleware + rate-limit buckets |
| **S-02** | classify-advanced sin admin bajo `/api` (middleware-only) | Mitigado por S-01; residual: handler-level admin Depends (P1 defense-in-depth) |
| **S-07** | Trailing slash caía a scope classify | Incluido en normalizer |

### P1 residual

| ID | Hallazgo | Ticket |
|----|----------|--------|
| **S-03** | Classify/images por observation id sin match `organization_id` | Org-scope en mutators |
| **S-04** | Rate-limit buckets ignoraban `/api` | **Fixed** con same normalizer |
| **S-05** | Root `.env` no gitignored | **Fixed** en `.gitignore` |
| **S-06** | `DATABASE_URL` ignorado — siempre SQLite StaticPool | Wire settings.database_url |

### P2–P3

- S-08 public paths consistency (mitigado con normalize en `_is_public`)
- S-09 models status error strings leak path
- S-10 API_KEYS empty en dev
- S-11 human-review blacklist incompleta vs safety_i18n
- S-12 HSTS en HTTP local

### Controles positivos

- CORS: no `*` + credentials en prod  
- `bind_request_id` + header  
- Global 500 sin stack leak  
- OpenAPI oculto en prod  
- Job `raw` strip non-admin  

---

## 4. Lane B — Frontend surfaces / media / i18n

### Surfaces matrix (resumen)

Identify, Encyclopedia, Detail, Games, Lookalike, Home: **orientation sticky** o warn strip. Map: chip educativo (sin PageShell sticky).  
`product_unlock=false` en data honesty modules. Media: `MEDIA_SURFACE_POLICY` grid thumb+preferLocal; gallery sin probe storm; GamesHub hydrate gate.

### Findings

| Sev | ID | Hallazgo |
|-----|----|----------|
| **P1** | F-SPA | Dual-build emite `index-app.html` pero SW/navigateFallback y rewrites apuntan a `index.html` → riesgo 404 offline/deep-link |
| **P2** | F-i18n | CA/EU **100% keys** pero strings largos = ES (no calidad nativa) |
| **P2** | F-CSS | identifyChromeSafety audita `redesign.css` muerto; cascade viva es campo-nocturno |
| **P2** | F-food | Ficha detail resume “Comestible” colapsado (con never-consume body) |
| **P3** | F-map / main.tsx / surfaceRoutes | Sticky inconsistente; main.tsx huérfano; list drift menor |

### Tests FE lane

75 tests targeted (safety/media/routes) green; full **608/608**.

---

## 5. Lane C — Data SSOT / lookalikes / join / media

### Metrics

| Métrica | Valor |
|---------|-------|
| Catalog v2 count | **523** |
| Lookalike edges / asymmetric | **140 / 0** |
| Deadly empty LA | **0** |
| Classic pairs JSON = FE studio | **22 = 22** |
| Multiview SSOT classic vs FE copy | **20 vs 28** (drift) |
| Join v20 model∩catalog | **40/40 = 100%** |
| speciesPhotos with_photo | **523/523** |
| Local media dirs | **520** (3 slugs sin dir) |

### P0 data (no code fix this cycle — product content)

| ID | Hallazgo |
|----|----------|
| **D-LA-01** | Classic `Agaricus xanthodermus` vs SSOT **`Agaricus xanthoderma`** — pair sin edge canónico |
| **D-LA-02** | Classic `Rubroboletus satanas` vacío; catalog tiene **Boletus satanas** con edge a edulis |

### P1

| ID | Hallazgo |
|----|----------|
| **D-LA-03** | FE/BE expanded catalogs lag v2 en 5 taxa (p.ej. *C. rubellus* sin *Imleria badia*) |
| **D-MV-01** | Multiview dual file (data/ vs frontend/) mismo timestamp, distinto contenido |
| **D-LA-04** | `involutus-edulis` sin edge en catalog |

### P2

- 27 high/toxico sin LA  
- 3 media dirs missing  
- `species_fe_export.json` stale (347 vs 523)  

---

## 6. Lane D — Backend classify / open-set / honesty

| Check | Result |
|-------|--------|
| product_unlock hard-false en status/open-set/feedback | **PASS** |
| evaluate_product_unlock_criteria can_auto_unlock | **Always False** |
| Mock never claims real stack | **PASS** |
| safety_level unsafe_to_consume on real paths | **PASS** |
| Open-set deadly via HIGH_RISK_GENERA only | Residual: satanas/Omphalotus no disparan open-set deadly genus gate |
| Ranker may demote elevated risk via catalog | Residual HON-3 |

### BE fails residuales (suite amplia)

| Test | Causa probable |
|------|----------------|
| `test_species_catalog_expanded` assert 523==520 | Count stale (catalog creció) |
| `test_training_metrics` assert 40==500 | Expectativa legacy v9-era |
| `test_human_review_safe_to_eat_blocking` KeyError `detail` | Envelope canónico usa `message` |
| `test_async_job_safety` / `test_job_result_contract` | Envelope/mode gate `None` |

---

## 7. Matriz de tickets priorizados (post-audit)

### P0 — ship now / shipped

| Ticket | Estado | Área |
|--------|--------|------|
| **S-01/S-04/S-07** dual-mount path normalize | **SHIPPED this cycle** | AuthZ |
| **S-05** `.env` gitignore | **SHIPPED this cycle** | Ops |
| **D-LA-01** xanthoderma canonical classic pair | OPEN | Data |
| **D-LA-02** satanas dual taxon classic | OPEN | Data |

### P1

| Ticket | Área |
|--------|------|
| **S-02b** Depends(admin) en classify-advanced handlers | AuthZ depth |
| **S-03** org_id en classify/images | Multi-tenant |
| **S-06** DATABASE_URL / Postgres pool | Infra |
| **F-SPA** index-app vs index.html PWA | Frontend deploy |
| **D-LA-03** regen expanded FE/BE lookalikes from v2 | Catalog |
| **D-MV-01** single multiview SSOT + hash CI | Catalog |
| **HON-1** fix human-review error key test | Tests |
| **BE-count** fix 520→523 + training metrics expectations | Tests |

### P2

| Ticket | Área |
|--------|------|
| F-i18n native CA/EU | i18n |
| F-CSS live cascade audit | Safety CSS |
| F-food soft label on detail summary | UX safety |
| HON-2 open-set deadly beyond genus set | ML honesty |
| HON-3 ranker never demote elevation | ML honesty |
| D-LA-05 fill high/toxico empty LA top Iberia | Data |
| D-MED-01 3 missing media dirs | Media |
| Encyclopedia virtualization T5 | Perf |

### P3

| Ticket | Área |
|--------|------|
| main.tsx orphan cleanup | FE |
| HSTS gate | Security headers |
| species_fe_export quarantine | Data |
| Mortifero-not-in-ML40 honesty surface | ML |

---

## 8. Cambios aplicados en este cycle (además del informe)

1. `backend/app/core/security_scopes.py` — `normalize_request_path` + uso en `required_scope_for_path`  
2. `backend/app/middleware/api_key_auth.py` — public + scope sobre path canónico  
3. `backend/app/middleware/rate_limit.py` — buckets classify/auth sobre path canónico  
4. `backend/app/tests/test_security_scopes.py` — dual-mount + trailing slash + middleware `/api`  
5. `.gitignore` — `.env` / `.env.*` / `tmp-vitest.json`  

**No se ha tocado `product_unlock`.**  

---

## 9. Graph engineering

| Campo | Valor |
|-------|--------|
| Active graph version (post) | `v1.66.0-mega-audit` |
| Report path | `docs/audits/MEGA_AUDIT_v1.66.0_2026-07-31.md` |
| Policy | product_unlock=**false** |

---

## 10. Checklist adversario (8/8)

| # | Claim | Result |
|---|-------|--------|
| 1 | product_unlock never true from metrics | **PASS** |
| 2 | No safe-to-eat product UI strings | **PASS** |
| 3 | Admin gate bare classify-advanced | **PASS** |
| 4 | Admin gate dual-mount /api | **PASS post-fix** |
| 5 | Lookalike bidirectionality v2 | **PASS** (0 asym) |
| 6 | Join v20 40/40 | **PASS** |
| 7 | FE 608 tests | **PASS** |
| 8 | Deadly taxa non-empty LA | **PASS** |

**Residual known fails:** 5 BE tests stale (counts/envelopes) — no policy unlock.

---

*Fin mega-auditoría v1.66.0 · orientation only · never product_unlock*
