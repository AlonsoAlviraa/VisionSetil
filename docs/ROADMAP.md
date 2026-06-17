# Roadmap

## Fase 1

MVP mock funcional con FastAPI, React, SQLite, subida multiple de fotos, clasificacion orientativa y safety rails.

## Fase 2

Integracion con API externa tipo mushroom.id o primer pipeline visual con:

- crop por YOLOE o YOLO26-seg
- embeddings congelados con DINOv3, SigLIP2 y BioCLIP
- ranking top-k sin romper la capa de seguridad

## Fase 3

Pipeline de datasets y entrenamiento con FungiTastic, DF20 y FungiCLEF, incluyendo:

- fusion multi-imagen
- fusion con metadatos
- evaluacion top-k
- coste de falsos seguros
- checkpoints especificos de fungi

## Fase 4

Risk engine y validacion humana:

- lookalikes peligrosos
- abstencion
- open-set rejection
- conformal prediction
- cuentas, cola de revision, roles de experto y moderacion

## Fase 5

Produccion controlada:

- PostgreSQL y almacenamiento objetual
- cola de inferencia
- observabilidad y versionado
- modelo multimodal con imagen, metadatos, geografia, temporada y abstencion calibrada
