# Dataset Strategy

> **España / Soria / organismos públicos:** ver
> [`DATA_SOURCES_SPAIN_SORIA.md`](./DATA_SOURCES_SPAIN_SORIA.md) y
> `data/training_sources_registry.json`. Sondeo GBIF:
> `python scripts/probe_gbif_spain_fungi.py --write`.

## FungiTastic

Usar FungiTastic como fuente principal para:

- prototipos por especie
- embeddings por observacion
- metadatos ecologicos
- evaluacion de especies raras

## FungiCLEF

Usar FungiCLEF 2024/2025 para:

- benchmark top-k
- comparacion por especie y genero
- few-shot y long tail
- evaluacion de robustez

## DF20

DF20 sirve como base adicional para entrenamiento y comparacion regional.

## Prototipos por especie

Estrategia prevista:

- extraer embeddings DINOv3/SigLIP2 por imagen
- agrupar por observacion
- calcular centroides por especie y, si hace falta, por genero

## Splits

- separar train/validation/test por observacion, no por imagen
- evitar leakage entre vistas de la misma observacion
- considerar splits por region y temporada para robustez real

## Metricas

- species accuracy
- genus accuracy
- top-k accuracy
- toxic confusion cost
- false_safe_rate

## Riesgo de data leakage

No mezclar fotos hermanas de una misma observacion entre train y test. El leakage por observacion falsearia la calidad real del sistema.
