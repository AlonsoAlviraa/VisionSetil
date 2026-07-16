# 🍄 VisionSetil Mega Training — Anti-Leak Expert Pipeline

Pipeline de entrenamiento de nivel experto para clasificación de hongos con **datos reales** (FungiCLEF 2025 / FungiTastic) en Kaggle GPU. **No usa datos sintéticos.**

## 📁 Estructura

```txt
kaggle/
├── anti_leak_splitter.py              # 🔒 Splitter anti-fuga (8 vectores de leak)
├── mega_training.py                   # 🧠 Pipeline de entrenamiento (CLI)
├── visionsetil_mega_training.ipynb    # 📓 Notebook Kaggle (listo para ejecutar)
├── kernel-metadata.json               # ⚙️ Config del kernel Kaggle
└── configs/
    └── mega_training_v1.json          # 🎛️ Config del experimento
```

## 🚀 Ejecución rápida (Kaggle)

1. **Subir el notebook**: `visionsetil_mega_training.ipynb` → Kaggle
2. **Vincular dataset**: `fungi-clef-2025` (Add Input)
3. **Activar GPU**: Settings → Accelerator → GPU T4 x1
4. **Activar Internet**: Settings → Internet → On (para pesos pretrained)
5. **Run All**

## 🔒 Técnicas Anti-Leak (8 vectores mitigados)

| # | Vector de fuga | Mitigación |
|---|----------------|------------|
| 1 | **Image-level** | Hash perceptual (phash) de 8-char prefix — mismo archivo/crop nunca en 2 splits |
| 2 | **Observation-level** | GroupKFold por `observation_id` — todas las fotos de una seta van al mismo split |
| 3 | **Session-level** | Union-Find por `user_id + observed_at` — sesión completa al mismo split |
| 4 | **Metadata leak** | No se usa GPS/fecha como feature directo |
| 5 | **Class leak** | Clases con < 3 obs se fusionan a `__rare__`; StratifiedGroupKFold |
| 6 | **Near-duplicate** | phash prefix isolation post-split (mover val→train si colisión) |
| 7 | **Lookalike leak** | Mapeo opcional de species tóxicas/seguras visualmente similares |
| 8 | **Source leak** | Session key incluye photographer/observer ID |

### Auditoría post-split

El splitter ejecuta automáticamente estas aserciones (falla si hay leak):

```python
assert not (train_obs & val_obs)       # observaciones disjuntas
assert not (train_sessions & val_sessions)  # sesiones disjuntas
assert not (train_phash & val_phash)   # hashes disjuntos
assert val_classes ⊆ train_classes    # cobertura de clases
assert stratification_balance ± 50%   # balance verificado
```

## 🧠 Arquitectura del modelo

- **Backbone**: ConvNeXt-Base (89M params) con pesos ImageNet1K-V1
- **Head**: Linear(1024 → num_classes)
- **Estrategia**: Freeze backbone 2 epochs → unfreeze + differential LR

## ⚙️ Hiperparámetros clave

| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| Image size | 384px | Balance detail/VRAM en T4 |
| Batch size | 32 | Máximo que cabe en T4 (16GB) |
| LR head | 3e-4 | Head nueva entrena rápido |
| LR backbone | 2e-5 | Backbone pretrained, cambios sutiles |
| Epochs | 25 | Suficiente para convergencia con cosine decay |
| Warmup | 2 epochs | Estabiliza head nuevo antes de unfreeze |
| Label smoothing | 0.1 | Regularización para long-tail |
| Focal γ | 2.0 | Baja peso a clases mayoritarias |
| AMP | ✅ | 2x velocidad en T4 |

## 📊 Métricas reportadas

- **Accuracy** (top-1)
- **F1 Macro** (justo para clases desbalanceadas)
- **Top-3 Accuracy**
- **Per-class report** (precision/recall/F1 por especie)

## 📦 Artefactos generados

```txt
/kaggle/working/visionsetil_outputs/
├── best_model.pt              # Checkpoint PyTorch (state_dict + label2idx)
├── label2idx.json             # Mapeo especie → índice
├── training_history.json      # Métricas por epoch
├── test_metrics.json          # Métricas finales leak-free
└── per_class_report.csv       # Reporte por especie
```

## 🔗 Integración con VisionSetil backend

Después del entrenamiento:

1. Descargar `best_model.pt` + `label2idx.json` desde Kaggle
2. Colocar en `backend/app/ml/weights/`
3. Actualizar `model_registry.py` para cargar este checkpoint:

```python
# backend/app/services/model_registry.py
import torch
from torchvision.models import convnext_base

def load_visionsetil_classifier(weights_path, label2idx_path):
    label2idx = json.load(open(label2idx_path))
    model = convnext_base()
    model.classifier[2] = nn.Linear(1024, len(label2idx))
    ckpt = torch.load(weights_path, map_location='cpu')
    model.load_state_dict(ckpt['model_state'])
    model.eval()
    return model, label2idx
```

## 🎯 Política de datos

- ❌ **No datos sintéticos** (no GANs, no diffusion, no augmentación offline)
- ✅ **Solo datos reales** de FungiCLEF 2025 / FungiTastic
- ✅ **Augmentation online** (transformaciones en GPU durante training, no persisten)
- ✅ **Licencia**: ver términos del dataset original