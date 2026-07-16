# ⚠️ VisionSetil — Reglas del Sistema

> **Constitución para Loop Engineering.** Reglas no negociables que gobiernan todo desarrollo, despliegue y operación del sistema.

---

## 🔴 REGLAS DURAS (Hard Rules — Inviolables)

> Estas 7 reglas aplican a **todo sprint, todo commit, todo deployment**. No hay excepciones.

### R1. Safety Policy Intacta
La `docs/SAFETY_POLICY.md` es ley. **Nunca** modificar, relajar ni omitir ninguna regla de seguridad sin aprobación explícita del producto owner.

- ❌ **Prohibido**: lenguaje "safe to eat", "comestible", "edible"
- ✅ **Obligatorio**: toda salida es `orientation_only` + `unsafe_to_consume`
- ✅ **Obligatorio**: especies mortales SIEMPRE flaggeadas con advertencia crítica

**Verificación**: `backend/app/tests/test_classification_safety.py` debe pasar siempre.

---

### R2. Anti-Leak por `observation_id`
Ninguna observación puede aparecer en dos splits (train/val/test). El split se hace **estrictamente por `observation_id`**.

- ✅ **Obligatorio**: `GroupKFold` o `train_test_split` sobre observaciones únicas
- ✅ **Obligatorio**: asserts de no-intersección: `train ∩ val = ∅`
- ❌ **Prohibido**: split aleatorio por imagen (causa data leak)

**Verificación**: `kaggle/anti_leak_splitter.py` + asserts en Cell 7 del notebook.

---

### R3. No Mocks en Producción
El código de producción **nunca** debe usar mocks, datos sintéticos o placeholders para inferencia.

- ❌ **Prohibido**: `mock_model`, `fake_data`, `random_predictions` en código de prod
- ✅ **Permitido**: mocks **solo** en tests (`backend/app/tests/`)
- ✅ **Permitido**: synthetic data **solo** si no hay dataset real (con warning explícito)

**Verificación**: grep de `mock|fake|dummy|placeholder` en `backend/app/` (excluyendo tests).

---

### R4. No Datasets Sintéticos para Evaluación
Las métricas reportadas deben ser sobre **datos reales** (FungiCLEF, FungiTastic, observaciones reales).

- ❌ **Prohibido**: reportar métricas sobre `torch.randn()` o datos generados
- ✅ **Obligatorio**: si no hay datos, declarar "smoke test" explícitamente

**Verificación**: `eval/scripts/compute_full_metrics.py` debe cargar datos reales.

---

### R5. Reproducibilidad con Config JSON
Todo entrenamiento debe ser **100% reproducible** desde un archivo de configuración versionado.

- ✅ **Obligatorio**: config en `kaggle/configs/mega_training_v*.json`
- ✅ **Obligatorio**: `seed`, `backbone`, `epochs`, `lr`, `batch_size` en config
- ✅ **Obligatorio**: export de `training_history.json` con todos los hiperparámetros
- ❌ **Prohibido**: hardcoded hyperparameters en el notebook sin config

**Verificación**: reproducir run con config debe dar mismos resultados (±epsilon).

---

### R6. IC 95% Obligatorio en Métricas
Toda métrica reportada (MAP@3, F1, accuracy) debe incluir **intervalo de confianza al 95%**.

- ✅ **Obligatorio**: bootstrap con 1000 iteraciones
- ✅ **Formato**: `MAP@3 = 0.XXX [CI 95%: 0.XXX, 0.XXX]`
- ❌ **Prohibido**: reportar un solo número sin incertidumbre

**Verificación**: Cell 21 del notebook computa IC 95% con bootstrap.

---

### R7. Safety Recall Deadly = 100%
El recall de especies mortales (deadly) debe ser **exactamente 100%**.

- ✅ **Obligatorio**: toda seta mortal en el test set debe ser detectada
- ✅ **Obligatorio**: si no se alcanza 100%, el modelo **no se despliega**
- ✅ **Trade-off aceptable**: sacrificar precisión general para mantener recall deadly = 100%

**Verificación**: `test_classification_safety.py` valida deadly recall.

---

## 🟡 REGLAS DE DESARROLLO (Development Rules)

### D1. Test-First para Safety-Critical
Todo cambio que toque safety, clasificación o inferencia debe incluir o actualizar tests.

```
backend/app/tests/
├── test_classification_safety.py   ← Safety policy
├── test_classification_pipeline.py ← Pipeline end-to-end
├── test_multi_view_pipeline.py     ← Multi-view inference
├── test_security.py                ← Auth + headers
├── test_validation.py              ← Input validation
└── test_image_upload.py            ← File upload safety
```

### D2. Linting Obligatorio
- Backend: `ruff check` + `black --check` deben pasar
- Frontend: `npm run lint` (ESLint) debe pasar
- CI falla si lint falla

### D3. Commits Atómicos
- Un commit = un cambio lógico
- Mensaje en formato: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- Scope claro: `feat(backend): add drift detection endpoint`

### D4. No Breaking Changes sin Migración
- Cambios en DB models requieren migración (`init_db()` con schema check)
- Cambios en API contracts requieren versión (`/v2/classify`)
- Cambios en Pydantic schemas requieren backward compat

### D5. Documentación Sincronizada
- Todo nuevo endpoint → actualizar `ARCHITECTURE.md`
- Todo nuevo servicio → actualizar `ARCHITECTURE.md`
- Todo cambio de visión → actualizar `VISION.md`
- Todo bug fix crítico → registrar en `MEMORY.md`

---

## 🟢 REGLAS DE ML (ML Rules)

### M1. Model Versioning
- Todo modelo entrenado se guarda con: `model_v{N}_best.pt` + `metrics_v{N}.json`
- Versionado semántico: major (cambio arquitectura) · minor (nuevo dataset) · patch (retrain)
- `model_registry.py` carga la versión especificada en config

### M2. Evaluación Honesta
- **Nunca** evaluar en train set
- Métricas en **test set** (nunca visto por el modelo)
- Reportar todas las métricas: MAP@3, F1-macro, balanced accuracy, ECE
- Si hay overfitting, declararlo explícitamente

### M3. Progressive Resizing
- Entrenamiento por etapas: 224px → 384px → 512px
- Cambiar tamaño solo al inicio de epoch
- Rebuild DataLoader solo cuando cambia image_size (no cada epoch)

### M4. SWA (Stochastic Weight Averaging)
- SWA activado por defecto desde epoch 20
- `update_bn()` obligatorio antes de evaluar SWA model
- Guardar tanto `best.pt` como `swa.pt`

### M5. Anti-Catastrophic Forgetting
- LoRA adapters (rank=16) para no destruir pesos pre-entrenados
- Warmup de backbone (2 epochs frozen) antes de unfreeze
- Learning rate diferenciado: backbone (2e-5) vs head (3e-4)

---

## 🔵 REGLAS DE OPERACIÓN (Ops Rules)

### O1. Health Checks
- `/health` — liveness (proceso vivo)
- `/readyz` — readiness (modelos cargados, DB conectada)
- Docker healthcheck usa `/health`

### O2. Rate Limiting
- Endpoints de inferencia: rate limit por API key + IP
- Configurable via `RateLimitMiddleware`
- Redis-backed en prod, in-memory en dev

### O3. Logging Estructurado
- Todo log en formato JSON (structlog)
- Niveles: DEBUG (dev), INFO (prod), WARNING, ERROR
- Request ID propagado en toda la cadena de middleware

### O4. Graceful Degradation
- Si GPU no disponible → CPU mode (más lento pero funcional)
- Si modelo no cargado → fallback a "servicio no disponible" (no crash)
- Si Redis cae → fallback a in-memory cache

### O5. Secret Management
- `.env.example` con claves sin valores reales
- Secrets NUNCA en código ni en git
- `API_KEY`, `KAGGLE_KEY`, `DATABASE_URL` via environment variables

---

## 📋 CHECKLIST PRE-DEPLOY

Antes de todo deployment a producción:

- [ ] Todos los tests pasan (`pytest backend/app/tests/`)
- [ ] `test_classification_safety.py` pasa (deadly recall = 100%)
- [ ] Lint pasa (`ruff check`, `npm run lint`)
- [ ] No hay mocks en código de producción (grep verify)
- [ ] Config JSON versionada y reproducible
- [ ] Métricas con IC 95% reportadas
- [ ] `.env` no commiteado (verificar `.gitignore`)
- [ ] Docker images buildan sin error
- [ ] Health endpoints responden

---

## 🔗 Referencias

| Regla | Documento fuente |
|-------|-----------------|
| R1-R7 | `docs/KAGGLE_FIX_PROMPT.md` § "Reglas Duras" |
| Safety | `docs/SAFETY_POLICY.md` |
| Anti-leak | `kaggle/anti_leak_splitter.py` |
| Config | `kaggle/configs/mega_training_v5.json` |
| Tests | `backend/app/tests/` |

---

*Documento vivo. Actualizado por el Loop Engineering Agent.*