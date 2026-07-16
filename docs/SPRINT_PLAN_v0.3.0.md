# 🍄 Sprint Plan v0.3.0 — VisionSetil

> **Fecha:** 2026-07-07
> **Sprint anterior:** v0.2.0 (safety UI, feedback loop, mega-training pipeline, CI robusto)
> **Objetivo del sprint:** Cerrar brecha mocks→real, eliminación de deuda técnica crítica y escalabilidad para producción.

---

## ✅ Verificación de repositorio (local + remoto)

| Check | Estado | Detalle |
|-------|--------|---------|
| Working directory | `C:\AlonsoAlviraa\VisionSetil` | ✓ |
| Git remote | `https://github.com/AlonsoAlviraa/VisionSetil.git` | ✓ |
| Branch actual | `main` (sync con `origin/main`) | ✓ |
| Tests backend | **91/91 PASS** (~38s) | ✓ |
| CI GitHub Actions | 4 jobs (lint+test, model smoke, frontend, docker) | ✓ |
| Frontend | TypeScript + React + Vite puro | ✓ |
| Modelo detector | YOLOv8n funcional (smoke test CI) | ✓ |

---

## 📊 Estado actual del proyecto

### Stack tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Backend | FastAPI + Uvicorn | 0.115+ |
| DB | SQLAlchemy + SQLite | 2.0+ |
| ML | PyTorch + torchvision + ultralytics | 2.2+ |
| Frontend | React + Vite + TypeScript | 20+ |
| CI/CD | GitHub Actions (matrix Python 3.11) | - |
| Contenedores | Docker multi-stage + docker-compose | - |
| Calidad | Ruff + Black + mypy (non-blocking) | - |

### Pipeline ML actual

```
Imagen → YOLOv8n (detección) → DINOv3/SigLIP2 (embeddings) → Species Index → Ranker → Safety Layer → Open-Set Rejection → Resultado
```

**⚠️ Estado real:** Los 3 componentes ML principales usan **mocks por defecto**:
- `MockMushroomDetector` — detección heurística por nombre de archivo
- `MockVisualEmbedder` — hash SHA256 como vector
- `MockImageTextEmbedder` — hash SHA256 como vector

---

## 🔍 Deuda técnica detectada en el análisis

### 🔴 Crítica (bloquea producción)

| ID | Deuda | Impacto | Archivo |
|----|-------|---------|---------|
| **TD-1** | `datetime.utcnow()` deprecated (Python 3.14+) | Warning + fallo futuro | `db/models.py` (vía SQLAlchemy) |
| **TD-2** | Mocks ML activos por defecto | Pipeline no clasifica de verdad | `ml/fallbacks.py` |
| **TD-3** | SQLite no soporta concurrencia real | Bloquea multi-usuario | `db/database.py` |
| **TD-4** | `mypy \|\| true` en CI — errores de tipos ignorados | Bugs silentes | `.github/workflows/ci.yml` |

### 🟡 Media (debería arreglarse este sprint)

| ID | Deuda | Impacto |
|----|-------|---------|
| **TD-5** | Import tardío `import os as _os` en `main.py` línea 63 | Style + mantenibilidad |
| **TD-6** | No hay cache distribuida (Redis) | Recomputación costosa de embeddings |
| **TD-7** | Frontend no es PWA — sin offline | UX móvil limitada |
| **TD-8** | Sin tests E2E | Regresiones UI no detectadas |
| **TD-9** | `Dockerfile.cpu` referenciado en CI pero no existe en raíz | Build docker job falla |
| **TD-10** | `kaggle/MEGA` — archivo sin extensión (probable truncado) | Confusión |

### 🟢 Baja (backlog)

| ID | Deuda |
|----|-------|
| **TD-11** | Sin versionado de datasets (DVC) |
| **TD-12** | Sin i18n (solo ES) |
| **TD-13** | Sin observabilidad ML (MLflow) |
| **TD-14** | Sin A/B testing framework |

---

## 🤖 Plan de sprint — Delegación a subagentes

### 🤖 Subagente A — ML & Datos (fine-tuning real)

**Rol:** Ingeniero/a ML Senior
**Objetivo:** Reemplazar mocks por modelos reales fine-tuneados

| ID | Tarea | Esfuerzo | Prioridad |
|----|-------|----------|-----------|
| **A-1** | Ejecutar `kaggle/visionsetil_mega_training.ipynb` en Kaggle GPU T4 | M | 🔴 Crítica |
| **A-2** | Descargar `best_model.pt` + `label2idx.json` e integrar en `backend/app/ml/weights/` | S | 🔴 Crítica |
| **A-3** | Implementar `ConvNeXtClassifier` en `ml/model_registry.py` que cargue el checkpoint | M | 🔴 Crítica |
| **A-4** | Build species index con embeddings reales (`scripts/build_species_index.py`) | L | Alta |
| **A-5** | Calibrar thresholds de open-set rejection con dataset validación | M | Alta |
| **A-6** | Benchmark end-to-end en 1.000 observaciones (`kaggle/run_large_dataset_benchmark.py`) | L | Alta |

**Definition of Done:**
- [ ] `USE_REAL_YOLOE=true` carga detector real sin crash
- [ ] `USE_REAL_DINOV3=true` carga embedder real sin crash
- [ ] Species index tiene ≥500 especies con prototypes verificados
- [ ] Benchmark 1.000 casos ejecuta en <30 min en GPU
- [ ] Mocks solo se activan si `ALLOW_MOCK_FALLBACKS=true` Y falta hardware

**Skills requeridas:** PyTorch, torchvision, Kaggle GPU, CUDA, scikit-learn, pandas

---

### 🤖 Subagente B — Backend & Infra (escalabilidad)

**Rol:** Backend Engineer
**Objetivo:** Producción-ready con PostgreSQL, Redis y observabilidad

| ID | Tarea | Esfuerzo | Prioridad |
|----|-------|----------|-----------|
| **B-1** | Fix `datetime.utcnow()` → `datetime.now(UTC)` (TD-1) | S | 🔴 Crítica |
| **B-2** | Migrar SQLite → PostgreSQL con Alembic migrations | L | 🔴 Crítica |
| **B-3** | Añadir Redis para `EmbeddingCache` distribuido | M | Alta |
| **B-4** | Activar `mypy --strict` en CI (quitar `\|\| true`) (TD-4) | M | Alta |
| **B-5** | Limpiar `main.py`: mover imports arriba, eliminar `import os as _os` tardío | S | Media |
| **B-6** | Crear `Dockerfile.cpu` faltante (TD-9) o corregir referencia CI | S | Alta |
| **B-7** | Añadir `/metrics` endpoint con formato Prometheus | S | Media |
| **B-8** | `docker-compose.prod.yml` con PostgreSQL + Redis + backend | M | Alta |

**Definition of Done:**
- [ ] 0 warnings en suite de tests (`pytest -W error::DeprecationWarning`)
- [ ] `mypy app` pasa sin errores (no solo baseline)
- [ ] `docker-compose.prod.yml` levanta stack completo
- [ ] `/metrics` expone métricas Prometheus estándar

**Skills requeridas:** FastAPI, SQLAlchemy 2.0, Alembic, PostgreSQL, Redis, Docker, Prometheus

---

### 🤖 Subagente C — Frontend & UX (PWA móvil)

**Rol:** Frontend Engineer
**Objetivo:** PWA instalable con offline-first y cámara nativa

| ID | Tarea | Esfuerzo | Prioridad |
|----|-------|----------|-----------|
| **C-1** | Convertir a PWA: `vite-plugin-pwa` + service worker + manifest | M | Alta |
| **C-2** | Camera capture nativo (`<input capture="environment">`) | S | Alta |
| **C-3** | Multi-image upload (sombrero, láminas, pie, base) | L | Alta |
| **C-4** | Offline cache de observaciones con IndexedDB | L | Media |
| **C-5** | Onboarding con tutorial de seguridad (3 slides) | M | Media |
| **C-6** | Tests E2E con Playwright (TD-8) | M | Media |
| **C-7** | Geolocalización automática (opcional, con consentimiento) | S | Baja |

**Definition of Done:**
- [ ] App instalable en Android/iOS (Add to Home Screen)
- [ ] Funciona offline (cache de últimas 50 observaciones)
- [ ] Tests Playwright cubren flujo upload → classify → feedback
- [ ] Lighthouse PWA score ≥ 90

**Skills requeridas:** React, TypeScript, Vite, PWA, Service Workers, IndexedDB, Playwright

---

### 🤖 Subagente D — Seguridad & Compliance

**Rol:** Security Engineer
**Objetivo:** Hardening OWASP + GDPR compliance

| ID | Tarea | Esfuerzo | Prioridad |
|----|-------|----------|-----------|
| **D-1** | OWASP Top 10 audit automatizado (bandit + safety) | M | Alta |
| **D-2** | Rate limiting dinámico por API key (mejorar middleware existente) | M | Alta |
| **D-3** | GDPR: endpoint `DELETE /users/me` (right-to-be-forgotten) | M | Alta |
| **D-4** | GDPR: consentimiento de datos en onboarding | S | Media |
| **D-5** | Auditoría de secrets en git history (`gitleaks`) | S | Alta |
| **D-6** | CSP headers + HSTS + X-Frame-Options | S | Alta |
| **D-7** | Penetration testing básico (Burp/ZAP scan automatizado) | L | Media |
| **D-8** | Revisión legal del disclaimer con equipo jurídico | M | Media |

**Definition of Done:**
- [ ] `bandit -r backend/` con 0 high-severity findings
- [ ] `gitleaks detect` con 0 leaks en history
- [ ] Headers de seguridad activos (verificado con securityheaders.com)
- [ ] Endpoint GDPR operativo y testado

**Skills requeridas:** OWASP, GDPR, bandit, gitleaks, OWASP ZAP, FastAPI security

---

## 📅 Cronograma del sprint (2 semanas)

| Semana | Subagente A | Subagente B | Subagente C | Subagente D |
|--------|-------------|-------------|-------------|-------------|
| **W1 D1-3** | A-1, A-2 (Kaggle training) | B-1, B-5, B-6 (fixes rápidos) | C-1, C-2 (PWA + cámara) | D-1, D-5 (auditorías) |
| **W1 D4-5** | A-3 (integrar checkpoint) | B-2, B-3 (PostgreSQL + Redis) | C-3 (multi-image) | D-2, D-6 (rate limit + headers) |
| **W2 D1-3** | A-4, A-5 (species index + calibration) | B-4, B-7 (mypy + metrics) | C-4, C-5 (offline + onboarding) | D-3, D-4 (GDPR) |
| **W2 D4-5** | A-6 (benchmark final) | B-8 (docker-compose.prod) | C-6 (E2E tests) | D-7, D-8 (pentest + legal) |

---

## 🎯 Métricas objetivo del sprint

| Métrica | Antes (v0.2.0) | Objetivo (v0.3.0) |
|---------|----------------|-------------------|
| Tests backend | 91 | 120+ |
| Tests E2E | 0 | 10+ |
| Mocks ML activos | 3 | 0 (en prod) |
| Species index size | mock | ≥500 especies |
| Database | SQLite | PostgreSQL |
| Cache | SQLite local | Redis distribuido |
| `mypy` CI | non-blocking | blocking |
| DeprecationWarnings | 1+ | 0 |
| Lighthouse PWA | N/A | ≥ 90 |
| `bandit` high findings | ? | 0 |

---

## ⚠️ Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| Kaggle GPU cuota agotada | Media | Alto | Plan B: Google Colab Pro |
| PostgreSQL migration rompe datos existentes | Baja | Alto | Backup + Alembic downgrade path |
| Modelo fine-tuneado peor que mock | Media | Medio | A/B test保留 mock como fallback |
| Redis no disponible en CI | Baja | Medio | Mock Redis en tests |
| Playwright flaky en CI | Media | Bajo | Retry logic + `--workers=1` |

---

## 🚀 Próximos pasos inmediatos

1. **Commit del estado actual** (`git add -A && git commit -m "sprint v0.2.0 complete"`)
2. **Crear branch por subagente**: `feat/subagent-A-ml`, `feat/subagent-B-backend`, etc.
3. **Lanzar subagentes en paralelo** (trabajo independiente)
4. **Daily sync** para desbloquear dependencias cruzadas
5. **Sprint review** al final de la semana 2

---

## 📎 Quick fixes inmediatos — ✅ APLICADOS (2026-07-07)

Estos fixes se aplicaron antes de delegar a subagentes:

| Fix | Estado | Detalle |
|-----|--------|---------|
| **Fix 1:** `datetime.utcnow()` (TD-1) | ✅ Done | 5 ocurrencias migradas a `datetime.now(timezone.utc)` |
| **Fix 2:** Import tardío en `main.py` (TD-5) | ✅ Done | `import os as _os` → `import os` al inicio |
| **Fix 3:** `Dockerfile.cpu` faltante (TD-9) | ✅ Done | Multi-stage build creado (builder + runtime slim) |
| **Fix 4:** `kaggle/MEGA` sin extensión (TD-10) | ✅ Done | Renombrado a `kaggle/MEGA_TRAINING_NOTES.md` |
| **Lint bonus:** 20 errores ruff | ✅ Done | UP017, SIM110, F401, I001, W292 — todos resueltos |
| **Tests de regresión** | ✅ Done | **91/91 PASS**, ruff limpio |

**Archivos modificados:**
- `backend/app/db/models.py` — `datetime.UTC`
- `backend/app/api/routes_human_review.py` — `datetime.UTC`
- `backend/app/main.py` — import cleanup
- `backend/app/middleware/api_key_auth.py` — SIM110 + newline
- `backend/app/middleware/rate_limit.py` — SIM110 + newline
- `backend/app/api/routes_metrics.py` — unused imports + newline
- `backend/app/api/routes_feedback.py` — newline
- `backend/app/middleware/__init__.py` — newline
- `backend/app/services/feedback_logger.py` — newline
- `Dockerfile.cpu` — **NUEVO** (CPU-only multi-stage)
- `kaggle/MEGA_TRAINING_NOTES.md` — renombrado de `kaggle/MEGA`
- `backend/app/ml/` — **NUEVO** directorio para Subagent A
- `backend/app/ml/weights/.gitkeep` — placeholder para checkpoints

---

_Última actualización: 2026-07-07 — Quick fixes aplicados, Phase 1 lista para comenzar_
