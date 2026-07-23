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

## D-B12 — Metrics path SSOT (normativo)

El gate de serve **nunca** elige “best MAP” entre kernels. Las métricas del veredicto
deben ser las del checkpoint **realmente cargado** (sibling `metrics.json` del path
de pesos multi-view en serve).

### Algoritmo (`load_primary_metrics` / `quality_gate_status`)

```text
function load_gate_metrics(loaded_weights_path: Path | None) -> metrics | None:
  # 1) SSOT: sibling of ACTUALLY loaded multi-view checkpoint
  if loaded_weights_path and (loaded_weights_path.parent / "metrics.json").is_file():
      return read(sibling)   # _metrics_path = full resolved path (D-B23)

  # 2) Weights known but no sibling metrics → species_id_allowed=false
  #    reason_code=no_metrics (do NOT fall through to "best kernel MAP"
  #    nor to industrial_v1 / other kernels)
  if loaded_weights_path is not None:
      return None

  # 3) No weights resolved (mock / status reporting only):
  #    Prefer configured multi_view_weights_path sibling,
  #    then data/industrial_v1/metrics.json,
  #    then mtime-newest among kaggle/kernel_output*/models/metrics.json
  #    Do NOT pick max(test_map_at_3) across kernels for serve decisions
  return discovery_metrics_for_status_only()
```

| Paso | Condición | Resultado |
|------|-----------|-----------|
| 1 | Pesos serve resueltos + sibling `metrics.json` | Usar sibling (SSOT) |
| 2 | Pesos known, **sin** sibling | `no_metrics` — **sin** fallthrough |
| 3 | Sin pesos (mock/status) | Discovery: configured → industrial → mtime-newest kernel |

**Prohibido en serve:**

- `max(test_map_at_3)` entre `kaggle/kernel_output*`
- Usar métricas de un run que **no** es el modelo en serve
- Declarar `verdict=ACCEPTABLE` con métricas de otro checkpoint

**Implementación:** algoritmo serve en **B-03** (`backend/app/ml/quality_gate.py`).  
**Goldens multi-layout:** **B-20** (`backend/app/tests/test_quality_gate.py`).

### D-B23 — `metrics_path` siempre completo

En `QualityGatePayload` y en logs de evaluate:

- `metrics_path` es path **completo** (absoluto / `Path.resolve()` cuando es posible)
- **Nunca** basename-only (`"metrics.json"`)
- Si no hay métricas: `metrics_path=null` y `reason_code=no_metrics`

Cada evaluate registra (structured log):

`metrics_path`, `test_map_at_3`, `safety_recall_deadly`, `reason_code`, `verdict`.

### Dual signals (D-B15) — resumen

| Campo | Significado |
|-------|-------------|
| `metrics_acceptable` | Solo umbrales MAP/deadly crudos — **nunca** forzado por disable |
| `species_id_allowed` | Política de serve (`block_enabled`) |
| `verdict` | Sigue **métricas** (`ACCEPTABLE` / `UNACCEPTABLE`), no el bypass |
| `reason_code` | `no_metrics` \| `map_below` \| `deadly_below` \| `gates_passed` \| `gate_disabled` |

Si `model_block_species_id_when_below_gate=false` (dev only):  
`species_id_allowed=true`, `reason_code=gate_disabled`, pero `metrics_acceptable` puede seguir en `false`.

### Layouts golden (B-20)

| Layout | Expectativa |
|--------|-------------|
| Múltiples kernels, serve en low-MAP | Sibling low; **no** high-MAP |
| Sibling miss + industrial/high kernel | `no_metrics`; sin fallthrough |
| Solo reporting (sin pesos): industrial + kernels | Prefiere `data/industrial_v1/metrics.json` |
| Solo reporting: configured sibling + industrial | Prefiere configured sibling |
| Solo reporting: kernels por mtime | mtime-newest, **no** max-MAP |
| Cualquier métrica leída | `metrics_path` full path (D-B23) |

Código de referencia: `docs/PHASE_B_HONEST_IDENTIFY.md` §6 (D-B12) y D-B23.

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

## Disable del gate (dev-only; B-23 / D-B3)

| Env | `MODEL_BLOCK_SPECIES_ID_WHEN_BELOW_GATE=false` |
|-----|-----------------------------------------------|
| `development` / `staging` | Permitido; warn estructurado (B-19) |
| `production` / `prod` | **Rechazado** al construir `Settings` (B-23) — el proceso no arranca |

Default: `true` (fail-closed). Disable **nunca** fuerza `metrics_acceptable=true`.  
Runbook: [`ML_WEIGHTS_RUNBOOK.md`](./ML_WEIGHTS_RUNBOOK.md) · config: [`configuration.md`](./configuration.md).

Plan de recuperación 30 días (autopsia E12–E14 + roadmap industrial):  
[`PLAN_30D_MODELO_INDUSTRIAL.md`](./PLAN_30D_MODELO_INDUSTRIAL.md).
