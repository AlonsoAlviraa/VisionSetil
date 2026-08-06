# UX-01 Identify residual checklist R1–R5 (verify-then-fix)

**Plan:** UX-01 / pr-2
**Branch:** `execute-plan/bfde5857-pr-2-identify-residual-checklist-verify-then-fix`
**Verified:** 2026-08-05
**Rails:** orientation only · never forage · never auto `product_unlock`

## Summary

| ID | Acceptance | Result | Code change |
|----|------------|--------|-------------|
| **R1** | Sticky Analizar/Identificar not under bottom-nav (clearance ≥ nav + 8px + safe-area) | **FAIL → fixed** | `campo-nocturno.css` |
| **R2** | Soft-confirm functional (`identify-soft-confirm*`); buttons advance; ES without raw “orientación only” | **PASS** | none |
| **R3** | Camera for pressed wizard slot assigns that `CanonicalView` (`cameraTargetSlot` / `onOpenCamera`) | **PASS** | none |
| **R4** | Soft-confirm ES copy exact (audit cheat-sheet) + camera blob → `onAssign(view, file, url)` multi-slot safe | **PASS** | none |
| **R5** | JPEG long-edge ≤1280 in `CameraCapture` | **PASS** (out of scope) | none |

Non-goals (untouched): PhotoCoach, result hierarchy redesign, product_unlock, forage copy.

---

## R1 — Sticky safe-area above bottom nav — **FAIL → fixed**

### Evidence (before)

- `.page-identify .analyze-actions` and `.identify-sticky-cta` are `position: sticky` with `bottom` lifted via `--cn-sticky-above-nav` under `.app--has-bottom-nav` (`campo-nocturno.css`).
- `--cn-bottom-nav-h` was **3.6rem**, but real chrome is ≈ **3.85rem** (`pad-top 0.35 + item min-height 3.1 + pad-bottom 0.4`).
- `--cn-sticky-above-nav` was `nav + safe-area` only — **missing the required +8px gap** from design acceptance (“≥ nav+8px”).

### Fix

```css
--cn-bottom-nav-h: 3.85rem;
--cn-sticky-above-nav: calc(
  var(--cn-bottom-nav-h) + 8px + env(safe-area-inset-bottom, 0px)
);
```

Files: `frontend/src/styles/campo-nocturno.css`

### After

- Sticky submit / result CTA `bottom` clears fixed `.cn-bottom-nav` with ≥ 8px air + device home indicator.
- Page pad `--identify-sticky-cta-pad` still includes sticky bar + nav height so content is not trapped under the bar.

---

## R2 — Soft-confirm UI functional — **PASS**

### Evidence

`frontend/src/pages/IdentifyPage.tsx`:

- `SoftConfirmPanel` with `data-testid="identify-soft-confirm"`, `-add`, `-proceed`.
- `requestClassify` → if `preSubmitCoach.needsSoftConfirm` → `setSoftConfirmOpen(true)` (no silent POST).
- `onAdd={dismissSoftConfirm}` → closes panel, opens camera (next critical empty slot in wizard / free camera).
- `onProceed={confirmClassifySoft}` → closes panel, `handleClassify()`.
- Rendered in both wizard and free paths when `softConfirmOpen && needsSoftConfirm`.

Not a no-op; both actions advance the flow.

---

## R3 — `cameraTargetSlot` assigns to pressed slot — **PASS**

### Evidence

- `MultiViewWizard`: `onClick={() => onOpenCamera(slot.view)}`.
- `IdentifyPage`: `onOpenCamera={(view) => { setCameraTargetSlot(view); setShowCamera(true) }}`.
- Capture handler: `const target = cameraTargetSlot ?? (useWizard ? nextCameraSlot(assignments) : null)` then `onAssignSlot(target, file, previewUrl)`.
- `CameraCapture` receives `slotLabel` from the target slot for simple-mode chrome.

Pressed slot is preferred over next-empty fallback.

---

## R4 — Soft-confirm ES + multi-slot pipeline — **PASS**

### ES copy (locale SSOT)

`frontend/src/locales/es/common.json` → `identify.softConfirm`:

| Key | ES (exact) |
|-----|------------|
| `proceed.single_photo` | `Identificar con 1 foto (menos fiable)` |
| `proceed.missing_critical` | `Continuar sin más fotos` |
| `title.missing_critical` | `Faltan vistas clave` |
| `title.single_photo` | `1 foto es débil` |

No raw English “orientación only” in ES softConfirm block. UI uses `t('identify.softConfirm.*')` so locale wins over coach defaults.

### Pipeline multi-paso

- `onAssignSlot` spreads prior assignments and stores `{ fileName, previewUrl, file }`.
- Subsequent captures fill other slots without clearing existing ones.
- `collectWizardFiles` walks `orderedSlotKeys` and only emits slots with `file`.

---

## R5 — JPEG long-edge ≤1280 — **PASS** (no code)

### Evidence

`frontend/src/components/CameraCapture.tsx`:

- `getUserMedia` ideal `width: 1280`, `height: 720`.
- Capture: `const maxEdge = 1280`; `scale = Math.min(1, maxEdge / Math.max(vw, vh))`.
- `canvas.toBlob(..., 'image/jpeg', 0.82)`.

Out of PR code scope while green (design KD).

---

## Tests

- `frontend/src/lib/competitiveFeatures.test.ts` — new case
  `UX-01 Identify residual R1–R5 (sticky / soft-confirm / slot / ES / JPEG)`
  structural lock on the five residuals (nav height 3.85rem + 8px + safe-area).
- Run: related competitiveFeatures / Identify suite (see PR verification).

---

## Files touched this PR

| File | Why |
|------|-----|
| `frontend/src/styles/campo-nocturno.css` | R1 FAIL fix |
| `frontend/src/lib/competitiveFeatures.test.ts` | residual contract lock |
| `docs/verify/UX01_IDENTIFY_RESIDUAL_R1_R5.md` | checklist evidence (this file) |
