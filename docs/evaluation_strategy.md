# Estrategia de Evaluación y Validación de Seguridad (Fase 4)

Este documento detalla la infraestructura de pruebas y validación instalada para medir de forma reproducible la precisión taxonómica, la tasa de abstención de open-set, la calibración de confianza y las garantías de seguridad de VisionSetil.

---

## Esquema de Métricas de Validación Biológica y Seguridad

El orquestador de evaluación (`run_eval.py`) procesa cada caso de validación en la API in-memory de FastAPI y calcula un conjunto completo de métricas estructurado en:

### 1. Métricas de Precisión Taxonómica
*   `species_top1_accuracy`: Porcentaje de coincidencia exacta con el taxón especie esperado en el candidato de mayor confianza.
*   `species_top5_accuracy`: Porcentaje de veces en que la especie esperada aparece en los 5 primeros candidatos clasificados.
*   `genus_accuracy`: Porcentaje de coincidencia correcta a nivel de género biológico.
*   `family_accuracy`: Porcentaje de coincidencia correcta a nivel de familia biológica (p. ej., *Amanitaceae*, *Agaricaceae*).
*   `risk_level_accuracy`: Exactitud en la asignación del nivel de riesgo correspondiente.

### 2. Métricas de Seguridad y Revisión Humana
*   `false_safe_rate`: Porcentaje de setas tóxicas o mortales clasificadas incorrectamente como seguras o sin marcar como no comestibles (debe ser estrictamente `0.0%`).
*   `toxic_not_flagged_rate`: Frecuencia con la que casos tóxicos no reciben advertencias de peligro.
*   `dangerous_case_without_human_review_rate`: Frecuencia con la que un género peligroso evita ser desviado a revisión humana.
*   `overconfident_wrong_rate`: Proporción de predicciones erróneas donde la confianza del modelo es mayor o igual al 70% ($\ge 0.7$).
*   `human_review_recall_on_dangerous_cases`: Capacidad del sistema para derivar correctamente casos de peligro a los expertos.

### 3. Métricas de Open-Set
*   `open_set_true_positive_rate`: Tasa de rechazo correcto en imágenes de baja calidad, incompletas u observaciones fuera de distribución.
*   `open_set_false_positive_rate`: Tasa de rechazo incorrecto en observaciones completas y claras.

---

## Calibración de Confianza (ECE)

Para validar si las estimaciones de probabilidad de la red corresponden a las tasas de acierto reales, se utiliza la calibración por contenedores:
*   **Expected Calibration Error (ECE):** Se agrupan las confianzas en 10 bins y se calcula el error absoluto ponderado entre exactitud y confianza media por bin.
*   **Overconfident Wrong Cases:** Se identifican las observaciones donde la predicción falló pero el sistema asignó una confianza alta, lo que ayuda a mitigar riesgos de sobreconfianza en el clasificador.

---

## Auditoría Semántica y Safety Policy

El módulo auditor valida dinámicamente cada respuesta del endpoint `/classify-advanced` para verificar que:
1.  **Cero sugerencias de consumo:** Bloquea explícitamente cualquier frase que sugiera comestibilidad (`safe_to_eat`, `edible`, `comestible`, etc.).
2.  **Negaciones permitidas:** Permite advertencias explícitas de no consumo como `no consumir`, `no consumas`, u `orientación únicamente`.
3.  **Encabezados obligatorios:** Exige que los campos `status` sean `orientation_only`, `safety_level` sea `unsafe_to_consume` y exista una advertencia en `final_warning` para casos de alto riesgo.

---

## Estructura de Reportes Generados

Al ejecutar el benchmark, se producen los siguientes archivos bajo `eval/reports/`:
*   `report.json`: Diccionario estructurado con todas las métricas de rendimiento y calibración.
*   `report.md`: Reporte avanzado formateado en Markdown para análisis de ingeniería y auditoría.
*   `confusion_species.csv` / `confusion_genus.csv` / `confusion_risk_level.csv`: Matrices de confusión detallando las predicciones del clasificador.
*   `failure_cases.json` / `dangerous_failures.json` / `overconfident_wrong_cases.json`: Archivos con el detalle de las observaciones fallidas para facilitar su depuración.
