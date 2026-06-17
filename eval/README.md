# VisionSetil Evaluation Infrastructure (Fase 3)

Este directorio contiene la infraestructura de evaluación reproducible del pipeline de identificación de setas. El objetivo es medir la precisión técnica del sistema, la tasa de abstención de open-set y garantizar de forma medible que se cumple la política estricta de seguridad (false_safe_rate de 0%).

---

## Estructura del Directorio

```txt
eval/
  README.md
  datasets/
    sample_observations.json   # Casos de observaciones generales
    poisonous_cases.json       # Casos con setas tóxicas/mortales
    incomplete_cases.json      # Casos con vistas/evidencias incompletas
  scripts/
    run_eval.py                # Script principal de ejecución y auditoría
    summarize_eval.py          # Script de resumen en consola
  reports/                     # Reportes generados (json y markdown)
```

---

## Esquema del Dataset

Cada caso de prueba en los archivos JSON sigue el siguiente formato:

```json
{
  "observation_id": "eval_001",
  "title": "Amanita phalloides de prueba",
  "expected_taxon": "Amanita phalloides",
  "expected_genus": "Amanita",
  "risk_level": "deadly",
  "images": [
    "eval/images/phalloides_cap.jpg",
    "eval/images/phalloides_base.jpg"
  ],
  "metadata": {
    "country": "España",
    "region": "Navarra",
    "habitat": "broadleaf forest",
    "substrate": "soil",
    "nearby_trees": ["oak", "beech"],
    "observed_at": "2026-10-15"
  },
  "expected_behavior": {
    "must_reject_open_set": true,
    "must_recommend_human_review": true,
    "must_not_claim_safe": true
  }
}
```

---

## Cómo Ejecutar la Evaluación

1.  **Instalar dependencias y activar entorno virtual:**
    ```bash
    python -m venv .venv
    .venv\Scripts\activate
    pip install -r backend/requirements.txt
    ```

2.  **Preparar Imágenes Reales (Opcional):**
    Crea la carpeta `eval/images/` y coloca las imágenes de setas reales con los nombres correspondientes si deseas validar precisión biológica.
    *   *Nota:* Si las imágenes no se encuentran en el disco, el script marcará los casos correspondientes como `skipped_missing_images` y no detendrá la evaluación global.

3.  **Ejecutar Evaluación:**
    Ejecuta el script indicando el dataset y la ruta del reporte JSON de salida:
    ```bash
    python eval/scripts/run_eval.py --dataset eval/datasets/sample_observations.json --output eval/reports/report.json
    ```

4.  **Ver Resumen en Consola:**
    ```bash
    python eval/scripts/summarize_eval.py --report eval/reports/report.json
    ```

5.  **Revisar Reporte en Markdown:**
    El script generará automáticamente `eval/reports/report.md` con un reporte formateado y advertencias de auditoría de seguridad.
