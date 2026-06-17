Actúa como un **Senior Computer Vision Evaluation Engineer + ML Safety Auditor**.

El proyecto VisionSetil ya tiene completadas:

* Fase 1: MVP funcional.
* Fase 2: arquitectura avanzada con YOLOE-26, DINOv3, SigLIP 2, metadata encoder, open-set rejection y human review.
* Fase 3: evaluación reproducible, auditoría de seguridad, reportes y 32 tests verdes.

Ahora quiero implementar la **Fase 4: Real Model Benchmark + Biological Validation**.

El objetivo de esta fase no es añadir features nuevas, sino demostrar con imágenes reales y modelos reales si el sistema identifica correctamente, cuándo falla, cuándo se abstiene y cuándo recomienda revisión humana.

---

# 1. OBJETIVO PRINCIPAL

Implementar una fase de validación real con:

* modelos reales activados si están disponibles,
* imágenes reales etiquetadas,
* evaluación por especie,
* evaluación por género,
* evaluación por nivel de riesgo,
* matriz de errores,
* calibración de confianza,
* análisis de casos peligrosos,
* detección de sobreconfianza,
* reporte técnico reproducible.

El sistema debe seguir diferenciando claramente entre:

* evaluación con mocks,
* evaluación con modelos reales,
* evaluación mixta.

Si los modelos siguen en mock, el reporte debe indicar que no se está evaluando precisión biológica.

---

# 2. INSPECCIÓN INICIAL

Antes de tocar código:

1. Lee:

   * `walkthrough.md`
   * `task.md`
   * `README.md`
   * `docs/evaluation_strategy.md`
   * `docs/model_architecture.md`
   * `docs/real_model_loading.md`
   * `docs/safety_policy.md`
   * `docs/open_set_rejection.md`
   * `docs/human_review_workflow.md`

2. Ejecuta:

```bash
pytest
```

3. Ejecuta:

```bash
python eval/scripts/run_eval.py --dataset eval/datasets/sample_observations.json --output eval/reports/report.json
```

4. Comprueba el endpoint:

```txt
GET /models/status
```

5. Resume:

   * qué modelos están reales,
   * qué modelos están en fallback,
   * qué datasets existen,
   * qué métricas existen,
   * qué falta para benchmark real.

No pidas confirmación salvo bloqueo técnico real.

---

# 3. DATASET REAL DE VALIDACIÓN

Crear soporte para un dataset local de imágenes reales:

```txt
eval/real_data/
  README.md
  images/
    .gitkeep
  labels/
    real_observations_template.json
```

El schema debe soportar:

```json
{
  "observation_id": "real_001",
  "expected_taxon": "Amanita phalloides",
  "expected_genus": "Amanita",
  "expected_family": "Amanitaceae",
  "risk_level": "deadly",
  "images": [
    "eval/real_data/images/real_001_cap.jpg",
    "eval/real_data/images/real_001_gills.jpg",
    "eval/real_data/images/real_001_base.jpg"
  ],
  "metadata": {
    "country": "España",
    "region": "Navarra",
    "observed_at": "2026-10-12",
    "habitat": "broadleaf forest",
    "substrate": "soil",
    "nearby_trees": ["oak", "beech"],
    "altitude_m": 500,
    "smell": null,
    "color_change_on_cut": null,
    "user_notes": "Fotos etiquetadas por experto o fuente validada."
  },
  "source": {
    "type": "expert_labeled",
    "license": "local_private",
    "verified_by": "human_expert",
    "notes": "No redistribuir imágenes si no hay licencia."
  },
  "expected_behavior": {
    "must_not_claim_safe": true,
    "should_detect_genus": true,
    "should_recommend_human_review": true,
    "should_flag_dangerous_lookalikes": true
  }
}
```

No descargues datasets automáticamente.

Deja documentación clara para que el usuario pueda añadir imágenes reales manualmente.

---

# 4. NUEVAS MÉTRICAS DE VALIDACIÓN BIOLÓGICA

Añade al motor de evaluación métricas adicionales:

```json
{
  "species_top1_accuracy": 0.0,
  "species_top5_accuracy": 0.0,
  "genus_accuracy": 0.0,
  "family_accuracy": 0.0,
  "risk_level_accuracy": 0.0,

  "toxic_not_flagged_rate": 0.0,
  "dangerous_case_without_human_review_rate": 0.0,
  "dangerous_genus_missed_rate": 0.0,
  "overconfident_wrong_rate": 0.0,

  "open_set_true_positive_rate": 0.0,
  "open_set_false_positive_rate": 0.0,
  "human_review_recall_on_dangerous_cases": 0.0,

  "mean_confidence_correct": 0.0,
  "mean_confidence_wrong": 0.0,
  "expected_calibration_error": 0.0
}
```

Define claramente cada métrica en `docs/evaluation_strategy.md`.

---

# 5. MATRIZ DE ERRORES

Implementa generación de matrices:

```txt
eval/reports/confusion_species.csv
eval/reports/confusion_genus.csv
eval/reports/confusion_risk_level.csv
```

Cada fila debe incluir:

```csv
expected,predicted,count
Amanita phalloides,Amanita sp.,3
Amanita phalloides,unknown_fungus,2
Macrolepiota procera,Chlorophyllum sp.,1
```

También genera:

```txt
eval/reports/failure_cases.json
eval/reports/dangerous_failures.json
eval/reports/overconfident_wrong_cases.json
```

---

# 6. CALIBRACIÓN DE CONFIANZA

Añade un módulo:

```txt
eval/scripts/calibration.py
```

Debe calcular:

* confidence bins,
* accuracy por bin,
* expected calibration error,
* overconfident wrong cases.

Ejemplo de bins:

```json
[
  {
    "bin": "0.0-0.1",
    "count": 12,
    "accuracy": 0.08,
    "mean_confidence": 0.06
  },
  {
    "bin": "0.8-0.9",
    "count": 5,
    "accuracy": 0.40,
    "mean_confidence": 0.84
  }
]
```

El reporte debe avisar si hay predicciones incorrectas con confianza alta.

---

# 7. VALIDACIÓN DE YOLOE REAL

Añade evaluación específica del detector:

```json
{
  "detector_backend": "real_yoloe",
  "total_images": 0,
  "images_with_detection": 0,
  "detection_rate": 0.0,
  "mean_detection_confidence": 0.0,
  "full_image_fallback_rate": 0.0,
  "crop_files_created": 0,
  "mask_files_created": 0
}
```

Si no hay anotaciones de bbox, no calcules IoU real. Solo mide cobertura operativa.

Si en el futuro existen bboxes etiquetados, deja preparada la estructura para calcular:

* IoU,
* mAP,
* recall detector,
* precision detector.

---

# 8. VALIDACIÓN DE DINOv3 Y SIGLIP 2

Añade desglose de embeddings:

```json
{
  "dino_backend": "real_dinov3",
  "siglip_backend": "real_siglip2",
  "embedding_dim_dino": 1024,
  "embedding_dim_siglip": 768,
  "embedding_normalization_ok": true,
  "embedding_cache_hit_rate": 0.0,
  "mean_pairwise_similarity_same_genus": 0.0,
  "mean_pairwise_similarity_different_genus": 0.0
}
```

Si hay suficientes casos reales, calcula separación básica:

```txt
same_genus_similarity > different_genus_similarity
```

Si no hay suficientes casos, reporta `not_enough_data`.

---

# 9. REPORTE MARKDOWN AVANZADO

Actualiza `report.md` para incluir:

```md
# VisionSetil Real Model Benchmark Report

## Executive Summary

## Model Status

## Dataset

## Real vs Mock Warning

## Biological Identification Metrics

## Safety Metrics

## Open-Set Rejection Metrics

## Human Review Metrics

## Detector Evaluation

## Embedding Evaluation

## Calibration

## Confusion Matrices

## Dangerous Failure Cases

## Overconfident Wrong Cases

## Skipped Cases

## Recommendations

## Production Readiness Assessment
```

La sección `Production Readiness Assessment` debe clasificar el sistema como:

```txt
NOT_READY_FOR_PRODUCTION
READY_FOR_INTERNAL_TESTING
READY_FOR_EXPERT_REVIEW_PILOT
READY_FOR_LIMITED_PUBLIC_EDUCATIONAL_PILOT
```

Por defecto, si no hay dataset real suficiente o modelos reales, debe ser:

```txt
NOT_READY_FOR_PRODUCTION
```

---

# 10. CRITERIOS DE READINESS

Implementa reglas simples:

```txt
NOT_READY_FOR_PRODUCTION:
- modelos en mock
- menos de 100 casos reales
- no hay casos peligrosos reales
- toxic_not_flagged_rate > 0
- dangerous_case_without_human_review_rate > 0
- overconfident_wrong_rate alto

READY_FOR_INTERNAL_TESTING:
- modelos reales funcionando
- dataset real pequeño
- sin violaciones de safety
- reportes completos

READY_FOR_EXPERT_REVIEW_PILOT:
- modelos reales
- dataset real suficiente
- revisión humana operativa
- casos peligrosos correctamente derivados a revisión

READY_FOR_LIMITED_PUBLIC_EDUCATIONAL_PILOT:
- validación amplia
- revisión humana operativa
- disclaimers fuertes
- monitorización de errores
- baja sobreconfianza
```

---

# 11. TESTS NUEVOS

Añade tests para:

1. Cargar dataset real template.
2. Calcular `toxic_not_flagged_rate`.
3. Calcular `dangerous_case_without_human_review_rate`.
4. Calcular `dangerous_genus_missed_rate`.
5. Detectar `overconfident_wrong_cases`.
6. Generar matrices de confusión.
7. Calcular calibration bins.
8. Calcular expected calibration error.
9. Generar detector evaluation.
10. Generar embedding evaluation.
11. Reportar `not_enough_data` cuando falten casos.
12. Clasificar readiness como `NOT_READY_FOR_PRODUCTION` si hay mocks.
13. Clasificar readiness como `NOT_READY_FOR_PRODUCTION` si hay pocos datos reales.
14. Generar `report.md` avanzado.

---

# 12. DOCUMENTACIÓN

Crear o actualizar:

```txt
docs/real_benchmark_strategy.md
docs/production_readiness.md
eval/real_data/README.md
docs/evaluation_strategy.md
README.md
```

Debe quedar claro:

* cómo añadir imágenes reales,
* cómo etiquetar observaciones,
* cómo ejecutar benchmark,
* cómo interpretar readiness,
* por qué mocks no validan identificación biológica,
* qué métricas bloquean producción,
* cómo revisar dangerous failures.

---

# 13. NO HACER

No descargues datasets grandes automáticamente.

No afirmes que el sistema es preciso sin benchmark real.

No elimines mocks.

No relajes la Safety Layer.

No permitas salidas de consumo seguro.

No conviertas open-set rejection en un simple warning: debe afectar ranking, taxón final y human review.

---

# 14. ORDEN DE TRABAJO

Sigue este orden:

1. Inspecciona estado actual.
2. Ejecuta tests existentes.
3. Revisa evaluación Fase 3.
4. Crea soporte `eval/real_data`.
5. Extiende schema de dataset.
6. Añade métricas biológicas.
7. Añade métricas de seguridad avanzadas.
8. Añade matrices de confusión.
9. Añade calibración.
10. Añade evaluación de detector.
11. Añade evaluación de embeddings.
12. Añade production readiness assessment.
13. Actualiza reportes JSON/MD.
14. Añade tests.
15. Actualiza documentación.
16. Ejecuta suite completa.
17. Devuelve resumen final con:

    * archivos creados/modificados,
    * métricas añadidas,
    * cómo ejecutar benchmark real,
    * cómo interpretar readiness,
    * qué falta para piloto con expertos.

---

# 15. RESULTADO ESPERADO

Al terminar debe existir una Fase 4 donde podamos decir:

* El sistema tiene benchmark real preparado.
* El sistema distingue claramente mock vs real.
* El sistema mide errores biológicos, no solo seguridad textual.
* El sistema detecta casos peligrosos no bien tratados.
* El sistema mide sobreconfianza.
* El sistema genera matrices de confusión.
* El sistema evalúa detector y embeddings.
* El sistema emite un nivel de readiness conservador.
* El sistema sigue bloqueando cualquier consejo de consumo.
