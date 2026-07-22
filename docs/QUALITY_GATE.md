# Quality gate — métricas inaceptables

## Veredicto actual (checkpoint v9 en disco)

| Métrica | Valor | Gate |
|---------|------:|------|
| MAP@3 test | ~0.076 | **FAIL** (objetivo ≥ 0.25 prod-soft / ≥ 0.45 ambicioso) |
| Top-1 | 0.05 | **FAIL** |
| Safety recall mortales | **0.0** | **BLOCKER** (R7) |
| Clases a 0% acc | 472/500 | **FAIL** |

Estas cifras **no** se presentan como producto de identificación.

## Mitigaciones en serve (hasta checkpoint aceptable)

1. **GATE DURO (activo):** si MAP@3 < 0.20 **o** recall mortales < 0.90 →  
   `/classify` devuelve `decision=rejected`, **predicciones vacías**, warning GATE.  
   Endpoint: `GET /models/quality-gate`.
2. Open-set multi-view + cap conf ≤ 0.45.
3. Human review forzado.
4. Boost mortales en top-20 si ya son plausibles.
5. T recomendada 1.5.

Con el checkpoint v9, **la app no identifica especies**. Solo abstención.

## Re-entrenos

| Exp | Kernel | Objetivo | Notas |
|-----|--------|----------|-------|
| E12 data-scale | `…-v12-data-scale` | MAP@3 ≥ 0.12 | RUNNING (GPU slot) |
| E13 deadly+data | `…-v13-deadly` | deadly ≥ 0.5 | RUNNING (GPU slot) |
| E14 focused 120 | `…-v14-focused` | MAP@3 ≥ 0.20 + deadly | Notebook listo; **push pendiente** (límite 2 GPU Kaggle) |

E14 es el plan realista: **120 clases × 40 obs**, no 500×8 few-shot.

## Gates para “aceptable” en producción

- [ ] MAP@3 test ≥ 0.20 (mínimo) en hold-out por observación  
- [ ] Safety recall mortales top-3 ≥ 0.90  
- [ ] ECE ≤ 0.05 con T calibrado  
- [ ] Eval regional ES/Soria documentada  
- [ ] Open-set: acc\|accept ≥ 0.35 a coverage ≥ 0.25  

Hasta entonces: **solo orientación + abstención + experto**.

Plan de recuperación 30 días (autopsia E12–E14 + roadmap industrial):  
[`PLAN_30D_MODELO_INDUSTRIAL.md`](./PLAN_30D_MODELO_INDUSTRIAL.md).
