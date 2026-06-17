# mushroom-photo-id / VisionSetil

MVP serio y seguro para identificación orientativa de setas desde fotos. La app sigue un enfoque conservador inspirado en patrones chinos de mini-programa ligero: flujo guiado, backend simple, clasificador visual sustituible, colección personal, explicación educativa y avisos fuertes para especies venenosas.

Nunca usa lenguaje de consumo seguro. La salida siempre es orientativa y recomienda validación humana experta.

---

## Características de la Fase 2

1.  **Carga de Modelos Reales y Fallbacks:** Soporte para carga real de pesos de YOLOE-26, DINOv3 y SigLIP 2 con transiciones y degradaciones limpias si faltan dependencias o archivos locales.
2.  **Crops y Máscaras Reales:** Detección de bboxes de setas y recortado real guardando archivos en disco y actualizando en base de datos.
3.  **Caché de Características:** `EmbeddingCache` basado en SQLite para evitar recomputaciones costosas.
4.  **Open-Set Rejection:** Capa de abstención y degradación (a género o desconocido) en caso de baja confianza, bajo margen, ausencia de vistas críticas, o sospechas de géneros mortales.
5.  **Flujo Operativo de Revisión Humana:** Endpoints de creación y resolución de revisiones por parte de un micólogo experto que anula e introduce taxones verificados en la respuesta clasificada (bajo estricto control de seguridad que bloquea aserciones de consumo seguro).
6.  **Infraestructura de Evaluación y Auditoría (Fase 3):** Herramientas para ejecutar evaluaciones cuantitativas reproducibles en datasets de prueba, auditar violaciones de seguridad del API y generar reportes automatizados de precisión, abstención y latencia.
7.  **Benchmark de Modelos Reales y Validación Biológica (Fase 4):** Soporte para datasets de validación locales etiquetados por expertos (`eval/real_data`), cálculo de métricas taxonómicas avanzadas (especie, género, familia, nivel de riesgo), calibración de confianza (Expected Calibration Error) con detección de sobreconfianza, evaluación operativa del detector (YOLOE) y embeddings (DINOv3/SigLIP 2), matrices de error en CSV, reportes analíticos completos y un framework automatizado de evaluación de preparación para producción (`Production Readiness Assessment`).

---

## Estructura

```txt
backend/
  app/
    api/              # Controladores y rutas HTTP (incluye routes_human_review.py)
    core/             # Configuración, logging y seguridad
    db/               # Base de datos ORM SQLAlchemy y esquemas Pydantic
    ml/               # Definición de interfaces y fallbacks mock
    services/         # Servicios de negocio, modelos ML, caché y open-set
  requirements.txt
  README.md
frontend/
  src/
  package.json
  README.md
eval/
  real_data/          # Dataset local de validación real (imágenes y etiquetas)
  reports/            # Salidas y matrices de confusión del benchmark
  scripts/            # Scripts de ejecución de evaluación y calibración
docs/
```

## Backend (Desarrollo)

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r backend/requirements.txt
# Opcional: instalar librerías de Deep Learning para modelos reales:
pip install torch torchvision transformers ultralytics Pillow
uvicorn app.main:app --reload
```

## Tests

```bash
python -m pytest backend/app/tests
```

## Documentación Detallada

*   [docs/real_model_loading.md](./docs/real_model_loading.md)
*   [docs/real_model_loading.md](./docs/real_model_loading.md)
*   [docs/open_set_rejection.md](./docs/open_set_rejection.md)
*   [docs/human_review_workflow.md](./docs/human_review_workflow.md)
*   [docs/evaluation_strategy.md](./docs/evaluation_strategy.md)
*   [docs/real_benchmark_strategy.md](./docs/real_benchmark_strategy.md)
*   [docs/production_readiness.md](./docs/production_readiness.md)
*   [docs/large_public_dataset_benchmark.md](./docs/large_public_dataset_benchmark.md)
*   [docs/kaggle_benchmark.md](./docs/kaggle_benchmark.md)
*   [docs/product_spec.md](./docs/product_spec.md)
*   [docs/model_architecture.md](./docs/model_architecture.md)
*   [docs/safety_policy.md](./docs/safety_policy.md)
