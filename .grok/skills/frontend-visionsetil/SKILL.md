---
name: frontend-visionsetil
description: >
  Frontend engineering for VisionSetil (React 18 + Vite + TypeScript PWA).
  Use when redesigning UI, building pages/components, integrating the classify API,
  improving accessibility, PWA offline, multi-view capture, or running /frontend-visionsetil.
---

# Frontend VisionSetil

## Stack (current)

- React 18, TypeScript, Vite 5, react-router-dom 7
- axios, react-dropzone, framer-motion, leaflet/react-leaflet
- vite-plugin-pwa, vitest
- Styles: CSS design tokens in `frontend/src/styles/` (no Tailwind yet)

## Source map

| Area | Path |
|------|------|
| Routes | `frontend/src/App.tsx` |
| Identify flow | `frontend/src/pages/IdentifyPage.tsx` |
| API client | `frontend/src/api/client.ts`, `types.ts` |
| Components | `frontend/src/components/*` |
| Static species data | `frontend/src/data/*` |
| Env | `VITE_API_URL`, `VITE_API_KEY` |

## Non-negotiable UX (safety-first)

1. **Never** show "safe to eat" / "comestible" / consumption green-lights.
2. Every result screen must show: orientation-only, unsafe-to-consume, deadly warnings.
3. Prefer multi-view capture (gills, front/cap, habitat, detail) over single photo.
4. Open-set rejection is a first-class UI state (`decision: rejected`), not an error.
5. Footer/disclaimer always visible on identify + result flows.
6. Spanish is the primary product language.

## Design system rules

- Use CSS variables from `global.css` (`--primary`, `--danger`, `--deadly`, `--warning`).
- Deadly species: `--deadly` / high-contrast alert, not playful animation.
- Prefer progressive disclosure: guide → capture → metadata → result → education.
- Mobile-first; camera flow must work on phone browsers.
- Prefer design tokens over hardcoded hex in new components.
- Respect `prefers-reduced-motion` for particle/3D effects.

## API integration patterns

```ts
// Preferred classify entry
POST /classify  // multipart: images + optional metadata
// Response: ClassificationResult (see frontend/src/api/types.ts)

// Async (when jobs ready)
POST /classify/async → poll GET /jobs/{id} → GET /jobs/{id}/result

// Feedback loop
POST /feedback { request_id, is_correct, corrected_species? }
```

- Map backend `edibility` carefully: display as **risk / toxicity orientation**, never as "edible OK".
- Surface `missing_evidence`, `dangerous_lookalikes`, `questions_for_user`, `recommend_human_review`.
- Handle timeouts (≥60s) and partial pipeline degradation (`model_stack`).

## Quality bar for any FE PR

- [ ] TypeScript clean (`npm run build`)
- [ ] Safety copy present on result + identify
- [ ] Multi-view guidance if upload UX changes
- [ ] No new third-party trackers without review
- [ ] Keyboard + screen-reader labels on primary actions
- [ ] Offline/PWA: fail gracefully when API unreachable

## Preferred redesign directions

When redesigning the app, prefer:

1. Wizard multi-view (not free-form 10-file dump)
2. Result hierarchy: safety → decision/rejection → top-3 → evidence → lookalikes → education
3. Encyclopedia fed by backend catalog eventually (static data is interim)
4. Human-review queue UI for experts (uses `/human-reviews*`)
5. Thin API layer: typed client, no business logic in components
6. Optional design system migration only if justified (CSS tokens first; Tailwind only if full redesign)

## Anti-patterns

- Celebratory confetti on high confidence (false safety)
- Green "edible" badges
- Hiding rejection reasons
- Calling external mushroom.id without product decision
- Storing secrets in client beyond optional public API key for rate limits
---

