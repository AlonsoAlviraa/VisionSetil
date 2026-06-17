# Deployment Notes

## Modo mock

Por defecto:

- `USE_REAL_YOLOE=false`
- `USE_REAL_DINOV3=false`
- `USE_REAL_SIGLIP2=false`

La app funciona con fallbacks conservadores y mantiene toda la safety layer.

## Modo real

Variables de entorno:

- `USE_REAL_YOLOE=true`
- `YOLOE_MODEL_NAME=yolov8n.pt`
- `YOLOE_MODEL_PATH=`
- `YOLOE_DEVICE=auto`
- `YOLOE_CONF_THRESHOLD=0.25`
- `YOLOE_IOU_THRESHOLD=0.7`

- `USE_REAL_DINOV3=true`
- `DINO_MODEL_NAME=facebook/dinov2-base`
- `DINO_MODEL_PATH=`
- `DINO_DEVICE=auto`
- `DINO_EMBEDDING_DIM=1024`

- `USE_REAL_SIGLIP2=true`
- `SIGLIP_MODEL_NAME=google/siglip-base-patch16-224`
- `SIGLIP_MODEL_PATH=`
- `SIGLIP_DEVICE=auto`
- `SIGLIP_EMBEDDING_DIM=768`

## Dependencias de Deep Learning

Para activar el modo real, debes instalar las dependencias necesarias en el entorno virtual de Python:

```bash
pip install torch torchvision transformers ultralytics Pillow
```

Si no están instaladas, el sistema hará fallback silencioso al modo mock con un warning en los logs sin interrumpir la ejecución del API.

## Base de Datos y Caché

- **SQLite Database:** La aplicación utiliza SQLite por defecto (`mushroom_photo_id.db`). Las tablas `observations`, `observation_images` y `human_review_requests` se crean automáticamente al arrancar.
- **Embedding Cache:** Los embeddings de imágenes se guardan automáticamente en una base de datos SQLite caché (`embedding_cache.db` en el directorio de subidas) para evitar recálculos lentos.
