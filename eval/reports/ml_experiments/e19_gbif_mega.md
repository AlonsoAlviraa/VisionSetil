# E19 GBIF mega — analysis (2026-07-27)

| Campo | Valor |
|-------|--------|
| **Estado** | **COMPLETE** |
| **Slug** | `alonsoalviraaaa/visionsetil-exp-v19-gbif-mega` (v3 fixed SyntaxError) |
| **GPU** | Tesla P100 16 GB |
| **Best val MAP@3** | **0.953** @ epoch 8 |
| **Checkpoint** | `kaggle/kernel_output_v19/models/best.pt` (~122 MB) |

## Test metrics

| Métrica | **E19** | E18 | E17 | Soft A | Expand |
|---------|--------:|----:|----:|-------:|-------:|
| **MAP@3** | **0.960** | 0.870 | 0.194 | ≥0.25 ✅ | ≥0.22 ✅ |
| MAP CI | [0.951, 0.968] | [0.852, 0.887] | — | — | — |
| Top-1 | **0.936** | 0.824 | 0.126 | — | — |
| Macro-F1 | **0.905** | 0.819 | 0.036 | — | — |
| Balanced acc | 0.902 | 0.812 | 0.072 | — | — |
| **ECE** | **0.063** | 0.186 | 0.398 | ≤0.06 ⚠️ | almost |
| **Deadly@3** | **0.963** | 0.890 | 0.447 | ≥0.90 ✅ | ≥0.50 ✅ |
| Deadly n test | 455 | 419 | 159 | — | — |
| Train/val/test obs | 6065 / 1300 / 1300 | 5525 / 1184 / 1185 | 3822 / 819 / 820 | — | — |
| Clases | 40 | 40 | 40 | — | — |

## Data stack (real multi-source)

| Fuente | Montada | Post-allowlist pre-cap | Post-cap imgs |
|--------|:-------:|-----------------------:|--------------:|
| FungiTastic | ✅ | 50 973 | 10 937 |
| **gbif_es** | ✅ | **38 003** | **12 326** |
| mush215 | ✅ path | 0 (no usable layout) | 0 |
| **Total** | | 88 976 | **23 263 imgs / 8 665 obs** |

- GBIF JSONL: 38 003 images, 40 spp, **24 649 obs**, `cc_ok=1089` (rest mostly NC).
- Post-cap license mix: nc=11226, unknown=10937 (FT), cc_ok=1089, other=11.
- Split anti-leak: train 6065 obs (16256 imgs) | val 1300 | test 1300.
- Deadly class weight ×12; 11 deadly spp in dataset.

## Gates (kernel print)

| Gate | Result |
|------|--------|
| DO2 expand MAP≥0.22 | ✅ 0.960 |
| DO2b soft MAP≥0.25 | ✅ |
| DO3 expand deadly≥0.50 | ✅ 0.963 |
| DO3b soft deadly≥0.90 | ✅ 0.963 |
| Multi-source ≥2 | ✅ FT + GBIF |
| GBIF in used | ✅ |
| ECE ≤0.06 | ⚠️ 0.063 (borderline) |

## Training dynamics

- Ep0 already val deadly@3 ~0.98 (mortales muy “fáciles” en este pool o métrica top-3 generosa al inicio).
- Best MAP val @ **ep 8** (0.953); early stop ~ep 18.
- Loss 32 → ~1.5; sin el colapso grave de E16/E17.

## Integrity notes

1. **Mejor que E18 en integridad de fuentes:** no usa mushroom1/combined (packs genéricos con alto riesgo de near-dup). Solo **FT + GBIF ES**.
2. **GBIF es StillImage ES allowlist** (campo/ciudadano) — más alineado con producto ES que packs Kaggle genéricos.
3. Sigue habiendo **mezcla FT+GBIF en el mismo split aleatorio por obs** — no es un hold-out *solo-GBIF*. Para producto ideal: test_es_gbif puro o eval zero-shot del checkpoint E19 solo en obs `gbif_*`.
4. Licencias mayoritariamente **NC** en GBIF → research/orientation; no redistribuir comercialmente sin filtrar `cc_ok`.
5. Números ~0.96 son **muy altos** para fungi ID real; mantener escepticismo hasta eval hold-out GBIF-only y/o fotos de usuario.

## Product policy

- Expand-to-80 **numéricamente PASS** (MAP+deadly).
- Soft A **PASS** (MAP + deadly).
- ECE casi soft (0.063 vs 0.06) — confianzas aún no “seguros de campo”.
- **Orientation only — never consumption permission.**
- Recomendación: antes de desbloquear Identify en prod, correr **eval solo `source=gbif_es`** y smoke con fotos reales ES.

## Artefacts

```
kaggle/kernel_output_v19/models/
  best.pt, checkpoint_latest.pt, metrics.json, training_history.json,
  label2idx.json, temperature_scaler.pt, test_predictions.npz
log: kaggle/kernel_output_v19/visionsetil-exp-v19-gbif-mega.log
```
