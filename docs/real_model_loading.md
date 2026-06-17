# Carga de Modelos Reales y Fallbacks

Este documento detalla el funcionamiento, configuración y modo de recuperación (fallback) de los modelos de aprendizaje automático en VisionSetil:
*   **Detector/Segmentador:** YOLOE-26
*   **Visual Embedding:** DINOv3
*   **Image-Text Embedding:** SigLIP 2

---

## Variables de Entorno y Configuración

Los modelos se activan mediante variables de entorno (cargadas en `app.core.config`):

```bash
# YOLOEDetector (Detección de setas y recortado de imágenes)
USE_REAL_YOLOE=true
YOLOE_MODEL_NAME=yolov8n.pt  # Nombre del modelo en la librería ultralytics
YOLOE_MODEL_PATH=             # Ruta local opcional a los pesos
YOLOE_DEVICE=auto             # 'cpu', 'cuda' o 'auto'
YOLOE_CONF_THRESHOLD=0.25
YOLOE_IOU_THRESHOLD=0.7

# DINOv3Embedder (Extracción de características visuales)
USE_REAL_DINOV3=true
DINO_MODEL_NAME=facebook/dinov2-base
DINO_MODEL_PATH=
DINO_DEVICE=auto
DINO_EMBEDDING_DIM=1024

# SigLIP2Embedder (Similaridad imagen-texto)
USE_REAL_SIGLIP2=true
SIGLIP_MODEL_NAME=google/siglip-base-patch16-224
SIGLIP_MODEL_PATH=
SIGLIP_DEVICE=auto
SIGLIP_EMBEDDING_DIM=768
```

---

## Carga Dinámica y Dependencias

Dado que el entorno base puede no tener instaladas las librerías de Deep Learning (`torch`, `torchvision`, `transformers`, `ultralytics`), el backend implementa **importaciones dinámicas**:

1.  Al arrancar la aplicación o la primera petición, el `ModelRegistry` (que actúa como Singleton) lee las variables de entorno.
2.  Si `USE_REAL_XXX` está a `true`, intenta importar la librería pertinente y cargar el modelo.
3.  Si ocurre un error de importación (`ImportError`) o los archivos de pesos no existen en la ruta indicada, el sistema **registra una advertencia en los logs** y desactiva el uso del modelo real para esa ejecución.
4.  **Modo Fallback:** En lugar de lanzar una excepción y tumbar la petición, el sistema delega automáticamente en los modelos mock correspondientes (`mock_yoloe`, `mock_dinov3`, `mock_siglip2`), garantizando que la API responda siempre.

---

## Verificación de Estado

Para diagnosticar qué modelos están cargados en producción, consulta el endpoint:
```http
GET /models/status
```

Respuesta típica:
```json
{
  "detector": {
    "requested": "YOLOE-26",
    "backend": "real_yoloe",
    "loaded": true,
    "device": "cuda",
    "model_path": null
  },
  "visual_embedder": {
    "requested": "DINOv3",
    "backend": "real_dinov3",
    "loaded": true,
    "device": "cuda",
    "embedding_dim": 1024
  },
  "image_text_embedder": {
    "requested": "SigLIP 2",
    "backend": "mock_siglip2",
    "loaded": false,
    "device": "cpu",
    "embedding_dim": 768,
    "reason": "weights_not_found"
  }
}
```
