# Plan de Sprint — VisionSetil

> Generado a partir del análisis del repositorio en commit `dcdff6f` (rama `main`, sincronizada con `origin/main`).

## 0. Verificación de repositorio

| Check | Estado |
| --- | --- |
| Remote | `origin = https://github.com/AlonsoAlviraa/VisionSetil.git` ✅ |
| Rama activa | `main` (tracking `origin/main`, up to date, clean) ✅ |
| Local vs remoto | HEAD `dcdff6f` = `origin/main` ✅ |
| Working tree | limpio, sin cambios sin commitear ✅ |

El repositorio local recién clonado coincide exactamente con el remoto indicado.

## 1. Estado actual (resumen ejecutivo)

- **Producto**: Identificación orientativa de setas desde fotos con capa de seguridad estricta (nunca afirma consumo seguro). MVP maduro, fases 1–6 (mock → modelos reales YOLOE/DINOv3/SigLIP2 → benchmark Kaggle/real → human review → production readiness).
- **Stack**: Backend **FastAPI + SQLAlchemy + SQLite** (`backend/app/`, 64 archivos Python, ~5.604 líneas); Frontend **React 18 + Vite 5** (6 componentes, sin tests); módulos de **eval** y **kaggle** para benchmarks.
- **Calidad**: código limpio, sin TODO/FIXME, tests de seguridad y pipeline presentes. **Safety layer conservadora y coherente** con la política de producto.
- **Deuda detectable**: infraestructura de entrega y consistencia del repo, no tanto lógica de negocio.

## 2. Hallazgos prioritarios (con evidencia)

### P1 — Bloqueantes / alto riesgo

1. **CORS inseguro**: `backend/app/main.py:21` usa `allow_origins=["*"]` **junto con** `allow_credentials=True`. Esa combinación es inválida por spec y abre el API a cualquier origen. Debe restringirse por configuración.
2. **Dependencias ML no declaradas**: `yoloe_detector.py`, `dinov3_embedder.py`, `siglip2_embedder.py` hacen imports perezosos (`torch`, `ultralytics`, `transformers`, `PIL`) que **no están** en `backend/requirements.txt` ni como extras en `pyproject.toml`. La app arranca en modo mock, pero activar modelos reales falla sin documentación clara de instalación.
3. **Backend duplicado / legacy**: existe `app/` (raíz, Fase 1) **y** `backend/app/` (activo). `pyproject.toml` confirma que el paquete real es `backend/app`. El `app/` raíz es código muerto que confunde (README y TECHNICAL.md describen estructuras distintas).

### P2 — Importante para entrega robusta

4. **Sin CI/CD**: no existe `.github/workflows`. Tests, lint y build no se ejecutan automáticamente; nada protege `main` contra regresiones.
5. **Sin contenerización ni env example**: no hay `Dockerfile`, `docker-compose.yml`, `.dockerignore` ni `.env.example`. La configuración de modelos (15+ variables en `config.py`) no está documentada como plantilla.
6. **Lockfiles ausentes**: sin `requirements.txt` con pinning, sin `package-lock.json`/`pnpm-lock.yaml`. Builds no reproducibles.
7. **Configuración sin tipado de entorno**: `core/config.py` usa `BaseModel` con `os.getenv` manual en vez de `pydantic-settings` (`BaseSettings`), lo que impide validación/coerción y secrets typing.

### P3 — Mejora continua

8. **Docs desincronizadas**: `ROADMAP.md` termina en Fase 5 pero hay commits de Fase 6 (Kaggle). `README.md` describe `backend/app/{api,core,db,ml,services}` pero `TECHNICAL.md` describe `app/{routers,services}` (estructura legacy). Enlace duplicado a `real_model_loading.md` en el README.
9. **Sin tests de frontend**: `frontend/` no declara framework de tests (ni Vitest). Cobertura de UI = 0.
10. **Sin type-check ni lint en gate**: `ruff`/`black` están como dev deps pero no se aplican automáticamente.
11. **Sin observabilidad**: no hay logging estructurado ni trazas (el `core/logging.py` existe pero conviene revisar formato/sink).

## 3. Objetivos del sprint

1. **Endurecer la entrega**: CI en `main`, contenerización, dependencias reproducibles.
2. **Eliminar deuda estructural**: borrar backend legacy, unificar docs, declarar bien las dependencias.
3. **Subir la barra de seguridad y calidad**: CORS seguro, settings tipadas, lint/type gate, tests de frontend.
4. **Mantener la política de seguridad de producto intacta** (regresión cero en safety).

**Definición de Hecho (DoD)**: `main` verde en CI (lint + tests backend + build frontend), `app/` raíz eliminado, `docker build` funciona, `.env.example` cubre todos los settings, CORS configurable, docs de roadmap y estructura actualizadas.

## 4. Delegación a subagentes

Cada subagent recibe un alcance, ficheros y criterio de aceptación. Paralelizables salvo dependencia indicada.

### 🛰️ Subagent A — DevOps / Infra (dueño de P2.4–P2.6)
- **Tareas**
  - A1. Crear `.github/workflows/ci.yml`: matrix Python 3.11/3.12 con `pip install -e .[dev]`, `ruff check`, `black --check`, `pytest backend/app/tests` y `cd frontend && npm ci && npm run build`.
  - A2. Crear `Dockerfile` multi-stage (builder Python + runtime slim) y `.dockerignore`.
  - A3. Crear `docker-compose.yml` (servicio `api` + volumen `uploads`) y `docker-compose.override.yml` para dev.
  - A4. Generar `requirements.lock` (o migrar a `uv` con `uv.lock`) y `frontend/package-lock.json` (`npm install`).
  - A5. Añadir badges de CI en `README.md`.
- **Aceptación**: push a `main` ejecuta CI verde; `docker compose up` levanta el API en `:8000`.
- **Dependencias**: ninguna (puede empezar ya).

### 🧹 Subagent B — Higiene de build y código legacy (dueño de P1.3, P1.2)
- **Tareas**
  - B1. Eliminar `app/` raíz (legacy Fase 1) tras confirmar que nada lo importa (búsqueda de `from app.routers`, `uvicorn app.main:app` referenciando la raíz). Ajustar `.gitignore`, `README.md` y `TECHNICAL.md`.
  - B2. Mover la declaración de dependencias a `pyproject.toml` con **extras**:
    - `[project.optional-dependencies] ml = ["torch", "torchvision", "transformers", "ultralytics", "Pillow"]`
    - `[project.optional-dependencies] eval = ["scikit-learn", "pandas"]`
    - Mantener `requirements.txt` generado o como alias `pip install -e .[ml]`.
  - B3. Sincronizar `README.md` (sección *Estructura* y *Backend (Desarrollo)*) y `TECHNICAL.md` con la estructura real `backend/app/...`.
  - B4. Corregir el enlace duplicado a `real_model_loading.md` en el README.
- **Aceptación**: `python -c "import app"` solo resuelve a `backend/app`; `pip install -e .[ml]` instala todo lo que el código importa; docs reflejan el árbol real.
- **Dependencias**: coordinar con C1 (rutas) para no pisarse.

### 🔒 Subagent C — Endurecimiento de seguridad (dueño de P1.1, P2.7)
- **Tareas**
  - C1. **CORS configurable**: en `core/config.py` añadir `cors_origins: list[str]` (default `[]`); en `main.py` sustituir el wildcard por `settings.cors_origins` y **no** combinar credenciales con `*`.
  - C2. Migrar `core/config.py` a `pydantic-settings.BaseSettings` (`env_prefix`, `env_file`), conservando defaults. Eliminar el `os.getenv` manual disperso.
  - C3. Validación de subida reforzada: límite de tamaño global (middleware/body limit), verificación de magic bytes además de la extensión.
  - C4. Revisar manejo de rutas en `image_storage`/`yoloe_detector` (construcción de `obs_id_str` desde nombre de archivo → prevenir path traversal; confirmar que `obs_id` es entero y los nombres se sanitizan).
  - C5. Añadir/actualizar tests de seguridad que cubran CORS y path traversal (regresión).
- **Aceptación**: tests verifican que un origen no permitido es rechazado y que `*` no se combina con credenciales; `config.py` carga vía `BaseSettings`.
- **Dependencias**: tras C2, Subagent A genera `.env.example` con todos los settings.

### 🧪 Subagent D — Cobertura de tests y calidad (dueño de P3.9–P3.10)
- **Tareas**
  - D1. Añadir **Vitest** al frontend (`frontend/`): `npm i -D vitest @testing-library/react jsdom`) y test básico de `ResultScreen` (render de advertencia obligatoria).
  - D2. Añadir al CI (de A1) el paso `npm test`.
  - D3. Configurar `ruff` y `black` con `[tool.ruff]`/`[tool.black]` en `pyproject.toml` (longitud de línea, target-version) y ejecutar `black .` + `ruff check --fix` para alinear el código existente.
  - D4. Añadir `mypy` (o `pyright`) en modo no-bloqueante al CI como baseline de tipos.
- **Aceptación**: `npm test` pasa en CI; `ruff`/`black` no reportan cambios pendientes.
- **Dependencias**: tras A1 (para añadir los pasos).

### 📚 Subagent E — Documentación y roadmap (dueño de P3.8)
- **Tareas**
  - E1. Actualizar `docs/ROADMAP.md` con Fase 6 (Kaggle/real benchmark) y Fase 7 propuesta (producción controlada: Postgres, cola de inferencia, observabilidad).
  - E2. Reescribir la sección *Estructura* de `README.md` para reflejar `backend/app`, `frontend`, `eval`, `kaggle`, `docs`.
  - E3. Crear `docs/configuration.md` que liste **todos** los settings de `config.py` con tipo, default y propósito (fuente única de verdad para `.env.example`).
  - E4. Limpiar el enlace duplicado en README y verificar que todos los enlaces a `docs/*.md` existen.
- **Aceptación**: `ROADMAP.md` incluye Fase 6+; ningún enlace del README está roto; `configuration.md` cuadra con `config.py`.
- **Dependencias**: tras C2 (para que la doc de settings sea fiel) y B1 (estructura final).

### 📈 Subagent F — Observabilidad y productización (prepara P3.11 / Fase 5)
- **Tareas**
  - F1. Revisar `core/logging.py`: formato JSON estructurado en producción (`LOG_FORMAT=json`), nivel configurable, correlación request-id (middleware).
  - F2. Añadir endpoint `/health` y `/readyz` diferenciados (live vs. ready: DB + modelos cargados).
  - F3. Esbozar (doc) la migración SQLite → PostgreSQL: `DATABASE_URL`, dialecto SQLAlchemy, seed idempotente.
  - F4. Documentar estrategia de almacenamiento objetual (S3/MinIO) para `uploads/` (Fase 5).
- **Aceptación**: logs en JSON cuando `LOG_FORMAT=json`; `/readyz` refleja estado de dependencias; doc de migración presente.
- **Dependencias**: tras C2 (settings).

## 5. Backlog priorizado (1 = más prioritario)

| # | Item | Subagent | Esfuerzo | Riesgo |
| --- | --- | --- | --- | --- |
| 1 | CORS seguro + settings tipadas | C1, C2 | S | Alto si se retrasa |
| 2 | CI/CD en `main` | A1 | M | Medio |
| 3 | Eliminar backend legacy `app/` | B1 | S | Bajo (confirmar imports) |
| 4 | Declarar dependencias ML/eval + lockfile | B2, A4 | M | Medio |
| 5 | `.env.example` + `docs/configuration.md` | E3, C2 | S | Bajo |
| 6 | Dockerfile + compose | A2, A3 | M | Medio |
| 7 | Lint/format gate + tests frontend | D1, D3 | M | Bajo |
| 8 | Sincronizar README/ROADMAP/TECHNICAL | E1, E2, B3 | S | Bajo |
| 9 | Observabilidad + `/readyz` | F1, F2 | M | Bajo |
| 10 | Doc migración Postgres/S3 (Fase 5) | F3, F4 | S | Bajo |

Esfuerzo: S (<1 día), M (1–2 días).

## 6. Riesgos y mitigaciones

- **R1 — Borrar `app/` raíz rompe despliegues existentes**: mitigar con búsqueda de referencias (`from app.`, `uvicorn app.main`) y un commit separado; mantener `app/__init__.py` reexportando solo si hay un runner externo.
- **R2 — Migrar a `BaseSettings` cambia defaults**: escribir tests de configuración antes/después y comparar dumps; mantener env vars con el mismo nombre.
- **R3 — Lockfile de ML pesa y ralentiza CI**: usar extras y caché de acciones (`actions/cache` / `setup-python` cache), matrix sin ML en el job rápido.
- **R4 — Regresión de safety policy**: los tests `test_safety_layer.py`, `test_classification_safety.py` deben ser **gate obligatorio**; cualquier cambio en `safety_layer.py` requiere revisión explícita.

## 7. Criterios de salida del sprint

- [x] CI verde en `main` (lint, format, tests backend, build Docker). *Frontend tests pendiente D1/D2.*
- [x] `allow_origins=["*"]` eliminado; CORS por configuración (`CORS_ORIGINS`).
- [ ] `backend/app` es el único backend; `app/` raíz eliminado. *(B1: pendiente eliminación física — marcado como deprecated).*
- [x] `pip install -e .[ml]` instala todas las dependencias usadas por el código.
- [x] `docker build` + `docker compose up` funcionan; `.env.example` cubre los settings.
- [ ] `ROADMAP.md`, `README.md` y `TECHNICAL.md` coherentes con el árbol real. *(E1/E2 en progreso.)*
- [x] Tests de seguridad (CORS, traversal, magic bytes, request-id) añadidos (`test_security.py`).

### 7.1 Bitácora de implementación

| Fecha | Subagent | Artefacto | Estado |
| --- | --- | --- | --- |
| Sprint actual | C1+C2 | `core/config.py` migrado a `BaseSettings` + `CORS_ORIGINS` | ✅ |
| Sprint actual | C1 | `main.py` CORS seguro + `RequestIDMiddleware` | ✅ |
| Sprint actual | C3+C4 | `services/image_storage.py` magic bytes + anti-traversal | ✅ |
| Sprint actual | C5 | `backend/app/tests/test_security.py` | ✅ |
| Sprint actual | F1 | `core/logging.py` JSON + correlation filter | ✅ |
| Sprint actual | F2 | `/health` + `/readyz` en `routes_health.py` | ✅ |
| Sprint actual | B2 | `pyproject.toml` extras `ml`/`eval` + tool config | ✅ |
| Sprint actual | A1 | `.github/workflows/ci.yml` | ✅ |
| Sprint actual | A2/A3 | `Dockerfile.cpu` + `.dockerignore` | ✅ |
| Sprint actual | A4 | `docker-compose.yml` | ✅ |
| Sprint actual | E3 | `docs/configuration.md` + `.env.example` | ✅ |
| Sprint actual | B1 | Eliminar `app/` legacy raíz | ⏳ Pendiente |
| Sprint actual | D1/D2 | Vitest frontend + step en CI | ⏳ Pendiente |
| Sprint actual | D3 | `black` + `ruff` aplicados al árbol | ⏳ Pendiente |
| Sprint actual | E1/E2 | `ROADMAP.md` Fase 6+ + README estructura | ⏳ Pendiente |

## 8. Próximos sprints (out of scope pero anotado)

- Migración efectiva a **PostgreSQL + almacenamiento objetual** (Fase 5).
- Cola de inferencia para modelos pesados (RQ/Celery + Redis).
- Benchmark real reproducible en CI sobre dataset reducido.
- Internacionalización del frontend y accesibilidad (WCAG AA).