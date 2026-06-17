# Documentacion tecnica

## Objetivo

VisionSetil implementa una arquitectura simple, segura por defecto y preparada para evolucionar desde un clasificador mock a un proveedor de vision externo o a un modelo propio.

## Componentes

- `app/main.py`: arranque FastAPI, `lifespan`, montaje de estaticos y uploads.
- `app/database.py`: engine SQLite y sesiones SQLAlchemy.
- `app/models.py`: observaciones, fotos y catalogo persistente de especies peligrosas.
- `app/routers/api.py`: API JSON para salud, observaciones, catalogo y chat.
- `app/routers/web.py`: render server-side del frontend movil-first.
- `app/services/classifier.py`: clasificador mock conservador.
- `app/services/providers.py`: contrato para conectar FungiTastic, DF20, FungiCLEF o un modelo propio.
- `app/services/chatbot.py`: respuestas educativas con bloqueo de consejos de consumo.

## Flujo de observacion

1. La persona sube varias fotos y metadatos de campo.
2. El backend guarda la observacion y las imagenes en disco local.
3. El clasificador mock busca coincidencias con marcadores de especies peligrosas.
4. La respuesta persiste riesgo, resumen educativo y advertencia obligatoria.
5. El frontend muestra el resultado como orientacion, nunca como veredicto de seguridad.

## Preparacion para modelos externos

La interfaz `ClassifierProvider` aisla el backend del mecanismo de inferencia. Un siguiente paso razonable:

- crear `ExternalApiClassifier` para un proveedor HTTP
- crear `LocalModelClassifier` para un pipeline propio
- encapsular transformaciones de datasets FungiTastic, DF20 y FungiCLEF en un modulo de adapters
- registrar proveedores por configuracion o feature flag

## Almacenamiento

- SQLite: metadatos y catalogo
- `uploads/`: imagenes originales
- JSON seed: especies peligrosas iniciales

## Tests

Los tests cubren:

- politica educativa del healthcheck
- disponibilidad del catalogo
- respuesta conservadora del clasificador mock
- bloqueo de consejo de consumo en el chatbot
