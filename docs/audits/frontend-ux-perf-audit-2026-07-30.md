# Auditoría frontend VisionSetil — UX / Imágenes / Rendimiento

**Fecha:** 2026-07-30  
**Modo:** multi-agente (7 explore + workflow adversarial)  
**Alcance:** `frontend/src` (páginas, componentes, estilos, pipeline de media)

---

## Resumen ejecutivo

La app tiene una base sólida en seguridad micológica (orientation sticky, open-set, multi-vista) y un pipeline de imágenes con cascada real, pero sufre de:

1. **Jerarquía de botones rota** — 4+ dialectos (`btn-atelier`, `mkt-btn`, `cn-btn`, legacy) y múltiples primarios en la misma pantalla.
2. **Imágenes caras y multi-pipeline** — grid a 500px, strip a 1280px, tres sistemas de cascada, sin `srcset`.
3. **Rendimiento de arranque** — rutas primarias eager (incl. Leaflet/mapa), hydrate de fotos antes del primer paint, mapa con weather N-zonas.

---

## P0 — Bloqueadores (arreglar primero)

| ID | Área | Hallazgo | Archivos clave |
|----|------|----------|----------------|
| B1 | UX | Sticky Analizar / Nuevo análisis bajo bottom nav (no tocable) | `campo-nocturno.css`, `atelier.css` |
| B2 | UX | Soft-confirm "Añadir vista" es no-op (`dismissSoftConfirm`) | `IdentifyPage.tsx` |
| B3 | UX | Cámara del wizard no apunta al slot pulsado | `MultiViewWizard.tsx`, `IdentifyPage.tsx` |
| B4 | UX | Cámara multi-paso interna desconectada (fotos se pierden) | `CameraCapture.tsx` |
| B5 | UX | Múltiples primarios en resultado + sticky | `IdentifyPage.tsx`, `ResultCard.tsx` |
| B6 | UX | Copy "orientación only" (EN en ES) | `ResultCard` / locales |
| B7 | Img | Grid encyclopedia `quality: 'display'` (500px) × 12+ | `SpeciesPhotoCard.tsx` |
| B8 | Img | Seasonal strip `quality="hd"` (1280px) | `SeasonalTopStrip.tsx` |
| B9 | Img | History previews `blob:` en localStorage → rotas al recargar | `IdentifyPage` / history |
| B10 | Perf | SpainMap eager en App + weather all zones | `App.tsx`, `SpainMapPage.tsx` |
| B11 | Perf | `await hydrateSpeciesPhotos()` bloquea paint | `main*.tsx` |
| B12 | Perf | `foodQuality` importa mushroomDatabase en Home/Ency | `foodQuality.ts` |
| B13 | Enc | Error de catálogo ignorado; empty mientras loading | `EncyclopediaPage.tsx` |
| B14 | Enc | Filtro risk `poisonous` muerto + "Tóxica" duplicada | `EncyclopediaPage.tsx` |
| B15 | Enc | Botón ángulo dentro de `<Link>` (a11y) | `SpeciesPhotoCard.tsx` |
| B16 | Games | Quiz `priority` en 4 thumbs; Wordle auto-advance daily; LearnGallery reels | Quiz / Wordle / LearnGallery |

---

## P1 — Alto impacto

- Unificar botón SSOT; secondary real; tap targets 44px globales
- Mode toggle Identify (segmented, no primarios)
- CTAs cortos: Identificar, Cómo fotografiar, Confusiones (no Lookalikes EN)
- GPS label corto + helper
- Menos copy wall en capture/result
- `srcset` + quality por superficie (thumb/display/hd)
- Unificar en `SpeciesImage` / un stack
- Gallery probes en paralelo (no secuencial)
- Lazy SpainMap + Identify/Ency preferible
- Memo `SpeciesPhotoCard`; grid quality thumb
- Cámara cap 1280 / JPEG 0.82
- i18n gaps (Camera, Upload, Setadle play, Education body)
- Soft-confirm dialog a11y
- Free mode: botón cámara tras 1ª foto
- Pass `onFocusWizardSlot` desde Identify → ResultCard
- Touch-visible `btn-remove-image`

---

## P2 — Polish

- LayoutModeToggle sin CSS
- Bottom nav labels 0.58rem / Enciclopedia truncada
- Mojibake MultiViewWizard
- Featured duplicado en encyclopedia
- CSS cascade slim (redesign/premium/atelier dead weight)
- PRM unificado
- Skeleton único

---

## Copy cheat-sheet

| Actual | Recomendado |
|--------|-------------|
| Enviar con 1 / Enviar igual | Identificar con 1 foto (menos fiable) / Continuar sin más fotos |
| Analizar (n vistas) | Identificar (n) |
| Identificar multi-vista | Identificar |
| Educación multi-vista | Cómo fotografiar |
| Lookalikes | Confusiones |
| orientación only | solo orientación |
| críticas x/y | vistas clave x/y |
| Abrir (quiz) | Jugar |

---

## Orden de implementación (Fase 2)

1. Sticky CTA clearance + soft-confirm + camera slot (Identify P0)
2. Image quality caps (grid thumb, strip thumb, priority budget)
3. Encyclopedia error/empty/risk filter + PhotoCard a11y/quality
4. App lazy SpainMap; non-blocking photo hydrate
5. Result CTA hierarchy + ES copy pass
6. Games P0 (quiz priority, wordle daily, learn gallery)
7. Design system touch targets + remove-image touch
8. Perf follow-ups (foodQuality, gallery probes, camera downscale)

---

## Fase 2 — Cambios aplicados (2026-07-30)

### Identify / UX
- Sticky analyze/result CTAs elevados por encima del bottom nav (`--cn-sticky-above-nav`)
- Soft-confirm “Añadir” abre cámara del siguiente slot (ya no es no-op)
- Cámara del wizard recibe el slot pulsado (`onOpenCamera(view)`)
- `onFocusWizardSlot` cableado desde Identify → ResultCard
- Mode toggle: segmented + aria-pressed + CSS alineado
- Resultado: un solo primary en sticky; demote Lookalike Studio a ghost
- Copy: Identificar (n), vistas clave, soft-confirm proceed, Confusiones, solo orientación
- Free mode: botón Cámara tras 1ª foto
- GPS label corto + hint
- Remove-image visible en touch (44px)

### Imágenes
- `SpeciesPhotoCard`: quality thumb, maxCandidates 4, sin re-request catalog en terminal
- Ángulo como `<button>` fuera del link (a11y)
- Seasonal strip: thumb + priority solo idx 0
- Featured grid: priority solo 1 card

### Enciclopedia
- Gate error / loading / empty
- Filtro risk SSOT (sin poisonous duplicado)
- CTAs cortos: Identificar / Cómo fotografiar
- priority O(1) por índice

### Rendimiento
- `hydrateSpeciesPhotos` no bloquea FCP (main/main-app/main-web)
- SpainMap lazy-loaded
- Weather mapa: top-10 primero, resto en segunda fase
- Cámara: 1280×720 ideal, JPEG 0.82, downscale long edge

### Games
- Quiz options sin priority
- Wordle daily no auto-avanza; stats no cuentan como Setadle
- LearnGallery: reels grid pausados, intervalo ~3.2s

### Design system
- btn-icon 44×44; bottom-nav label 0.65rem

---

## Iteración 2 — botón a botón / imagen a imagen (2026-07-30)

### Inventario
- 2 agentes explore: inventario CTA por página + inventario raw `<img>`
- Hallazgo clave: **locale ES ganaba a defaults del código** (`analyzeViews: Analizar`, tabs Lookalikes)

### Locales SSOT
- `es`: Identificar (n), Confusiones, Estudio de confusiones, solo orientación, identifyFab corto
- `ca`/`eu`: analyzeViews alineado

### Botones / jerarquía por superficie
- Games hub: **tarjeta completa** clickable
- History: primary + menú **Más** (share/export/clear)
- Education / Community / Offline / Flashcard / App / Detail / Home: **Confusiones** no Lookalikes
- ResultCard expert CTA → **ghost** (primary solo sticky)
- NotFound: sin dual primary
- ProPlanBanner / Setadle: un primary Pro, Identificar ghost
- Map zone: encyclopedia secondary si hay permiso
- UploadZone i18n; Camera CTAs i18n + labels cortos
- Soft-confirm / GPS / retry / FAQ / filter chips touch

### Imágenes
- PhotoFrame hide on error (blob muerto)
- MultiView preview, free grid, lightbox, gallery thumbs, batch compare, community feed
- FeaturedMushroomCard dims/sizes/referrer
- SpeciesGallery thumbs + lightbox referrer + decoding

### CSS
- min-height 44px global en btn-atelier / mkt-btn / cn-btn / faq / camera chrome
- history-more-menu, games-hub-card--link, community-text-link

---

## Iteración 3 completa (2026-07-30)

### History previews (blob death)
- `sanitizeHistoryPreviews` / `persistHistoryPreviews` / `compressPreviewToDataUrl` en `observationHistory.ts`
- Identify convierte blob→JPEG dataURL (≤2, edge 320) antes de guardar
- Load/migrate elimina `blob:` muertos
- Tests: `historyPreview.test.ts` (2 passed)

### SpeciesGallery
- Probes de hero + gallery 01–08 en **paralelo**
- Cascada terminal hasta `INLINE_PLACEHOLDER_SVG` en frame/lightbox/thumbs
- Hero: SpeciesImage quality display

### i18n + Button SSOT
- HabitatSortGame, MetadataForm, ErrorBoundary, Setadle play strings
- SoftConfirm + Login/Register + EmptyState action usan `Button`
- Quiz mode Confusiones; Lookalike suggest «Añadir confusión»
- ca/eu nav.lookalikes localizados

### Images residual
- FeaturedMushroomCard → SpeciesImage cascade
- LookalikeCompare quality thumb + sizes

---

## Agentes

1. UI buttons/CTAs  
2. Images/media  
3. Performance  
4. Identify+Home deep dive  
5. Encyclopedia+Detail  
6. Games/More/Map  
7. Design system/CSS  

Workflow `frontend-ux-perf-audit` (scan → verify → synthesize) en paralelo.
