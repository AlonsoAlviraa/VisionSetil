Actúa como un **Senior ML Platform Engineer + Computer Vision Benchmark Engineer**.

El proyecto VisionSetil ya tiene implementadas:

* Fase 1: MVP funcional.
* Fase 2: pipeline avanzado con YOLOE-26, DINOv3, SigLIP 2, metadata encoder, open-set rejection y human review.
* Fase 3: evaluación reproducible y auditoría de seguridad.
* Fase 4: benchmark biológico, métricas taxonómicas, calibración, matrices de confusión y production readiness.

Ahora quiero implementar la **Fase 5: Kaggle Benchmark Runner**.

El objetivo es poder ejecutar VisionSetil en Kaggle con muchas imágenes, sin depender del ordenador local, generando reportes reproducibles.

---

# 1. OBJETIVO PRINCIPAL

Preparar el proyecto para ejecutarse en Kaggle como benchmark batch.

No quiero servir la API FastAPI como producto en Kaggle. Quiero usar Kaggle para:

* cargar datasets grandes de imágenes,
* ejecutar el pipeline de evaluación,
* generar crops,
* generar embeddings,
* guardar outputs intermedios,
* calcular métricas,
* generar reportes,
* descargar resultados.

La ejecución debe funcionar aunque los modelos reales no estén disponibles, usando mocks/fallbacks, pero el reporte debe indicar claramente si se ha evaluado con:

* modelos reales,
* mocks,
* mezcla real/mock.

---

# 2. CONTEXTO TÉCNICO ACTUAL

El benchmark local se ejecuta actualmente así:

```bash
python eval/scripts/run_eval.py \
  --dataset eval/real_data/labels/real_observations_template.json \
  --output eval/reports/real_report.json
```

Y genera:

```txt
eval/reports/real_report.json
eval/reports/real_report.md
eval/reports/confusion_species.csv
eval/reports/confusion_genus.csv
eval/reports/confusion_risk_level.csv
eval/reports/failure_cases.json
eval/reports/dangerous_failures.json
eval/reports/overconfident_wrong_cases.json
```

Ahora quiero que esto pueda ejecutarse en Kaggle usando rutas tipo:

```txt
/kaggle/input/...
/kaggle/working/...
```

---

# 3. TAREAS PRINCIPALES

Implementa soporte completo para Kaggle.

Crea o modifica estos elementos:

```txt
kaggle/
  README.md
  vision_setil_kaggle_benchmark.ipynb
  kaggle_run_config.example.json
  prepare_kaggle_dataset.py
  run_kaggle_benchmark.py

docs/
  kaggle_benchmark.md
```

Si el repo ya tiene otra estructura, adapta sin romper lo existente.

---

# 4. CONFIGURACIÓN KAGGLE

Crear un archivo:

```txt
kaggle/kaggle_run_config.example.json
```

Con estructura:

```json
{
  "dataset_path": "/kaggle/input/visionsetil-real-data/real_observations.json",
  "images_root": "/kaggle/input/visionsetil-real-data/images",
  "output_dir": "/kaggle/working/visionsetil_outputs",
  "mode": "full_pipeline",
  "stages": {
    "run_detection": true,
    "run_dino_embeddings": true,
    "run_siglip_embeddings": true,
    "run_fusion_and_eval": true
  },
  "models": {
    "use_real_yoloe": false,
    "use_real_dinov3": false,
    "use_real_siglip2": false,
    "yoloe_model_path": "/kaggle/input/visionsetil-models/yoloe.pt",
    "dino_model_path": "/kaggle/input/visionsetil-models/dinov3",
    "siglip_model_path": "/kaggle/input/visionsetil-models/siglip2"
  },
  "runtime": {
    "device": "auto",
    "batch_size": 8,
    "num_workers": 2,
    "max_cases": null,
    "save_intermediate_outputs": true
  },
  "safety": {
    "enforce_safety_audit": true,
    "fail_on_safety_violation": true
  }
}
```

---

# 5. SCRIPT PRINCIPAL PARA KAGGLE

Crear:

```txt
kaggle/run_kaggle_benchmark.py
```

Debe ejecutarse así:

```bash
python kaggle/run_kaggle_benchmark.py \
  --config kaggle/kaggle_run_config.example.json
```

Debe hacer:

1. Leer config.
2. Validar rutas `/kaggle/input`.
3. Crear output dir en `/kaggle/working`.
4. Copiar o adaptar dataset labels si hace falta.
5. Resolver rutas relativas de imágenes.
6. Ejecutar `eval/scripts/run_eval.py`.
7. Guardar reportes en `/kaggle/working/visionsetil_outputs`.
8. Copiar outputs relevantes al final.
9. Imprimir resumen claro en consola.
10. No romper si faltan algunas imágenes; marcarlas como skipped.

Debe generar:

```txt
/kaggle/working/visionsetil_outputs/
  real_report.json
  real_report.md
  confusion_species.csv
  confusion_genus.csv
  confusion_risk_level.csv
  failure_cases.json
  dangerous_failures.json
  overconfident_wrong_cases.json
  model_status.json
  kaggle_run_summary.md
```

---

# 6. MODO STAGED PARA AHORRAR MEMORIA

Kaggle puede quedarse corto si intenta cargar YOLOE-26 + DINOv3 + SigLIP 2 a la vez.

Implementa un modo staged.

Debe soportar estos modos:

```txt
full_pipeline
detection_only
dino_embeddings_only
siglip_embeddings_only
fusion_eval_only
```

La idea:

```txt
Stage 1:
YOLOE → crops/masks → guardar crops

Stage 2:
DINOv3 → embeddings visuales → guardar embeddings_dino.parquet/jsonl/npy

Stage 3:
SigLIP 2 → embeddings imagen-texto → guardar embeddings_siglip.parquet/jsonl/npy

Stage 4:
Fusion + ranking + evaluation → reportes finales
```

Añade argumentos:

```bash
python kaggle/run_kaggle_benchmark.py --config kaggle/config.json --mode detection_only

python kaggle/run_kaggle_benchmark.py --config kaggle/config.json --mode dino_embeddings_only

python kaggle/run_kaggle_benchmark.py --config kaggle/config.json --mode siglip_embeddings_only

python kaggle/run_kaggle_benchmark.py --config kaggle/config.json --mode fusion_eval_only
```

Si todavía no existen implementaciones separadas para stages, deja wrappers preparados y documenta qué parte llama al pipeline actual.

---

# 7. NOTEBOOK KAGGLE

Crear:

```txt
kaggle/vision_setil_kaggle_benchmark.ipynb
```

El notebook debe tener secciones claras:

```md
# VisionSetil Kaggle Benchmark

## 1. Environment Check

## 2. Install Dependencies

## 3. Paths and Config

## 4. Model Status

## 5. Dataset Preview

## 6. Run Benchmark

## 7. Summarize Results

## 8. Show Key Metrics

## 9. Inspect Dangerous Failures

## 10. Download Outputs
```

Debe incluir comandos como:

```bash
!python kaggle/run_kaggle_benchmark.py --config kaggle/kaggle_run_config.example.json
```

Y después:

```bash
!python eval/scripts/summarize_eval.py --report /kaggle/working/visionsetil_outputs/real_report.json
```

Debe mostrar:

* model stack,
* real/mock warning,
* species_top1_accuracy,
* species_top5_accuracy,
* genus_accuracy,
* false_safe_rate,
* toxic_not_flagged_rate,
* dangerous_case_without_human_review_rate,
* overconfident_wrong_rate,
* readiness.

---

# 8. PREPARACIÓN DE DATASET PARA KAGGLE

Crear:

```txt
kaggle/prepare_kaggle_dataset.py
```

Debe ayudar a convertir un dataset local a formato Kaggle.

Entrada esperada:

```bash
python kaggle/prepare_kaggle_dataset.py \
  --labels eval/real_data/labels/real_observations_template.json \
  --images-root eval/real_data/images \
  --output-dir kaggle_dataset_export
```

Debe generar:

```txt
kaggle_dataset_export/
  real_observations.json
  images/
    ...
  README.md
```

El JSON debe usar rutas relativas compatibles con Kaggle:

```json
{
  "images": [
    "images/real_001_cap.jpg",
    "images/real_001_gills.jpg"
  ]
}
```

No debe incluir rutas absolutas locales tipo:

```txt
C:\Users\...
/home/user/...
```

---

# 9. SOPORTE PARA DATASETS GRANDES

Añade opciones:

```txt
--max-cases
--sample-risk-level
--sample-genus
--shuffle
--seed
```

Ejemplos:

```bash
python kaggle/run_kaggle_benchmark.py \
  --config kaggle/config.json \
  --max-cases 500 \
  --shuffle \
  --seed 42
```

Debe permitir probar primero un subset pequeño:

```txt
50 casos → smoke test
500 casos → benchmark medio
2000+ casos → benchmark serio
```

---

# 10. VALIDACIÓN DE MODELOS EN KAGGLE

Añade lógica para guardar:

```txt
model_status.json
```

Debe contener:

```json
{
  "environment": "kaggle",
  "device": "cuda",
  "gpu_name": "...",
  "models": {
    "detector": {
      "backend": "mock_yoloe_fallback",
      "loaded": false
    },
    "visual_embedder": {
      "backend": "real_dinov3",
      "loaded": true
    },
    "image_text_embedder": {
      "backend": "mock_siglip2_fallback",
      "loaded": false
    }
  }
}
```

El reporte debe advertir:

```txt
If all models are mocks, this run validates pipeline behavior and safety logic, not biological identification accuracy.
```

---

# 11. CONTROL DE MEMORIA

Añade recomendaciones y checks:

* imprimir uso de GPU si está disponible,
* imprimir uso de RAM si es sencillo,
* permitir batch size configurable,
* permitir limpiar caché de CUDA entre stages,
* permitir `--cpu-only`,
* no cargar todos los modelos si el modo staged no lo requiere.

Variables:

```txt
KAGGLE_BATCH_SIZE=8
KAGGLE_CPU_ONLY=false
KAGGLE_CLEAR_CUDA_CACHE_BETWEEN_STAGES=true
```

---

# 12. DOCUMENTACIÓN

Crear:

```txt
docs/kaggle_benchmark.md
```

Debe explicar:

## Objetivo

Ejecutar VisionSetil con muchas imágenes fuera del entorno local.

## Cuándo usar Kaggle

* benchmark batch,
* datasets grandes,
* evaluación reproducible,
* outputs descargables.

## Cuándo no usar Kaggle

* API persistente,
* producto en producción,
* inferencia en tiempo real.

## Cómo preparar dataset

Incluir pasos:

```bash
python kaggle/prepare_kaggle_dataset.py \
  --labels eval/real_data/labels/real_observations_template.json \
  --images-root eval/real_data/images \
  --output-dir kaggle_dataset_export
```

## Cómo subirlo a Kaggle

Explicar:

1. Crear Dataset en Kaggle.
2. Subir `real_observations.json`.
3. Subir carpeta `images/`.
4. Añadir dataset al notebook.
5. Ajustar config.

## Cómo ejecutar benchmark

```bash
python kaggle/run_kaggle_benchmark.py \
  --config kaggle/kaggle_run_config.example.json
```

## Cómo interpretar resultados

Explicar:

* real vs mock,
* readiness,
* safety metrics,
* biological metrics,
* skipped cases,
* dangerous failures,
* overconfident wrong cases.

## Cuándo pasar a RunPod/Modal

Explicar:

* si Kaggle no tiene VRAM suficiente,
* si se quieren cargar los tres modelos grandes a la vez,
* si se necesitan muchas horas,
* si se quiere API temporal.

---

# 13. TESTS

Añadir tests para:

1. Cargar config Kaggle.
2. Resolver rutas `/kaggle/input`.
3. Crear output dir.
4. Preparar dataset export con rutas relativas.
5. Ejecutar benchmark con dataset pequeño/mock.
6. Generar `kaggle_run_summary.md`.
7. Generar `model_status.json`.
8. Manejar imágenes faltantes sin romper.
9. `--max-cases` limita casos.
10. `--shuffle --seed` es reproducible.
11. Modo `full_pipeline` funciona.
12. Modos staged no rompen aunque usen mocks.

---

# 14. NO HACER

No descargar datasets enormes automáticamente.

No subir claves ni credenciales.

No hardcodear rutas personales.

No asumir GPU siempre disponible.

No romper ejecución local.

No eliminar scripts existentes de `eval/`.

No afirmar precisión biológica si se ejecuta con mocks.

No relajar la Safety Layer.

---

# 15. ORDEN DE TRABAJO

Sigue este orden:

1. Inspecciona el repo actual.
2. Lee README y docs de evaluación.
3. Ejecuta tests existentes.
4. Crea carpeta `kaggle/`.
5. Crea config example.
6. Crea script de preparación de dataset.
7. Crea script runner de Kaggle.
8. Añade soporte para rutas `/kaggle/input` y `/kaggle/working`.
9. Añade soporte `--max-cases`, `--shuffle`, `--seed`.
10. Añade modo staged.
11. Crea notebook Kaggle.
12. Añade model status export.
13. Añade summary markdown.
14. Crea documentación.
15. Añade tests.
16. Ejecuta suite completa.
17. Devuelve resumen final con:

    * archivos creados,
    * cómo exportar dataset,
    * cómo subirlo a Kaggle,
    * cómo ejecutar notebook,
    * cómo ejecutar benchmark,
    * cómo interpretar resultados,
    * limitaciones de Kaggle,
    * cuándo pasar a RunPod/Modal.

---

# 16. RESULTADO ESPERADO

Al terminar debe existir una Fase 5 donde podamos decir:

* VisionSetil puede ejecutarse en Kaggle.
* El dataset local puede exportarse a formato Kaggle.
* El benchmark puede correr con muchas imágenes.
* Los outputs se guardan en `/kaggle/working`.
* Hay notebook preparado.
* Hay modo staged para ahorrar memoria.
* Hay resumen de modelos real/mock.
* Hay reportes descargables.
* El sistema sigue siendo seguro y auditable.
* Kaggle se usa como entorno de benchmark, no como producción.
