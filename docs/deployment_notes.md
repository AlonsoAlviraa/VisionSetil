# Deployment Notes

## Modo mock

Por defecto:

- `USE_REAL_YOLOE=false`
- `USE_REAL_DINOV3=false`
- `USE_REAL_SIGLIP2=false`

La app funciona con fallbacks conservadores y mantiene toda la safety layer.

## Modo real

Variables de entorno:

- `YOLOE_MODEL_NAME`
- `YOLOE_MODEL_PATH`
- `DINO_MODEL_NAME`
- `DINO_MODEL_PATH`
- `SIGLIP_MODEL_NAME`
- `SIGLIP_MODEL_PATH`
- `TOP_K_CANDIDATES`
- `MAX_IMAGE_MB`
- `UPLOAD_DIR`

## Dependencias opcionales

El repo no afirma cargar modelos reales por defecto. Los adaptadores estan preparados, pero la integracion efectiva de pesos queda pendiente.

## ONNX y TensorRT

La arquitectura deja previsto:

- exportacion ONNX para detector y embedders
- despliegue TensorRT si hay NVIDIA
- servicio desacoplado de inferencia en produccion

## Servidor y edge

- servidor: FastAPI + cola futura + almacenamiento objetual
- edge: detector ligero y preclasificacion local, con resolucion final en backend
