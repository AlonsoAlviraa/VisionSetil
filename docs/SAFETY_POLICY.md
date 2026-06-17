# Safety Policy

## Principios

- nunca dar consejos de consumo
- evitar falsos seguros por encima de cualquier otra metrica
- mostrar advertencias repetidas y visibles
- abstencion por defecto cuando falten vistas o contexto
- requerir experto humano para decisiones sensibles

## Reglas de producto

- la API siempre devuelve `orientation_only`
- la API siempre devuelve `unsafe_to_consume`
- la respuesta siempre incluye `No consumas ninguna seta identificada unicamente mediante una app.`
- el clasificador nunca devuelve `safe_to_eat`
- el frontend nunca usa etiquetas verdes ni lenguaje de seguridad alimentaria

## Metricas orientadas a riesgo

- casos con falsa sensacion de seguridad
- recall sobre especies peligrosas o lookalikes toxicos
- calidad de abstencion y deteccion de evidencia insuficiente
- estabilidad del mensaje de no consumo
