# MEGA PROMPT — VisionSetil Hardening Industrial

> Actúa como un **Principal Engineer + Security & Safety Lead + MLOps + Frontend Lead**.
>
> Objetivo: llevar VisionSetil a un estado **industrial, fiable y production-grade** sin romper la política de seguridad de producto. Delega en 6 subagentes con skills concretas. Todo cambio debe ser reproducible, testeado y auditable.

---

## 0. CONTEXTO REAL DEL REPOSITORIO (commit `dcdff6f`)

```txt
Producto: VisionSetil — identificación orientativa de setas con safety layer estricta.
Stack backend:  FastAPI + SQLAlchemy + SQLite en backend/app/ (64 archivos, ~5.604 líneas).
Stack frontend: React 18 + Vite 5 (6 componentes, sin tests).
Benchmark:      módulos eval/ y kaggle/ (FungiCLEF/FungiTastic, dataset real).
Fases:          1 (mock) → 2 (modelos reales YOLOE/DINOv3/SigLIP2) → 3-4 (eval+human review) → 5-6 (production readiness, Kaggle).
Calidad:        código limpio, sin TODO/FIXME; safety layer conservadora y coherente.
Deuda:          infraestructura de entrega + consistencia del repo (no lógica de negocio).
```

### Hallazgos de la auditoría (evidencia)

```txt
P1.1 CORS inseguro:        backend/app/main.py usa allow_origins=["*"] + allow_credentials=True.
P1.2 Deps ML no declaradas: torch/ultralytics/transformers/PIL importados lazy, fuera de requirements.
P1.3 Backend duplicado:    app/ (raíz, legacy Fase 1) + backend/app/ (activo). pyproject confirma backend/app.
P2.4 Sin CI/CD:            no existe .github/workflows.
P2.5 Sin contenerización:  no Dockerfile / docker-compose / .dockerignore / .env.example.
P2.6 Sin lockfiles:        ni requirements.lock ni package-lock.json.
P2.7 Config sin tipar:     core/config.py usa BaseModel + os.getenv manual en vez de pydantic-settings.
P3.8 Docs desincronizadas: ROADMAP termina en Fase 5 (hay Fase 6); README vs TECHNICAL discrepan.
P3.9 Sin tests frontend:   Vitest no declarado.
P3.10 Sin lint gate:       ruff/black como dev deps pero no aplicados automáticamente.
P3.11 Sin observabilidad:  logging simple, sin /readyz diferenciado.
```

---

## 1. OBJETIVO PRINCIPAL INDUSTRIAL

Convertir VisionSetil en una aplicación **fiable, reproducible y observable**, capaz de pasar un checklist de producción:

```txt
- main protegido por CI verde obligatorio (lint + type + tests + build).
- builds 100% reproducibles (lockfiles + contenedores deterministas).
- seguridad verificable (CORS, secrets, upload validation, path traversal).
- observabilidad mínima (logs estructurados, health vs readiness, request-id).
- cero regresiones en la Safety Policy de producto.
- documentación como fuente única de verdad (settings, roadmap, estructura).
```

**No se añaden features de producto.** Esto es hardening industrial.

---

## 2. CRITERIOS DE ACEPTACIÓN GLOBALES (DoD)

El sprint solo se completa si TODOS estos puntos se cumplen:

```txt
[ ] CI verde en main: ruff + black --check + mypy(baseline) + pytest backend + build frontend + test frontend.
[ ] CORS configurable; allow_origins=["*"] eliminado; * nunca combinado con allow_credentials.
[ ] backend/app es el ÚNICO backend; app/ raíz eliminado (o reexport shim documentado).
[ ] pip install -e .[ml] instala todo lo que el código importa (torch/ultralytics/transformers/PIL).
[ ] pip install -e .[eval] instala scikit-learn/pandas si eval los usa.
[ ] docker build && docker compose up levantan el API en :8000 sin pasos manuales extra.
[ ] .env.example documenta TODOS los settings de core/config.py (15+ variables).
[ ] core/config.py migrado a pydantic-settings.BaseSettings con env_prefix/env_file.
[ ] requirements.lock / uv.lock y frontend/package-lock.json commiteados.
[ ] logs en JSON cuando LOG_FORMAT=json; request-id propagado.
[ ] /health (liveness) y /readyz (readiness: DB + modelos cargados) diferenciados.
[ ] ROADMAP.md, README.md y TECHNICAL.md coherentes con el árbol real.
[ ] docs/configuration.md lista todos los settings con tipo, default y propósito.
[ ] Tests de seguridad (CORS, path traversal) y de frontend (Vitest) añadidos y verdes.
[ ] Tests de safety existentes (test_safety_layer.py, test_classification_safety.py) siguen en verde.
```

---

## 3. NO CONSIDERAR VÁLIDO (falla fuerte y explícita)

```txt
- Cualquier build/CI rojo en main.
- allow_origins=["*"] persistente en cualquier rama mergeada.
- app/ raíz y backend/app/ coexistiendo tras el sprint.
- Dependencias importadas en código pero ausentes de pyproject/requirements.
- docker build que requiere pasos manuales no documentados.
- Cambios que relajen la Safety Layer o permitan frases de consumo seguro.
- Mentir sobre modelos real/compatible (regla heredada de PROMPT.md sección 16).
- Logs que filtran datos sensibles (paths absolutos, tokens, PII).
- .env real commiteado (solo .env.example).
```

---

## 4. DELEGACIÓN A SUBAGENTES

Cada subagent opera en su dominio. Paralelizables salvo dependencias indicadas. Todos respetan la **sección 16 (NO HACER)** y la **Safety Policy**.

---

### 🛰️ SUBAGENT A — DevOps / Infra (dueño: P2.4, P2.5, P2.6)

**Rol**: `Platform Engineer`. **Skills**: GitHub Actions, Docker multi-stage, `uv`/pip-tools, `actions/cache`, `setup-python`, npm lockfiles.

**Tareas**

- **A1 — CI obligatorio** `.github/workflows/ci.yml`:
  - Matrix Python 3.11/3.12.
  - Job `backend`: `pip install -e .[dev]` → `ruff check` → `black --check` → `mypy backend/app` (non-blocking baseline) → `pytest backend/app/tests -q`.
  - Job `frontend`: `npm ci` → `npm run lint` → `npm run build` → `npm test` (tras subagent D).
  - Job `security`: `pip audit` o `gh dependency-review-action` en PRs.
  - Gates: bloquear merge si `backend` o `security` fallan. `mypy` inicialmente `continue-on-error: true`.
  - Caché: `actions/setup-python` con `cache: pip` + `actions/cache` para `~/.cache/pip` y `frontend/node_modules`.

- **A2 — Dockerfile multi-stage determinista**:
  - Stage `builder`: Python 3.12-slim, instala `.[dev]`, compila.
  - Stage `runtime`: slim, copia solo artefactos, usuario **no-root**, `HEALTHCHECK` contra `/health`.
  - Soporte de `.[ml]` vía `BUILD_ARG=EXTRA=ml` para imagen GPU opcional.

- **A3 — `.dockerignore`** (excluye `.git`, `__pycache__`, `node_modules`, `uploads`, `*.db`, `.venv`, `eval/reports`).

- **A4 — `docker-compose.yml`** + `docker-compose.override.yml` (dev con reload y volumen `uploads`). Servicio `api` exponiendo `:8000`.

- **A5 — Lockfiles reproducibles**:
  - Backend: `pip-compile` → `requirements.lock` (o migrar a `uv` con `uv.lock`). Mantener `requirements.txt` como thin alias.
  - Frontend: `npm install` → commitear `package-lock.json`.

- **A6 — Badges de CI y docs de despliegue** en `README.md` + `docs/deployment_notes.md` actualizado con build/run Docker.

**Aceptación**: push a `main` ejecuta CI verde; `docker compose up` levanta API en `:8000` con `/health` 200; `requirements.lock` reproduce el entorno.
**Dependencias**: ninguna (empieza ya). D1/D2 (frontend tests) se enganchan a A1.

---

### 🧹 SUBAGENT B — Higiene de build y código legacy (dueño: P1.3, P1.2)

**Rol**: `Tech Lead / Build Engineer`. **Skills**: empaquetado Python (`pyproject.toml`, PEP 621), refactor seguro, búsqueda de referencias.

**Tareas**

- **B1 — Eliminar backend legacy `app/` raíz**:
  - Buscar referencias: `from app.routers`, `from app.services`, `uvicorn app.main:app`, imports en `tests/`, scripts y notebooks (`kaggle/`, `eval/`).
  - Si nada lo usa → borrar `app/` raíz. Si un runner externo lo referencia → mantener **solo** `app/__init__.py` como shim con `warnings.warn("use backend.app", DeprecationWarning)` y documentar.
  - Commit separado y aislado para revert fácil.

- **B2 — Declarar dependencias como extras en `pyproject.toml`**:
  ```toml
  [project.optional-dependencies]
  ml = ["torch>=2.2", "torchvision>=0.17", "transformers>=4.40", "ultralytics>=8.2", "Pillow>=10.3"]
  eval = ["scikit-learn>=1.4", "pandas>=2.2"]
  all = ["mushroom-photo-id[ml,eval]"]
  ```
  - `backend/requirements.txt` pasa a `pip install -e .[dev,ml]` o se genera vía lock.

- **B3 — Sincronizar `README.md`** (secciones *Estructura* y *Backend (Desarrollo)*) y `docs/TECHNICAL.md` con el árbol real `backend/app/{api,core,db,ml,services}`.

- **B4 — Arreglar enlace duplicado** a `real_model_loading.md` en README y verificar todos los enlaces a `docs/*.md` existen.

**Aceptación**: `python -c "import app"` solo resuelve a `backend/app`; `pip install -e .[ml]` instala lo que el código importa; docs reflejan el árbol real.
**Dependencias**: coordinar con C1 (rutas/main) para no pisarse.

---

### 🔒 SUBAGENT C — Endurecimiento de seguridad (dueño: P1.1, P2.7)

**Rol**: `Application Security Engineer`. **Skills**: pydantic-settings, OWASP, FastAPI middleware, validación de ficheros.

**Tareas**

- **C1 — CORS configurable y seguro** (`core/config.py` + `main.py`):
  ```python
  cors_origins: list[str] = []  # default vacío = deniega todo salvo same-origin
  ```
  - En `main.py`: si `settings.cors_origins` incluye `"*"` → forzar `allow_credentials=False`. Log de warning.

- **C2 — Migrar `core/config.py` a `pydantic-settings.BaseSettings`**:
  - `env_prefix=""` (mantener nombres actuales de env vars), `env_file=".env"`, `model_config=SettingsConfigDict(env_file=".env", extra="ignore")`.
  - Conservar defaults exactos para no romper despliegues.
  - Añadir tests que comparen dump antes/después de la migración.

- **C3 — Validación de subida reforzada** (`routes_images.py` / `image_storage.py`):
  - Límite de tamaño global vía middleware/starlette `body` limit.
  - Verificación de **magic bytes** (no solo extensión) con `python-magic` o firma embebida ligera.
  - Sanitizar nombres de archivo: usar `uuid` + extensión validada; nunca confiar en `Path(path).name` para construir rutas.

- **C4 — Anti path traversal** (`yoloe_detector.py` / `image_storage.py`):
  - `obs_id_str` debe provenir de un **entero validado**, no de `filename.split('-')[0]`.
  - Asegurar que las rutas generadas están confinadas a `settings.upload_dir` (comprobar `Path.resolve().is_relative_to(upload_dir)`).

- **C5 — Tests de seguridad (regresión)**:
  ```txt
  test_cors_rejects_unknown_origin
  test_cors_never_combines_wildcard_with_credentials
  test_config_loads_from_env_via_basesettings
  test_upload_rejects_invalid_magic_bytes
  test_upload_rejects_oversized_body
  test_obs_path_confined_to_upload_dir
  test_safety_layer_regression_unchanged      # snapshot de la policy
  ```

**Aceptación**: tests de seguridad verdes; `config.py` carga vía `BaseSettings`; CORS rechaza orígenes no listados.
**Dependencias**: tras C2, Subagent A genera `.env.example`; E3 documenta settings.

---

### 🧪 SUBAGENT D — Cobertura de tests y calidad (dueño: P3.9, P3.10)

**Rol**: `QA / Tooling Engineer`. **Skills**: Vitest, @testing-library/react, ruff, black, mypy, coverage.

**Tareas**

- **D1 — Vitest en frontend** (`frontend/`):
  - `npm i -D vitest @testing-library/react @testing-library/jest-dom jsdom`.
  - `vite.config.js` con `test: { environment: 'jsdom', globals: true }`.
  - Test mínimo: `ResultScreen.jsx` renderiza la advertencia obligatoria; `ImageUploader` rechaza tipos no permitidos.

- **D2 — Enganchar `npm test` al CI** (subagent A1, job `frontend`).

- **D3 — Lint/format gate** en `pyproject.toml`:
  ```toml
  [tool.ruff]
  line-length = 100
  target-version = "py311"
  [tool.ruff.lint]
  select = ["E","F","I","UP","B","SIM","S"]
  ignore = ["S101"]  # asserts en tests
  [tool.black]
  line-length = 100
  ```
  - Ejecutar `black .` + `ruff check --fix` para alinear el código existente en un commit aislado.

- **D4 — `mypy` baseline** (`mypy.ini` o `[tool.mypy]`): `strict_optional = True`, `ignore_missing_imports = True` para torch/ultralytics. Non-blocking en CI primero.

- **D5 — Coverage mínimo** (opcional, `pytest-cov`) con umbral bajo inicial y meta de subida progresiva.

**Aceptación**: `npm test` verde en CI; `ruff`/`black` sin cambios pendientes; mypy baseline establecido.
**Dependencias**: tras A1 (para añadir los pasos al CI).

---

### 📚 SUBAGENT E — Documentación y roadmap (dueño: P3.8)

**Rol**: `Technical Writer`. **Skills**: Markdown, single-source-of-truth, link checking.

**Tareas**

- **E1 — Actualizar `docs/ROADMAP.md`**: añadir **Fase 6** (Kaggle/real benchmark, ya existente en commits) y **Fase 7 propuesta** (producción controlada: Postgres, cola de inferencia, observabilidad, object storage).

- **E2 — Reescribir sección *Estructura* de `README.md`** para reflejar `backend/app`, `frontend`, `eval`, `kaggle`, `docs`.

- **E3 — Crear `docs/configuration.md`**: tabla con **todos** los settings de `config.py` (nombre, tipo, default, env var, propósito). Fuente única de verdad para `.env.example`.

- **E4 — Link check**: script o paso CI que verifique que todos los enlaces internos a `docs/*.md` existen (p. ej. `lychee` o un script Python ligero). Arreglar el duplicado de `real_model_loading.md`.

- **E5 — `.env.example`** generado a partir de E3 (coordinado con A).

**Aceptación**: ROADMAP con Fase 6+; cero enlaces rotos; `configuration.md` cuadra con `config.py`.
**Dependencias**: tras C2 (settings finales) y B1 (estructura final).

---

### 📈 SUBAGENT F — Observabilidad y productización (dueño: P3.11, prepara Fase 5)

**Rol**: `SRE`. **Skills**: logging estructurado, FastAPI middleware, health checks, SQLAlchemy dialects.

**Tareas**

- **F1 — Logs estructurados** (`core/logging.py`):
  - `LOG_FORMAT=json|text` (JSON en prod), `LOG_LEVEL` configurable.
  - Middleware de **request-id** (header `X-Request-ID` propagado a logs y respuestas).
  - Sanitización: no loguear tokens, paths absolutos innecesarios, ni PII.

- **F2 — `/health` vs `/readyz`** (`routes_health.py`):
  - `/health` = liveness (proceso vivo).
  - `/readyz` = readiness (DB responde + estado de modelos cargados real/mock).
  - Documentar diferencia en `docs/deployment_notes.md`.

- **F3 — Doc migración SQLite → PostgreSQL** (`docs/migration_postgres.md`): `DATABASE_URL`, dialecto SQLAlchemy, `seed` idempotente, backup/restore.

- **F4 — Doc almacenamiento objetual** (`docs/object_storage.md`): estrategia S3/MinIO para `uploads/` (interfaz `StorageBackend`, local vs S3), con vistas a Fase 5.

**Aceptación**: logs JSON cuando `LOG_FORMAT=json`; `/readyz` refleja dependencias; docs de migración presentes.
**Dependencias**: tras C2 (settings).

---

## 5. SKILLS TRANSVERSALES OBLIGATORIAS

Todos los subagentes aplican:

```txt
- Commits atómicos y con conventional commits (feat:, fix:, chore:, docs:, refactor:, ci:).
- Un PR por subagent (o agrupación lógica); CI debe pasar antes de merge.
- Sin secrets en el repo; .env solo como .env.example.
- Regresión cero en safety: test_safety_layer.py y test_classification_safety.py son gate obligatorio.
- No mentir sobre modelos real/compatible (heredado de PROMPT.md).
- Documentar cualquier decisión no trivial en docs/ o en el PR.
```

---

## 6. TESTS OBLIGATORIOS GLOBALES

```txt
# Seguridad (Subagent C)
test_cors_rejects_unknown_origin
test_cors_never_combines_wildcard_with_credentials
test_config_loads_from_env_via_basesettings
test_upload_rejects_invalid_magic_bytes
test_upload_rejects_oversized_body
test_obs_path_confined_to_upload_dir

# Calidad (Subagent D)
frontend/test_result_screen_renders_warning.jsx
frontend/test_image_uploader_rejects_bad_types.jsx
test_ruff_clean
test_black_clean

# Observabilidad (Subagent F)
test_health_live_endpoint
test_readyz_reports_db_and_models
test_logs_json_format_when_configured
test_request_id_propagated

# Regresión safety (intocable)
test_safety_layer_regression_unchanged
test_classification_safety_regression
```

---

## 7. NO HACER (reglas duras)

```txt
- No relajes la Safety Layer. No permitas frases de consumo seguro.
- No combines allow_origins=["*"] con allow_credentials=True.
- No borres app/ raíz sin confirmar que nada lo importa.
- No declares un modelo como real si es compatible/mock (PROMPT.md §16).
- No commitees .env real, ni tokens, ni claves.
- No ignores Safety Violations Count > 0 si se ejecutan benchmarks.
- No introduzcas dependencias sin declararlas en pyproject/requirements.
- No dejes CI rojo en main.
- No loguees datos sensibles.
- No añadas features de producto nuevas en este sprint.
```

---

## 8. ORDEN DE TRABAJO (grafo de dependencias)

```txt
1. A1 (CI) + C1/C2 (CORS + BaseSettings)        → paralelos, sin bloqueos
2. B1 (eliminar app/ legacy)                    → tras búsqueda de refs
3. A2/A3/A4 (Docker) + B2 (extras deps)         → tras 1
4. A5 (lockfiles)                                → tras B2
5. D1/D2/D3/D4 (tests frontend + lint gate)     → tras A1
6. C3/C4/C5 (upload + traversal + tests)        → tras C2
7. E1/E2/E3/E4/E5 (docs + .env.example)         → tras B1 + C2
8. F1/F2 (logs + readyz)                         → tras C2
9. F3/F4 (docs Postgres/S3)                      → tras F2
10. DoD global check + smoke test Docker         → cierre
```

---

## 9. RESULTADO ESPERADO (cierre)

```txt
Infraestructura:
- CI verde en main (lint + type baseline + tests backend + build/test frontend + security scan).
- docker build && docker compose up OK en :8000.
- requirements.lock + package-lock.json reproducibles.

Seguridad:
- CORS configurable; * nunca con credentials.
- config.py vía pydantic-settings; .env.example completo.
- Upload validado por magic bytes + tamaño; paths confinados a upload_dir.

Estructura:
- backend/app ÚNICO backend; app/ raíz eliminado.
- pip install -e .[ml] / .[eval] funcional.

Calidad:
- Vitest en frontend; ruff/black limpios; mypy baseline.
- Tests de seguridad y de frontend verdes.

Docs:
- ROADMAP con Fase 6+7; README/TECHNICAL coherentes.
- docs/configuration.md fuente única de settings.

Observabilidad:
- Logs JSON a demanda; request-id propagado.
- /health (live) + /readyz (ready: DB + modelos).

Safety:
- Política de producto INTACTA (regresión cero).
- test_safety_layer.py y test_classification_safety.py verdes.

Conclusión:
- VisionSetil pasa de MVP maduro a candidato industrial fiable y reproducible.
- Pendiente (out of scope): Postgres real, object storage real, cola de inferencia (Fase 7).