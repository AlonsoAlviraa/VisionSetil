# ROADMAP — VisionSetil

> Documento vivo. Se actualiza al final de cada sprint.

---

## Estado Actual — Fase 6 (Sprint completado)

### ✅ Logros del sprint

| Área                     | Entregable                                                        | Estado |
| ------------------------ | ----------------------------------------------------------------- | ------ |
| **Configuración**        | Migración a `pydantic-settings`, `.env.example`, `docs/configuration.md` | ✅ |
| **Seguridad**            | Validación magic bytes en uploads, anti path traversal, tests de seguridad (11 tests) | ✅ |
| **Observabilidad**       | Request-id middleware, logging JSON estructurado, `/health` + `/readyz` | ✅ |
| **CI/CD**                | GitHub Actions matrix (Python 3.11/3.12/3.13), ruff + black + pytest | ✅ |
| **Contenerización**      | `Dockerfile` multi-stage, `.dockerignore`, `docker-compose.yml`    | ✅ |
| **Calidad de código**    | Ruff (0 errores), Black, 91/91 tests pasan                        | ✅ |
| **Documentación**        | README reestructurado, ROADMAP, `configuration.md`                | ✅ |

### 📊 Métricas del sprint

- **Tests:** 91/91 pasando (0 fallos)
- **Cobertura de linting:** 0 errores de ruff
- **Tiempo de suite:** ~38s
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

_Última actualización: Fin del Sprint Fase 6_