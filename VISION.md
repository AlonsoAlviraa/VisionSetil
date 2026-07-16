# 🍄 VisionSetil — Visión del Producto

> **Documento fundacional para Loop Engineering.** Define QUÉ es VisionSetil, POR QUÉ existe, y QUÉ NO es.

---

## 1. Declaración de Misión

**VisionSetil** es un sistema de **identificación orientativa de setas** desde fotografías, diseñado con una filosofía *safety-first*. El objetivo no es reemplazar al micólogo experto, sino ofrecer una **primera orientación** rigurosa, conservadora y educativa que priorice siempre la seguridad del usuario.

> **Una identificación incorrecta puede costar una vida.** Cada decisión de diseño se toma bajo este axioma.

---

## 2. El Problema

| Problema | Impacto |
|----------|---------|
| Las setas son difíciles de identificar visualmente, incluso para expertos | Confusión entre especies comestibles y mortales |
| Las apps existentes dan falsa confianza ("segura para comer") | Intoxicaciones graves, incluso fatales |
| La identificación requiere múltiples ángulos (laminillas, sombrero, pie, hábitat) | Una sola foto no es suficiente |
| No existen sistemas que combinen multi-vista + metadata + open-set rejection | Falsos positivos peligrosos |

---

## 3. La Solución: VisionSetil

### 3.1 Arquitectura Multi-Vista
El usuario sube **hasta 4 vistas** de la misma seta:
- 🌀 **Laminillas** (gills) — parte inferior del sombrero
- 📸 **Frontal** (front) — vista completa de perfil
- 🌿 **Hábitat** (habitat) — entorno donde crece
- 🔍 **Detalle** (detail) — primer plano del sombrero/pie

El modelo fusiona todas las vistas mediante **attention pooling** + **metadata** (hábitat, sustrato, olor, país) para producir una predicción más robusta.

### 3.2 Safety Policy Inviolable
- **Nunca** se usa el lenguaje "segura para consumir"
- Toda salida es `orientation_only` y `unsafe_to_consume`
- Las especies mortales (deadly) **siempre** se flaggean con advertencia crítica
- El **recall de deadly debe ser 100%** — es preferible un falso positivo a un falso negativo

### 3.3 Open-Set Rejection
El sistema **rechaza** observaciones de las que no está seguro (threshold de confianza calibrado), en lugar de forzar una predicción. Un "no lo sé" es una respuesta válida y segura.

---

## 4. Métrica Norte (North Star Metric)

- **MAP@3** (Mean Average Precision @ 3) — métrica oficial de FungiCLEF
- Objetivo: maximizar MAP@3 manteniendo **safety recall deadly = 100%**
- Toda métrica reportada con **IC 95%** (bootstrap con 1000 iteraciones)

---

## 5. Audiencia

| Usuario | Necesidad | Cómo lo resuelve VisionSetil |
|---------|-----------|------------------------------|
| **Senderista curioso** | "¿Qué seta es esta?" | Interfaz simple, multi-vista guiada, advertencias claras |
| **Micólogo aficionado** | Confirmar hipótesis | Top-3 predicciones con score, metadata taxonómica |
| **Investigador / repositorio de datos** | Dataset anotado de observaciones | Export de observaciones para Kaggle, feedback loop de revisión humana |
| **Comunidad micológica** | Aprender y compartir | Colección personal, batch compare, educación |

---

## 6. Límites del Producto (Lo que VisionSetil NO es)

| ❌ No es | ✅ Sí es |
|----------|---------|
| Una guía de consumo | Una herramienta de orientación taxonómica |
| Un reemplazo del experto | Un primer filtro conservador |
| Un sistema de 100% de precisión | Un sistema que admite incertidumbre (open-set) |
| Un producto médico | Una herramienta educativa de campo |

---

## 7. Estado Actual (v0.2.0 → v0.3.0)

- ✅ Backend FastAPI con 12 routers, 15+ servicios, middleware de seguridad
- ✅ Frontend React 18 PWA en español con flujo multi-vista
- ✅ Pipeline de entrenamiento en Kaggle (mega_training_v5.py)
- ✅ Safety policy implementada en todo el stack
- ✅ Tests de seguridad, clasificación, multi-vista
- 🔄 Sprint actual: robustez de modelos + data pipeline
- 📅 Roadmap: MLOps, monitoring, escalabilidad multi-tenant

---

## 8. Principios de Diseño

1. **Safety over accuracy** — Si hay conflicto, gana la seguridad
2. **Conservative over confident** — Mejor rechazar que adivinar
3. **Multi-view over single-view** — Más información = mejor decisión
4. **Transparent over opaque** — El usuario debe entender el nivel de certeza
5. **Educated over ignorant** — Cada predicción viene con contexto educativo
6. **Reproducible over ad-hoc** — Todo entrenamiento con config JSON versionada

---

## 9. Referencias Clave

- `docs/SAFETY_POLICY.md` — Política de seguridad completa
- `docs/ROADMAP.md` — Roadmap de sprints (N+1 a N+4 + Backlog)
- `docs/product_spec.md` — Especificación de producto detallada
- `docs/KAGGLE_FIX_PROMPT.md` — Prompt de fix + sprints + reglas duras

---

*Documento vivo. Actualizado por el Loop Engineering Agent.*