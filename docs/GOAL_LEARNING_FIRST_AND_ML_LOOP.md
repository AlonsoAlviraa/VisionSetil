# Goal — Learning-first UX + continuous ML loop

| Campo | Valor |
|-------|--------|
| **Producto** | VisionSetil — identificación orientativa de setas |
| **Intención** | Learning-first (usuarios mejoran skill) **y** ML continuous (lab no para) |
| **Tracks** | **UX ∥ ML** en paralelo (merge independientes) |
| **Idioma primario** | Español |
| **Estado** | Pointer in-repo (execute-plan DOC-01 / pr-5) |
| **Plan ID** | `bfde5857` · PR-DOC-01 |

> **Thin pointer only.** No duplica el design completo. Criterios y DAG: ver § SSOT de diseño + checklist abajo.

---

## Product intent (exacto)

1. **Fase A — UX learning-first:** mejorar UX y fotos para que los usuarios *mejoren* (captura multi-view, lectura de incertidumbre, discriminación lookalike, deadly study, daily practice). Shell play-first locked.
2. **Fase B — ML loop continuo:** tras (o en paralelo a) UX, no parar de iterar el lab (handoff → rails → diagnose/suite → frictions frescas → stage notebook). Nunca inventar métricas; nunca auto-unlock.

Traducción operativa del operador: *rediseña la app / mejora UX y fotos haciendo que los usuarios mejoren; luego céntrate en el ML y no pares de iterar*.

---

## Rails (permanentes — no negociable)

```
orientation only · never forage · never consumption green-light
never auto product_unlock from metrics · MAP ≠ safety
open-set honesty · dual ECE primary = train-published (not posthoc)
forage_permission = false · consumption_permission = false
```

| Rail | Regla |
|------|--------|
| Product posture | Solo orientación de campo; no permiso de consumo |
| `product_unlock` | Fail-closed; **nunca** auto desde métricas de lab o diseño |
| Copy | Zero “safe to eat” / “comestible OK” / confetti en high confidence |
| MAP vs safety | MAP@k ≠ permiso de forraje; deadly / open-set son first-class |
| ECE | Primary = train-published; posthoc lab-only separado |
| Metrics | Solo `[MEASURED]` desde SSOT (`eval/reports/ml_experiments/…`); no inventar |
| Kaggle push | Human/operator gate; scripts stage-only por defecto |

Ver también: `docs/SAFETY_POLICY.md`, `docs/OPERATOR_UNLOCK_RUNBOOK.md`, `docs/OPERATOR_UNLOCK_APPROVAL.md`.

---

## SSOT de diseño (execute-plan)

| Rol | Path / nota |
|-----|-------------|
| **Design SSOT (execute-plan)** | Scratch session artifact: `C:\Users\Mariano\AppData\Local\Temp\grok-Mariano\grok-design-doc-08b0a458.md` — *Rediseño total VisionSetil: UX/fotos learning-first + loop ML continuo* (2026-08-05). **Not checked into this repo as a full design duplicate.** |
| **Exec plan DAG** | `C:\Users\Mariano\AppData\Local\Temp\grok-Mariano\grok-exec-plan-bfde5857.json` |
| **This file** | In-repo goal pointer + acceptance checklist only |

Si el design se materializa en-repo más adelante, preferir un único doc bajo `docs/design/` y dejar **este** archivo como entry point (no copiar el cuerpo).

---

## Skills (implementación)

| Skill | Path |
|-------|------|
| Frontend | [`.grok/skills/frontend-visionsetil/SKILL.md`](../.grok/skills/frontend-visionsetil/SKILL.md) |
| Loop ML | [`.grok/skills/loop-ml-visionsetil/SKILL.md`](../.grok/skills/loop-ml-visionsetil/SKILL.md) *(path canónico del design; crear/rellenar si ausente)* |
| Mycology safety | [`.grok/skills/mycology-safety/SKILL.md`](../.grok/skills/mycology-safety/SKILL.md) |

---

## Related goal / loop / launch docs

| Doc | Path | Notas |
|-----|------|--------|
| Redesign goal | [`docs/GOAL_APP_WEB_REDESIGN.md`](GOAL_APP_WEB_REDESIGN.md) | Shell / redesign bar (puede estar pending en tree) |
| Games parity | [`docs/GOAL_APP_WEB_PARITY_GAMES.md`](GOAL_APP_WEB_PARITY_GAMES.md) | App/web games parity |
| Launch readiness | [`docs/LAUNCH_READINESS.md`](LAUNCH_READINESS.md) | Launch honesty; no public identify-as-field-tool sin quality |
| Loop ML full | [`docs/LOOP_ENGINEERING_ML.md`](LOOP_ENGINEERING_ML.md) | Pipeline ML continuo (canónico design) |
| Loop engineering (producto 8w) | [`docs/LOOP_ENGINEERING_2M_PLAN.md`](LOOP_ENGINEERING_2M_PLAN.md) | Plan loop producto (shipped) |
| Safety policy | [`docs/SAFETY_POLICY.md`](SAFETY_POLICY.md) | R1/R7 posture |
| Open-set notes | [`docs/OPEN_SET_CALIBRATION_NOTES.md`](OPEN_SET_CALIBRATION_NOTES.md) | Serve honesty |
| ML experiments index | [`eval/reports/ml_experiments/LOOP_INDEX.md`](../eval/reports/ml_experiments/LOOP_INDEX.md) | Lab index (si existe) |
| E20 metrics SSOT | [`eval/reports/ml_experiments/E20_BASELINE_METRICS_TO_IMPROVE.json`](../eval/reports/ml_experiments/E20_BASELINE_METRICS_TO_IMPROVE.json) | Cite metrics from file only |
| FE audit | [`docs/audits/frontend-ux-perf-audit-2026-07-30.md`](audits/frontend-ux-perf-audit-2026-07-30.md) | Residual UX debt |

---

## PR track table — UX ∥ ML

Tracks corren **en paralelo**. Coordinación solo en: multi-view labels, open-set UI copy, dashboard metrics display.  
**Conflict rule:** un solo owner de `IdentifyPage.tsx` a la vez (UX residual → hierarchy → coach/buttons).

| Track | Plan ID | Title (execute-plan) | Deps (high-level) |
|-------|---------|----------------------|-------------------|
| **UX** | UX-00 / pr-1 | SSOT risk labels poisonous=Venenosa | — |
| **UX** | UX-01 / pr-2 | Identify residual R1–R4 verify-then-fix | — |
| **UX** | UX-07a / pr-3 | Map MAP≠safety + history residual | — |
| **ML** | ML-01 / pr-4 | Operator handoff + anti-leak rails | — |
| **DOC** | DOC-01 / pr-5 | **This pointer** | — |
| **UX** | UX-02 / pr-6 | Result hierarchy + open-set contracts | pr-1, pr-2 |
| **UX** | UX-03 / pr-7 | PhotoCoach multi-view learning | pr-2 |
| **UX** | UX-05 / pr-8 | Games hub continue + honest share | pr-1 |
| **UX** | UX-06 / pr-9 | Lookalike focus slug + ency thumbs | pr-1 |
| **ML** | ML-02 / pr-10 | E20b diagnose Lepiota FT | pr-4 |
| **ML** | ML-03 / pr-11 | E20c pull + post_train + compare | pr-4 |
| **UX** | UX-07b / pr-12 | Education multi-view anchors + Más | — (soft coach) |
| **ML** | ML-07 / pr-13 | Stage notebook if rails OK (no auto push) | pr-4 |
| **UX** | UX-04 / pr-14 | Adopt `ui/Button` Games/Más (+ Identify) | pr-6 |
| **ML** | ML-04 / pr-15 | Open-set serve audit (fresh) | pr-11 (fallback pr-4) |
| **ML** | ML-05 / pr-16 | deadly@1 + lookalike hotspots (fresh) | pr-4 |
| **ML** | ML-06 / pr-17 | ECE dual honesty + lepiota inventory | pr-4 (OR baseline) |
| **UX** | UX-08 / pr-18 | Dual-shell learning-first e2e + a11y | pr-6, pr-7, pr-8 |

DAG resumido (design):

```text
UX-00 ──────────────────► UX-05, UX-06
UX-01 ──► UX-02 ──► UX-04
    │         │
    └► UX-03 ─┴──► UX-08
UX-07a · UX-07b (soft UX-03) · UX-05 ──► UX-08

ML-01 ──► ML-02 ──┐
    │             ├──► ML-05 (OR any ready preds)
    └► ML-03 ──► ML-04 (or E20 fallback)
              └──► ML-06 (OR baseline)
ML-01 + rails (+ optional insights) ──► ML-07

DOC-01 anytime
```

---

## Acceptance checklist (DoD global del design)

Copiado del Definition of Done del design SSOT — tildar al cerrar el programa execute-plan, no al merge de este pointer solo.

- [ ] Nav play-first intacta; tests verdes.
- [ ] PhotoCoach visible sin webp; `assessPhotoClientHints` tests.
- [ ] Result hierarchy contracts + open-set; P0 risk full surfaces.
- [ ] Games continue + honest share; local skill counters or e2e exercisable.
- [ ] UX-01 / history: residual checklist documented (PASS=no code).
- [ ] E20b diagnose JSON always; E20c suite+compare when available.
- [ ] ≥3 **fresh** loop iters (`generated_at` post-plan) with honesty rails — not historical files alone.
- [ ] Cero auto `product_unlock`; cero forage UX.
- [ ] Dual-shell e2e learning path (5173 + 5174).

### Rails smoke (cada PR UX o ML)

- [ ] No new forage / consumption green-light copy.
- [ ] No auto flip of `product_unlock` from metrics.
- [ ] ML artifacts (if any): `product_unlock: false`, dual ECE primary = train-published, metrics labeled `[MEASURED]` from SSOT files.

---

## Non-goals (pointer scope)

- No full design rewrite in this file.
- No product unlock, no forage permission UX.
- No invent metrics / unlocks / green-lights.
- No auto Kaggle push from this doc.

---

*DOC-01 / pr-5 · execute-plan `bfde5857` · 2026-08-05*
