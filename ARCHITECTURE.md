# 🏗️ VisionSetil — Arquitectura del Sistema

> **Mapa técnico para Loop Engineering.** Define la estructura completa del sistema, componentes, dependencias y flujos.

---

## 1. Visión General

VisionSetil es una arquitectura de **3 capas + pipeline ML externo**:

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (React PWA)                      │
│   Vite · TypeScript · react-dropzone · axios · vite-plugin-pwa│
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS (REST)
┌──────────────────────▼──────────────────────────────────────┐
│                    BACKEND (FastAPI)                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Middleware: RequestID → CORS → RateLimit →          │    │
│  │              APIKey → SecurityHeaders                │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │  Routes  │→ │ Services │→ │   ML     │→ │   DB     │    │
│  │ (12 routers)│ (15+ svc)│  │ (torch)  │  │(SQLite)  │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│              PIPELINE ML (Kaggle / GPU)                       │
│  mega_training_v5.py → ConvNeXtV2 + LoRA + Attention Fusion  │
│  → ArcFace → Calibración → Export de pesos                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Estructura de Directorios (Críticos)

```
VisionSetil/
├── backend/app/
│   ├── main.py                    # FastAPI app + middleware registration
│   ├── core/config.py             # Settings (Pydantic BaseSettings)
│   ├── core/logging.py            # Structured logging
│   ├── api/                       # 12 route modules
│   │   ├── routes_classify.py     # POST /classify (multi-view inference)
│   │   ├── routes_classification.py
│   │   ├── routes_human_review.py # Human-in-the-loop review queue
│   │   ├── routes_health.py       # /health, /readyz
│   │   ├── routes_feedback.py
│   │   ├── routes_observations.py
│   │   ├── routes_metrics.py
│   │   ├── routes_jobs.py         # Async job tracking
│   │   ├── routes_image_upload.py
│   │   └── ...
│   ├── services/                  # Business logic layer
│   │   ├── multi_view_classifier.py   # Multi-view inference orchestrator
│   │   ├── view_classifier.py         # View type detection
│   │   ├── open_set_rejection.py      # Confidence threshold rejection
│   │   ├── yoloe_detector.py          # YOLOE object detection (ROI)
│   │   ├── image_storage.py           # File I/O for uploads
│   │   ├── feedback_logger.py
│   │   ├── cache.py                   # Redis/in-memory cache
│   │   ├── drift_detector.py          # Data drift monitoring
│   │   ├── ab_testing.py             # A/B test framework
│   │   ├── task_queue.py             # Async task management
│   │   └── ...
│   ├── ml/
│   │   └── model_registry.py      # Model weights loading + caching
│   ├── db/
│   │   ├── database.py            # Engine + session factory
│   │   ├── models.py              # SQLAlchemy 2.0 ORM models
│   │   └── schemas.py             # Pydantic response/request schemas
│   ├── middleware/
│   │   ├── api_key_auth.py        # API key validation
│   │   ├── rate_limit.py          # Per-endpoint rate limiting
│   │   └── security_headers.py    # CSP, X-Frame-Options, etc.
│   └── tests/                     # pytest suite
│
├── frontend/src/
│   ├── main.tsx                   # React root mount
│   ├── App.tsx                    # Main app (upload → classify → result)
│   ├── api/
│   │   ├── client.ts              # Axios instance + endpoints
│   │   └── types.ts               # TypeScript API types
│   ├── components/
│   │   ├── CameraCapture.tsx      # Multi-view camera capture overlay
│   │   ├── UploadZone.tsx         # Drag-drop upload area
│   │   ├── ResultCard.tsx         # Classification result display
│   │   ├── MetadataForm.tsx       # Habitat/substrate/smell inputs
│   │   ├── BatchCompare.tsx       # Side-by-side observation compare
│   │   ├── Header.tsx
│   │   └── ...
│   ├── styles/global.css
│   ├── vite-env.d.ts
│   ├── tsconfig.json
│   └── package.json               # React 18, Vite 5, axios, dropzone
│
├── kaggle/                        # External GPU training pipeline
│   ├── mega_training_v5.py        # Standalone training script
│   ├── multi_view_model.py        # MultiViewModel definition
│   ├── anti_leak_splitter.py      # GroupKFold split by observation_id
│   ├── foundation_ensemble.py     # Ensemble of foundation models
│   ├── gen_notebook_v5.py         # Generates the Kaggle notebook
│   ├── visionsetil_mega_training.ipynb  # Generated notebook (23 cells)
│   ├── configs/
│   │   └── mega_training_v5.json  # Training config (versioned)
│   └── kernel-metadata.json       # Kaggle kernel metadata
│
├── scripts/                       # Operational utilities
│   ├── build_species_index.py     # Build species lookup index
│   ├── augment_dataset.py         # Data augmentation pipeline
│   ├── calibrate_thresholds.py    # Calibrate rejection thresholds
│   ├── build_taxonomy_db.py       # Build taxonomy database
│   ├── prepare_multi_source_dataset.py
│   ├── finetune_yolov8_roi.py     # YOLOv8 ROI fine-tuning
│   ├── research_sota.py           # SOTA benchmark research
│   ├── research_sota_deep.py
│   ├── kaggle_orchestrator.py     # Orchestrate Kaggle kernel runs
│   └── verify_detection.py
│
├── eval/
│   └── scripts/
│       └── compute_full_metrics.py  # MAP@3, F1, balanced acc, ECE, CI 95%
│
├── docs/                          # 25+ documentation files
├── docker-compose.yml             # Dev environment
├── docker-compose.prod.yml        # Production (with Redis)
├── Dockerfile.cpu                 # CPU-only build
├── pyproject.toml                 # Project metadata (mushroom-photo-id)
└── .github/workflows/ci.yml       # GitHub Actions CI
```

---

## 3. Backend (FastAPI)

### 3.1 Stack
| Componente | Tecnología |
|-----------|------------|
| Web framework | FastAPI ≥0.115 |
| ASGI server | Uvicorn[standard] |
| ORM | SQLAlchemy 2.0 (Mapped/mapped_column) |
| Database | SQLite (`mushroom_photo_id.db`) |
| Validation | Pydantic v2 + pydantic-settings |
| ML (lazy) | torch, timm, PIL, cv2, onnxruntime |
| Cache | Redis (fallback: in-memory dict) |
| Tests | pytest, httpx |

### 3.2 Entrypoint
**`backend/app/main.py`** construye la app FastAPI:
1. Configura logging estructurado
2. Crea directorio de uploads
3. Ejecuta `init_db()` (crea tablas + seed data)
4. Registra middleware en orden (outer→inner):
   `RequestIDMiddleware` → `CORSMiddleware` → `RateLimitMiddleware` → `APIKeyMiddleware` → `SecurityHeadersMiddleware`
5. Monta `/uploads` (static files)
6. Incluye **12 routers**

### 3.3 Endpoints (12 routers)

| Dominio | Archivo | Endpoints clave |
|---------|---------|-----------------|
| **Classify** | `routes_classify.py` | `POST /classify` (multi-view inference), `POST /classify/batch` |
| **Classification** | `routes_classification.py` | Legacy single-image classification |
| **Upload** | `routes_image_upload.py` | `POST /upload` |
| **Observations** | `routes_observations.py` | CRUD de observaciones del usuario |
| **Feedback** | `routes_feedback.py` | `POST /feedback` (correct/incorrect) |
| **Human Review** | `routes_human_review.py` | Queue de revisión humana |
| **Metrics** | `routes_metrics.py` | Prometheus metrics |
| **Jobs** | `routes_jobs.py` | Async job tracking |
| **Health** | `routes_health.py` | `/health`, `/readyz` |

### 3.4 Servicios Clave (15+)

| Servicio | Archivo | Responsabilidad |
|----------|---------|-----------------|
| **MultiViewClassifier** | `multi_view_classifier.py` | Orquesta inferencia multi-vista: detección → view classification → embedding → fusión → rejection |
| **ViewClassifier** | `view_classifier.py` | Clasifica el tipo de vista (gills/front/habitat/detail) |
| **OpenSetRejection** | `open_set_rejection.py` | Rechaza predicciones de baja confianza |
| **YOLOEDetector** | `yoloe_detector.py` | Detecta y recorta ROI de la seta |
| **ModelRegistry** | `ml/model_registry.py` | Carga y cachea pesos del modelo (lazy) |
| **ImageStorage** | `image_storage.py` | Guarda/sirve imágenes de upload |
| **FeedbackLogger** | `feedback_logger.py` | Registra feedback para re-entrenamiento |
| **Cache** | `cache.py` | Cache Redis/in-memory |
| **DriftDetector** | `drift_detector.py` | Monitorea drift en datos de entrada |
| **ABTesting** | `ab_testing.py` | Framework A/B testing de modelos |
| **TaskQueue** | `task_queue.py` | Gestión de tareas asíncronas |

### 3.5 Base de Datos

**`backend/app/db/models.py`** — SQLAlchemy 2.0 ORM:

| Tabla | Propósito |
|------|-----------|
| `Observation` | Observación de usuario (imágenes, metadata, predicción) |
| `Classification` | Resultado de clasificación (top-3, scores) |
| `Feedback` | Feedback humano (correcto/incorrecto) |
| `HumanReviewItem` | Items en cola de revisión humana |
| `Job` | Tareas asíncronas |
| `Seed` | Datos semilla (species index, safety flags) |

---

## 4. Frontend (React PWA)

### 4.1 Stack
| Componente | Tecnología |
|-----------|------------|
| UI | React 18.3 |
| Build | Vite 5.3 |
| Language | TypeScript 5.5 (strict) |
| HTTP | axios 1.7 |
| Uploads | react-dropzone 14.2 |
| PWA | vite-plugin-pwa 0.20 |
| Tests | vitest 2.0 (jsdom) |
| Lint | ESLint 8.57 |

### 4.2 Flujo Principal (`App.tsx`)
1. **Upload**: drag-drop o cámara (hasta 10 imágenes, max 10MB c/u)
2. **CameraCapture**: overlay guiado para las 4 vistas (gills/front/habitat/detail)
3. **MetadataForm**: habitat, sustrato, olor, país (opcionales)
4. **Classify**: POST a backend → `ResultCard` con top-3 + advertencias
5. **BatchCompare**: comparar observaciones lado a lado
6. **History**: sesión persistente en localStorage

### 4.3 API Client (`api/client.ts`)
- Instancia axios configurada
- Endpoints: `classify`, `upload`, `observations`, `feedback`, `health`
- Types en `api/types.ts` (mirrors de los schemas Pydantic del backend)

---

## 5. Pipeline ML (Kaggle)

### 5.1 Arquitectura del Modelo (`kaggle/multi_view_model.py`)

```
Input: [B, N_views, 3, H, W] + metadata + view_idx + attention_mask
  │
  ▼
ViewConditionedBackbone
  ├── timm backbone (ConvNeXtV2 Base, ~89M params)
  ├── 4× LoRA adapters (rank=16, per-view: gills/front/habitat/detail)
  ├── View embedding (4 tipos)
  └── Projection → d_model=1024
  │ [B, N_views, 1024]
  ▼
AttentionFusion
  ├── MetadataEncoder (habitat/substrate/smell/country → 64-dim)
  ├── Metadata token projection → d_model
  ├── Positional encoding (max_views + 1)
  ├── MultiheadAttention (4 heads, key_padding_mask para padded views)
  ├── FFN (d_model → 2×d_model → d_model, GELU)
  └── Masked mean pooling → [B, d_model]
  │ [B, 1024 + 64]
  ▼
ArcFaceHead
  ├── Normalize embeddings + weights
  ├── Add angular margin (m=0.50, s=30.0) during training
  └── Cosine similarity × s → logits [B, num_classes]
```

### 5.2 Training Pipeline (`mega_training_v5.py` / `gen_notebook_v5.py`)

| Cell | Función |
|------|---------|
| 1-2 | CUDA smoke test + PyTorch reinstall si kernels rotos |
| 3-4 | Auto-detect FungiCLEF/FungiTastic data + load CSV |
| 5 | Normalize columns (BUGFIX: deduplicate species columns) |
| 6 | Auto-label view types (heuristic + round-robin) |
| 7 | **Anti-leak split** by `observation_id` (GroupKFold) |
| 8 | Build observation-level multi-view records |
| 9 | MultiViewDataset + batched collate_fn |
| 10-15 | Model components (LoRA, backbone, metadata, fusion, ArcFace) |
| 16 | Metadata vocab + smoke test |
| 17 | TrainConfig (epochs=25, batch=16, progressive resizing) |
| 18 | Build model + optimizer + SWA |
| 19 | **Training loop** (progressive resizing 224→384→512, mixup, center loss) |
| 20 | SWA finalize + temperature calibration |
| 21 | **Test evaluation** (MAP@3, F1, balanced acc, ECE, IC 95%) |
| 22 | Export artifacts (weights, metrics, label2idx, history) |

### 5.3 Anti-Leak Strategy (`anti_leak_splitter.py`)
- Split **estrictamente por `observation_id`** — ninguna observación en dos splits
- Stratify por species + genus
- Mínimo 3 observaciones por especie para incluir
- Verificación con asserts: `train ∩ val = ∅`, `train ∩ test = ∅`, `val ∩ test = ∅`

### 5.4 Config Schema (`configs/mega_training_v5.json`)
```json
{
  "backbone": "convnextv2_base.fcmae_ft_in22k_in1k",
  "d_model": 1024,
  "metadata_dim": 128,
  "lora_rank": 16,
  "epochs": 25,
  "batch_size": 16,
  "progressive_schedule": [[0,9,224],[9,19,384],[19,999,512]],
  "use_swa": true,
  "swa_start_epoch": 20
}
```

---

## 6. Deployment

### 6.1 Docker Services

**`docker-compose.yml`** (Dev):
- `backend`: FastAPI + Uvicorn (hot-reload)
- `frontend`: Vite dev server

**`docker-compose.prod.yml`** (Prod):
- `backend`: FastAPI (gunicorn/uvicorn workers)
- `frontend`: Vite build → nginx static
- `redis`: Cache + rate limiting

### 6.2 CI/CD (`.github/workflows/ci.yml`)
- **Triggers**: push to main/PRs
- **Jobs**: lint (ruff) → test (pytest) → build (Docker)
- **Backend tests**: seguridad, clasificación, multi-vista, validación, kaggle

---

## 7. Flujos Críticos

### 7.1 Flujo de Inferencia (POST /classify)
```
Usuario sube imágenes (1-4 vistas)
  → Backend valida + guarda en ImageStorage
  → YOLOEDetector recorta ROI de cada imagen
  → ViewClassifier etiqueta tipo de vista
  → ModelRegistry carga modelo (lazy, cached)
  → MultiViewClassifier: backbone → fusion → ArcFace
  → OpenSetRejection: si max_prob < threshold → "unknown"
  → SafetyPolicy: marca deadly/poisonous warnings
  → Retorna: top-3 predictions + confidence + safety flags
```

### 7.2 Flujo de Entrenamiento (Kaggle)
```
gen_notebook_v5.py genera .ipynb (23 cells)
  → kaggle kernels push
  → Kaggle GPU (T4/P100) ejecuta:
      1. CUDA check + deps
      2. Data detect + load + anti-leak split
      3. Progressive resizing training (224→384→512)
      4. SWA + temperature calibration
      5. Test eval + IC 95%
      6. Export artifacts
  → kaggle kernels output (descarga pesos + metrics)
  → ModelRegistry carga nuevos pesos en backend
```

---

## 8. Dependencias Críticas

| Dependencia | Propósito | Versión |
|-------------|-----------|---------|
| `torch` + `timm` | ML inference + training | 2.5.1+cu121 / latest |
| `fastapi` | Web framework | ≥0.115 |
| `sqlalchemy` | ORM | 2.0 |
| `pydantic` | Validation | v2 |
| `react` | Frontend | 18.3 |
| `vite` | Build tool | 5.3 |
| `ConvNeXtV2` | Backbone ML | via timm |
| `redis` | Cache + rate limit | optional |

---

*Documento vivo. Actualizado por el Loop Engineering Agent.*