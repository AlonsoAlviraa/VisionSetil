# ROADMAP — VisionSetil

> Documento vivo. Se actualiza al final de cada sprint.

---

## Phase E — Quality + AuthZ + depth (active)

| Campo | Valor |
| --- | --- |
| **Estado** | **En curso / closeout en árbol** (post audit + Phase D) |
| **Doc** | [`docs/PHASE_E_QUALITY_AUTHZ.md`](./PHASE_E_QUALITY_AUTHZ.md) |
| **Horizonte** | ~3–4 semanas · E-00…E-18 |
| **Foco** | CI verde, AuthZ observations/reviews/uploads, token hash, encyc perf, media honesty |
| **Rama** | `merge/best-of-both` |

| Track | Entrega | Estado |
| --- | --- | --- |
| **T0–T1** | Audit ship + vitest/CI | ✅ |
| **T2** | AuthZ observations + review roles + auth uploads + token hash | ✅ |
| **T3** | HttpOnly cookies | ⏳ deferred |
| **T4** | Encyc debounce + page 12 + catalog v2-only | ✅ |
| **T5–T7** | Media residual / ML ops / product polish | 🔄 partial |

---

## Phase D — Funciones + belleza visual (shipped MVP mes)

| Campo | Valor |
| --- | --- |
| **Estado** | **W1–W4 entregado** (post A/B/C MVP) — closeout en doc |
| **Doc** | [`docs/PHASE_D_30D_FEATURES_AND_BEAUTY.md`](./PHASE_D_30D_FEATURES_AND_BEAUTY.md) |
| **Horizonte** | 30 días · ~18 PRs (D-01…D-18) |
| **Foco** | Design system unificado, polish top surfaces, notebook/quiz/mapa/offline, PWA/a11y |
| **Fuera de foco residual** | Crawl masivo `ok_real` (opcional); D-13 community light |
| **Rama** | `merge/best-of-both` |

| Semana | Entrega | Estado |
| --- | --- | --- |
| **W1** | Tokens, UI kit, Home media path, Encyc skeletons, media badges | ✅ |
| **W2** | Detail tabs, lookalikes, Identify density, i18n chrome | ✅ |
| **W3** | Notebook v2, Quiz daily, Mapa hotspots | ✅ |
| **W4** | Offline season pack, PWA install/icons, perf routes, a11y skip, docs | ✅ |

---

## Estado Actual — Fase 7 (Frontend MVP + Mega Training + Seguridad)

### ✅ Logros del sprint

| Área                     | Entregable                                                        | Estado |
| ------------------------ | ----------------------------------------------------------------- | ------ |
| **Configuración**        | Migración a `pydantic-settings`, `.env.example`, `docs/configuration.md` | ✅ |
| **Seguridad**            | Validación magic bytes en uploads, anti path traversal, tests de seguridad | ✅ |
| **Seguridad**            | Security headers middleware (HSTS, CSP, X-Frame-Options, XSS) + API key auth + rate limiting | ✅ |
| **Observabilidad**       | Request-id middleware, logging JSON estructurado, `/health` + `/readyz` + `/metrics` | ✅ |
| **CI/CD**                | GitHub Actions matrix (Python 3.11/3.12/3.13), ruff + black + pytest | ✅ |
| **Contenerización**      | `Dockerfile.cpu` multi-stage, `.dockerignore`, `docker-compose.yml` + `docker-compose.prod.yml` | ✅ |
| **Frontend**             | React + TypeScript + Vite SPA, PWA offline-first, camera capture, multi-image upload, redesigned UI | ✅ |
| **Frontend**             | Metadata form (hábitat, sustrato, olor, árboles cercanos), result cards con feedback | ✅ |
| **Backend**              | `POST /classify` endpoint simplificado (frontend → pipeline completo en 1 llamada) | ✅ |
| **ML Training**          | Mega Training Pipeline: ConvNeXt/DINOv2/EfficientNet + focal loss + label smoothing | ✅ |
| **ML Training**          | Métricas FungiCLEF reales: MAP@3, top-k acc, balanced acc, macro/micro F1 | ✅ |
| **ML Training**          | Anti-leak splitting (observation + session aware), best checkpoint on MAP@3 | ✅ |
| **Calidad de código**    | Ruff (0 errores en archivos modificados), 101/101 tests pasan     | ✅ |
| **Documentación**        | README reestructurado, ROADMAP, `configuration.md`, docs técnicos  | ✅ |

### 📊 Métricas del sprint

- **Tests:** 101/101 pasando (0 fallos)
- **Cobertura de linting:** 0 errores de ruff en archivos del backend
- **Frontend:** TypeScript compila limpio, 103 módulos, bundle 268 KB (86 KB gzip)
- **Deuda técnica crítica:** Eliminada

---

## Próximos Sprints

### Sprint N+1 — Robustez de Modelos y Data Pipeline

**Objetivo:** Cerrar la brecha entre mocks y modelos reales en GPU.

| ID    | Tarea                                                      | Prioridad | Esfuerzo |
| ----- | ---------------------------------------------------------- | --------- | -------- |
| ML-1  | Integrar pesos reales de YOLOE-26 en CI (GPU runner)      | Alta      | L        |
| ML-2  | Fine-tuning de DINOv3 con dataset FungiCLEF 2025           | Alta      | XL       |
| ML-3  | Construcción de índice de especies con prototypes reales   | Alta      | M        |
| ML-4  | Calibración de umbrales open-set con dataset de validación | Media     | M        |
| ML-5  | Benchmark end-to-end en dataset 1.000 observaciones        | Alta      | L        |
| DP-1  | Pipeline de data augmentation para entrenamiento           | Media     | M        |
| DP-2  | Versionado de datasets con DVC                             | Baja      | S        |

**Definition of Done:**

- Modelos reales cargan en CI sin mock fallbacks.
- Índice de especies tiene ≥500 especies con prototypes verificados.
- Benchmark de 1.000 casos ejecuta en <30 min en GPU.

---

### Sprint N+2 — Frontend MVP y API Gateway

**Objetivo:** Exponer el pipeline a usuarios finales vía mini-app.

| ID    | Tarea                                                      | Prioridad | Esfuerzo |
| ----- | ---------------------------------------------------------- | --------- | -------- |
| FE-1  | Scaffold frontend (React/Vite o Next.js)                   | Alta      | M        |
| FE-2  | Flujo de captura multi-vista (sombrero, láminas, pie, base) | Alta      | L        |
| FE-3  | Pantalla de resultados con explicaciones y avisos          | Alta      | M        |
| FE-4  | Integración con API: upload + classify-advanced            | Alta      | M        |
| FE-5  | PWA offline-first con cache de observaciones               | Media     | L        |
| GW-1  | Rate limiting en endpoints de clasificación                | Alta      | S        |
| GW-2  | API key authentication para acceso externo                 | Media     | M        |
| GW-3  | WebSocket para progreso de clasificación async              | Baja      | M        |

**Definition of Done:**

- Usuario puede subir fotos y recibir clasificación en <15s.
- Frontend desplegado en Vercel/Netlify.
- Rate limiting activo en producción.

---

### Sprint N+3 — MLOps y Monitoring en Producción

**Objetivo:** Observabilidad de modelos en producción y feedback loop.

| ID    | Tarea                                                      | Prioridad | Esfuerzo |
| ----- | ---------------------------------------------------------- | --------- | -------- |
| MO-1  | Integrar MLflow para tracking de experimentos              | Alta      | M        |
| MO-2  | Dashboard de métricas en vivo (Grafana/Prometheus)         | Alta      | L        |
| MO-3  | Alerting de drift en distribuciones de embedding           | Media     | M        |
| MO-4  | Pipeline de re-entrenamiento automatizado (CI/CD ML)       | Media     | XL       |
| MO-5  | A/B testing framework para nuevos modelos                  | Baja      | L        |
| MO-6  | Data logging para feedback de expertos (human review loop) | Alta      | M        |

---

### Sprint N+4 — Escalabilidad y Multi-tenant

**Objetivo:** Soportar múltiples organizaciones y alta disponibilidad.

| ID    | Tarea                                                      | Prioridad | Esfuerzo |
| ----- | ---------------------------------------------------------- | --------- | -------- |
| SC-1  | Migrar a PostgreSQL con connection pooling                 | Alta      | M        |
| SC-2  | Redis para caché distribuida de embeddings                 | Alta      | M        |
| SC-3  | Queue asíncrono para clasificación (Celery/RQ)             | Alta      | L        |
| SC-4  | Multi-tenant: aislamiento de datos por organización        | Media     | XL       |
| SC-5  | Auto-scaling en Kubernetes (HPA)                           | Media     | L        |
| SC-6  | CDN para servir imágenes estáticas y crops                 | Baja      | S        |

---

### Backlog — Mejoras Continuas

| ID    | Tarea                                                      | Prioridad |
| ----- | ---------------------------------------------------------- | --------- |
| BK-1  | Soporte para audio (descripción de voz del usuario)        | Baja      |
| BK-2  | Integración con iNaturalist API para enriquecimiento       | Baja      |
| BK-3  | Microscopio USB support para esporas                       | Baja      |
| BK-4  | Modo colaborativo: identificación grupal                   | Baja      |
| BK-5  | Internacionalización (i18n): EN, FR, DE, IT, PT            | Media     |
| BK-6  | Accesibilidad WCAG 2.1 AA                                  | Media     |
| BK-7  | Tests E2E con Playwright                                   | Media     |
| BK-8  | Migrar a ASGI server con uvicorn workers en prod           | Media     |

---

## Principios de Priorización

1.  **Seguridad primero:** Cualquier cambio que afecte la política de seguridad (consumo, lookalikes mortales) tiene prioridad máxima.
2.  **Modelos reales > mocks:** Priorizar tareas que reduzcan dependencia de mocks.
3.  **Feedback loop:** Valorar tareas que conectan expertos → modelos → usuarios.
4.  **Reproducibilidad:** Todo experimento debe ser reproducible con un solo comando.

---

## Riesgos Técnicos

| Riesgo                                        | Probabilidad | Impacto | Mitigación                          |
| --------------------------------------------- | ------------ | ------- | ----------------------------------- |
| GPU no disponible en CI                       | Alta         | Alto    | Usar runners cloud con GPUspot      |
| Dataset FungiCLEF 2025 con etiquetas ruidosas | Media        | Medio   | Auditoría manual de subconjunto     |
| Latencia alta de modelos reales en CPU        | Alta         | Medio   | Queue asíncrono + cache agresivo    |
| Overfitting a dataset de benchmark            | Media        | Alto    | Validación cruzada con datasets dispares |

---

_Última actualización: Fin del Sprint Fase 7 — Frontend MVP + Mega Training Pipeline + Seguridad_
