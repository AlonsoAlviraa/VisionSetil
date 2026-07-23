# 🧠 VisionSetil — Memoria del Sistema

> **Bitácora para Loop Engineering.** Registra decisiones, bugs, lecciones aprendidas y contexto histórico. Empieza vacía pero estructurada para uso inmediato.

---

## 📋 Convención de Entradas

Cada entrada sigue este formato:

```
### [FECHA] [TIPO] Título breve
- **Contexto:** Por qué pasó / por qué se decidió
- **Decisión/Acción:** Qué se hizo
- **Archivos:** Rutas afectadas
- **Estado:** ✅ Resuelto | ⚠️ Pendiente | 🔄 En progreso
- **Lección:** Qué aprender para el futuro
```

**Tipos**: `[BUG]` `[DECISIÓN]` `[APRENDIZAJE]` `[SPRINT]` `[DEPLOY]` `[RESEARCH]`

---

## 🐛 Bugs Resueltos

### [2026-07-09] [BUG] v5: Wrong CSV detected (Climatic-Timeseries, 914 cols)
- **Contexto:** v5 escogió `FungiTastic-Climatic-Timeseries.csv` que tiene 914 columnas (no es metadata de imágenes). Resultó en 1 especie, 350k filas inútiles, 1.8h desperdiciadas.
- **Decisión/Acción:** Filtro `_is_valid_image_csv()` que rechaza >50 cols + keywords "climatic"/"timeseries"
- **Archivos:** `kaggle/gen_notebook_v7.py` (Cell 4), `kaggle/gen_notebook_v8.py` (Cell 4)
- **Estado:** ✅ Resuelto en v7, preservado en v8
- **Lección:** Validar CSV antes de cargarlo completo. El filesystem de Kaggle es catastroficamente lento con millones de archivos.

### [2026-07-10] [BUG] v7: rglob scan took 49 minutes on FungiTastic
- **Contexto:** Incluso con bounded rglob (max 200 CSVs), el filesystem traversal en el dataset FungiTastic de Kaggle tomó 2958s (49 min). El árbol tiene millones de archivos anidados.
- **Decisión/Acción:** Reemplazar rglob completamente con **direct path construction**. Lista de paths conocidos (`metadata/FungiTastic/FungiTastic-ClosedSet-Test.csv`, etc.) que se prueban instantáneamente.
- **Archivos:** `kaggle/gen_notebook_v8.py` (Cell 3 + Cell 4)
- **Estado:** ✅ Resuelto en v8
- **Lección:** **NUNCA usar rglob en datasets de Kaggle.** Usar paths directos construidos desde la estructura conocida del dataset.

### [2026-07-10] [BUG] v7: FungiCLEF dataset = 0 images
- **Contexto:** El dataset `seemshukla/fungiclef` tiene una estructura diferente sin CSV con columnas estándar (image_path, species). El CSV detection falló y el fallback `rglob('*.jpg')` también por el mismo problema de lentitud.
- **Decisión/Acción:** Multi-tier CSV detection con más paths conocidos + fallback a build-from-files con bounded glob (no rglob) usando parent-dir como species label.
- **Archivos:** `kaggle/gen_notebook_v8.py` (Cell 4)
- **Estado:** ✅ Resuelto en v8 (pending verification)
- **Lección:** Cada dataset de Kaggle tiene estructura única. Necesitas paths específicos por dataset, no un scanner genérico.

### [2026-07-10] [BUG] v7: Stratified split crash (ValueError)
- **Contexto:** Con `MAX_OBS_PER_SPECIES=5`, algunas especies quedaron con solo 1 observación después del subsampling. `train_test_split(stratify=...)` requiere >= 2 muestras por clase.
- **Decisión/Acción:** 
  1. Aumentar `MAX_OBS_PER_SPECIES` de 5 a 8 (más datos para split seguro)
  2. Filtrar especies con >= 4 obs (era >= 3)
  3. Split robusto: separar clases "large" (>=4 obs, stratified) de "small" (2-3 obs, random split)
- **Archivos:** `kaggle/gen_notebook_v8.py` (Cell 5 + Cell 7)
- **Estado:** ✅ Resuelto en v8

---

## 🏗️ Decisiones de Arquitectura

*(Vacío — se poblará con decisiones significativas)*

<!-- Ejemplo:
### [2026-07-08] [DECISIÓN] SQLite en lugar de PostgreSQL para MVP
- **Contexto:** ...
-->

---

## 📚 Lecciones Aprendidas

*(Vacío — se poblará con insights técnicos)*

---

## 🚀 Historial de Sprints

*(Vacío — se poblará conforme completen sprints)*

<!-- Ejemplo:
### Sprint N+1: Robustez de Modelos y Data Pipeline
- **Objetivo:** ...
- **Resultado:** ...
- **Metrics:** MAP@3 = X [CI: ...]
-->

---

## 🔬 Research y Experimentos

*(Vacío — se poblará con hallazgos de investigación)*

---

## ⚠️ Deuda Técnica Conocida

*(Vacío — registrar todo tech debt consciente)*

---

## 🚨 Incidentes

*(Vacío — registrar incidentes de producción)*

---

## 📌 Contexto Activo

> **Última actualización:** 2026-07-23 — Phase E Quality/AuthZ + audit security/perf

**Sprint actual:** Phase E — CI verde, AuthZ residual, perf enciclopedia

**Rama:** `merge/best-of-both` (PR #1 a main abierto)

**Hecho (2026-07-23):**
- Audit security/perf remediated (scopes API, prod guardrails, jobs org, PWA, Home, async view_types)
- Phase E: vitest setup, AuthZ observations/reviews/uploads, token hash, encyc perf, CI
- Identify sigue **blocked** por quality gate (MAP@3 / deadly recall)

**ML baseline:** MAP@3 ~0.07–0.09, deadly recall insuficiente — gate FAIL intentional

**Próximo residual:** E-08 cookies opt-in; media P0 ok_real crawl; Kaggle E15/E16 eval

---

## 🐛 Bugs Resueltos

### [2026-07-09] [BUG] Duplicate species columns crash groupby
- **Contexto:** El CSV de FungiTastic tiene tanto `scientificName` como `species`. El COLUMN_MAP renombraba `scientificName` → `species`, creando columnas duplicadas.
- **Decisión/Acción:** Safe rename (solo si el destino no existe) + dedup guard.
- **Archivos:** `kaggle/gen_notebook_v5.py` (Cell 5)
- **Estado:** ✅ Resuelto
- **Lección:** Siempre verificar duplicados después de `.rename()` en pandas.

### [2026-07-10] [BUG] Kernel timeout 12h (v2) — entrenamiento inviable
- **Contexto:** ConvNeXtV2 Base (89M params) × 4 views × 150k imágenes × 25 epochs = ~50h estimadas. Kaggle mata el kernel a las 12h sin mensaje de error.
- **Decisión/Acción:** Reescritura completa del notebook (gen_notebook_v6.py) con 10 mejoras: backbone tiny (28M), LoRA vectorizado (torch.bmm), subsampling (top-500 × 5 obs = ~7.5k imgs), 8 epochs, transforms v2, AMP, logging granular, checkpointing, early stopping, multi-DB.
- **Archivos:** `kaggle/gen_notebook_v6.py` (23 cells), `OBJECTIVE.md`
- **Estado:** ✅ Resuelto (v3 pushed, esperando ejecución)

### [2026-07-10] [BUG] CSV detection picked wrong file → 1 species, 350k useless rows
- **Contexto:** El kernel v5 detectó `FungiTastic-Climatic-Timeseries.csv` (914 columnas, datos climáticos) como metadata de imágenes. Resultado: 1 especie, 350,425 imágenes inútiles, 6461s desperdiciados en rglob.
- **Decisión/Acción:** v7 implementa `_is_valid_image_csv()` que rechaza CSVs con >50 columnas y keywords como "climatic"/"timeseries". También añade tiers de búsqueda (known paths → glob → bounded rglob con límite de 200).
- **Archivos:** `kaggle/gen_notebook_v7.py` (Cell 4)
- **Estado:** ✅ Resuelto
- **Lección:** Validar siempre el contenido de CSVs antes de procesarlos. No confiar en rglob sin límites.

### [2026-07-10] [BUG] Missing deadly species safety (DO3 unmet)
- **Contexto:** El notebook no tenía lista de especies mortales ni métrica `safety_recall_deadly`. DO3 no se cumplía.
- **Decisión/Acción:** v7 añade `DEADLY_SPECIES` set (28 especies), mapeo a label indices, y cálculo de `safety_recall_deadly` en test evaluation.
- **Archivos:** `kaggle/gen_notebook_v7.py` (Cell 17 + Cell 21)
- **Estado:** ✅ Resuelto

### [2026-07-10] [BUG] Wrong artifact names (DO8 unmet)
- **Contexto:** Artifacts se guardaban como `multiview_v6_best.pt`, `final_metrics.json` en lugar de los nombres requeridos por DoD (`best.pt`, `metrics.json`).
- **Decisión/Acción:** v7 usa exact names: `best.pt`, `metrics.json`, `label2idx.json`, `training_history.json`, `test_predictions.npz`.
- **Archivos:** `kaggle/gen_notebook_v7.py` (Cell 19 + Cell 22)
- **Estado:** ✅ Resuelto

### [2026-07-10] [BUG] In-place tensor assignment risk
- **Contexto:** `features[real_mask] = real_features` puede romper autograd en algunos casos.
- **Decisión/Acción:** v7 usa `features.index_copy(0, real_indices, real_features)` que es seguro para autograd.
- **Archivos:** `kaggle/gen_notebook_v7.py` (Cell 11)
- **Estado:** ✅ Resuelto

---

*Documento vivo. Actualizado por el Loop Engineering Agent después de cada iteración.*