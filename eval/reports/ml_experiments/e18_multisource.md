# E18 Multisource — analysis (updated 2026-07-26)

| Campo | Valor |
|-------|--------|
| **Estado** | **COMPLETE** |
| **Slug** | `alonsoalviraaaa/visionsetil-exp-v18-multisource` |
| **GPU** | Tesla P100 16 GB |
| **Best val** | MAP@3 **0.881** @ ep 7 · deadly@3 val **0.964** |
| **Checkpoint** | `kaggle/kernel_output_v18/models/best.pt` |

> Nota: un push intermedio murió por `SyntaxError` en `replace('\\','/')`. El run que exportó métricas es el **completo** (~3.5 h train).

## Test metrics

| Métrica | **E18** | E17 | Soft A | Expand gate |
|---------|--------:|----:|-------:|------------:|
| **MAP@3** | **0.870** | 0.194 | ≥0.25 ✅ | ≥0.22 ✅ |
| MAP CI | [0.852, 0.887] | [0.172, 0.217] | — | — |
| Top-1 | **0.824** | 0.126 | — | — |
| Macro-F1 | **0.819** | 0.036 | — | — |
| ECE | 0.186 | 0.398 | ≤0.06 ❌ | — |
| **Deadly@3** | **0.890** | 0.447 | ≥0.90 ⚠️ (−0.01) | ≥0.50 ✅ |
| Deadly n test | 419 | 159 | — | — |
| Train/val/test obs | 5525 / 1184 / 1185 | 3822 / 819 / 820 | — | — |
| Clases | 40 | 40 | — | — |

## Data stack (real multi-source)

| Fuente | Imgs post-allowlist (pre-cap) | Post-cap (contrib) |
|--------|------------------------------:|-------------------:|
| mushroom1 | 105 684 | 5 890 |
| fungitastic | 50 973 | 11 819 |
| combined_mushrooms | 19 475 | 19 475 |
| **Total post-dedup** | — | **37 184 imgs / 7 894 obs** |

- Dedup paths: 102 821 → 37 184 (muchas rutas repetidas entre packs).
- `combined_mushrooms`: carpeta → **226 obs** / 80k imgs (1 obs por carpeta-especie).
- Split anti-leak por `observation_id` **dentro** del pool unificado.

## Gates (printed by kernel)

- DO2 expand MAP≥0.22 ✅ (0.870)
- DO2b soft MAP≥0.25 ✅
- DO3 expand deadly≥0.50 ✅ (0.890)
- DO3b soft deadly≥0.90 ⚠️ **0.890** (casi; no llega)
- Multi-source ≥2 ✅

## Integrity caveats (importante)

El salto E17→E18 (**+0.68 MAP**, **+0.44 deadly**) es **demasiado grande** para solo “más datos limpios” sin riesgo de:

1. **Near-duplicates cross-source** (mismas fotos web en mushroom1/combined y FungiTastic) con **obs_id distintos** → anti-leak no las separa.
2. Packs Kaggle genéricos con fotos “de estudio” más fáciles que campo ES.
3. `combined_mushrooms` con obs = carpeta entera → multi-view artificial muy denso por clase.

**Recomendación:** no desbloquear ID de producto solo con E18. Validar en **hold-out ES real (GBIF)** vía E19 arreglado.

## Artefactos

```
kaggle/kernel_output_v18/models/
  best.pt, checkpoint_latest.pt, metrics.json, training_history.json,
  label2idx.json, temperature_scaler.pt, test_predictions.npz
```
