# Guía Completa de Ejecución en Kaggle — VisionSetil

Este documento describe detalladamente cómo interactuamos con los datasets de Kaggle y cómo se ejecutan, paso a paso, los comandos en la terminal para diagnosticar, indexar, evaluar y calibrar el sistema en producción.

---

## 1. Entornos y Datasets en Kaggle

Para evaluar VisionSetil a escala, dependemos de tres datasets principales alojados en Kaggle. Es fundamental entender sus ubicaciones físicas (`/kaggle/input/...`) y su estructura de metadatos antes de lanzar cualquier comando.

### A. FungiCLEF 2025 (`/kaggle/input/fungi-clef-2025`)

**Propósito:** Fine-grained identification a gran escala.

**Estructura clave:**
- `/images/`: Contiene miles de imágenes reales en formato JPEG organizadas en subcarpetas.
- `FungiTastic-FewShot-Train.csv`: Metadatos de entrenamiento/referencia. Contiene las columnas `observationId`, `species`, `genus`, `family`, `image_path` y datos de geolocalización.

> [!WARNING]
> **Regla Crítica:** No utilizar `FungiCLEF25-SAMPLE_SUBMISSION.csv` para la evaluación, ya que no incluye etiquetas verdaderas. El script `run_large_dataset_benchmark.py` aborta automáticamente si detecta este archivo como fuente principal.

### B. FungiTastic (`/kaggle/input/fungitastic`)

**Propósito:** Evaluación multimodal y de pocos ejemplos (Few-Shot). Contiene metadatos ecológicos detallados (hábitat, sustrato).

**Estructura:** Contiene archivos de metadatos `.csv` con mapeo explícito de especies y columnas ambientales para el cálculo de priors ecológicos.

### C. Danish Fungi 2020 — DF20 (`/kaggle/input/danish-fungi-2020`)

**Propósito:** Conjunto de datos histórico de alta fidelidad taxonómica validado por micólogos de Dinamarca.

**Estructura:** Archivo principal `DF20_metadata.csv` y estructura jerárquica de imágenes.

---

## 2. Validación Pre-Vuelo en la Terminal (STEP 0)

Antes de ejecutar cualquier pipeline de ML en Kaggle, es obligatorio realizar una validación estricta del hardware y la presencia de datos en la terminal para evitar ejecuciones fallidas en frío:

```bash
# 1. Validar hardware y drivers CUDA
nvidia-smi

# 2. Verificar disponibilidad de GPU en PyTorch
python - <<'PY'
import torch
print("CUDA Disponible:", torch.cuda.is_available())
print("Dispositivo:", torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU")
print("Versión de PyTorch:", torch.__version__)
PY

# 3. Comprobar la presencia física del dataset FungiCLEF 2025
find /kaggle/input -maxdepth 5 -type d | grep "fungi-clef-2025" || echo "ERROR: Dataset FungiCLEF 2025 no encontrado en /kaggle/input"
```

**Regla de Control:** Si `torch.cuda.is_available()` retorna `False`, la ejecución debe abortar con código de salida 1 en lugar de degradar a mock. El script `run_large_dataset_benchmark.py` valida esto automáticamente cuando `allow_mock_fallbacks: false` en la configuración.

---

## 3. Guía Completa de Ejecución en la Terminal (FASE 6)

El flujo de trabajo se divide en fases secuenciales que se controlan enteramente mediante scripts de consola. Cada script tiene flags específicos para controlar la ingesta, indexación y evaluación.

### Paso 1: Diagnóstico de Cobertura de Metadatos

Antes de construir índices, evaluamos la compatibilidad taxonómica entre las observaciones de prueba y el catálogo:

```bash
python eval/scripts/diagnose_catalog.py \
  --converted /kaggle/working/visionsetil_outputs/converted_fungiclef2025_observations.json \
  --catalog /kaggle/working/visionsetil_outputs/real_species_catalog.json \
  --output /kaggle/working/visionsetil_outputs/catalog_diagnostics.json
```

**Salidas generadas:**
- `catalog_diagnostics.json`: Métricas de cobertura (species, genus, family)
- `catalog_diagnostics.md`: Reporte legible con tablas de taxa faltantes

**Validaciones automáticas:**
- Aborta si la cobertura de especies es < 10%
- Aborta si la cobertura de géneros es < 30%
- Reporta taxa y géneros faltantes únicos

### Paso 2: Construcción del Índice de Referencia (Sin Leakage)

Extrae los embeddings visuales (DINOv3/SigLIP 2) y de texto de la partición de referencia (80% de los datos) y genera los prototipos de especie, género y familia:

```bash
python eval/scripts/build_species_index.py \
  --dataset-root /kaggle/input/fungi-clef-2025 \
  --converted /kaggle/working/visionsetil_outputs/converted_fungiclef2025_observations.json \
  --output-dir /kaggle/working/visionsetil_outputs/species_index \
  --split reference \
  --models yoloe,dinov3,siglip2 \
  --device cuda
```

> [!NOTE]
> El script excluye automáticamente las imágenes que pertenezcan al conjunto de test (eval_split) para prevenir filtrado de datos (leakage). Si no se proporciona un archivo de IDs de test explícito, usa un split determinista 80/20 basado en hash.

**Salidas generadas:**
- `species_visual_prototypes.json`: Prototipos de especie con embeddings DINOv3 + SigLIP2
- `genus_prototypes.json`: Prototipos de género (promedio de especies)
- `family_prototypes.json`: Prototipos de familia
- `index_metadata.json`: Metadatos con información de leakage prevention

**Validaciones automáticas:**
- Aborta si todos los modelos están en modo mock/fallback
- Verifica que ninguna observación de test contribuyó a los prototipos
- Reporta el número de observaciones excluidas

### Paso 3: Lanzamiento del Benchmark Incremental

Ejecutamos el benchmark escalando la carga de trabajo de forma progresiva utilizando el ranker multimodal optimizado por similitud de coseno:

```bash
# A. Smoke Test (50 casos) para verificar que el pipeline corre sin crashes
python kaggle/run_large_dataset_benchmark.py \
  --config kaggle/configs/fungiclef2025_1000_real_models_config.json \
  --max-cases 50 \
  --ranker candidate_ranker_v2 \
  --open-set-calibrated false

# B. Evaluación Intermedia (200 casos)
python kaggle/run_large_dataset_benchmark.py \
  --config kaggle/configs/fungiclef2025_1000_real_models_config.json \
  --max-cases 200 \
  --ranker candidate_ranker_v2

# C. Benchmark Completo (1000 casos)
python kaggle/run_large_dataset_benchmark.py \
  --config kaggle/configs/fungiclef2025_1000_real_models_config.json \
  --max-cases 1000 \
  --ranker candidate_ranker_v2
```

**Validaciones automáticas del benchmark:**
- Aborta si `Unique Species <= 1` o `Unique Genera <= 1`
- Aborta si se detecta uso de `SAMPLE_SUBMISSION.csv`
- Aborta si hay violaciones de seguridad (`safety_policy_violations > 0`)
- Aborta si la mayoría de casos no tienen `expected_taxon` o `expected_genus`
- Advierte si se ejecutan 1000+ casos sin modelos embedder reales

**Salidas generadas en `/kaggle/working/visionsetil_outputs/`:**
- `real_report.json` y `real_report.md`: Precisión taxonómica y métricas de seguridad
- `large_dataset_summary.json` y `large_dataset_summary.md`: Resumen ejecutivo
- `model_status.json`: Estado de los modelos cargados
- `confusion_species.csv`, `confusion_genus.csv`, `confusion_risk_level.csv`: Matrices de confusión
- `failure_cases.json`: Casos fallidos
- `dangerous_failures.json`: Fallos críticos con géneros peligrosos
- `overconfident_wrong_cases.json`: Predicciones erróneas con alta confianza
- `safety_debug_violations.json`: Violaciones de seguridad detectadas

### Paso 4: Estudio de Ablación de Embeddings

Analiza el impacto relativo de usar solo DINO, solo SigLIP, o la fusión de ambos:

```bash
python eval/scripts/run_ablation.py \
  --report /kaggle/working/visionsetil_outputs/real_report.json \
  --output /kaggle/working/visionsetil_outputs/ablation_report.json
```

**Configuraciones evaluadas:**
| Configuración | Descripción |
|---|---|
| `fusion_dinov3_siglip2_metadata` | Baseline: fusión completa |
| `dinov3_only` | Solo DINOv3 (SigLIP removido) |
| `siglip2_only` | Solo SigLIP2 (DINOv3 removido) |
| `metadata_only` | Solo metadatos (embeddings visuales removidos) |

**Salidas generadas:**
- `ablation_report.json`: Métricas detalladas por configuración
- `ablation_report.md`: Reporte con tablas comparativas y análisis

### Paso 5: Calibración Real de Open-Set (Percentiles Reales)

Calcula las distribuciones de similitud del coseno de los casos correctos vs incorrectos y genera thresholds dinámicos para evitar que el 100% de los casos se envíe a revisión humana:

```bash
python eval/scripts/calibrate_open_set.py \
  --predictions /kaggle/working/visionsetil_outputs/real_report.json \
  --output /kaggle/working/visionsetil_outputs/open_set_thresholds.json
```

**Parámetros de calibración:**
- `--target-rejection-rate`: Tasa de rechazo objetivo (default: 15%)
- `--min-threshold`: Threshold mínimo (default: 0.25)
- `--max-threshold`: Threshold máximo (default: 0.50)

**Métricas calculadas:**
- Percentiles de predicciones correctas (P5, P10, P25, mediana)
- Percentiles de predicciones incorrectas (mediana, P75, P90)
- Tasa de rechazo falsos positivos (correctos rechazados)
- Tasa de rechazo verdaderos positivos (incorrectos rechazados)
- Precisión por bin de confianza

**Salidas generadas:**
- `open_set_thresholds.json`: Thresholds calibrados finales
- `open_set_thresholds.md`: Reporte con análisis de percentiles

### Paso 6: Re-evaluación con Capa Open-Set Calibrada

```bash
python kaggle/run_large_dataset_benchmark.py \
  --config kaggle/configs/fungiclef2025_1000_real_models_config.json \
  --max-cases 1000 \
  --ranker candidate_ranker_v2 \
  --open-set-thresholds /kaggle/working/visionsetil_outputs/open_set_thresholds.json
```

Esta re-evaluación aplica los thresholds dinámicos calibrados en el Paso 5, permitiendo que el sistema rechace observaciones inciertas de forma inteligente en lugar de enviar todo a revisión humana.

---

## 4. Descarga e Integración de Reportes en la Terminal Local

Una vez que el kernel de Kaggle finaliza con estado `COMPLETE`, procedemos a descargar los reportes de rendimiento a nuestro entorno local mediante la API de Kaggle.

Dado que la descarga por defecto puede omitir archivos si hay miles de crops intermedios generados, ejecutamos el script especializado que realiza paginación y filtrado por patrón de nombres:

```bash
# Ejecutar desde el root del repositorio local
python eval/scripts/download_reports.py
```

Este script descargará automáticamente los siguientes archivos a `kaggle_cloud_outputs/starter_outputs/visionsetil_outputs/`:

| Archivo | Descripción |
|---|---|
| `real_report.json` y `real_report.md` | Precisión taxonómica de la nueva fusión |
| `catalog_diagnostics.md` | Diagnóstico de cobertura del dataset |
| `ablation_report.json` | Resultados de ablación |
| `open_set_thresholds.json` | Umbrales calibrados finales |
| `dangerous_failure_analysis.json` | Clasificación de fallos críticos |
| `large_dataset_summary.json` y `.md` | Resumen ejecutivo del benchmark |
| `model_status.json` | Estado de modelos cargados |
| `confusion_*.csv` | Matrices de confusión |
| `failure_cases.json` | Casos fallidos |
| `dangerous_failures.json` | Fallos con géneros peligrosos |
| `overconfident_wrong_cases.json` | Predicciones erróneas overconfident |
| `safety_debug_violations.json` | Violaciones de seguridad |

---

## 5. Reglas de Control en Terminal ("No Hacer")

### Prohibido el fallback silencioso a Mocks
Si el script detecta que `torch.cuda` no está disponible o que no se pueden instanciar los modelos reales, la ejecución debe abortar con código de salida 1 en lugar de degradar a mock.

**Implementación:** El script `build_species_index.py` verifica `registry.get_status()` y aborta si todos los modelos están en fallback. El script `run_large_dataset_benchmark.py` advierte cuando se ejecutan 1000+ casos sin modelos embedder reales.

### Validar coherencia de muestras antes de procesar
Abortar de inmediato si `Unique Species <= 1` o `Unique Genera <= 1` en el conjunto convertido.

**Implementación:** `run_large_dataset_benchmark.py` líneas 187-193:
```python
if len(unique_species) <= 1:
    print(f"Error: Unique Species Covered is {len(unique_species)}, which is <= 1. Benchmark is invalid.", file=sys.stderr)
    sys.exit(1)
if len(unique_genera) <= 1:
    print(f"Error: Unique Genera Covered is {len(unique_genera)}, which is <= 1. Benchmark is invalid.", file=sys.stderr)
    sys.exit(1)
```

### Prevención de Leakage
Comprobar mediante pruebas de assertions en terminal que ninguna observación evaluada haya servido para calcular su propio embedding de referencia en `species_visual_prototypes.parquet`.

**Implementación:** `build_species_index.py` excluye explícitamente las observaciones de test y reporta:
```
Leakage prevention assertion PASSED: test observations excluded from prototype computation.
```

---

## 6. Configuración de Modelos Reales

### Variables de Entorno para Kaggle

```bash
# YOLOE Detector
export USE_REAL_YOLOE=true
export YOLOE_MODEL_NAME=yolov8n.pt
export YOLOE_DEVICE=auto

# DINOv3 Embedder
export USE_REAL_DINOV3=true
export DINO_MODEL_NAME=facebook/dinov2-base
export DINO_DEVICE=auto
export DINO_EMBEDDING_DIM=1024

# SigLIP2 Embedder
export USE_REAL_SIGLIP2=true
export SIGLIP_MODEL_NAME=google/siglip-base-patch16-224
export SIGLIP_DEVICE=auto
export SIGLIP_EMBEDDING_DIM=768
```

### Config File de Referencia

```json
{
  "dataset_name": "fungiclef2025",
  "dataset_root": "/kaggle/input/fungi-clef-2025",
  "output_dir": "/kaggle/working/visionsetil_outputs",
  "models": {
    "use_real_yoloe": true,
    "use_real_dinov3": true,
    "use_real_siglip2": true,
    "allow_mock_fallbacks": false
  },
  "runtime": {
    "device": "cuda",
    "batch_size": 1,
    "num_workers": 2,
    "mode": "full_pipeline",
    "clear_cuda_cache_between_stages": true
  },
  "safety": {
    "enforce_safety_audit": true,
    "fail_on_safety_violation": true,
    "debug_safety": true,
    "max_safety_debug_cases": 10
  }
}
```

---

## 7. Flujo Completo de Ejecución (Resumen)

```
STEP 0: Validación Pre-Vuelo
  └─ nvidia-smi + torch.cuda check + dataset presence check

FASE 6 - Paso 1: Diagnóstico de Cobertura
  └─ diagnose_catalog.py → catalog_diagnostics.json/.md

FASE 6 - Paso 2: Construcción del Índice (Sin Leakage)
  └─ build_species_index.py → species_visual_prototypes.json + genus/family prototypes

FASE 6 - Paso 3: Benchmark Incremental
  ├─ Smoke Test (50 casos)
  ├─ Evaluación Intermedia (200 casos)
  └─ Benchmark Completo (1000 casos)
  └─ run_large_dataset_benchmark.py → real_report.json/.md + confusion matrices

FASE 6 - Paso 4: Ablación de Embeddings
  └─ run_ablation.py → ablation_report.json/.md

FASE 6 - Paso 5: Calibración Open-Set
  └─ calibrate_open_set.py → open_set_thresholds.json/.md

FASE 6 - Paso 6: Re-evaluación con Thresholds Calibrados
  └─ run_large_dataset_benchmark.py --open-set-thresholds ...

Descarga Local:
  └─ download_reports.py → kaggle_cloud_outputs/starter_outputs/visionsetil_outputs/
```

---

## 8. Métricas de Evaluación Generadas

### Métricas Taxonómicas
| Métrica | Descripción |
|---|---|
| `species_top1_accuracy` | Coincidencia exacta de especie top-1 |
| `species_top5_accuracy` | Especie esperada en top-5 |
| `genus_accuracy` | Coincidencia de género |
| `family_accuracy` | Coincidencia de familia |
| `risk_level_accuracy` | Exactitud de nivel de riesgo |

### Métricas de Seguridad
| Métrica | Target | Descripción |
|---|---|---|
| `false_safe_rate` | **0.00%** | Tóxicos clasificados como seguros |
| `toxic_not_flagged_rate` | **0.00%** | Géneros peligrosos sin advertencia |
| `overconfident_wrong_rate` | **< 5.0%** | Predicciones erróneas con conf ≥ 0.7 |
| `safety_policy_violations` | **0** | Violaciones de política de seguridad |

### Métricas de Open-Set
| Métrica | Descripción |
|---|---|
| `open_set_true_positive_rate` | Rechazo correcto de casos inciertos |
| `open_set_false_positive_rate` | Rechazo incorrecto de casos claros |
| `open_set_rejection_rate` | Tasa global de rechazo |

### Métricas de Revisión Humana
| Métrica | Descripción |
|---|---|
| `human_review_recommendation_rate` | Tasa global de recomendación de revisión |
| `human_review_recall_on_dangerous_cases` | Cobertura de HR en casos peligrosos |
| `dangerous_case_without_human_review_rate` | Casos peligrosos que evaden HR |

### Métricas de Calibración
| Métrica | Descripción |
|---|---|
| `expected_calibration_error` | Error de calibración esperado (ECE) |
| `mean_confidence_correct` | Confianza media de predicciones correctas |
| `mean_confidence_wrong` | Confianza media de predicciones incorrectas |

---

## 9. Niveles de Production Readiness

| Nivel | Criterios |
|---|---|
| `NOT_READY_FOR_PRODUCTION` | Modelos mock, < 100 casos, violaciones de seguridad |
| `READY_FOR_INTERNAL_TESTING` | Modelos reales, dataset pequeño, cero violaciones |
| `READY_FOR_EXPERT_REVIEW_PILOT` | > 100 casos, HR activo, cero bypass de peligrosos |
| `READY_FOR_LIMITED_PUBLIC_EDUCATIONAL_PILOT` | > 500 casos, HR activo, overconfident < 5%, cero violaciones |