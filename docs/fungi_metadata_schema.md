# Fungi Metadata Schema

## Objetivo

Definir un esquema minimo de metadatos compatible con un futuro pipeline multimodal inspirado en FungiTastic y FungiCLEF.

## Campos implementados

- country
- region
- latitude
- longitude
- observed_at
- habitat
- substrate
- nearby_trees
- altitude_m
- smell
- color_change_on_cut
- user_notes

## Estrategia actual

- hashing simple para categoricos
- bucket de mes y estacion
- contador de arboles cercanos
- flags de geolocalizacion y notas

## Evolucion prevista

- encoder aprendido
- restricciones suaves por region y temporada
- integracion con clima y elevacion
- embeddings textuales de notas
