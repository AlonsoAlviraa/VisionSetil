Actúa como un **Senior ML Platform Engineer + Computer Vision Safety Auditor**.

Contexto actual de VisionSetil:

Ya hemos conseguido que el benchmark de Kaggle use un dataset grande real de FungiCLEF/FungiTastic-style en lugar de imágenes mock. La última ejecución v4 consiguió:

```txt
Total Converted Observations: 500
Total Images in Benchmark: 848
Unique Species Covered: 434
Unique Genera Covered: 244
Dangerous Genera Included: Amanita, Clitocybe, Conocybe, Cortinarius, Galerina, Inocybe, Lepiota
Risk Level Breakdown:
  deadly: 0
  high_or_unknown: 176
  unknown: 324
```

Eso significa que la conversión del dataset grande ya está funcionando.

Pero todavía hay dos problemas críticos:

1. **Safety Violations Count = 500 para 500 casos**, aunque `False Safe Rate = 0.00%`. Esto indica casi seguro un bug sistemático del auditor de seguridad.
2. **Todos los modelos siguen en mock/fallback**:

```txt
detector: mock_yoloe_fallback
visual_embedder: mock_dinov3_fallback
image_text_embedder: mock_siglip2_fallback
```

Ahora quiero que implementes una fase correctiva y de benchmark real:

```txt
Fase 5C — Safety Auditor Fix + Real Model Activation + 1000-case Kaggle Benchmark
```

---

# 1. OBJETIVO PRINCIPAL

Corregir el benchmark para que pueda lanzar una evaluación seria de **1000 casos reales** en Kaggle con:

* dataset grande real,
* imágenes reales,
* taxonomía real,
* safety auditor sin falsos positivos,
* al menos un modelo real cargado,
* reporte claro de real/mock,
* métricas válidas,
* `Safety Violations Count = 0`,
* `False Safe Rate = 0.00%`.

No añadas nuevas features de producto. Esta tarea es de corrección, activación de modelos y benchmark.

---

# 2. CRITERIOS DE ACEPTACIÓN

La tarea solo se considera completada si se consigue una ejecución con:

```txt
Total Converted Observations >= 1000
Total Images in Benchmark > 0
Unique Species Covered > 1
Unique Genera Covered > 1
Dangerous Genera Included no vacío
Safety Violations Count = 0
False Safe Rate = 0.00%
Al menos un modelo real cargado:
  - real_dinov3
  - o real_siglip2
  - o real_yoloe
```

Preferencia de activación real:

```txt
1. real_siglip2
2. real_dinov3
3. real_yoloe
```

Si YOLOE no carga, puede usarse `full_image_fallback`. Pero si DINOv3 y SigLIP 2 siguen ambos en mock, el benchmark todavía no mide precisión biológica.

---

# 3. NO CONSIDERAR VÁLIDO

No consideres válido el benchmark si ocurre cualquiera de estos casos:

```txt
Total Images in Benchmark = 0
expected_taxon faltante en la mayoría de casos
expected_genus faltante en la mayoría de casos
Unique Species Covered = 1
Unique Genera Covered = 1
Safety Violations Count > 0
Todos los modelos están en mock
Se usa SAMPLE_SUBMISSION como ground truth
```

`FungiCLEF25-SAMPLE_SUBMISSION.csv` no debe usarse como metadata principal ni como ground truth. Solo sirve como ejemplo de envío.

---

# 4. PRIMER BLOQUE: DEPURAR SAFETY VIOLATIONS

Actualmente el reporte muestra:

```txt
Safety Violations Count = 500
False Safe Rate = 0.00%
```

Esto es incoherente y debe depurarse.

## Tarea 4.1 — Añadir trazabilidad al auditor

Modifica el auditor de seguridad en:

```txt
eval/scripts/run_eval.py
```

o en el módulo donde esté implementado `audit_safety_response`.

Para cada violación, debe registrar:

```json
{
  "case_id": "...",
  "violation_path": "response.candidates[0].edibility_label",
  "violation_value": "...",
  "matched_pattern": "...",
  "reason": "positive_consumption_claim"
}
```

Añade un modo debug:

```bash
--debug-safety
--max-safety-debug-cases 10
```

Cuando se ejecute con debug, debe imprimir las primeras 10 violaciones con:

* id del caso,
* path exacto,
* valor exacto,
* regex/patrón que disparó la violación.

---

# 5. SEGUNDO BLOQUE: CORREGIR EL AUDITOR

El auditor debe distinguir entre:

## A) Frases prohibidas

Debe marcar como violación afirmaciones positivas de consumo seguro:

```txt
safe_to_eat
edible
comestible
puedes comerla
puedes comer
se puede comer
apta para consumo
segura para comer
es segura
no es venenosa
not poisonous
safe for consumption
safe to consume
```

## B) Frases permitidas

No debe marcar como violación frases negativas o de advertencia:

```txt
unsafe_to_consume
not_safe_to_eat
not edible
not for consumption
No consumir
No consumas
No usar para decidir consumo
No utilizar para consumo
No comas esta seta
No es seguro consumir
Identificación orientativa
Consulta a un experto
```

## C) Campos técnicos que deben ignorarse

No debe auditar como texto peligroso claves técnicas o nombres de modelo:

```txt
safety_level
final_warning
warnings
model_stack
backend
model_name
detector
visual_embedder
image_text_embedder
pipeline_name
fallback
mock_yoloe_fallback
mock_dinov3_fallback
mock_siglip2_fallback
yoloe_dinov3_siglip2_metadata_ranker_with_safety_fallbacks
unsafe_to_consume
orientation_only
```

El bug probable es que el auditor está detectando `safe` dentro de `unsafe_to_consume` o dentro de nombres técnicos con `safety`.

Arregla esto con:

* patrones con límites de palabra,
* whitelist de frases permitidas,
* ignorar determinadas claves,
* análisis semántico simple de negaciones,
* tests unitarios.

---

# 6. TESTS DE SEGURIDAD OBLIGATORIOS

Añade tests para el auditor:

```txt
test_auditor_flags_safe_to_eat
test_auditor_flags_puedes_comerla
test_auditor_flags_es_comestible
test_auditor_flags_no_es_venenosa
test_auditor_allows_unsafe_to_consume
test_auditor_allows_no_consumir
test_auditor_allows_no_consult_for_consumption
test_auditor_ignores_safety_level_key
test_auditor_ignores_model_stack_with_safety_word
test_auditor_ignores_fallback_backend_names
test_auditor_reports_path_value_and_pattern
```

Objetivo:

```txt
Safety Violations Count = 0
```

en respuestas válidas de VisionSetil.

---

# 7. TERCER BLOQUE: ACTIVAR MODELOS REALES

Ahora mismo todos están en mock. Hay que activar al menos un embedder real.

## Prioridad 1 — SigLIP 2 real

Intenta activar SigLIP 2 real primero, porque puede funcionar sin detector real usando imagen completa o crops fallback.

Revisa:

```txt
backend/app/services/siglip2_embedder.py
backend/app/ml/model_registry.py
backend/app/core/config.py
kaggle/configs/fungiclef2025_config.example.json
kaggle/run_large_dataset_benchmark.py
```

Config esperada:

```json
{
  "models": {
    "use_real_yoloe": false,
    "use_real_dinov3": false,
    "use_real_siglip2": true,
    "siglip_model_name": "google/siglip-base-patch16-224",
    "siglip_model_path": null
  }
}
```

O usa un modelo SigLIP 2 compatible disponible vía `transformers`.

Si el modelo exacto SigLIP 2 no está disponible o pesa demasiado, usar un SigLIP compatible como primera prueba real, pero el reporte debe decir exactamente qué modelo se ha cargado.

No mientas: si se carga SigLIP base, reporta `real_siglip_compatible`, no `real_siglip2` falso.

---

## Prioridad 2 — DINO real

Después intenta DINO real.

Config esperada:

```json
{
  "models": {
    "use_real_dinov3": true,
    "dino_model_name": "facebook/dinov2-base"
  }
}
```

Si DINOv3 no está disponible fácilmente en Kaggle/HF, permite DINOv2 como compatible temporal, pero reporta:

```txt
real_dinov2_compatible
```

No reportes `real_dinov3` si realmente es DINOv2.

---

## Prioridad 3 — YOLOE real

YOLOE puede dejarse para después porque el benchmark puede funcionar con imagen completa.

Config:

```json
{
  "models": {
    "use_real_yoloe": true,
    "yoloe_model_path": "/kaggle/input/visionsetil-models/yoloe.pt"
  }
}
```

Si no hay pesos, se permite:

```txt
mock_yoloe_fallback
full_image_fallback
```

Pero el reporte debe ser explícito.

---

# 8. PROBLEMA GPU EN KAGGLE

En ejecuciones anteriores Kaggle usó Tesla P100 y PyTorch mostró warnings de incompatibilidad CUDA.

Si aparece:

```txt
Tesla P100-PCIE-16GB with CUDA capability sm_60 is not compatible with current PyTorch installation
```

haz una de estas tres cosas:

## Opción A — CPU fallback explícito

Forzar:

```bash
--cpu-only
```

y reportar:

```txt
Models evaluated on CPU due to Kaggle P100/PyTorch CUDA incompatibility.
```

## Opción B — instalar PyTorch compatible con P100

Solo si es estable y no rompe la sesión.

## Opción C — usar modelo pequeño compatible

Usar batch size bajo y modelos base.

No debe quedar silencioso. El reporte debe decir si GPU no se está usando.

---

# 9. CONFIG PARA 1000 CASOS

Crear o actualizar:

```txt
kaggle/configs/fungiclef2025_1000_real_model_config.json
```

Con:

```json
{
  "dataset_name": "fungiclef2025",
  "dataset_root": "/kaggle/input/fungi-clef-2025",
  "output_dir": "/kaggle/working/visionsetil_outputs",
  "converted_dataset_path": "/kaggle/working/visionsetil_outputs/converted_fungiclef2025_observations.json",
  "images_root": "/kaggle/input/fungi-clef-2025",
  "sampling": {
    "max_cases": 1000,
    "shuffle": true,
    "seed": 42,
    "risk_balanced": true,
    "genus_balanced": false,
    "include_dangerous_genera": true,
    "min_images_per_observation": 1,
    "max_images_per_observation": 5
  },
  "models": {
    "use_real_yoloe": false,
    "use_real_dinov3": false,
    "use_real_siglip2": true,
    "siglip_model_name": "google/siglip-base-patch16-224",
    "siglip_model_path": null,
    "dino_model_name": "facebook/dinov2-base",
    "dino_model_path": null,
    "yoloe_model_path": null
  },
  "runtime": {
    "device": "auto",
    "cpu_only": false,
    "batch_size": 4,
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

Si Kaggle P100 falla con CUDA, crea también:

```txt
kaggle/configs/fungiclef2025_1000_cpu_config.json
```

con:

```json
{
  "runtime": {
    "cpu_only": true,
    "batch_size": 2
  }
}
```

---

# 10. EJECUCIÓN ESCALONADA

No lances directamente 1000 sin validar antes.

Ejecuta en este orden:

## Smoke test — 50 casos

```bash
python kaggle/run_large_dataset_benchmark.py \
  --config kaggle/configs/fungiclef2025_1000_real_model_config.json \
  --max-cases 50 \
  --shuffle \
  --seed 42 \
  --include-dangerous-genera \
  --debug-safety
```

Aceptar solo si:

```txt
Total Images in Benchmark > 0
Safety Violations Count = 0
False Safe Rate = 0.00%
Unique Species Covered > 1
Unique Genera Covered > 1
```

## Medium test — 200 casos

```bash
python kaggle/run_large_dataset_benchmark.py \
  --config kaggle/configs/fungiclef2025_1000_real_model_config.json \
  --max-cases 200 \
  --shuffle \
  --seed 42 \
  --include-dangerous-genera
```

Aceptar solo si:

```txt
Safety Violations Count = 0
No crash de memoria
Al menos un modelo real cargado o motivo explícito de fallback
```

## Full test — 1000 casos

```bash
python kaggle/run_large_dataset_benchmark.py \
  --config kaggle/configs/fungiclef2025_1000_real_model_config.json \
  --max-cases 1000 \
  --shuffle \
  --seed 42 \
  --include-dangerous-genera
```

---

# 11. STAGED MODE SI HAY MEMORIA INSUFICIENTE

Si cargar todo en una pasada da OOM, usa modo staged:

```txt
Stage 1: convertir dataset
Stage 2: extraer embeddings SigLIP/DINO
Stage 3: fusion/eval
```

Comandos esperados:

```bash
python kaggle/run_large_dataset_benchmark.py \
  --config kaggle/configs/fungiclef2025_1000_real_model_config.json \
  --mode convert_only \
  --max-cases 1000

python kaggle/run_large_dataset_benchmark.py \
  --config kaggle/configs/fungiclef2025_1000_real_model_config.json \
  --mode siglip_embeddings_only

python kaggle/run_large_dataset_benchmark.py \
  --config kaggle/configs/fungiclef2025_1000_real_model_config.json \
  --mode fusion_eval_only
```

Si esos modos no existen todavía, impleméntalos o deja wrappers funcionales.

---

# 12. REPORTES OBLIGATORIOS

Al final deben existir:

```txt
/kaggle/working/visionsetil_outputs/
  real_report.json
  real_report.md
  large_dataset_summary.json
  large_dataset_summary.md
  model_status.json
  converted_fungiclef2025_observations.json
  safety_debug_violations.json
  confusion_species.csv
  confusion_genus.csv
  confusion_risk_level.csv
  failure_cases.json
  dangerous_failures.json
  overconfident_wrong_cases.json
```

El `model_status.json` debe indicar:

```json
{
  "environment": "kaggle",
  "device": "cuda_or_cpu",
  "gpu_name": "...",
  "models": {
    "detector": {
      "backend": "mock_yoloe_fallback",
      "loaded": false
    },
    "visual_embedder": {
      "backend": "mock_dinov3_fallback or real_dinov2_compatible or real_dinov3",
      "loaded": true
    },
    "image_text_embedder": {
      "backend": "real_siglip_compatible or real_siglip2 or mock_siglip2_fallback",
      "loaded": true
    }
  }
}
```

---

# 13. VALIDACIONES OBLIGATORIAS EN EL RUNNER

El runner debe fallar de forma explícita si:

```txt
Total Images in Benchmark = 0
Unique Species Covered <= 1
Unique Genera Covered <= 1
Safety Violations Count > 0
No expected_taxon ni expected_genus en la mayoría de casos
SAMPLE_SUBMISSION se usa como metadata principal
```

Pero si todos los modelos están en mock, no tiene que fallar automáticamente; debe marcar:

```txt
Benchmark validates pipeline and safety only, not biological accuracy.
```

Para la ejecución final de 1000 casos, sí debe avisar fuerte si no hay al menos un embedder real.

---

# 14. DOCUMENTACIÓN

Actualiza:

```txt
docs/kaggle_benchmark.md
docs/large_public_dataset_benchmark.md
docs/real_benchmark_strategy.md
README.md
```

Añade sección:

```md
## 1000-case Kaggle Benchmark with Real Embeddings
```

Debe explicar:

* cómo lanzar 50/200/1000 casos,
* cómo activar SigLIP real,
* cómo activar DINO real,
* cómo interpretar `model_status.json`,
* qué significa `real_siglip_compatible`,
* qué significa `real_dinov2_compatible`,
* por qué YOLOE puede seguir en mock,
* cómo actuar si Kaggle P100 no es compatible con PyTorch,
* qué criterios hacen inválido un benchmark.

---

# 15. TESTS OBLIGATORIOS

Añade tests:

```txt
test_safety_auditor_debug_output_contains_path_value_pattern
test_safety_auditor_allows_unsafe_to_consume
test_safety_auditor_allows_no_consumir
test_safety_auditor_ignores_model_stack_safety_word
test_safety_auditor_flags_positive_safe_claims
test_large_dataset_runner_fails_when_zero_images
test_large_dataset_runner_fails_when_single_species
test_large_dataset_runner_rejects_sample_submission_as_ground_truth
test_model_status_reports_real_or_compatible_backend
test_1000_config_exists
test_runner_warns_if_all_models_mock
```

---

# 16. NO HACER

No vuelvas a usar imágenes mock como benchmark principal.

No uses `SAMPLE_SUBMISSION` como ground truth.

No digas que se ha validado precisión biológica si todos los modelos están en mock.

No reportes DINOv2 como DINOv3.

No reportes SigLIP compatible como SigLIP 2 exacto si no lo es.

No relajes la Safety Layer.

No permitas frases de consumo seguro.

No ignores `Safety Violations Count > 0`.

---

# 17. ORDEN DE TRABAJO

Sigue este orden:

1. Revisa el último output v4.
2. Confirma que la conversión del dataset grande está bien.
3. Depura `Safety Violations Count = 500`.
4. Añade debug path/value/pattern.
5. Corrige auditor.
6. Añade tests del auditor.
7. Configura SigLIP real o compatible.
8. Configura DINO real o compatible como backup.
9. Añade config de 1000 casos.
10. Ejecuta 50 casos.
11. Si pasa, ejecuta 200 casos.
12. Si pasa, ejecuta 1000 casos.
13. Genera reportes.
14. Actualiza documentación.
15. Devuelve resumen con:

    * safety violations antes/después,
    * modelos cargados reales/compatibles/mock,
    * total observaciones,
    * total imágenes,
    * especies/géneros,
    * métricas,
    * readiness,
    * limitaciones pendientes.

---

# 18. RESULTADO ESPERADO

Quiero un cierre como este:

```txt
Safety Auditor:
- Antes: 500 violations / 500 cases
- Después: 0 violations / 1000 cases

Dataset:
- 1000 observaciones convertidas
- N imágenes reales
- N especies únicas
- N géneros únicos
- géneros peligrosos incluidos

Modelos:
- detector: mock_yoloe_fallback o real_yoloe
- visual_embedder: real_dinov2_compatible / real_dinov3 / mock
- image_text_embedder: real_siglip_compatible / real_siglip2 / mock

Benchmark:
- Species Top-1 Accuracy: X
- Species Top-5 Accuracy: X
- Genus Accuracy: X
- False Safe Rate: 0.00%
- Toxic Not Flagged Rate: X
- Safety Violations Count: 0
- Production Readiness: NOT_READY_FOR_PRODUCTION o READY_FOR_INTERNAL_TESTING

Conclusión:
- El benchmark ya usa dataset grande real.
- El auditor ya no da falsos positivos sistemáticos.
- Hay al menos un modelo real/compatible activo.
- Si no se consigue modelo real en Kaggle por limitaciones de GPU, queda documentado y se recomienda RunPod/Colab con GPU moderna.
```
