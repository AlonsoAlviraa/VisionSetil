# Open-Set Rejection

Este documento describe la lógica de **Open-Set Rejection** utilizada en VisionSetil para rechazar observaciones inciertas o no pertenecientes al catálogo conocido, degradando la predicción para mantener la seguridad.

---

## ¿Por qué necesitamos Open-Set Rejection?

En la clasificación tradicional (Close-Set), el modelo siempre asigna una etiqueta del catálogo predefinido a la imagen, incluso si la seta fotografiada no se parece a nada que el modelo conozca o si la imagen tiene muy mala calidad. En micología, esto es sumamente peligroso (p. ej., confundir una especie mortal con una seta comestible común debido a ruido en la imagen).

**Open-Set Rejection** evalúa métricas del clasificador y del contexto para determinar si la seta es "desconocida" o si la predicción es altamente incierta, degradando la respuesta del API.

---

## Criterios de Rechazo

La evaluación en `OpenSetRejectionService` aplica las siguientes reglas consecutivas:

1.  **Umbral de Confianza:** Si la confianza del candidato top 1 es menor que `OPEN_SET_MIN_CONFIDENCE` (por defecto `0.55`).
2.  **Margen de Confianza:** Si la diferencia entre la confianza del candidato top 1 y el top 2 es menor que `OPEN_SET_MIN_MARGIN` (por defecto `0.15`), indicando alta ambigüedad.
3.  **Falta de Evidencias Críticas:** Si faltan fotos de las vistas obligatorias (`gills_or_pores`, `base`, o `environment`) y `OPEN_SET_REJECT_ON_MISSING_CRITICAL_EVIDENCE` está a `true`.
4.  **Género de Alto Riesgo:** Si el género principal predicho pertenece a la lista de géneros con especies mortales:
    *   *Amanita*
    *   *Galerina*
    *   *Cortinarius*
    *   *Lepiota*
    *   *Gyromitra*
5.  **Lookalikes Mortales:** Si el candidato top 1 tiene asociadas especies semejantes (lookalikes) que son mortales o tóxicas, y `OPEN_SET_REJECT_ON_DEADLY_LOOKALIKES` está a `true`.

---

## Degradación de Predicciones

Cuando se activa el rechazo, el sistema realiza una degradación controlada:

*   **Rechazo por falta de evidencias:** Degrada completamente a `unknown_fungus` (Rank: `unknown`, confianza `0.0`), con el mensaje: *"La observación no contiene evidencias suficientes para una identificación fiable."*
*   **Rechazo por incertidumbre, alto riesgo o lookalikes:** Degrada la especie a su género (p. ej., *"Amanita muscaria"* se convierte en *"Amanita sp."*, Rank: `genus`), reduce la confianza al 50% y recomienda revisión humana.
