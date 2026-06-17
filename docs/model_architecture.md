# Model Architecture

## Vision general

La pipeline avanzada implementada sigue este flujo:

1. validacion de calidad
2. detector compatible con YOLOE-26 (Real si está activo y con pesos, o fallback mock)
3. crop conservador de la seta en disco (`/uploads/observations/{id}/crops/`) y máscara si existe (`/uploads/observations/{id}/masks/`)
4. embeddings visuales con adaptador DINOv3 (Real o fallback) y normalización L2
5. embeddings imagen-texto con adaptador SigLIP 2 (Real o fallback) y similitud coseno
6. Caché de embeddings persistente en SQLite para optimizar tiempos de cómputo
7. fusion multi-imagen
8. fusion con metadatos inspirados en FungiTastic/FungiCLEF
9. ranking top-k
10. Open-Set Rejection (Rechazo y degradación por incertidumbre, falta de evidencias o riesgo alto)
11. safety layer estricta
12. Revisión humana experta (Si se requiere, permitiendo anular predicción una vez resuelta)

## Por que YOLOE-26 no es el clasificador final

YOLOE-26 se trata como etapa de deteccion y crop, no como juez final de especie. Esto evita usar un detector rapido para una tarea de reconocimiento fino con riesgo alto.

## Por que DINOv3 es el backbone principal

DINOv3 queda como backbone visual principal por su utilidad para embeddings finos y por su buena compatibilidad con una arquitectura de retrieval o prototipos.

## Por que SigLIP 2 ayuda

SigLIP 2 permite comparar imagenes con descripciones textuales de especies. Eso ayuda en ranking semantico, explicabilidad y futuras integraciones zero-shot o few-shot.

## Metadata estilo FungiTastic/FungiCLEF

El encoder actual representa pais, region, temporada, habitat, sustrato, arboles, altitud y notas como vector numerico simple. Esta capa queda preparada para sustituirse por un encoder aprendido.

## Caché de Embeddings

Para evitar la recomputación redundante de características de imágenes idénticas (muy costoso en CPU/GPU), se ha integrado un `EmbeddingCache` en SQLite. Almacena vectores calculados vinculándolos al hash MD5 del archivo original.

## Fusion multi-imagen

La fusion pondera mas:

- laminas o poros
- base
- corte

y menos:

- fotos desconocidas
- entorno

Tambien aplica penalizacion por evidencias faltantes.

## Ranking

El ranker combina:

- similitud visual (DINOv3)
- similitud imagen-texto (SigLIP 2)
- ajuste por metadatos
- penalizacion por evidencia insuficiente

## Safety layer

La safety layer:

- fuerza `orientation_only`
- fuerza `unsafe_to_consume`
- elimina cualquier semantica de consumo seguro
- reduce confianza si faltan vistas criticas
- eleva warnings para Amanita, Galerina, Cortinarius, Lepiota y Gyromitra
