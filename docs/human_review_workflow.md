# Flujo Operativo de Revisión Humana

Este documento detalla el ciclo de vida y los endpoints para la revisión humana experta de observaciones de setas de riesgo o inciertas en VisionSetil.

---

## Activación de la Revisión Humana

La recomendación de revisión humana se genera automáticamente en la respuesta de `/classify-advanced` si:
1.  Se activa el rechazo por **Open-Set**.
2.  La seta identificada pertenece a un **género de alto riesgo** (*Amanita*, *Galerina*, etc.) o tiene **lookalikes mortales** (Prioridad: `critical`).
3.  Faltan fotos críticas de diagnóstico (Prioridad: `medium` o `high`).

---

## Endpoints de la API

*   **Crear Petición:**
    `POST /observations/{observation_id}/request-human-review`
    Crea una petición de revisión (por defecto `pending`) si no existe ya una activa.

*   **Listar Peticiones:**
    `GET /human-reviews?status=pending`
    Devuelve las revisiones pendientes, en revisión o resueltas.

*   **Ver Petición:**
    `GET /human-reviews/{review_id}`

*   **Resolver/Actualizar Petición:**
    `PATCH /human-reviews/{review_id}`
    Permite al revisor experto asignar:
    *   `reviewer_taxon`: Nombre de la especie o género corregido.
    *   `reviewer_confidence`: Puntuación de confianza (0.0 a 1.0).
    *   `reviewer_notes`: Observaciones descriptivas.
    *   `status`: Cambiar a `in_review`, `resolved` o `rejected`.

---

## Restricciones Críticas de Seguridad

1.  **Bloqueo de términos de consumo:** La API de actualización valida el input del revisor. Si los campos `reviewer_taxon` o `reviewer_notes` contienen palabras prohibidas de consumo seguro (p. ej., *"safe_to_eat"*, *"comestible"*, *"segura"*, *"no venenosa"*, *"se puede comer"*), la API responde con un error `400 Bad Request`.
2.  **Advertencia de no consumo persistente:** Una vez resuelta la revisión, las clasificaciones avanzadas posteriores mostrarán el taxón del revisor experto como primera opción, pero la respuesta general seguirá manteniendo firmemente:
    *   `status`: `"orientation_only"`
    *   `safety_level`: `"unsafe_to_consume"`
    *   `final_warning`: *"No consumas ninguna seta identificada únicamente mediante una app."*
