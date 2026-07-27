# E16 MEGA-FOCUS40 — análisis post-run

| Campo | Valor |
|-------|--------|
| **Estado** | **COMPLETE** (exit limpio, artefactos exportados) |
| **Slug** | `alonsoalviraaaa/visionsetil-exp-v16-mega-focus` |
| **GPU** | Tesla P100 16 GB |
| **Duración** | ~2.5–3 h wall (early stop ep 19, no 60) |
| **Datos** | FungiTastic + FungiCLEF (públicos) |
| **Clases** | 40 (allowlist industrial, 11 mortales presentes) |

## Métricas test (anti-leak)

| Métrica | E16 | E14 (prev best) | Soft gate A | Veredicto |
|---------|----:|----------------:|------------:|-----------|
| **MAP@3** | **0.184** | 0.093 | ≥ 0.25 | ⚠️ ~2× E14, aún **FAIL** gate |
| MAP@3 CI 95% | [0.156, 0.210] | — | — | techo real ~0.21 |
| Top-1 acc | 0.111 | 0.063 | — | bajo |
| Macro-F1 | 0.046 | 0.037 | — | long-tail / colapso por clase |
| Balanced acc | 0.086 | — | — | — |
| **ECE** | **0.262** | 0.142 | ≤ 0.06 | ❌ mal calibrado |
| **Deadly recall** | **0.371** | ~0.02 | ≥ 0.90 | ⚠️ gran salto, aún **FAIL** R7 |
| Deadly en test | 124 obs | 48 | — | más señal mortal |
| Train/val/test obs | 2893 / 620 / 620 | 3245 / 696 / 696 | — | comparable |
| Best val MAP@3 | 0.184 @ **ep 7** | 0.114 @ ep 10 | — | picos tempranos |

## Dinámica de entrenamiento

- Loss baja 42 → 11 (aprende algo).
- Mejor val MAP@3 en **epoch 7**, luego **plateau y degradación**.
- Early stop en epoch **19** (patience 12 sin mejorar best).
- Progressive 384 **no llegó** (umbral era ep 25).
- SWA no se activó (start ep 40).

## Diagnóstico (por qué no es “fiable” aún)

1. **Mejora real de diseño** (allowlist 40 + más obs + mortales) → MAP@3 y deadly suben vs E12–E14.
2. **Overfitting / colapso**: top-1 ~11%, muchas especies a **0% acc** en test (incl. mortales como *A. phalloides*, *Galerina*, *Gyromitra* en el top-worst del log).
3. Deadly@3 0.37 significa: en ~1 de cada 3 casos mortales el taxón entra en top-3 — **insuficiente** para R7 (hace falta ≥0.90).
4. ECE alto → confianzas **no usables** como “certeza de campo”.
5. Gate producto debe **seguir bloqueando** species ID.

## Artefactos locales

```
kaggle/kernel_output_v16/models/
  best.pt (~122 MB, epoch 7, 40 classes)
  checkpoint_latest.pt
  metrics.json
  training_history.json
  label2idx.json
  temperature_scaler.pt
  test_predictions.npz
```

## Siguiente movimiento recomendado (E17)

No “más epochs ciego”. Priorizar:

1. **Más señal por clase** (min 50–100 obs limpios; hard negatives de mortales).
2. Loss / sampler más agresivos en mortales + evaluación deadly@1/@3 cada epoch (early-stop dual).
3. Ablation **single-view vs multi-view** (fusion ruidosa puede estar matando).
4. Solo ampliar a 80 spp si MAP@3 ≥ 0.22 y deadly ≥ 0.50 en re-run.

## Atribución

FungiTastic / FungiCLEF públicos (Picek et al.) — educational orientation only; never consumption permission.
