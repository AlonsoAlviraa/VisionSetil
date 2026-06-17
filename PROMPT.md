Actúa como un **Senior ML Platform Engineer + Computer Vision Benchmark Engineer**.

El flujo de Kaggle ya funciona técnicamente, pero ahora quiero corregir el enfoque: **no quiero probar VisionSetil con imágenes mock ni con un dataset pequeño creado manualmente**.

Quiero que adaptes el benchmark para usar un **dataset grande público de hongos/setas ya existente**, preferiblemente en Kaggle, y transformarlo automáticamente al formato de evaluación de VisionSetil.

---

# 1. OBJETIVO PRINCIPAL

Sustituir el dataset mock/local por un dataset grande real.

Prioridad de datasets:

1. **FungiCLEF 2025 en Kaggle**

   * Primera opción.
   * Dataset orientado a identificación fina de hongos.
   * Observaciones con varias imágenes y metadatos.
   * Ideal para probar VisionSetil.

2. **FungiTastic**

   * Segunda opción.
   * Dataset grande multimodal de hongos.
   * Muchas observaciones, muchas especies, metadatos y enfoque open-set/few-shot.

3. **DF20 / Danish Fungi 2020**

   * Tercera opción.
   * Dataset grande de imágenes de hongos con etiquetas taxonómicas y metadatos.

No quiero que crees tres imágenes falsas con Pillow salvo para un smoke test mínimo. El benchmark real debe usar imágenes reales del dataset grande.

---

# 2. QUÉ NO QUIERO

No quiero:

* crear imágenes mock como prueba principal,
* exportar un dataset local pequeño inventado,
* validar únicamente infraestructura,
* decir que el benchmark es real si usa mocks,
* descargar manualmente miles de imágenes una por una,
* montar un dataset desde cero si ya existe uno público grande.

Las imágenes mock solo se permiten para:

```txt
smoke_test
unit_tests
validación de que el runner no rompe
```

Pero el benchmark serio debe usar:

```txt
FungiCLEF 2025 / FungiTastic / DF20
```

---

# 3. NUEVA FASE

Implementa una nueva fase:

```txt
Fase 5B — Large Public Fungi Dataset Benchmark
```

Objetivo:

```txt
Ejecutar VisionSetil en Kaggle contra un dataset grande real de hongos, convirtiendo automáticamente sus labels/metadatos al formato de evaluación de VisionSetil.
```

---

# 4. INSPECCIÓN INICIAL

Antes de tocar código:

1. Revisa el flujo actual de Kaggle:

   * `kaggle/run_kaggle_benchmark.py`
   * `kaggle/prepare_kaggle_dataset.py`
   * `kaggle/vision_setil_kaggle_benchmark.ipynb`
   * `kaggle/kaggle_run_config.example.json`
   * `docs/kaggle_benchmark.md`

2. Revisa los outputs actuales:

   * `kaggle_cloud_outputs/visionsetil_outputs/model_status.json`
   * `kaggle_cloud_outputs/visionsetil_outputs/real_report.json`
   * `kaggle_cloud_outputs/visionsetil_outputs/kaggle_run_summary.md`

3. Identifica claramente dónde se están usando imágenes mock.

4. Sustituye ese flujo por uno basado en dataset público grande.

No pidas confirmación salvo bloqueo real.

---

# 5. DATASET PRINCIPAL: FUNGICLEF 2025

Primera opción: usar FungiCLEF 2025 en Kaggle.

Tareas:

1. Crear soporte para leer datasets desde `/kaggle/input/fungi-clef-2025` o el path real que Kaggle monte.
2. Detectar automáticamente archivos de metadata/labels disponibles.
3. Detectar columnas relevantes:

   * observation_id,
   * image_path,
   * taxon/species,
   * genus,
   * family,
   * metadata,
   * substrate,
   * habitat,
   * latitude/longitude si existen,
   * date/timestamp si existe,
   * toxicity/risk si existe.
4. Convertir el formato original al formato de VisionSetil.
5. Crear un archivo convertido:

```txt
/kaggle/working/visionsetil_outputs/converted_fungiclef_observations.json
```

6. Ejecutar el benchmark sobre ese JSON convertido.

---

# 6. DATASET SECUNDARIO: FUNGITASTIC

Añade soporte para FungiTastic como alternativa.

Debe existir un conversor:

```txt
kaggle/converters/fungitastic_to_visionsetil.py
```

Debe:

1. Leer metadatos originales de FungiTastic.
2. Agrupar imágenes por observación.
3. Extraer taxonomía:

   * species,
   * genus,
   * family si existe.
4. Extraer metadata:

   * país/región si existe,
   * coordenadas si existen,
   * fecha,
   * hábitat,
   * sustrato,
   * toxicidad/risk si existe.
5. Convertir al schema de VisionSetil.
6. Permitir limitar casos para no procesar todo de golpe.

---

# 7. DATASET TERCERO: DF20

Añade soporte para DF20 / Danish Fungi 2020 como tercera opción.

Debe existir:

```txt
kaggle/converters/df20_to_visionsetil.py
```

Debe:

1. Leer metadata de DF20.
2. Agrupar imágenes por observación si el dataset lo permite.
3. Extraer taxonomía.
4. Extraer metadata de entorno si existe.
5. Convertir al schema de VisionSetil.

---

# 8. ESTRUCTURA NUEVA

Crea o adapta:

```txt
kaggle/
  converters/
    __init__.py
    common.py
    fungiclef_to_visionsetil.py
    fungitastic_to_visionsetil.py
    df20_to_visionsetil.py

  configs/
    fungiclef2025_config.example.json
    fungitastic_config.example.json
    df20_config.example.json

  run_large_dataset_benchmark.py
  inspect_kaggle_dataset.py
```

---

# 9. CONFIG PARA FUNGICLEF

Crear:

```txt
kaggle/configs/fungiclef2025_config.example.json
```

Ejemplo:

```json
{
  "dataset_name": "fungiclef2025",
  "dataset_root": "/kaggle/input/fungi-clef-2025",
  "output_dir": "/kaggle/working/visionsetil_outputs",
  "converted_dataset_path": "/kaggle/working/visionsetil_outputs/converted_fungiclef_observations.json",
  "images_root": "/kaggle/input/fungi-clef-2025",
  "sampling": {
    "max_cases": 500,
    "shuffle": true,
    "seed": 42,
    "risk_balanced": true,
    "min_images_per_observation": 1,
    "max_images_per_observation": 5
  },
  "models": {
    "use_real_yoloe": false,
    "use_real_dinov3": false,
    "use_real_siglip2": false
  },
  "runtime": {
    "device": "auto",
    "batch_size": 8,
    "num_workers": 2,
    "mode": "full_pipeline"
  },
  "safety": {
    "enforce_safety_audit": true,
    "fail_on_safety_violation": true
  }
}
```

---

# 10. SCRIPT PARA INSPECCIONAR DATASET

Crear:

```txt
kaggle/inspect_kaggle_dataset.py
```

Uso:

```bash
python kaggle/inspect_kaggle_dataset.py \
  --dataset-root /kaggle/input/fungi-clef-2025
```

Debe imprimir:

* archivos encontrados,
* CSV/JSON/parquet detectados,
* columnas disponibles,
* número aproximado de imágenes,
* número aproximado de observaciones,
* columnas candidatas para taxonomía,
* columnas candidatas para metadata,
* ejemplo de filas.

Esto es importante porque los datasets de Kaggle pueden cambiar estructura o montar nombres distintos.

---

# 11. SCRIPT PRINCIPAL GRANDE

Crear:

```txt
kaggle/run_large_dataset_benchmark.py
```

Uso:

```bash
python kaggle/run_large_dataset_benchmark.py \
  --config kaggle/configs/fungiclef2025_config.example.json
```

También debe aceptar:

```bash
python kaggle/run_large_dataset_benchmark.py \
  --dataset-name fungiclef2025 \
  --dataset-root /kaggle/input/fungi-clef-2025 \
  --output-dir /kaggle/working/visionsetil_outputs \
  --max-cases 500 \
  --shuffle \
  --seed 42
```

Flujo:

```txt
1. Inspeccionar dataset.
2. Elegir converter según dataset-name.
3. Convertir labels al schema VisionSetil.
4. Validar que las imágenes existen.
5. Crear converted_dataset.json.
6. Ejecutar eval/scripts/run_eval.py sobre converted_dataset.json.
7. Generar reportes.
8. Guardar resumen específico de dataset grande.
```

Outputs:

```txt
/kaggle/working/visionsetil_outputs/
  converted_fungiclef_observations.json
  large_dataset_summary.json
  large_dataset_summary.md
  real_report.json
  real_report.md
  model_status.json
  confusion_species.csv
  confusion_genus.csv
  confusion_risk_level.csv
  failure_cases.json
  dangerous_failures.json
  overconfident_wrong_cases.json
```

---

# 12. CONVERSIÓN AL SCHEMA VISIONSETIL

El formato convertido debe ser:

```json
{
  "observation_id": "fungiclef_000001",
  "expected_taxon": "Amanita phalloides",
  "expected_genus": "Amanita",
  "expected_family": "Amanitaceae",
  "risk_level": "deadly_or_unknown",
  "images": [
    "/kaggle/input/fungi-clef-2025/path/to/image1.jpg",
    "/kaggle/input/fungi-clef-2025/path/to/image2.jpg"
  ],
  "metadata": {
    "country": null,
    "region": null,
    "latitude": null,
    "longitude": null,
    "observed_at": null,
    "habitat": null,
    "substrate": null,
    "nearby_trees": [],
    "altitude_m": null,
    "smell": null,
    "color_change_on_cut": null,
    "user_notes": "Converted from FungiCLEF 2025."
  },
  "source": {
    "type": "public_dataset",
    "dataset": "FungiCLEF 2025",
    "license": "see_original_dataset_terms",
    "original_observation_id": "...",
    "original_image_ids": []
  },
  "expected_behavior": {
    "must_not_claim_safe": true,
    "should_detect_genus": true,
    "should_recommend_human_review": false,
    "should_flag_dangerous_lookalikes": false
  }
}
```

Si falta una columna, no debe romper. Debe rellenar `null` o `unknown`.

---

# 13. RISK LEVEL

Si el dataset trae toxicidad, usarla.

Si no trae toxicidad, inferir de forma conservadora por género/especie usando catálogo local:

Géneros de alto riesgo:

```txt
Amanita
Galerina
Cortinarius
Lepiota
Gyromitra
Inocybe
Clitocybe
Conocybe
```

Reglas:

```txt
Si género en lista peligrosa → risk_level = high_or_unknown
Si especie conocida mortal en poisonous_species.json → risk_level = deadly
Si no hay información → risk_level = unknown
Nunca marcar como safe.
```

---

# 14. SAMPLING INTELIGENTE

El benchmark debe permitir procesar muchas imágenes, pero también subsets.

Añade sampling:

```bash
--max-cases 100
--max-cases 500
--max-cases 2000
--max-cases 10000
```

Añade sampling balanceado:

```bash
--risk-balanced
--genus-balanced
--include-dangerous-genera
```

Objetivo:

* no coger solo especies fáciles/comunes,
* incluir géneros peligrosos,
* incluir casos raros,
* probar open-set.

---

# 15. NOTEBOOK ACTUALIZADO

Actualiza el notebook Kaggle para que use dataset grande.

Secciones:

```md
# VisionSetil Large Public Fungi Benchmark

## 1. Environment Check

## 2. Attach Large Dataset

## 3. Inspect Dataset

## 4. Convert Dataset to VisionSetil Format

## 5. Run Benchmark on Subset

## 6. Run Larger Benchmark

## 7. Summarize Metrics

## 8. Dangerous Cases

## 9. Mock vs Real Warning

## 10. Download Outputs
```

Debe incluir comandos:

```bash
!python kaggle/inspect_kaggle_dataset.py \
  --dataset-root /kaggle/input/fungi-clef-2025

!python kaggle/run_large_dataset_benchmark.py \
  --dataset-name fungiclef2025 \
  --dataset-root /kaggle/input/fungi-clef-2025 \
  --output-dir /kaggle/working/visionsetil_outputs \
  --max-cases 500 \
  --shuffle \
  --seed 42 \
  --risk-balanced
```

---

# 16. DOCUMENTACIÓN

Crear o actualizar:

```txt
docs/large_public_dataset_benchmark.md
docs/kaggle_benchmark.md
README.md
```

Debe explicar:

* por qué no usar imágenes mock para benchmark real,
* cómo usar FungiCLEF 2025,
* cómo usar FungiTastic,
* cómo usar DF20,
* cómo aceptar términos de Kaggle si hace falta,
* cómo añadir el dataset al notebook,
* cómo convertir labels,
* cómo ejecutar primero 100 casos,
* cómo escalar a 500, 2000, 10000 casos,
* cómo interpretar resultados,
* por qué si los modelos están en mock no se mide precisión biológica.

---

# 17. TESTS

Añade tests con fixtures pequeños, no con dataset grande real.

Tests mínimos:

1. `inspect_kaggle_dataset.py` detecta CSV/JSON fake.
2. Converter FungiCLEF convierte un CSV de ejemplo.
3. Converter FungiTastic convierte un CSV de ejemplo.
4. Converter DF20 convierte un CSV de ejemplo.
5. El converter rellena campos faltantes con `null`.
6. El converter valida imágenes existentes.
7. Sampling `max_cases` funciona.
8. Sampling `shuffle + seed` es reproducible.
9. Risk inference detecta Amanita como high_or_unknown.
10. Risk inference detecta Galerina como high_or_unknown.
11. Nunca se genera `safe`.
12. El runner genera `converted_dataset.json`.
13. El runner llama a `run_eval.py`.
14. El notebook no referencia el dataset mock como benchmark principal.

---

# 18. NO HACER

No crear imágenes mock como benchmark principal.

No subir un dataset inventado a Kaggle si hay dataset público grande.

No asumir que todas las columnas existen.

No hardcodear una única estructura de FungiCLEF.

No descargar manualmente todo desde internet si Kaggle ya lo monta.

No afirmar precisión real si el modelo está en mock.

No marcar ninguna seta como comestible segura.

No ignorar términos/licencias del dataset.

---

# 19. ORDEN DE TRABAJO

Sigue este orden:

1. Inspecciona el flujo actual de Kaggle.
2. Localiza dónde se crean imágenes mock.
3. Mantén ese flujo solo para smoke tests.
4. Crea converters.
5. Crea inspector de dataset.
6. Crea config FungiCLEF.
7. Crea runner de dataset grande.
8. Actualiza notebook para dataset grande.
9. Añade sampling inteligente.
10. Añade inferencia conservadora de riesgo.
11. Añade tests.
12. Actualiza documentación.
13. Ejecuta tests.
14. Devuelve resumen final con:

    * qué dataset grande se usará primero,
    * cómo añadirlo al notebook Kaggle,
    * cómo convertirlo,
    * cómo ejecutar 100/500/2000 casos,
    * cómo distinguir mock vs modelo real,
    * qué queda pendiente para benchmark serio.

---

# 20. RESULTADO ESPERADO

Al terminar quiero poder ejecutar en Kaggle algo como:

```bash
python kaggle/run_large_dataset_benchmark.py \
  --dataset-name fungiclef2025 \
  --dataset-root /kaggle/input/fungi-clef-2025 \
  --output-dir /kaggle/working/visionsetil_outputs \
  --max-cases 500 \
  --shuffle \
  --seed 42 \
  --risk-balanced
```

Y obtener un benchmark real sobre un dataset grande público, no sobre imágenes mock.

El resultado debe dejar claro:

* número de observaciones reales procesadas,
* número de imágenes reales procesadas,
* especies/géneros cubiertos,
* géneros peligrosos incluidos,
* modelos real/mock usados,
* métricas biológicas,
* métricas de seguridad,
* readiness,
* fallos peligrosos,
* casos sobreconfiados.
