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

### [2026-07-29] [DECISIÓN] Canon anti time-travel (MEMORY / ROADMAP / VISION ↔ STATE)
- **Contexto:** Agents leían MEMORY (2026-07-23) con MAP~0.07 e Identify “blocked” mientras E20 ya pasaba soft gates (MAP@3~0.860, deadly@3~0.927).
- **Decisión/Acción:** STATE es SSOT de versión/residual; ROADMAP/VISION alineados a E20; MEMORY guarda lecciones sin pretender ser tabla live de métricas. Process en `.grok/graph-engineering/PROCESS.md`.
- **Archivos:** `MEMORY.md`, `VISION.md`, `docs/ROADMAP.md`, `.grok/graph-engineering/*`, `docs/OPERATOR_BETA_CHECKLIST.md`
- **Estado:** ✅ Resuelto
- **Lección:** Tras cada ingest ML (E20/E21) hay que tocar canon docs el mismo ciclo — si no, el siguiente agent “viaja en el tiempo”.

### [2026-07-27/28] [DECISIÓN] product_unlock fail-closed + E20 source-holdout
- **Contexto:** Métricas soft pueden PASS y aún así no hay permiso de forrajeo.
- **Decisión/Acción:** `product_unlock` siempre false en código/helpers hasta ciclo operador humano; `unlock_eligible_advisory` es solo advisory. Protocolo serve = E20 source-holdout (GBIF ES test puro).
- **Archivos:** `kaggle/ml_qa/gate_eval.py`, `docs/OPERATOR_UNLOCK_RUNBOOK.md`, quality_gate / models status
- **Estado:** ✅ Enforced
- **Lección:** Soft gates ≠ product unlock ≠ edible.

### [2026-07-28] [DECISIÓN] Closed beta Path A (Caddy) + GTM try-first
- **Contexto:** Necesidad de cohorte 20–40 sin App Store.
- **Decisión/Acción:** Hosting Path A documentado; form `VITE_BETA_FEEDBACK_URL`; checklist operador real.
- **Archivos:** `docs/HOSTING_DEPLOY_BETA.md`, `docs/GTM_BETA_COHORT.md`, `docs/OPERATOR_BETA_CHECKLIST.md`
- **Estado:** ⚠️ Docs shipped · deploy/form residual operador
- **Lección:** No blast cohorte sin HTTPS + form + smoke Identify.

### [2026-07-28] [DECISIÓN] Index Fungorum names-only backbone
- **Contexto:** Oferta Kew / API IF.
- **Decisión/Acción:** Integrar nomenclatura + sinónimos; no sustituye risk/classify; atribución en model card.
- **Archivos:** `backend/app/services/index_fungorum.py`, `docs/INDEX_FUNGORUM.md`, `docs/MODEL_CARD.md`
- **Estado:** ✅ Shipped (bulk synonyms); CSV oficial Kew opcional
- **Lección:** Nomenclature ≠ safety label.

---

## 📚 Lecciones Aprendidas

### [2026-07] [APRENDIZAJE] Kaggle FS + CSV detection
- Nunca `rglob` profundo en datasets Kaggle; paths conocidos + validación de CSV (no climatic/timeseries).
- DataParallel freeze: siempre `_unwrap(model).backbone`, nunca bare `model.backbone` en DP.

### [2026-07] [APRENDIZAJE] Dual deadly honesty
- `safety_recall_deadly` ambiguo sin definición @1/@3 y sin set industrial → fail-closed en quality_gate.
- Recompute desde npz + `deadly_set.json` ∩ label2idx; no confiar en keys legacy solas.

### [2026-07] [APRENDIZAJE] Multi-view honesty de producto
- Field holdout: MAP@3 sube 1→4 en general; deadly subset puede ser **flat**.
- Copy obligatorio: multi-foto sin vistas diagnósticas ≠ más seguro para consumir.
- ECE high (~0.19) → ocultar % de confianza en Identify chrome.

### [2026-07-29] [APRENDIZAJE] Graph engineering hygiene
- Commits temáticos (ml / catalog / fe / docs) > monobloque.
- Residual operador no se “cierra” con más polish FE autónomo.

---

## 🚀 Historial de Sprints / Graph

| Época | Resultado |
|-------|-----------|
| Phase D/E (pre graph v1) | UI/AuthZ/CI base shipped |
| Graph v1.0–1.3 | E20 complete + SSOT lookalikes + dual deadly |
| Graph v1.4–1.5 | Multiview honesty + beta/GTM/hosting docs |
| Graph v1.6–1.8 | Soft coach, geo pins, capture density |
| Graph v1.9.x | IF, ECE chrome, field holdout M3, S9 schema |
| Process sync 2026-07-29 | Canon docs + operator beta checklist |

Detalle: `.grok/graph-engineering/graph_evolution.md`.

---

## 🔬 Research y Experimentos

| Exp | Protocolo | Notas |
|-----|-----------|--------|
| E16–E19 | Varios multi-source | v19 MAP alto pero no protocol E20; dual keys recompute |
| **E20** | source_holdout_e20 | **Serve baseline** MAP@3~0.860 deadly@3~0.927 |
| E21 | scale holdout (plan) | Readiness only · no lanzado |
| Field multiview M3 | same-occurrence LOO | +MAP general · deadly flat caveat |
| IF bulk synonyms | live API | ~6951 aliases accepted |

---

## ⚠️ Deuda Técnica Conocida

| Item | Severidad | Notas |
|------|-----------|--------|
| Deploy + form + cohorte no ejecutados | Alta (ops) | Checklist operador |
| S9 tráfico real sparse | Media | Schema listo; falta traffic |
| ECE high | Media | Chrome humilde shipped; calib residual |
| deadly@1 ~0.79 vs aspiración | Media | Open-set + lookalikes mitigan; no fingir 100% |
| View-slot labeled holdout (M4) | Baja/Media | Necesita FT media local |
| MEMORY/ROADMAP time-travel | ✅ Mitigado | Process sync 2026-07-29 |
| E-08 HttpOnly cookies | Baja | Deferred opt-in |
| monorepo uncommitted histórico | Media | Snapshot temático process sync |

---

## 🚨 Incidentes

### [2026-07] [INCIDENTE] E20 bare DataParallel freeze crash
- **Contexto:** `AttributeError: DataParallel has no attribute 'backbone'` en freeze.
- **Acción:** `_unwrap(model)` en notebook + `safe_dp_freeze` guard + monitor recovery push.
- **Estado:** ✅ Resuelto en kernel E20 COMPLETE

### [2026-07] [INCIDENTE] Monitor SSL false-positive ERROR
- **Contexto:** `autonomous_monitor_e20` trataba texto SSL "error" como kernel ERROR.
- **Acción:** `classify_status()` distingue api_error vs KernelWorkerStatus.ERROR.
- **Estado:** ✅ Resuelto

---

## 📌 Contexto Activo

> **Última actualización:** 2026-07-29 — Graph Engineering process sync (anti time-travel)

| Campo | Valor |
|-------|--------|
| **Graph version** | `v1.9.9-s9-log-schema` (+ process/docs sync) |
| **Rama típica** | `main` |
| **Canon estado** | `.grok/graph-engineering/STATE.md` |
| **ML serve** | E20 MultiView v8 · 40 classes · soft gates **PASS** |
| **MAP@3 / deadly@3** | **~0.860 / ~0.927** (no ~0.07) |
| **product_unlock** | **false** (advisory eligible only) |
| **Identify** | Path real + open-set + SSOT lookalikes (orientation only) — **no** “blocked forever” |
| **Catalog** | SSOT ~523 · lookalikes + IF synonyms |
| **Beta** | Código listo · **operador:** deploy + form + smoke + cohorte |

**Hecho (graph v1.x, no reabrir como “blocked ML”):**
- E20 ingest, dual deadly honesty, open-set thr, S8–S14 pro tester
- Multiview honesty en producto + ECE chrome
- GTM/hosting/unlock runbooks + `OPERATOR_BETA_CHECKLIST.md`
- Index Fungorum product wire + model card citation

**Residual inmediato (operador):**
1. `docs/OPERATOR_BETA_CHECKLIST.md` steps 1–5  
2. Kew/CSV opcional  
3. Unlock solo vía runbook si se desea (sigue orientation-only)  

**Residual autónomo OK:** S9 depth bajo tráfico, i18n/a11y polish, M4 si hay media — **no** deploy/unlock/E21 push.

**Prohibido en contexto agent:**
- Citar MAP@3 ~0.07 o Identify permanently blocked como baseline actual  
- Auto `product_unlock=true`  
- Lenguaje edible / forage OK  

---

## 🐛 Bugs Resueltos (histórico Kaggle / training)

### [2026-07-09] [BUG] Duplicate species columns crash groupby
- **Contexto:** El CSV de FungiTastic tiene tanto `scientificName` como `species`. El COLUMN_MAP renombraba `scientificName` → `species`, creando columnas duplicadas.
- **Decisión/Acción:** Safe rename (solo si el destino no existe) + dedup guard.
- **Archivos:** `kaggle/gen_notebook_v5.py` (Cell 5)
- **Estado:** ✅ Resuelto
- **Lección:** Siempre verificar duplicados después de `.rename()` en pandas.

### [2026-07-10] [BUG] Kernel timeout 12h (v2) — entrenamiento inviable
- **Contexto:** ConvNeXtV2 Base (89M params) × 4 views × 150k imágenes × 25 epochs = ~50h estimadas. Kaggle mata el kernel a las 12h sin mensaje de error.
- **Decisión/Acción:** Reescritura completa del notebook (gen_notebook_v6.py) con 10 mejoras: backbone tiny (28M), LoRA vectorizado (torch.bmm), subsampling (top-500 × 5 obs = ~7.5k imgs), 8 epochs, transforms v2, AMP, logging granular, checkpointing, early stopping, multi-DB.
- **Archivos:** `kaggle/gen_notebook_v6.py` (23 cells)
- **Estado:** ✅ Resuelto (pipeline evolucionado a exp v12–v20)

### [2026-07-10] [BUG] CSV detection picked wrong file → 1 species, 350k useless rows
- **Contexto:** El kernel v5 detectó `FungiTastic-Climatic-Timeseries.csv` (914 columnas) como metadata de imágenes.
- **Decisión/Acción:** `_is_valid_image_csv()` + known paths.
- **Archivos:** `kaggle/gen_notebook_v7.py` (Cell 4)
- **Estado:** ✅ Resuelto
- **Lección:** Validar contenido de CSVs antes de procesarlos.

### [2026-07-10] [BUG] Missing deadly species safety (DO3 unmet)
- **Decisión/Acción:** DEADLY_SPECIES + safety_recall_deadly (luego dual at_1/at_3 honesty).
- **Estado:** ✅ Resuelto / evolucionado E20

### [2026-07-10] [BUG] Wrong artifact names (DO8 unmet)
- **Decisión/Acción:** `best.pt`, `metrics.json`, `label2idx.json`, `test_predictions.npz`.
- **Estado:** ✅ Resuelto

### [2026-07-10] [BUG] In-place tensor assignment risk
- **Decisión/Acción:** `features.index_copy(...)` seguro para autograd.
- **Estado:** ✅ Resuelto

### [2026-07-27] [BUG] pair_error_rate top-k shadowing
- **Contexto:** Loop sobre `idx2label` sobrescribía `k` → reportaba k=39.
- **Decisión/Acción:** variable `top_k` local.
- **Archivos:** `eval/scripts/lookalike_pair_metrics.py`
- **Estado:** ✅ Resuelto

### [2026-07-27] [BUG] training_metrics sort lexical v9 > v20
- **Contexto:** Primary dashboard mostraba v9 MAP~0.07 en lugar de E20.
- **Decisión/Acción:** sort por `version_num` numérico.
- **Archivos:** `backend/app/ml/training_metrics.py`
- **Estado:** ✅ Resuelto

---

*Documento vivo. Canon de métricas live = STATE + eval reports — no este archivo solo. Actualizado 2026-07-29 process sync.*
