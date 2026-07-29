# Mega-auditoría residual FE/BE — v1.13.0

**Fecha:** 2026-07-29  
**Ámbito:** hallazgos residuales documentados (CA/EU, ErrorBoundary, a11y, mojibake, bundle, DocumentTitle, rate limit, SQLite, Alembic, error shapes)  
**Política:** solo orientación · never product_unlock · never forage  

## Resumen ejecutivo

| Área | Antes | Después (este cycle) | Severidad residual |
|------|-------|----------------------|--------------------|
| CA/EU locales | ~54% keys (592/1097) → fallback ES | **100% keys** (1098) generadas desde ES + mapa CA/EU | Media (calidad lingüística imperfecta) |
| ErrorBoundary | root + 1 wrapper routes | **root + routes + por-ruta** (`withRouteBoundary`) | Baja |
| aria-label ES hardcode | ~15 | **i18n `t('a11y.*')`** en map/edu/camera/batch/footer | Baja (algunos ML/admin residuales) |
| Mojibake UTF-8 | 4 archivos (`├│` etc.) | **ModelInsightsPanel + MultiViewWizard** corregidos | Baja |
| Bundle photos | `speciesPhotos.json` eager ~150KB en main | **dynamic `import()` + hydrate** en boot | Baja |
| DocumentTitle | 9 rutas | **20+ rutas** con longest-prefix | Baja |
| Rate limiter | in-memory sin lock | **`threading.Lock`** + record atómico | Baja |
| SQLite busy | timeout 30s vs PRAGMA 5s | **ambos 30s / 30000ms** | Ninguna |
| Alembic | ausente | **`alembic/` + baseline revision** | Baja (stamp prod) |
| Error shapes | str/dict/list mezclados | **handler canónico** `error/message/status` | Media (call sites legacy str OK) |

**Verdict:** **GO** para merge de residuales técnicos; calidad lingüística CA/EU sigue mejorable por nativos.

---

## FE — detalle ampliado

### F1 · Locales CA/EU incompletos (antes ~46% missing)

- **Evidencia:** ES 1097 keys · CA/EU 592 → ~54% cobertura (≈46% missing).
- **Impacto:** i18next fallback silencioso a ES → UX “medio catalán/euskera”.
- **Fix:** script fill desde ES con mapas léxicos CA/EU → 0 missing keys.
- **Residual:** traducciones automáticas (no nativas). Backlog: review nativo por namespace `nav.*` / `identify.*`.

### F2 · Error boundary único

- **Evidencia:** `main-*.tsx` root + un `ErrorBoundary surface="routes"` en App.
- **Impacto:** un crash en Map o ML blankea todas las rutas hijas juntas; no aísla superficies.
- **Fix:** `withRouteBoundary(surface, element)` en **cada** `<Route>`; variant `inline` vs `page`.
- **Residual:** Header/BottomNav fuera de route boundary (intencional: shell estable).

### F3 · aria-labels hardcodeadas ES

- **Evidencia:** `SpainMapPage`, `EducationPage`, `CameraCapture`, `BatchCompare`, footer, etc.
- **Fix:** `t('a11y.*', { defaultValue })` en superficies product.
- **Residual:** ML dashboard / ExpertReview labels técnicos (EN/ES mix admin).

### F4 · Mojibake

- **Evidencia:** `ModelInsightsPanel.tsx` (`Informaci├│n`, `C├│mo`, `s├¡`, `revisi├│n`); `MultiViewWizard.tsx` (`cr├¡ticas`).
- **Causa:** UTF-8 leído como Latin-1 en un edit previo.
- **Fix:** reescritura UTF-8 correcta.

### F5 · Bundle 1MB / speciesPhotos eager

- **Evidencia:** `import photosDb from '../data/speciesPhotos.json'` en `speciesImageService.ts`.
- **Fix:** `hydrateSpeciesPhotos()` dynamic import; boot en `main-app` / `main-web` / `main`; tests via `setupCatalog`.
- **Residual:** otras chunks (leaflet, encyclopedia) siguen; medir con `vite build --report` en cycle siguiente.

### F6 · DocumentTitle 9/20

- **Evidencia:** solo home/identify/ency/map/edu/wordle/setadle/quiz.
- **Fix:** tabla completa (historial, comunidad, login, registro, offline, lookalikes, juegos, más, ml, beta, ficha slug, 404).

---

## BE — detalle ampliado

### B1 · Rate limiter sin lock

- **Evidencia:** `self._requests` mutado en `dispatch` async sin sincronización.
- **Impacto:** race cerca del límite → under/over count.
- **Fix:** `threading.Lock` + `_memory_check_and_record` atómico.
- **Residual:** Redis path sigue pipeline-based (OK distribuido).

### B2 · SQLite busy_timeout mismatch

- **Evidencia:** `connect_args timeout=30` (s) vs `PRAGMA busy_timeout=5000` (ms).
- **Fix:** `_SQLITE_BUSY_SECONDS = 30` · `_SQLITE_BUSY_MS = 30000` alineados.

### B3 · Sin Alembic

- **Evidencia:** solo `create_all` + ADD COLUMN manual en `database.py`.
- **Fix:** `backend/alembic.ini`, `alembic/env.py`, revision baseline `20260729_0001`.
- **Ops:** `alembic upgrade head` (no-op stamp) antes de nuevas revisiones.

### B4 · Error shapes inconsistentes

- **Evidencia:** `HTTPException(detail="str")` vs dicts vs validation list.
- **Fix:** `app/core/errors.py` + handlers en `main.py` → cuerpo `{ error, message, status, detail? }`.
- **Residual:** call sites pueden seguir pasando `detail=str`; el handler normaliza.

---

## Tests

- FE: photoTiers, mycologyData, regulatedZones, locales key count  
- BE: import app, rate limit suite, health  

## Graph engineering

- STATE → `v1.13.0-residual-audit-fix`  
- BACKLOG residual FE/BE marcados **SHIPPED** o **residual nativo**  
- `graph_evolution.md` entrada v1.13.0  
