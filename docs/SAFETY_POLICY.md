# Safety Policy

## Principios

- nunca dar consejos de consumo
- evitar falsos seguros por encima de cualquier otra metrica
- mostrar advertencias repetidas y visibles
- abstencion por defecto cuando falten vistas o contexto
- requerir experto humano para decisiones sensibles
- open-set rejection para abstenerse ante setas no listadas o inciertas

## Reglas de producto

- la API siempre devuelve `orientation_only`
- la API siempre devuelve `unsafe_to_consume`
- la respuesta siempre incluye `No consumas ninguna seta identificada unicamente mediante una app.`
- el clasificador nunca devuelve `safe_to_eat` o similar de consumo seguro
- el frontend nunca usa etiquetas verdes ni lenguaje de seguridad alimentaria
- la API de revisión humana prohíbe taxones y notas que indiquen comestibilidad o digan que es seguro comer (e.g. `safe_to_eat`, `comestible`, `no es venenosa`, `se puede comer`)

## Safety-by-surface (D16 / D-B16)

Product copy and chrome **depend on surface**. Educational culinary context is allowed only where it cannot be read as an Identify permission.

| Superficie | Food / edibility chrome | Colors | Copy rules |
| --- | --- | --- | --- |
| **Identify** (`IdentifyPage`, `ResultCard`, `ResultModeBanner`, share of classify result) | **Forbidden:** `FoodQualityChip`, food-class badges, “excelente comestible”, green edible/success framing | Risk-only: red / amber / slate / violet; **no food-safe green** on result chrome (banners, top-match, confidence, accent) | Orientation only + `unsafe_to_consume`; risk chips via `RiskChip` / `riskLabels` |
| **History / expert handoff of Identify results** | Same as Identify: risk chips only | Same as Identify | Same safety disclaimer semantics |
| **Encyclopedia / Species detail / photo cards** | Food-quality labels **allowed** as educational documentation (`getFoodQuality`, `FoodQualityChip`) with co-located no-consumption disclaimer | D16 tokens: teal/info for high culinary interest — **not** food-safe green for “seguro” | i18n: “interés culinario (referencia educativa)”, never “safe to eat” |
| **Quiz / education games** | Documented food_class for learning only | Neutral / risk-aware | Explicit educational framing; not a field ID result |

### Identify hard rules (audit targets)

1. **No `FoodQualityChip` / `getFoodQuality`** on Identify result UI (all modes: real / mock / blocked).
2. **Risk chips only** on prediction and lookalike rows (`RiskChip` + `toRiskLabel`; edible backend codes collapse to unknown/risky).
3. **No green edibility/success chrome** on `.result-card` (accepted banner, top-match highlight, confidence “high”, decorative accents).
4. Encyclopedia and food-quality registry remain available for non-Identify surfaces; do **not** strip them when fixing Identify.

### Cross-links

| Doc / code | Role |
| --- | --- |
| `docs/MEGA_PLAN_PROFESSIONAL_UPGRADE.md` § D16 | Canonical surface matrix (encyclopedia vs Identify) |
| `docs/PHASE_B_HONEST_IDENTIFY.md` § D-B16, UX results matrix | Phase B honesty modes + ban FoodQualityChip |
| `frontend/src/components/ResultCard.tsx` | Identify result chrome (B-08 ban + B-35 audit) |
| `frontend/src/lib/riskLabels.ts` | Risk-only labels + forbidden phrase list |
| `frontend/src/lib/edibility.ts` | D16 color tokens (educational surfaces) |
| `frontend/src/lib/safetyCopy.test.ts` | FE forbidden consumption-permission phrases |
| `frontend/src/lib/identifyChromeSafety.test.ts` | Source audit: Identify free of food chrome; encyclopedia untouched |
| `backend/app/tests/test_classification_safety.py` | API orientation_only / unsafe_to_consume |

## Metricas orientadas a riesgo

- casos con falsa sensacion de seguridad
- recall sobre especies peligrosas o lookalikes toxicos
- calidad de abstencion y deteccion de evidencia insuficiente
- estabilidad del mensaje de no consumo
