# Chinese Reference Patterns

## Mini-programa ligero

La interfaz React se ha planteado como flujo corto y movil-first con `Nueva observacion`, subida guiada y historial personal.

## Backend simple

El backend expone rutas REST directas para salud, observaciones, imagenes, clasificacion y especies venenosas.

## Modelo visual

Se usa `MockMushroomClassifier` con interfaz reemplazable por MobileNetV2, EfficientNet, DINOv2, SigLIP, BioCLIP, mushroom.id o un modelo propio entrenado con FungiCLEF.

## Clasificacion conservadora

La prioridad es evitar falsos seguros. La respuesta baja confianza si faltan vistas criticas y nunca devuelve consumo seguro.

## Chatbot o explicacion educativa

No se ha metido un LLM real. En su lugar, `SafetyExplanationService` genera explicacion, advertencias, checklist de faltantes y preguntas de seguimiento.

## Coleccion de observaciones

Cada observacion se guarda en SQLite y la SPA muestra un historial personal.

## Avisos de especies venenosas

Se carga un catalogo inicial con Amanita phalloides, Amanita muscaria, Amanita virosa, Galerina marginata, Cortinarius orellanus, Lepiota brunneoincarnata y Gyromitra esculenta.
