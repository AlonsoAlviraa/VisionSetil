# Product Spec

## Problema

Identificar setas desde una sola foto genera falsa seguridad. Muchas especies requieren varias vistas y contexto ambiental para distinguirse de dobles toxicos.

## Usuario objetivo

- aficionados que quieren aprender sin asumir consumo
- personas que registran observaciones de campo
- asociaciones o revisores que quieran una base inicial de observaciones

## Flujo del MVP

1. Inicio con aviso de seguridad y boton `Nueva observacion`.
2. Formulario de metadatos con pais, region, ubicacion aproximada, habitat, arboles, sustrato, olor, cambio al corte y notas.
3. Subida guiada de varias fotos.
4. Clasificacion orientativa con top candidatos, confianza, evidencias faltantes y lookalikes peligrosos.
5. Historial personal de observaciones.

## Que hace

- guarda observaciones en SQLite
- sube varias imagenes a `backend/uploads`
- ejecuta un `MockMushroomClassifier` conservador
- expone catalogo inicial de especies venenosas
- genera explicacion educativa y preguntas de seguimiento

## Que no hace

- no entrena un modelo real
- no usa APIs externas por defecto
- no confirma consumo ni seguridad
- no sustituye validacion humana

## Limites de seguridad

- abstencion por defecto en la semantica de salida
- `orientation_only` siempre presente
- `unsafe_to_consume` siempre presente
- advertencia de no consumo en todas las clasificaciones

## Futuras integraciones

- API tipo mushroom.id
- embeddings y modelos propios con FungiTastic, DF20 y FungiCLEF
- panel de revision humana y comunidad
