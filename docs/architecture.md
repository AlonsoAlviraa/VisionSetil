# Architecture

## Backend

`backend/app/main.py` monta FastAPI y registra rutas para salud, observaciones, clasificacion y especies venenosas.

## Frontend

`frontend/` contiene una SPA React movil-first con pantallas de inicio, nueva observacion, subida guiada, resultado e historial.

## Servicios

- `services/classifier.py`: interfaz `MushroomClassifier` y `MockMushroomClassifier`
- `services/safety_explanation.py`: `SafetyExplanationService`
- `services/quality_validation.py`: validacion de nitidez, vistas criticas, entorno y senales de mezcla
- `services/image_storage.py`: validacion y guardado local de imagenes
- `services/species_catalog.py`: lectura de catalogos JSON

## Base de datos

SQLite con SQLAlchemy:

- `Observation`: metadatos de campo y ultima clasificacion
- `ObservationImage`: imagenes asociadas y vista inferida

## Almacenamiento

- SQLite en `backend/mushroom_photo_id.db`
- imagenes en `backend/uploads`
- catalogos JSON en `backend/app/data`

## Clasificador

El mock usa palabras clave y faltantes de evidencia para reducir confianza. Nunca emite una salida de consumo seguro y siempre devuelve `orientation_only`.

## Capa de riesgo y trazabilidad

La clasificacion taxonomica queda separada de la evaluacion de riesgo:

- `status`: siempre `orientation_only`
- `safety_level`: siempre `unsafe_to_consume`
- `risk_state`: `needs_more_evidence`, `needs_expert_review`, `high_risk_lookalikes` o `unknown_or_out_of_distribution`
- `quality_assessment`: valida vistas diagnosticas y problemas basicos de calidad
- `trace`: deja preparada la evolucion a segmentacion, embeddings multimodales, open-set rejection y revision humana

## Sustituir mock por modelo real

La interfaz `MushroomClassifier` permite introducir:

- `ExternalApiClassifier` para mushroom.id
- `EmbeddingClassifier` para DINOv2, SigLIP o BioCLIP
- `MultimodalClassifier` para fusionar imagen y metadatos
- `SegmentedPipelineClassifier` para YOLOE o YOLO26-seg como etapa de crop antes del ranker

## Integracion API externa

La ruta de clasificacion solo depende del contrato `classify(observation, images)`. Se puede cambiar la implementacion sin romper los endpoints ni el frontend.
