# E17 DATA-SCALE — análisis post-run

| Campo | Valor |
|-------|--------|
| **Estado** | **COMPLETE** |
| **Slug** | `alonsoalviraaaa/visionsetil-exp-v17-data-scale` |
| **GPU** | Tesla P100 16 GB |
| **Duración** | ~1.5 h (early stop ep 15) |
| **Best val** | MAP@3 **0.217** @ ep 5 · deadly@3 val **0.754** @ ep 5 |

## Métricas test

| Métrica | **E17** | E16 | E14 | Soft gate A | ¿OK? |
|---------|--------:|----:|----:|------------:|:----:|
| **MAP@3** | **0.194** | 0.184 | 0.093 | ≥ 0.25 | ❌ (~78% del soft) |
| MAP@3 CI | [0.172, 0.217] | [0.156, 0.210] | — | — | techo ~0.22 |
| Top-1 | 0.126 | 0.111 | 0.063 | — | bajo |
| Macro-F1 | 0.036 | 0.046 | 0.037 | — | colapso por clase |
| **ECE** | **0.398** | 0.262 | 0.142 | ≤ 0.06 | ❌ peor calibrado |
| **Deadly@3** | **0.447** | 0.371 | ~0.02 | ≥ 0.90 | ❌ mejora, lejos |
| Deadly test n | 159 | 124 | 48 | — | más casos |
| Train/val/test obs | 3822 / 819 / 820 | 2893 / 620 / 620 | — | — | +32% train obs |
| Clases | 40 | 40 | 119 | — | OK |

**Veredicto:** mejora **marginal** vs E16 (MAP +0.01, deadly +0.08). **Gate sigue rojo.** Identify no se desbloquea.

## Qué pasó con los datos (crítico)

| Fuente montada | ¿Detectada? | ¿Usada en train? |
|----------------|:-----------:|:-----------------:|
| FungiTastic | ✅ | ✅ **única real** (10529 imgs allowlist) |
| FungiCLEF (seemshukla) | ✅ path | ❌ **0 filas útiles** en combine |
| FungiCLEF 2022 train | ✅ path | ❌ **No valid image CSV** |

Log clave:
- `Sources pre-cap: {'fungitastic': 11059}` → solo FungiTastic.
- `COMBINED: ... from 1 DBs`
- FC22: `WARNING: No valid image CSV found`

El “tercer dataset” **no aportó imágenes**. La subida de obs (3822 vs 2893) viene de **caps más altos (200/400)** sobre FungiTastic, no de multi-fuente real.

## Dinámica train

- Mejor val MAP@3 y deadly@3 en **epoch 5** (0.217 / 0.754).
- Luego overfit: loss ↓ 43→8.8, val MAP y deadly se **hunden** (ep 15: map3 0.10, deadly 0.24).
- Early stop ep 15 (patience 10).
- Dual early-stop de deadly **sí funcionó en val** (pico 0.75) pero el checkpoint de test (best MAP) no traduce a deadly test 0.90.

## Diagnóstico

1. **Bottleneck #1: ingest FungiCLEF** — path montado, parser CSV no legible → hay que arreglar el loader (columnas/path layout FC + FC22).
2. **Bottleneck #2: overfitting temprano** — más epochs sin regularización / sampler balanceado no ayuda.
3. **Deadly** mejora con peso×12 pero top-1 de mortales sigue débil en test.
4. ECE empeora (confianzas peores) → no usar conf como “certeza”.

## Próximo (E18) — acciones concretas

1. **Fix loader** FungiCLEF + FC22 (inspeccionar CSV real en Kaggle, mapear columnas `image_path`/`species`/`observationID`).
2. Si hace falta, dataset Kaggle propio solo con allowlist pre-empaquetado.
3. Entrenar con **sampler balanceado + early-stop en deadly@3 del best checkpoint** (no solo MAP).
4. No ampliar a 80 spp hasta MAP≥0.22 **y** deadly≥0.50 en test con multi-fuente real.

## Artefactos

```
kaggle/kernel_output_v17/models/
  metrics.json, training_history.json, label2idx.json, best.pt (~122 MB)
```

Policy: orientation only — never consumption permission.
