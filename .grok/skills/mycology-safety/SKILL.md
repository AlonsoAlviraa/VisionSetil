---
name: mycology-safety
description: >
  Mycology domain rules and safety-first product language for VisionSetil.
  Use when writing copy, classification UX, species encyclopedia, toxicity labels,
  lookalike education, metadata forms, or running /mycology-safety.
---

# Mycology Safety (VisionSetil)

## Axiom

> An incorrect identification can cost a life. Safety beats accuracy when they conflict.

Authoritative policy: `docs/SAFETY_POLICY.md`, `RULES.md` (R1, R7).

## Product language (ES / EN)

| Forbidden | Required |
|-----------|----------|
| safe to eat / segura para comer | orientación / orientation only |
| edible / comestible (as approval) | unsafe to consume / no apta para consumo |
| "you can eat this" | always recommend expert human validation |
| 100% sure species claim | confidence + open-set rejection possible |

When backend returns `edibility` or toxicity labels:

- Treat as **risk classification** for education and safety flags.
- Never rephrase into consumption permission.
- Deadly / poisonous must use highest visual severity.

## Multi-view evidence (canonical)

Prefer guiding users to these views (align with backend `CANONICAL_VIEWS`):

1. **Gills / hymenium** — underside of cap
2. **Cap / front** — top and profile
3. **Stipe / base** — stem and attachment
4. **Habitat** — substrate, trees, soil context

Missing critical views → surface `missing_evidence` and ask follow-ups; prefer abstention over guess.

## Field metadata that matters

Use when designing forms or training multimodal fusion:

- Country / region (biogeography)
- Habitat (forest type, meadow, etc.)
- Substrate (soil, wood, dung…)
- Nearby trees (mycorrhizal associations)
- Smell
- Color change on cut (if collected ethically / legally)
- Season / date (implicit via observation time)

## Taxonomy display

- Prefer **scientific name** primary; common name secondary.
- Show family/genus when species-level is rejected (open-set → genus).
- Lookalikes: always list **dangerous** lookalikes when present.
- Poisonous catalog source: backend `/species/poisonous` + `poisonous_species.json`.

## Open-set & human review

UI must support:

| Backend signal | UX |
|----------------|----|
| `decision: rejected` | Clear "no identification" + reason |
| `open_set_reason` | Explain uncertainty |
| `recommend_human_review` | CTA toward expert review path |
| `safety_level` deadly | Full-screen / sticky critical alert |
| low margin / low confidence | De-emphasize single top hit; show top-k |

## Encyclopedia & education content rules

- Separate **morphology**, **ecology**, **toxicity**, **lookalikes**.
- For deadly taxa (e.g. *Amanita phalloides*, *Galerina marginata*): over-index on warnings.
- Never present foraging recipes or cooking tips.
- Spain map / zones: educational distribution only, not "harvest guides".

## API / model semantics the FE must honor

- `orientation_only` + `unsafe_to_consume` always in product semantics.
- Deadly recall target: **100%** (R7) — prefer false positives over false negatives.
- Mock models are **dev/test only** (R3) — UI should not imply production certainty if `model_stack` is mock.

## Checklist for any mycologically-facing change

- [ ] No consumption-permission language
- [ ] Deadly/poisonous severity correct
- [ ] Multi-view / missing evidence considered
- [ ] Lookalikes shown when relevant
- [ ] Expert validation message present
- [ ] Aligns with `docs/SAFETY_POLICY.md`
---

