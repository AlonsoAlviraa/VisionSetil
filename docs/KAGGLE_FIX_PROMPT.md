# 🔧 PROMPT DE FIX — VisionSetil Kaggle Multi-View Training v5→v6

> **Estado actual**: El kernel v5 se ejecutó durante ~2 horas pero falló en **Cell 16** (model forward pass test). Hay **6 bugs identificados** en los logs. Este prompt describe exactamente qué está roto y cómo arreglarlo.

---

## 📋 CONTEXTO DEL FALLO

El kernel v5 progresó correctamente:
- ✅ CUDA smoke test PASSED (Tesla P100, sm_60)
- ✅ timm 1.0.26 cargado
- ✅ Dataset detectado en `/kaggle/input/datasets`
- ✅ Todas las clases del modelo definidas

Pero falló con:
```
RuntimeError: mat1 and mat2 shapes cannot be multiplied (1024x1 and 1024x16)
```
en el forward pass del `LoRAAdapter` dentro de `ViewConditionedBackbone.forward()`.

Adicionalmente, el **dataset cargado es incorrecto** (climatic data en vez de metadata de imágenes), resultando en **solo 1 especie** — inútil para entrenamiento.

---

## 🐛 BUGS IDENTIFICADOS (6 bugs, orden de severidad)

### BUG 1 — LoRA Adapter shape mismatch (CRÍTICO — mata el run)

**Archivo**: `kaggle/gen_notebook_v5.py`, CELL 11 (línea ~648)

**Código roto**:
```python
# ViewConditionedBackbone.forward()
features = self.backbone(images)  # [N, feat_dim] = [4, 1024]
adapted = torch.zeros_like(features)
for i in range(features.size(0)):
    ...
    adapted[i] = adapter(features[i:i+1].T).T.squeeze(0)  # ← BUG
```

**Por qué falla**:
- `features[i:i+1]` → shape `[1, 1024]`
- `.T` → transpone a `[1024, 1]`
- `adapter` contiene `nn.Linear(1024, rank=16)` — espera última dimensión = 1024
- Pero recibe `[1024, 1]` → la última dimensión es 1, no 1024
- Error: `mat1 and mat2 shapes cannot be multiplied (1024x1 and 1024x16)`

**Fix**:
```python
# Quitar el .T — el LoRA opera sobre la dimensión de features directamente
adapted[i] = adapter(features[i:i+1]).squeeze(0)
```

**O mejor aún (vectorizado, sin loop Python)**:
```python
def forward(self, images, view_idx):
    features = self.backbone(images)  # [N, D]
    
    # Aplicar LoRA por vista — vectorizado
    adapted = features.clone()
    for view_name in VIEW_TYPES:
        mask = []
        for i in range(images.size(0)):
            vi = view_idx[i].item()
            vn = VIEW_TYPES[vi] if vi < len(VIEW_TYPES) else 'front'
            mask.append(vn == view_name)
        mask = torch.tensor(mask, device=features.device)
        if mask.any():
            adapted[mask] = self.adapters[view_name](features[mask])
    
    view_emb = self.view_embed(view_idx.clamp(0, len(VIEW_TYPES)-1))
    features = adapted + view_emb
    return self.proj(features)
```

---

### BUG 2 — Carga el CSV equivocado (climatic data en vez de image metadata) (CRÍTICO)

**Archivo**: `kaggle/gen_notebook_v5.py`, CELL 4 (línea ~251-314)

**Síntoma en log**:
```
Loading metadata from: /kaggle/input/datasets/picekl/fungitastic/climaticData/FungiTastic-Climatic-Timeseries.csv
  Shape: (350425, 914)
```

**Por qué falla**: `find_metadata_csv()` busca recursivamente cualquier CSV con columnas que contengan "observation" o "species". El CSV climático tiene `observationID` pero NO tiene `species` ni `image_path`. La función lo selecciona igual.

**Consecuencia**:
```
After filtering (min 3 obs/species): 350425 images, 1 species  ← SOLO 1 ESPECIE
View type distribution: gills 350425  ← TODO asignado a "gills"
Classes: 1  ← INÚTIL PARA ENTRENAR
```

**Fix — reescribir `find_metadata_csv()`**:
```python
def find_metadata_csv(root):
    """Buscar SOLO el CSV de metadata de imágenes, no climáticos."""
    
    # 1. Patrones específicos de FungiTastic/FungiCLEF
    specific_patterns = [
        'FungiTastic-FewShot/FungiTastic-FewShot-Train.csv',
        'FungiTastic-FewShot/train.csv',
        '*/FungiTastic*Train*.csv',
        'fungiclef*/train.csv',
        '*/train_metadata.csv',
        'train.csv',
        'train_metadata.csv',
    ]
    for pat in specific_patterns:
        matches = list(root.glob(pat)) + list(root.rglob(pat))
        for match in matches:
            try:
                df_probe = pd.read_csv(match, nrows=5)
                cols_lower = set(c.lower() for c in df_probe.columns)
                # DEBE tener species/class Y image/filename
                has_species = bool(cols_lower & {'species', 'class', 'classid', 'scientificname', 'poisonous', 'label', 'fungitastic_below_category_3'})
                has_image = bool(cols_lower & {'filename', 'image_path', 'image', 'filepath', 'photo_path', 'image_path_jpg'})
                # NO debe ser climatic (914 columnas es un red flag)
                if has_species and has_image and len(df_probe.columns) < 100:
                    print(f"  ✓ Found image metadata: {match}")
                    return match
            except Exception:
                continue
    
    # 2. Búsqueda broad pero con filtros estrictos
    all_csvs = list(root.rglob('*.csv'))
    for csv_path in all_csvs:
        try:
            df_probe = pd.read_csv(csv_path, nrows=5)
            if len(df_probe.columns) > 200:  # Skip climatic/timeseries
                continue
            cols_lower = set(c.lower() for c in df_probe.columns)
            has_species = bool(cols_lower & {'species', 'class', 'scientificname', 'label'})
            has_image = bool(cols_lower & {'filename', 'image_path', 'image', 'filepath', 'photo_path'})
            if has_species and has_image:
                return csv_path
        except Exception:
            continue
    
    return None
```

**También hay que mapear columnas de FungiTastic correctamente**:
```python
# FungiTastic usa estos nombres de columna:
#   'filename' o 'photo_id' → image_path
#   'scientificName' o 'species' → species  
#   'observationUUID' o 'observation_id' → observation_id
#   'poisonous' → 0/1 (binario)
#   'FungiTastic-Below-Category-3' → species label (nullable)

COLUMN_MAP = {
    'filename': 'image_path',
    'photo_path': 'image_path',
    'photo_id': 'observation_id', 
    'observationUUID': 'observation_id',
    'observation_uuid': 'observation_id',
    'scientificName': 'species',
    'scientific_name': 'species',
    'class': 'species',
    'class_id': 'species',
    'FungiTastic-Below-Category-3': 'species',
    'poisonous': 'is_poisonous',
}
```

---

### BUG 3 — Image paths no se resuelven correctamente

**Archivo**: `kaggle/gen_notebook_v5.py`, CELL 5 (línea ~347-350)

**Problema**: FungiTastic guarda las imágenes en subdirectorios como:
```
FungiTastic-FewShot/train/001_Agaricus_campestris/0a1b2c3d.jpg
```
Pero el CSV solo tiene `filename = "0a1b2c3d.jpg"` sin el path completo.

**Fix**:
```python
# CELL 5: Resolver image paths para FungiTastic
def resolve_image_path(row, data_root):
    """Resolver el path completo de la imagen."""
    fname = str(row.get('image_path', row.get('filename', '')))
    if Path(fname).is_absolute() and Path(fname).exists():
        return fname
    
    # Buscar en subdirectorios comunes de FungiTastic
    search_dirs = [
        data_root / 'FungiTastic-FewShot' / 'train',
        data_root / 'train',
        data_root / 'images',
        data_root / 'FungiTastic-FewShot',
    ]
    for d in search_dirs:
        if d.exists():
            # Buscar por filename
            matches = list(d.rglob(fname))
            if matches:
                return str(matches[0])
    
    return str(data_root / fname)  # fallback

df['image_path'] = df.apply(lambda r: resolve_image_path(r, DATA_ROOT), axis=1)
```

---

### BUG 4 — Training loop procesa 1 observación a la vez (LENTÍSIMO)

**Archivo**: `kaggle/gen_notebook_v5.py`, CELL 19 (línea ~979-1031)

**Problema**: El loop de entrenamiento itera observación por observación dentro de cada batch:
```python
for batch in loader:
    for obs in batch['observations']:  # ← 1 obs a la vez
        images = obs['images'].to(DEVICE)
        ...
        logits, emb = model(images, view_idx, meta, ...)
        loss = ...
        batch_loss = batch_loss + loss
```

Con 245,297 observaciones de entrenamiento, esto significa **245k forward passes individuales**. En una P100 esto tardaría días.

**Fix — collate_fn que agrupa observaciones en batches reales**:
```python
def collate_fn(batch):
    """Agrupa observaciones en un batch padded."""
    max_views = max(len(b['images']) for b in batch)
    
    all_images = []
    all_view_idx = []
    all_labels = []
    all_obs_lens = []
    all_meta = {k: [] for k in ['habitat', 'substrate', 'smell', 'country']}
    
    for b in batch:
        n = len(b['images'])
        # Pad con ceros si menos de max_views
        if n < max_views:
            padding = torch.zeros(max_views - n, *b['images'].shape[1:])
            b_images = torch.cat([b['images'], padding])
            b_views = torch.cat([b['view_idx'], torch.zeros(max_views - n, dtype=torch.long)])
        else:
            b_images = b['images']
            b_views = b['view_idx']
        
        all_images.append(b_images)
        all_view_idx.append(b_views)
        all_labels.append(b['label'])
        all_obs_lens.append(n)
        for k in all_meta:
            all_meta[k].append(b['metadata'][k])
    
    return {
        'images': torch.stack(all_images),       # [B, max_views, C, H, W]
        'view_idx': torch.stack(all_view_idx),   # [B, max_views]
        'labels': torch.stack(all_labels),       # [B]
        'obs_lens': torch.tensor(all_obs_lens),  # [B]
        'metadata': all_meta,
    }
```

Y el modelo debe procesar `[B, max_views, C, H, W]` en paralelo, aplicando un mask para ignorar los paddings.

---

### BUG 5 — AMP API deprecada ( warnings, potencial break en PyTorch 2.5+)

**Archivo**: `kaggle/gen_notebook_v5.py`, CELL 18-19

**Código deprecado**:
```python
scaler = torch.cuda.amp.GradScaler(enabled=cfg.amp)      # ← deprecated
with torch.cuda.amp.autocast(enabled=cfg.amp):             # ← deprecated
```

**Fix**:
```python
scaler = torch.amp.GradScaler('cuda', enabled=cfg.amp)
with torch.amp.autocast('cuda', enabled=cfg.amp):
```

---

### BUG 6 — DataLoader se reconstruye cada epoch

**Archivo**: `kaggle/gen_notebook_v5.py`, CELL 19 (línea ~1079-1085)

```python
for epoch in range(cfg.epochs):
    train_ds = MultiViewDataset(train_obs, label2idx, image_size=img_size, augment=True)  # ← cada epoch
    val_ds = MultiViewDataset(val_obs, label2idx, image_size=img_size, augment=False)
    train_loader = DataLoader(train_ds, ...)
```

**Fix**: Solo reconstruir cuando cambia `image_size` (progressive resizing):
```python
current_size = None
for epoch in range(cfg.epochs):
    img_size = resizing.get_image_size(epoch) if resizing else 224
    
    if img_size != current_size:
        current_size = img_size
        train_ds = MultiViewDataset(train_obs, label2idx, image_size=img_size, augment=True)
        val_ds = MultiViewDataset(val_obs, label2idx, image_size=img_size, augment=False)
        train_loader = DataLoader(train_ds, batch_size=cfg.batch_size, shuffle=True,
                                  collate_fn=collate_fn, num_workers=NUM_WORKERS)
        val_loader = DataLoader(val_ds, batch_size=cfg.batch_size, shuffle=False,
                                collate_fn=collate_fn, num_workers=NUM_WORKERS)
    
    # ... entrenar
```

---

## 🎯 ORDEN DE EJECUCIÓN

1. **BUG 1** (LoRA) — Fix inmediato, sin esto el modelo no corre ni un forward pass
2. **BUG 2** (CSV equivocado) — Sin datos correctos, todo lo demás es inútil
3. **BUG 3** (image paths) — Necesario para que las imágenes se carguen
4. **BUG 4** (training loop batched) — Necesario para que entrene en tiempo razonable
5. **BUG 5** (AMP deprecation) — Quick fix, evita warnings
6. **BUG 6** (DataLoader rebuild) — Optimización

---

## 📊 DATOS ESPERADOS TRAS LOS FIXES

Con FungiTastic cargado correctamente deberías ver:
```
Loading metadata from: .../FungiTastic-FewShot-Train.csv
  Shape: (~300000, ~15)
Total images: ~300000
Unique species: ~2000-5000
After filtering (min 3 obs/species): ~250000 images, ~2000+ species
View type distribution:
  front     ~90000   (round-robin)
  gills     ~90000
  habitat   ~80000
  detail    ~80000
Classes: ~2000+
```

---

## ✅ CRITERIOS DE ACEPTACIÓN PARA v6

- [ ] `find_metadata_csv` carga el CSV correcto (no climático)
- [ ] `NUM_CLASSES > 100` (no 1)
- [ ] Forward pass del modelo funciona sin RuntimeError
- [ ] Training loop procesa batches reales (no 1 obs a la vez)
- [ ] Epoch 0 completa en <30 min (en P100 con ~250k obs)
- [ ] MAP@3 > 0 al final del epoch 1
- [ ] Modelo se guarda en `/kaggle/working/models/multiview_v5_best.pt`
- [ ] `final_metrics.json` se genera con métricas válidas

---

## 🔍 ARCHIVOS A MODIFICAR

| Archivo | Bugs | Descripción |
|---------|------|-------------|
| `kaggle/gen_notebook_v5.py` | 1-6 | Todos los bugs están en el generador del notebook |
| `kaggle/visionsetil_mega_training.ipynb` | — | Regenerar tras fixes (output de gen_notebook_v5.py) |
| `kaggle/kernel-metadata.json` | — | Bump version a 6 |

---

## 🚀 COMANDOS DE DESPLIEGUE

```powershell
# 1. Regenerar notebook tras fixes
python kaggle/gen_notebook_v5.py

# 2. Push a Kaggle
kaggle kernels push -p kaggle/

# 3. Monitorear
kaggle kernels status alonsoalvira/visionsetil-mega-training

# 4. Descargar logs cuando termine
kaggle kernels output alonsoalvira/visionsetil-mega-training -p kaggle/kernel_output_v6
```

---

## 📅 PRÓXIMOS SPRINTS (post-fix v6)

> Una vez el kernel v6 entrene correctamente, los siguientes sprints deben ejecutarse en orden.
> Referencias: `docs/ROADMAP.md`, `docs/SPRINT_PLAN_NEXT.md`, `docs/SPRINT_PLAN_v0.3.0.md`

### Sprint N+1 — Robustez de Modelos y Data Pipeline (post-v6)

**Objetivo:** Cerrar la brecha entre mocks y modelos reales en GPU.

| ID  | Tarea                                           | Archivos/rutas principales                                                                                     | Prioridad |
| --- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------- |
| ML-1 | Integrar pesos reales en backend                | `backend/app/services/multi_view_classifier.py`, `backend/app/ml/model_registry.py`, `backend/app/ml/weights/` | Alta      |
| ML-2 | Fine-tuning DINOv3/ConvNeXt v2 con FungiCLEF    | `kaggle/mega_training_v5.py`, `kaggle/multi_view_model.py`, `kaggle/configs/mega_training_v5.json`             | Alta      |
| ML-3 | Índice de especies con prototypes reales        | `scripts/build_species_index.py`, `backend/app/services/open_set_rejection.py`                                | Alta      |
| ML-4 | Calibración de umbrales open-set                | `scripts/calibrate_thresholds.py`, `eval/scripts/compute_full_metrics.py`                                     | Media     |
| ML-5 | Benchmark end-to-end 1.000 observaciones        | `eval/scripts/`, `eval/reports/`                                                                              | Alta      |
| DP-1 | Data augmentation pipeline                      | `scripts/augment_dataset.py`, `scripts/prepare_multi_source_dataset.py`                                       | Media     |
| DP-2 | Versionado de datasets con DVC                  | `data/`, `kaggle_dataset_export/`                                                                              | Baja      |

**Definition of Done (N+1):**
- Modelos reales cargan sin mock fallback (`backend/app/services/multi_view_classifier.py`).
- Índice de especies ≥500 especies en `backend/app/ml/weights/species_index.npz`.
- Benchmark 1.000 casos <30 min en GPU.

---

### Sprint N+2 — Frontend Multi-Vista + API Gateway

**Objetivo:** Exponer el pipeline multi-vista al usuario final.

| ID  | Tarea                                           | Archivos/rutas principales                                                                                     | Prioridad |
| --- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------- |
| FE-1 | Flujo captura 4 vistas (gills/front/habitat/detail) | `frontend/src/components/CameraCapture.tsx`, `frontend/src/App.tsx`, `frontend/src/api/types.ts`             | Alta      |
| FE-2 | Pantalla de resultados con safety + explicación | `frontend/src/components/ResultCard.tsx`, `frontend/src/styles/global.css`                                    | Alta      |
| FE-3 | Integración con API: upload 4 imgs + view_types | `frontend/src/api/client.ts`, `backend/app/api/routes_classify.py`                                            | Alta      |
| FE-4 | PWA offline-first + cache observaciones         | `frontend/vite.config.ts`, `frontend/index.html`, `frontend/src/main.tsx`                                      | Media     |
| GW-1 | Rate limiting en `/classify`                    | `backend/app/middleware/rate_limit.py`, `backend/app/api/routes_classify.py`                                   | Alta      |
| GW-2 | API key auth                                    | `backend/app/middleware/api_key_auth.py`                                                                       | Media     |
| GW-3 | WebSocket progreso async                        | `backend/app/main.py` (nuevo router)                                                                            | Baja      |

**Definition of Done (N+2):**
- Usuario sube 4 fotos y recibe clasificación en <15s.
- Frontend desplegado (Vercel/Netlify).
- Rate limiting activo.

---

### Sprint N+3 — MLOps y Monitoring en Producción

**Objetivo:** Observabilidad de modelos en producción y feedback loop.

| ID  | Tarea                                           | Archivos/rutas principales                                                                                     | Prioridad |
| --- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------- |
| MO-1 | MLflow tracking de experimentos                 | `kaggle/mega_training_v5.py`, nuevo `mlflow/` dir                                                               | Alta      |
| MO-2 | Dashboard de métricas (Grafana/Prometheus)      | `docker-compose.prod.yml`, `backend/app/api/routes_metrics.py`                                                | Alta      |
| MO-3 | Drift detection en embeddings                   | `backend/app/services/open_set_rejection.py` (extender)                                                        | Media     |
| MO-4 | Re-entrenamiento automatizado (CI/CD ML)        | `.github/workflows/ci.yml`, `scripts/kaggle_orchestrator.py`                                                   | Media     |
| MO-5 | A/B testing framework                           | `backend/app/ml/model_registry.py` (extender)                                                                   | Baja      |
| MO-6 | Human review loop                               | `backend/app/api/routes_human_review.py`, `backend/app/services/feedback_logger.py`                            | Alta      |

**Definition of Done (N+3):**
- MLflow registra todos los experimentos con métricas, params y artifacts (`kaggle/mega_training_v5.py` loggea a `mlflow/`).
- Dashboard Grafana muestra latencia P50/P95/P99, throughput y error rate en tiempo real (`docker-compose.prod.yml` incluye Grafana + Prometheus).
- Drift detection operativo: alerta cuando el embedding drift > 0.3 (KL divergence) en `backend/app/services/open_set_rejection.py`.
- Pipeline CI/CD ML ejecuta `scripts/kaggle_orchestrator.py` en push a `main` con auto-deploy de nuevo modelo si MAP@3 mejora.
- Human review loop funcional: `routes_human_review.py` expone endpoints para revisores y `feedback_logger.py` almacena correcciones.
- A/B testing framework permite servir 2 modelos en paralelo con split configurable (`backend/app/ml/model_registry.py`).
- Tests de integración cubren el feedback loop (subir → clasificar → revisar → re-entrenar).
- Documentación de runbooks para incidentes ML en `docs/`.

---

### Sprint N+4 — Escalabilidad y Multi-tenant

**Objetivo:** Soportar múltiples organizaciones y alta disponibilidad.

| ID  | Tarea                                           | Archivos/rutas principales                                                                                     | Prioridad |
| --- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------- |
| SC-1 | PostgreSQL con pooling                          | `backend/app/db/models.py`, `docker-compose.prod.yml`                                                          | Alta      |
| SC-2 | Redis para cache de embeddings                  | `docker-compose.prod.yml`, nuevo `backend/app/services/cache.py`                                              | Alta      |
| SC-3 | Queue async (Celery/RQ) para classify           | `backend/app/api/routes_classify.py` (refactor)                                                                 | Alta      |
| SC-4 | Multi-tenant                                    | `backend/app/db/models.py`, `backend/app/middleware/api_key_auth.py`                                           | Media     |
| SC-5 | Kubernetes HPA                                  | `k8s/` (nuevo)                                                                                                  | Media     |
| SC-6 | CDN para imágenes                               | `frontend/` + infra externa                                                                                      | Baja      |

**Definition of Done (N+4):**
- PostgreSQL configurado con connection pooling (pool_size ≥ 20) en `docker-compose.prod.yml`.
- Redis cache operativo: hit ratio ≥ 0.7 para embeddings repetidos (`backend/app/services/cache.py`).
- `/classify` procesa via queue async (Celery/RQ): P95 latency ≤ 5s con 50 req/s.
- Multi-tenant aislado por `organization_id` en todas las tablas (`backend/app/db/models.py`) + API key scoped.
- Kubernetes HPA escala horizontal basado en GPU utilization (`k8s/` desplegado).
- CDN configura Cache-Control headers para imágenes estáticas.
- Load test: 500 req/s sostenido sin degradación de latencia (`eval/scripts/` o `scripts/load_test.py`).
- Runbooks de escalado y disaster recovery documentados en `docs/`.

---

### Backlog — Mejoras Continuas

| ID  | Tarea                                           | Archivos/rutas principales                                                                                     |
| --- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| BK-1 | Soporte audio (descripción de voz)              | `frontend/src/components/MetadataForm.tsx`                                                                      |
| BK-2 | Integración iNaturalist API                     | Nuevo `backend/app/services/inaturalist.py`                                                                     |
| BK-3 | Soporte microscopio USB (esporas)               | `frontend/src/components/CameraCapture.tsx`                                                                     |
| BK-4 | Modo colaborativo                               | `backend/app/api/routes_observations.py` (extender)                                                             |
| BK-5 | i18n: EN/FR/DE/IT/PT                            | `frontend/src/` (nuevo `i18n/`)                                                                                 |
| BK-6 | WCAG 2.1 AA                                     | `frontend/src/components/*`, `frontend/src/styles/global.css`                                                   |
| BK-7 | Tests E2E Playwright                            | `e2e/` (nuevo)                                                                                                  |

---

## 📂 MAPA DE ARCHIVOS CRÍTICOS (referencia rápida)

```
backend/app/
├── api/
│   ├── routes_classify.py          ← Endpoint /classify (acepta view_types)
│   ├── routes_classification.py    ← Endpoint legacy
│   ├── routes_feedback.py          ← Feedback loop
│   ├── routes_human_review.py      ← Human review queue
│   ├── routes_health.py            ← /healthz /readyz
│   └── routes_metrics.py           ← Prometheus metrics
├── services/
│   ├── multi_view_classifier.py    ← Clasificador multi-vista (reemplaza Mock)
│   ├── view_classifier.py          ← Clasificador de vistas (4 clases)
│   ├── yoloe_detector.py           ← Detector ROI
│   ├── open_set_rejection.py       ← Open-set rejection
│   ├── feedback_logger.py          ← Logging de feedback
│   └── image_storage.py            ← Almacenamiento de imágenes
├── ml/
│   ├── model_registry.py           ← Carga lazy de modelos + fallback
│   └── weights/                    ← Pesos exportados (<200MB)
├── core/config.py                  ← Settings (model_weights_path, etc.)
├── db/models.py                    ← Esquema DB (Observation, Image)
└── middleware/                      ← Rate limiting, API key, security headers

kaggle/
├── gen_notebook_v5.py              ← Generador del notebook (DONDE ESTÁN LOS BUGS)
├── mega_training_v5.py             ← Script de entrenamiento standalone
├── multi_view_model.py             ← Definición del modelo multi-vista
├── foundation_ensemble.py          ← Ensemble de foundation models
├── anti_leak_splitter.py           ← Split anti-leak por observation_id
├── configs/mega_training_v5.json   ← Config v5 (multi-view)
├── kernel-metadata.json            ← Metadata del kernel Kaggle
└── visionsetil_mega_training.ipynb ← Notebook generado (output)

eval/scripts/
└── compute_full_metrics.py         ← MAP@3, AUROC, ECE, per-class CSV

scripts/
├── build_species_index.py          ← Índice de especies
├── calibrate_thresholds.py         ← Calibración open-set
├── augment_dataset.py              ← Data augmentation
├── prepare_multi_source_dataset.py ← Dedup multi-fuente
├── finetune_yolov8_roi.py          ← Fine-tune YOLOv8 ROI
├── research_sota.py                ← Research SOTA
└── kaggle_orchestrator.py          ← Orquestador de runs Kaggle

frontend/src/
├── App.tsx                         ← App principal
├── api/{client.ts, types.ts}       ← Cliente API + tipos
├── components/
│   ├── CameraCapture.tsx           ← Captura multi-vista
│   ├── MetadataForm.tsx            ← Form metadata
│   ├── ResultCard.tsx              ← Resultados + safety
│   └── ...
└── styles/global.css               ← Design tokens + dark mode

docs/
├── ROADMAP.md                      ← Roadmap completo de sprints
├── SPRINT_PLAN_NEXT.md             ← Plan v0.2.0
├── SPRINT_PLAN_v0.3.0.md           ← Plan v0.3.0
├── SAFETY_POLICY.md                ← Política de seguridad (NO relajar)
├── ML_IMPROVEMENT_PROMPT.md        ← Prompt ML original (spec multi-vista)
└── KAGGLE_FIX_PROMPT.md            ← ESTE DOCUMENTO
```

---

## ⚠️ REGLAS DURAS PARA TODOS LOS SPRINTS (no negociable)

1. **Safety Policy intacta** — `docs/SAFETY_POLICY.md`. Sin frases de consumo seguro.
2. **Anti-leak** — Split por `observation_id`. Validar antes de cada run.
3. **No mocks en producción** — Si `model_fallback_to_mock=True` en runtime, emitir warning en `/readyz`.
4. **No datasets sintéticos** — `PROMPT.md §16`.
5. **Reproducibilidad** — Todo experimento con config JSON versionada.
6. **IC 95% obligatorio** — En cualquier métrica reportada.
7. **Safety recall deadly = 100%** — Sin excepciones, sin trade-offs.
