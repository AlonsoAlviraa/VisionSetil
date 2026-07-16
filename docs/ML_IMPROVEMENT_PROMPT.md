# ML IMPROVEMENT PROMPT — VisionSetil Multi-View Model

> Actúa como un **Staff ML Engineer + Mycology Domain Expert + MLOps Lead**.
>
> Objetivo: llevar el modelo de VisionSetil a SOTA mediante un pipeline **multi-vista de 4 fotos obligatorias** (láminas, frente, hábitat, contexto), fusión late de embeddings, y entrenamiento sobre FungiCLEF/FungiTastic/DF20 con métricas oficiales MAP@3.
>
> Todo cambio debe ser reproducible, testeado y auditado. No se relaja la Safety Policy.

---

## 0. CONTEXTO REAL DEL PIPELINE ML (commit actual)

```txt
Pipeline actual:
  routes_classify.py  → MockMushroomClassifier (MVP, sin modelo real cargado)
  mega_training.py    → Entrenador single-image ConvNeXt/DINOv2/EVA-02 con
                        MixUp, CutMix, EMA, TTA, WeightedRandomSampler, Focal+LS.
  anti_leak_splitter  → Split por observation_id (anti-leak) con estratificación.
  configs/mega_training_v1..v4.json → 4 niveles: baseline → ensemble SOTA (SAM, SWA, ArcFace).
  eval/compute_full_metrics.py → harness: MAP@3+CI, AUROC open-set, ECE, per-class.

Limitaciones críticas detectadas:
  L1. Single-image: el modelo procesa 1 imagen por pasada. Sin fusión multi-vista.
  L2. Sin view-conditioning: el usuario sube N fotos sin etiquetar qué vista es.
  L3. Sin detector de ROI: la imagen entera (fondo incluido) va al clasificador.
  L4. Mock en producción: MockMushroomClassifier no carga pesos reales.
  L5. Sin fusión de embeddings: no hay mecanismo para combinar N vistas de una observación.
  L6. Sin metadata-fusión: hábitat/sustrato/olor no condicionan el embedding.
  L7. Sin calibración de confianza por combinación de vistas presentes.
```

### Estado de datasets disponibles

```txt
FungiCLEF 2024/2025:  ~150k+ imágenes, observation_id, especie, metadatos.
FungiTastic (DF20):   ~300k+ imágenes, múltiples vistas por observación.
DF20-MO:              ~50k imágenes, one-image-per-observation (para ablation).
VisionSetil export:   kaggle_dataset_export/real_observations.json (formato interno).
```

---

## 1. OBJETIVO PRINCIPAL ML

Construir un modelo **multi-vista de 4 fotos** que supere al single-image baseline en MAP@3 por ≥5 puntos absolutos, mediante:

```txt
1. Detector YOLOv8-degado → ROI crop (elimina fondo/habitat del embedding visual).
2. View classifier (4 clases: gills/front/habitat/other) → etiqueta automática de cada foto.
3. View-conditioned backbone → embeddings de 4 ramales especializados.
4. Late fusion (attention pooling) → agrega N embeddings en un vector de observación.
5. Metadata encoder (habitat/substrate/smell) → fusiona con embedding visual.
6. ArcFace head → metric learning para open-set rejection.
7. Calibración: temperatura + per-view-combination thresholds.
```

**No se añaden features de producto no listadas aquí.** Esto es ML puro.

---

## 2. FLUJO DE 4 FOTOS (especificación de producto → ML)

### 2.1 Las 4 vistas obligatorias

```txt
V1. LÁMINAS (gills/underside)
    - Hongo invertido o cortado mostrando el lado inferior del sombrero.
    - Criticales para distinguir Amanita (laminillas libres) de Boletus (poros).
    - Iluminación: flash o luz natural directa. Sin sombras del propio hongo.

V2. FRENTE / PERFIL (front/profile)
    - Vista lateral del hongo completo: sombrero + pie + base.
    - Muestra forma del pileus (convexo, campanulado, deprimido), anillo, volva.
    - Fondo neutro preferiblemente (papel/hand como escala).

V3. HÁBITAT (in-situ context)
    - Hongo sin cortar en su entorno natural.
    - Muestra suelo (bosque, pradera, madera muerta), musgo, hojarasca.
    - Distancia ~30-50 cm. Sin zoom extremo.

V4. CONTEXTO / DETALLE (context/detail)
    - Una de: corte longitudinal (carne, color de oxidación), base del pie (bulbo/volva),
      superficie del sombrero (escamas, viscosidad), o vista cenital del sombrero.
    - El usuario elige cuál detalle es más discriminativo.
```

### 2.2 UX esperada (interfaz)

```txt
- Pantalla "Foto 1/4: Láminas" → camera capture → preview → confirm/retry
- Pantalla "Foto 2/4: Frente" → ...
- Pantalla "Foto 3/4: Hábitat" → ...
- Pantalla "Foto 4/4: Detalle" → elección de subtipo → ...
- Solo cuando las 4 fotos están capturadas → botón "Analizar" habilitado.
- Opcional: permitir 2-3 fotos extra por vista (para TTA multi-vista).
```

### 2.3 Esquema de datos (backend)

```python
# Nueva columna en Image model
view_type: str | None  # "gills" | "front" | "habitat" | "detail_cross" | "detail_base" | ...

# Observation schema amplía con vista explícita por imagen
class ObservationImage(Base):
    image_path: str
    view_type: str | None  # None = sin etiquetar (fallback a view classifier)
    view_confidence: float | None  # confianza del view classifier
```

---

## 3. ARQUITECTURA ML MULTI-VISTA

### 3.1 Pipeline de inferencia (end-to-end)

```
┌─────────────────────────────────────────────────────────────────┐
│  4 fotos (gills, front, habitat, detail)                        │
│        │                                                        │
│        ▼                                                        │
│  [1] YOLOv8-detector → bounding box del hongo por imagen        │
│        │                                                        │
│        ▼                                                        │
│  [2] View Classifier (4-clases) → etiqueta automática por img   │
│        │                                                        │
│        ▼                                                        │
│  [3] Crop ROI + pad 10% → imagen centrada del hongo            │
│        │                                                        │
│        ▼                                                        │
│  [4] View-Conditioned Backbone (4 ramales) → 4 × [D-dim emb]    │
│        │                                                        │
│        ▼                                                        │
│  [5] Metadata Encoder (habitat/substrate/smell) → [M-dim]      │
│        │                                                        │
│        ▼                                                        │
│  [6] Attention Fusion Pooling → 1 × [D+M-dim] observation emb  │
│        │                                                        │
│        ▼                                                        │
│  [7] ArcFace Classifier → logits sobre N especies              │
│        │                                                        │
│        ▼                                                        │
│  [8] Temperature Calibration + per-view-combo thresholds       │
│        │                                                        │
│        ▼                                                        │
│  [9] Open-set rejection (cosine vs centroides) + safety layer   │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Componentes detallados

#### [1] Detector ROI (`yoloe_detector.py` → ampliar)

```python
class MushroomROIDetector:
    """YOLOv8 fine-tuned para detectar setas (1 clase: 'mushroom').

    Output: bbox + confidence. Si confidence < 0.3 → fallback a imagen entera.
    Si múltiples detecciones → elegir la de mayor area (hongo principal).
    """
    def detect(self, image: np.ndarray) -> list[BBox]: ...
    def crop_pad(self, image: np.ndarray, bbox: BBox, pad_pct: float = 0.1) -> np.ndarray: ...
```

**Tareas:**
- Fine-tune YOLOv8n sobre anotaciones de hongos (FungiCLEF bbox o anotar manualmente 500 imgs con CVAT/Roboflow).
- Exportar a ONNX/TorchScript para inferencia <50ms en CPU.
- Test: en 100 imágenes reales, IoU ≥ 0.7 contra ground-truth bbox.

#### [2] View Classifier (`view_classifier.py` — NUEVO)

```python
class ViewClassifier(nn.Module):
    """Clasifica cada foto en una de 4 vistas principales.

    Arquitectura: EfficientNet-B0 fine-tuned (4 clases: gills/front/habitat/detail).
    Entrenado sobre subset etiquetado manualmente (1000 imgs/clase mínimo).
    """
    VIEWS = ["gills", "front", "habitat", "detail"]

    def predict(self, image: np.ndarray) -> ViewPrediction:
        """Retorna view_type + softmax confidence."""
```

**Tareas:**
- Crear dataset etiquetado: muestrear 4000 imágenes de FungiCLEF/FungiTastic y etiquetar (semi-supervisado con un profesor inicial o manual).
- Fine-tune EfficientNet-B0 → F1-macro ≥ 0.85 en test.
- Manejar "otro" (out-of-distribution): si max softmax < 0.5 → "unknown view".
- Integrar en pipeline: auto-etiquetar si el usuario no lo hace.

#### [3] Crop ROI + pad

```python
def crop_and_pad(image: np.ndarray, bbox: BBox, pad_pct: float = 0.1) -> np.ndarray:
    """Crop con padding del 10% alrededor del bbox. Mantener aspect ratio."""
```

#### [4] View-Conditioned Backbone (`multi_view_backbone.py` — NUEVO)

```python
class ViewConditionedBackbone(nn.Module):
    """Backbone compartido con 4 adaptadores LoRA por vista.

    Ventaja: 1 backbone (pesos compartidos) + 4 adaptadores pequeños
    (low-rank) especializados por vista. Reduce parámetros vs 4 backbones.

    Alternativa: 4 backbones independientes (más memoria, mejor especialización).
    """

    def __init__(self, base_backbone: str = "convnextv2_base", d_model: int = 1024):
        super().__init__()
        self.backbone = timm.create_model(base_backbone, pretrained=True, num_classes=0)
        self.adapters = nn.ModuleDict({
            view: LoRAAdapter(self.backbone.num_features, rank=16)
            for view in ["gills", "front", "habitat", "detail"]
        })
        self.proj = nn.Linear(self.backbone.num_features, d_model)

    def forward(self, images: list[Tensor], view_types: list[str]) -> list[Tensor]:
        """Returns list of D-dim embeddings, one per image."""
```

#### [5] Metadata Encoder (`metadata_encoder.py` — ampliar)

```python
class MetadataEncoder(nn.Module):
    """Codifica hábitat/sustrato/olor/país en embedding denso.

    - habitat, substrate, smell: embedding categórico (vocab ~50 each).
    - country: embedding categórico (vocab ~200).
    - Concatenar + MLP → M-dim (64 o 128).
    """

    def forward(self, metadata: ObservationMetadata) -> Tensor:
        """Returns [B, M] metadata embedding."""
```

#### [6] Attention Fusion Pooling (`attention_fusion.py` — NUEVO)

```python
class AttentionFusion(nn.Module):
    """Late fusion de N embeddings de imágenes + metadata vía attention pooling.

    Arquitectura:
        1. Proyectar cada embedding visual a espacio común [D].
        2. Concatenar metadata embedding [M] como token extra.
        3. Self-attention 1-layer sobre los N+1 tokens.
        4. Attention weights → weighted sum → 1 vector [D+M].

    Maneja número variable de imágenes (2 a 10).
    """

    def forward(
        self,
        visual_embeddings: list[Tensor],  # [N, B, D]
        view_types: list[str],
        metadata_emb: Tensor | None,      # [B, M]
    ) -> Tensor:
        """Returns [B, D+M] observation-level embedding."""
```

#### [7] ArcFace Head (`arcface_head.py` — NUEVO)

```python
class ArcFaceHead(nn.Module):
    """Metric learning head para open-set rejection.

    - Entrena con margen angular (ArcFace loss).
    - En inferencia: cosine similarity vs centroides de clase.
    - Si max cosine < threshold → "unknown species" (open-set).
    """

    def __init__(self, in_features: int, num_classes: int, s: float = 30.0, m: float = 0.50):
        super().__init__()
        self.weight = nn.Parameter(torch.randn(num_classes, in_features))
        self.s = s
        self.m = m

    def forward(self, embeddings: Tensor, labels: Tensor | None = None) -> Tensor:
        """Returns logits (con ArcFace margin si labels provistos)."""
```

#### [8] Temperature Calibration

```python
class TemperatureScaler(nn.Module):
    """Calibración de temperatura para confidence realista.

    Aprende 1 parámetro T. logits /= T. Reduce over-confidence.
    Per-view-combo: distintas T según qué vistas estén presentes (gills+front vs habitat+detail).
    """
    def __init__(self, num_view_combos: int = 16):
        super().__init__()
        self.temperature = nn.Parameter(torch.ones(num_view_combos))
```

---

## 4. PIPELINE DE ENTRENAMIENTO

### 4.1 Dataset multi-vista

```python
class MultiViewMushroomDataset(Dataset):
    """Dataset que agrupa imágenes por observation_id y expone N vistas.

    - Cada item: (list[image_tensor], list[view_type], metadata, label).
    - Muestreo: si una observación tiene <4 vistas → rellenar con repetición
      o zero-pad + mask (esquema elegible en config).
    - Augmentation: independiente por vista (no mezclar augmentation entre vistas).
    """

    def __getitem__(self, idx: int) -> MultiViewSample:
        observation = self.observations[idx]
        images = []
        for img_path, view_type in observation.images:
            img = self.load_and_augment(img_path, view_type)
            images.append(img)
        return MultiViewSample(
            images=images,
            view_types=[v for _, v in observation.images],
            metadata=observation.metadata,
            label=self.label2idx[observation.species],
        )
```

### 4.2 Función de pérdida combinada

```python
def multi_view_loss(
    logits: Tensor,           # [B, num_classes]
    embeddings: Tensor,       # [B, D+M] pre-head
    labels: Tensor,           # [B]
    arcface_head: ArcFaceHead,
    cfg: TrainConfig,
) -> Tensor:
    """Combina:
        - ArcFace loss (clasificación con margen angular).
        - Center loss (cohesion intra-clase de embeddings).
        - Triplet loss opcional (separación inter-clase).
        - View consistency loss (misma especie → embeddings cercanos).
    """
    loss_cls = arcface_loss(arcface_head(logits, labels), labels)
    loss_center = center_loss(embeddings, labels, arcface_head.weight)
    loss_total = loss_cls + cfg.center_loss_weight * loss_center
    if cfg.use_triplet_loss:
        loss_total += triplet_loss(embeddings, labels)
    return loss_total
```

### 4.3 Estrategia de entrenamiento por fases

```txt
Fase 1 (ep 0-2):    Freeze backbone, entrenar solo heads + adapters + fusion + metadata.
                    LR: 3e-4 en heads, 0 en backbone.
Fase 2 (ep 3-15):   Unfreeze backbone (lr 2e-5), progressive resizing 224→384→512.
Fase 3 (ep 16-25):  Fine-tune completo con SWA (Stochastic Weight Averaging) últimos 5 epochs.
Fase 4 (post):      Temperature calibration sobre val set (freeze todo menos T).
```

### 4.4 Progressive resizing

```python
class ProgressiveResizing:
    """Cambia image_size durante entrenamiento para eficiencia.

    - Ep 0-8:   224×224 (batch 64, rápido warmup)
    - Ep 9-18:  384×384 (batch 32, balance)
    - Ep 19-25: 512×512 (batch 16, máxima resolución)
    """

    def get_image_size(self, epoch: int) -> int:
        if epoch < 9: return 224
        if epoch < 19: return 384
        return 512
```

### 4.5 Mixup/CutMix multi-vista

```python
def multi_view_mixup(
    obs_a: MultiViewSample, obs_b: MultiViewSample, alpha: float = 0.2
) -> MultiViewSample:
    """MixUp a nivel de observación (no por imagen individual).

    Mezcla las vistas correspondientes (gills con gills, front con front, etc.)
    usando el mismo lambda. Si b no tiene una vista → solo se mezcla las que coinciden.
    """
```

### 4.6 TTA multi-vista

```python
def multi_view_tta(
    model: nn.Module, sample: MultiViewSample
) -> Tensor:
    """TTA por vista + agregación.

    Para cada vista: hflip + 5-crop center/corners → 6 predicciones por vista.
    Promediar logits por vista, luego fusionar.
    Total: 4 vistas × 6 TTA = 24 forward passes (paralelizables en batch).
    """
```

---

## 5. PIPELINE DE INFERENCIA (backend)

### 5.1 Nuevo `services/multi_view_classifier.py` (NUEVO — reemplaza Mock)

```python
class MultiViewMushroomClassifier:
    """Clasificador multi-vista de producción.

    Carga pesos reales entrenados en Kaggle. Reemplaza a MockMushroomClassifier.

    Flujo:
        1. Detectar ROI por imagen (YOLOv8).
        2. Auto-clasificar vista si no etiquetada.
        3. Generar embeddings por vista (view-conditioned backbone).
        4. Codificar metadata.
        5. Fusionar (attention pooling) → embedding observación.
        6. ArcFace → logits.
        7. Temperatura → calibrated probs.
        8. Open-set rejection.
        9. Safety layer (reglas de producto).
    """

    def __init__(self, weights_path: str, device: str = "cpu"):
        self.detector = MushroomROIDetector(...)
        self.view_classifier = ViewClassifier(...)
        self.backbone = ViewConditionedBackbone(...)
        self.metadata_encoder = MetadataEncoder(...)
        self.fusion = AttentionFusion(...)
        self.arcface = ArcFaceHead(...)
        self.temperature = TemperatureScaler(...)
        self.label2idx = json.load(...)
        self.class_centroids = np.load(...)  # para open-set

    @torch.inference_mode()
    def classify(
        self, observation: Observation, images: list[ObservationImage]
    ) -> ClassificationResponse:
        ...
```

### 5.2 Configuración de carga de modelo

```python
# core/config.py — nuevas settings
model_weights_path: str = "backend/app/ml/weights/multiview_v1.pt"
model_device: str = "cpu"  # "cuda" en GPU server
model_enable_roi_detection: bool = True
model_enable_view_classifier: bool = True
model_open_set_threshold: float = 0.55  # cosine similarity
model_temperature: float = 1.5  # si no hay learned temperature
model_fallback_to_mock: bool = True  # si falla la carga, usar mock con warning
```

### 5.3 Integración en `/classify`

```python
@router.post("/classify", response_model=SimpleClassificationResult)
async def classify_images(
    images: list[UploadFile] = File(...),
    view_types: list[str] | None = Form(default=None),  # NUEVO: etiquetas por imagen
    ...
):
    # view_types es opcional: si None, el view_classifier las auto-detecta.
    # Si viene, se respeta (con verificación: si el view_classifier discrepa mucho, se loguea).
```

---

## 6. EVALUACIÓN

### 6.1 Métricas obligatorias

```txt
Clasificación:
  - MAP@3 observation-level (OFICIAL FungiCLEF). Reportar con IC 95% bootstrap.
  - Top-1 / Top-3 / Top-5 accuracy.
  - Macro-F1, Micro-F1, Balanced Accuracy.
  - Per-class precision/recall/F1/support (CSV).

Open-set rejection:
  - AUROC (known vs unknown).
  - FPR @ 95% TPR.
  - Open-set F1 (con clase "unknown").

Calibración:
  - Expected Calibration Error (ECE).
  - Brier score.
  - Reliability diagram.

Multi-vista (ablation):
  - MAP@3 con 1 vista vs 2 vs 3 vs 4 vistas.
  - MAP@3 por combinación (gills+front vs habitat+detail vs all).
  - Contribution per view (Shapley value o leave-one-out).

Safety:
  - Safety recall (especies tóxicas correctamente flaggeadas).
  - False-negative rate en especies deadly.
```

### 6.2 Ablation study obligatorio

```txt
A1. Single-image baseline (current mega_training.py) → MAP@3 referencia.
A2. + ROI detection → delta MAP@3.
A3. + View classifier → delta.
A4. + Multi-view fusion (attention) → delta.
A5. + Metadata encoder → delta.
A6. + ArcFace + open-set → delta AUROC.
A7. + Temperature calibration → delta ECE.
A8. + Progressive resizing → delta.
A9. + SWA → delta.
A10. Full model (todo lo anterior) → resultado final.

Reportar cada fila en tabla con IC 95%.
```

### 6.3 Cross-validation

```txt
- 5-fold GroupKFold (group=observation_id) sobre train+val.
- Reportar media ± desviación estándar de MAP@3.
- Test set final: 15% holdout que NO se toca durante CV.
```

---

## 7. CRITERIOS DE ACEPTACIÓN ML (DoD)

```txt
[ ] Pipeline multi-vista (4 fotos) implementado end-to-end en backend.
[ ] Detector YOLOv8 fine-tuned con IoU ≥ 0.7 en test set propio.
[ ] View classifier con F1-macro ≥ 0.85 en test.
[ ] Modelo multi-vista entrenado en Kaggle con FungiCLEF + FungiTastic.
[ ] MAP@3 ≥ baseline + 5 puntos absolutos (validado con IC 95%).
[ ] AUROC open-set ≥ 0.90.
[ ] ECE ≤ 0.05 tras calibración.
[ ] Safety recall en especies deadly = 100% (sin excepciones).
[ ] Ablation study completo en docs/model_metrics_report.md (A1-A10).
[ ] Pesos exportados a backend/app/ml/weights/ (<200MB comprimidos).
[ ] Inferencia <500ms en CPU (4 imágenes) o <150ms en GPU.
[ ] Config v5 (multi-view) en kaggle/configs/mega_training_v5.json.
[ ] Tests: unitarios para cada componente (detector, view_classifier, fusion, arcface).
[ ] Tests: integración con /classify enviando 4 imágenes con view_types.
[ ] Tests: regresión safety (test_classification_safety.py sigue verde).
[ ] openapi actualizado con view_types en /classify.
```

---

## 8. INTEGRIDAD DE DATOS (anti-leak)

```txt
- Split por observation_id: NUNCA mezclar imágenes de la misma observación en train/val/test.
- Stratify por genus + family (preservar distribución taxonómica).
- min_class_count: clases con <3 observaciones → descartar o agrupar en "rare".
- No usar imágenes sintéticas (regla de producto heredada de PROMPT.md §16).
- Si se mezclan FungiCLEF + FungiTastic + DF20: deduplicar por hash perceptual (avoid overlap).
- Etiquetas de vista: deduplicar observaciones entre datasets (mismo observation_id en dos fuentes = leak).
- Validar: hash md5 de imágenes, lista de observation_ids únicos en cada split.
```

---

## 9. CONFIG v5 (multi-view)

```json
// kaggle/configs/mega_training_v5.json
{
  "experiment_name": "mega_training_v5_multiview",
  "model": {
    "type": "multi_view",
    "base_backbone": "convnextv2_base.fcmae_ft_in22k_in1k",
    "d_model": 1024,
    "use_lora_adapters": true,
    "lora_rank": 16,
    "use_arcface": true,
    "arcface_s": 30.0,
    "arcface_m": 0.50,
    "view_classes": ["gills", "front", "habitat", "detail"]
  },
  "training": {
    "epochs": 25,
    "batch_size": 16,
    "lr_head": 3e-4,
    "lr_backbone": 2e-5,
    "weight_decay": 0.01,
    "warmup_epochs": 2,
    "label_smoothing": 0.1,
    "use_swa": true,
    "swa_start_epoch": 20,
    "use_progressive_resizing": true,
    "progressive_schedule": [[0, 9, 224], [9, 19, 384], [19, 25, 512]],
    "center_loss_weight": 0.01,
    "use_triplet_loss": false,
    "focal_gamma": 2.0,
    "max_grad_norm": 1.0,
    "amp": true
  },
  "augmentation": {
    "hflip": true,
    "vflip": false,
    "rotation_degrees": 20,
    "color_jitter": 0.3,
    "random_erasing": true,
    "mixup_alpha": 0.2,
    "cutmix_alpha": 0.0,
    "per_view_independent": true
  },
  "fusion": {
    "type": "attention_pooling",
    "num_heads": 4,
    "include_metadata_token": true,
    "max_views": 10
  },
  "metadata": {
    "use_habitat": true,
    "use_substrate": true,
    "use_smell": true,
    "use_country": true,
    "embed_dim": 64
  },
  "calibration": {
    "use_temperature": true,
    "learned_temperature": true,
    "per_view_combo": true,
    "num_view_combos": 16
  },
  "split": {
    "group_by": "observation_id",
    "stratify_by": ["genus", "family"],
    "test_size": 0.15,
    "val_size": 0.15,
    "random_state": 42,
    "min_class_count": 3
  },
  "output": {
    "dir": "/kaggle/working/models"
  }
}
```

---

## 10. DELEGACIÓN A SUBAGENTES ML

### 🧠 SUBAGENT M1 — Datos & etiquetado de vistas

**Rol**: Data Engineer / Mycologist. **Skills**: pandas, CVAT/Roboflow, hash perceptual.

**Tareas:**
- M1.1: Muestrear 4000 imágenes (1000/vista) y etiquetar view_type (gills/front/habitat/detail).
- M1.2: Anotar 500 imágenes con bbox de hongo para fine-tune YOLOv8.
- M1.3: Deduplicar FungiCLEF + FungiTastic + DF20 por hash perceptual (pHash).
- M1.4: Crear CSV multi-vista: `observation_id, image_path, view_type, species, genus, family, habitat, substrate, smell, country`.
- M1.5: Validar split anti-leak (ningún observation_id en dos splits).

### 🎯 SUBAGENT M2 — Detector ROI + View Classifier

**Rol**: Detection Engineer. **Skills**: YOLOv8, EfficientNet, timm.

**Tareas:**
- M2.1: Fine-tune YOLOv8n sobre 500 anotaciones → IoU ≥ 0.7 test.
- M2.2: Fine-tune EfficientNet-B0 view classifier (4 clases) → F1 ≥ 0.85.
- M2.3: Exportar ambos a ONNX.
- M2.4: Integrar en `services/yoloe_detector.py` + `services/view_classifier.py`.
- M2.5: Tests unitarios.

### 🔬 SUBAGENT M3 — Modelo multi-vista (core)

**Rol**: Research Engineer. **Skills**: PyTorch, timm, attention mechanisms, LoRA.

**Tareas:**
- M3.1: Implementar `MultiViewMushroomDataset` (variable N vistas).
- M3.2: Implementar `ViewConditionedBackbone` con LoRA adapters.
- M3.3: Implementar `AttentionFusion` pooling (variable length).
- M3.4: Implementar `MetadataEncoder`.
- M3.5: Implementar `ArcFaceHead` + center loss + triplet loss opcional.
- M3.6: Integrar todo en `mega_training.py` como subclase o nuevo `mega_training_v5.py`.
- M3.7: Progressive resizing + SWA hooks.
- M3.8: Entrenar en Kaggle (T4 x2 o P100) con config v5.

### 📊 SUBAGENT M4 — Evaluación & ablation

**Rol**: Eval Engineer. **Skills**: scikit-learn, bootstrap CI, matplotlib.

**Tareas:**
- M4.1: Ampliar `eval/scripts/compute_full_metrics.py` para multi-vista.
- M4.2: Ejecutar ablation A1-A10 (10 configs).
- M4.3: Cross-validation 5-fold GroupKFold.
- M4.4: Generar tabla de resultados con IC 95% en `docs/model_metrics_report.md`.
- M4.5: Reliability diagram + confusion matrix top-50 clases.

### 🚀 SUBAGENT M5 — Despliegue en backend

**Rol**: MLOps. **Skills**: FastAPI, ONNX, TorchScript, lazy loading.

**Tareas:**
- M5.1: Implementar `services/multi_view_classifier.py` (reemplaza Mock).
- M5.2: Lazy loading en startup con fallback a mock si pesos no existen.
- M5.3: Endpoint `/classify` acepta `view_types` opcional.
- M5.4: `/readyz` reporta modelo cargado (real vs mock).
- M5.5: Tests integración (4 imágenes + view_types).
- M5.6: Benchmark latencia (<500ms CPU, <150ms GPU).

### 🔒 SUBAGENT M6 — Safety & open-set

**Rol**: Safety Engineer. **Skills**: open-set recognition, calibration.

**Tareas:**
- M6.1: Implementar open-set rejection con cosine similarity vs centroides.
- M6.2: Calibrar thresholds por combinación de vistas (per-combo).
- M6.3: Temperature scaling → ECE ≤ 0.05.
- M6.4: Safety layer: especies deadly siempre flagged (hardcoded list + learned).
- M6.5: Tests: test_classification_safety.py + test_open_set_rejection.py verde.

---

## 11. ORDEN DE TRABAJO (grafo de dependencias)

```txt
1. M1 (datos + etiquetado)                       → bloqueante para todo
2. M2 (detector + view classifier)               → paralelo con M1.2/M1.3
3. M3 (modelo multi-vista)                        → tras M1 + M2
4. M4 (eval + ablation)                           → tras M3 (entrenamiento)
5. M5 (despliegue backend)                        → tras M3 (pesos disponibles)
6. M6 (safety + open-set)                         → tras M3 + M5
7. DoD ML check + smoke test Kaggle               → cierre
```

---

## 12. NO HACER (reglas duras)

```txt
- No uses imágenes sintéticas (regla de producto).
- No relajes la Safety Layer ni permitas frases de consumo seguro.
- No declares modelo "real" si ejecuta con mock fallback en producción.
- No mezcles observation_id entre splits (anti-leak).
- No entrenes con test set (ni siquiera para early stopping).
- No publiques pesos sin ablation study completo.
- No omitas IC 95% en reportes de métricas.
- No pongas especies deadly sin flag de safety aunque la confianza sea alta.
- No uses backbones sin licencia compatible (MIT/Apache/CC-BY).
- No ignores latencia: inferencia >1s en CPU = bloqueante.
```

---

## 13. RESULTADO ESPERADO (cierre)

```txt
Modelo:
  - Multi-vista (4 fotos: láminas, frente, hábitat, detalle) end-to-end.
  - MAP@3 ≥ baseline + 5 puntos absolutos (con IC 95%).
  - AUROC open-set ≥ 0.90, ECE ≤ 0.05.
  - Safety recall deadly = 100%.

Arquitectura:
  - YOLOv8 ROI detector + view classifier + view-conditioned backbone + attention fusion + ArcFace.
  - Pesos en backend/app/ml/weights/ (<200MB).
  - Inferencia <500ms CPU / <150ms GPU.

Pipeline:
  - mega_training_v5.py ejecutable en Kaggle con config v5 JSON.
  - Ablation A1-A10 en docs/model_metrics_report.md.
  - 5-fold CV con media ± std.

Backend:
  - /classify acepta view_types opcional.
  - MultiViewMushroomClassifier carga pesos reales (fallback a mock con warning).
  - /readyz reporta estado del modelo.

Safety:
  - Política intacta.
  - Open-set rejection funcional.
  - Especies deadly siempre flagged.

Conclusión:
  - VisionSetil pasa de MVP single-image a modelo multi-vista SOTA con safety robusta.
  - Pendiente (out of scope): modelo en producción GPU, A/B testing, active learning.