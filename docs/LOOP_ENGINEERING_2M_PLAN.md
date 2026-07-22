# VisionSetil — Plan Loop Engineering 8 semanas

| Campo | Valor |
|-------|--------|
| **Producto** | VisionSetil (identificación orientativa de setas) |
| **Horizonte** | 2 meses (~8 sprints semanales) |
| **Fecha** | 2026-07-17 |
| **Estado** | Plan de ejecución (listo para subagentes) |
| **Axioma** | Safety-first: orientación nunca permiso de consumo (`RULES.md` R1/R7, `docs/SAFETY_POLICY.md`) |

---

## 1. Objetivo del programa

En 8 semanas, convertir VisionSetil en una app **apetecible a la vista, fácil de usar y técnicamente sólida**, con:

1. **Lavado de cara total** — diseño atelier coherente, sin emoji-chrome, fotografía-first, mobile-first.
2. **Funcionalidades novedosas** que se sientan “producto 2026”, no un CRUD de fotos.
3. **Rendimiento real** — first paint rápido, fotos bajo demanda, menos JS en el camino crítico.
4. **Ciberseguridad reforzada** — defensa en profundidad BE+FE+ops.
5. **Taxonomía humana en España** — nombre común ES + familia (latín + ES) en toda la UI.
6. **Estrategia de fotos inteligente** — no cargar el catálogo entero; priorizar setas conocidas / visibles.

### North-star metrics (DoD del programa)

| Métrica | Hoy (aprox.) | Meta S8 |
|---------|--------------|---------|
| LCP home (4G mid) | sin baseline | ≤ 2.5 s |
| Bundle JS inicial (gzip, sin 3D) | ~90–130 KB chunks | ≤ 100 KB critical path |
| Fotos remotas al abrir enciclopedia | hasta N tarjetas × red | ≤ **12–16** “hero/known” + resto placeholder/lazy |
| Cobertura nombres comunes ES en catálogo | parcial (`commonNamesEs.ts`) | ≥ **95%** taxones con ≥1 nombre ES o “sin nombre local” explícito |
| Familias con `family` + `family_es` | ya parcial | **100%** de taxones con género mapeable |
| Security score (headers + deps + tests) | middleware básico | 0 high CVE, CSP strict, secrets scrub, tests seguridad verdes |
| Safety copy regressions | tests parciales | CI bloquea frases de consumo + UI risk-only |

---

## 2. Principios del Loop Engineering

```
  ┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌────────────┐
  │  ORQUESTA   │────▶│  SUBAGENTES  │────▶│  REVIEWER   │────▶│  MERGE/PR  │
  │  (humano+   │     │  en paralelo │     │  + /check   │     │  stack     │
  │   Grok)     │     │  (worktrees) │     │  -work      │     │            │
  └─────────────┘     └──────────────┘     └─────────────┘     └────────────┘
         ▲                                                          │
         └──────────────── feedback / métricas ◀────────────────────┘
```

### Topología de subagentes (roles fijos)

| Rol | `subagent_type` / modo | Responsabilidad | Capacidad |
|-----|------------------------|-----------------|-----------|
| **Orchestrator** | sesión principal | Prioriza PRs, lanza swarms, resuelve conflictos de diseño | all |
| **Explore** | `explore` | Mapear código, deuda, hotspots perf | read-only |
| **Plan** | `plan` | Specs de feature / ADR cortos | read-only |
| **FE Craft** | `general-purpose` + worktree | UI/UX, tokens, páginas | read-write |
| **Data/Taxonomy** | `general-purpose` | Nombres ES, familias, foto-tiers | read-write |
| **Perf** | `general-purpose` | Lazy load, code-split, image policy | read-write |
| **Sec** | `general-purpose` | Hardening BE/FE, deps, headers, auth | read-write |
| **Reviewer** | skill `/review` o subagente | Diffs, safety copy, a11y | read-only |
| **Verify** | skill `/check-work` | build + tests + smoke | execute |

### Reglas de swarm

1. **Máx. 3 worktrees en paralelo** por semana (evitar thrash de merge).
2. Cada subagente recibe: objetivo, DoD, archivos tocables, anti-patrones safety, y “no inventar permisos de consumo”.
3. **PR pequeño** (1 tema). Stack Graphite o branches `loop/sN-prXX-*`.
4. Tras cada merge: smoke identify + enciclopedia + headers security.
5. Secretos **nunca** en git; solo env / secret manager.

---

## 3. Estado de partida (honest baseline)

| Área | Ya existe | Gap principal |
|------|-----------|---------------|
| UI atelier | Home, header, species cards | Inconsistencia legacy CSS, residual chrome, polish mobile |
| Nombres ES | `commonNamesEs.ts`, `familyNamesEs.ts`, `genusFamilyMap` | Cobertura incompleta; no es “producto” en todos los flujos (resultados, mapa, comunidad) |
| Fotos | `speciesPhotos.json` (~346), `useSpeciesImage`, Wiki/iNat fallback | **Carga agresiva**: muchas tarjetas piden red a la vez; no hay tier “conocidas” |
| Seguridad | CSP/HSTS middleware, API key, rate limit, magic bytes | Auth fina, abuse classify, dependency audit, FE XSS en HTML de mapa, secret scrub |
| Perf | Lazy routes, Suspense 3D | JSON catálogo grande en main path; thrashing de imágenes; falta CDN/srcset |
| Features | Multi-view, 3D spin, mapa, community, expert review | Falta “wow” usable: field notebook, offline pack, compare 3D, season radar, etc. |

---

## 4. Decisiones de producto (Key Decisions)

### KD-1 — Jerarquía de nombres en UI

```
[ Nombre común ES principal ]
  Nombre científico (itálica)
  Familia ES · Familia latina
```

- Nunca solo latín si hay nombre común ES.
- Si no hay nombre local: “Sin nombre común local” (no inventar).
- Risk chip siempre presente; **nunca** badge “comestible OK”.

### KD-2 — Photo tiers (crítico para rendimiento)

| Tier | Criterio | Comportamiento de carga |
|------|----------|-------------------------|
| **T0 Hero** | 12–20 iconos ibéricos + mortales prioritarios | Eager / precache ligero en home + banner |
| **T1 Known** | Top ~80 por popularidad España + deadly/poisonous | Lazy al entrar en viewport (IntersectionObserver) |
| **T2 Rest** | Resto del catálogo | Placeholder SVG instantáneo; **fetch solo al abrir ficha** o al buscar/ favoritos |
| **T3 User** | Fotos del usuario (identify) | Local blob URL; no suben a catálogo sin review |

Implementación: `photoTier` en catálogo + `useSpeciesImage({ tier, eager })` + virtualización de grid.

### KD-3 — Design system “Atelier Forest”

- Tokens en `atelier.css` como fuente de verdad.
- Un solo lenguaje visual: tipografía Instrument Serif + Inter, crema/musgo, cards foto full-bleed.
- Cero emoji en UI de producto (SVG only).
- Microinteracciones con `prefers-reduced-motion`.

### KD-4 — Seguridad por capas

1. Edge/headers (CSP strict-dynamic o nonces si se puede)
2. Auth: scopes (`classify`, `review`, `admin`) sin romper dev
3. Upload: size, mime, magic bytes, virus-scan hook opcional
4. Rate limit por IP + org + endpoint classify más duro
5. Dependabot / `npm audit` + `pip-audit` en CI
6. FE: sanitizar cualquier HTML inyectado (Leaflet popups), no `dangerouslySetInnerHTML` sin DOMPurify

### KD-5 — Features “novedosas pero útiles”

Prioridad a features que **enseñan y protegen**, no gamifican el consumo:

| Feature | Valor |
|---------|--------|
| **Field Notebook** | Observaciones locales con fotos multi-vista + notas + clima zona |
| **Lookalike Studio** | Side-by-side foto + riesgo + 3D de confusiones mortales |
| **Season Radar ES** | Temporada + condiciones Open-Meteo por provincia (educativo) |
| **Offline Pack “España top 50”** | PWA cache de T0+T1 + guías safety |
| **Expert handoff 1-tap** | Desde resultado → cola review con evidencia empaquetada |
| **Voice field notes** (opcional S7–8) | Dictado de hábitat/olor en móvil |

---

## 5. Roadmap por semanas (8 sprints)

### Semana 1 — Foundation & Photo Policy  
**Tema:** dejar de ahogar la red + taxonomía visible.

| Track | Subagentes | Entregables |
|-------|------------|-------------|
| Data | 1× Data/Taxonomy | `photo_tier` T0/T1/T2 en catálogo; lista “España conocidas”; script generate |
| Perf | 1× Perf | `useSpeciesImage` respeta tier; IO viewport; no fetch T2 en grid |
| FE | 1× FE Craft | Enciclopedia: skeleton + virtual list (o page size ↓ + infinite con pause) |
| Explore | 1× Explore | Mapa de deuda CSS/emoji residual y bundles |

**DoD S1:** Abrir enciclopedia dispara ≤16 requests de foto; tarjetas muestran común ES + familia ES/latín.

**PRs:** `PR-01 photo-tiers` → `PR-02 lazy-image-hook` → `PR-03 encyclopedia-perf-names`

---

### Semana 2 — Design system & lavado de cara global  
**Tema:** una sola cara bonita y coherente.

| Track | Subagentes | Entregables |
|-------|------------|-------------|
| FE | 2× FE (worktrees) | Unificar Identify / History / Community / Login al atelier; empty states humanos |
| FE | 1× FE | Componentes: `SpeciesNameBlock`, `RiskChip`, `PhotoFrame`, `EmptyState` |
| Reviewer | 1× | Checklist a11y + contraste dark mode |

**DoD S2:** 0 páginas con estilo “legacy confetti”; navegación clara en móvil; Lighthouse a11y ≥ 90 en home.

**PRs:** `PR-04 design-system-atoms` → `PR-05 page-reskin-batch`

**Estado S2 (2026-07-17):** ✅ Atoms `SpeciesNameBlock` / `RiskChip` / `PhotoFrame` / `EmptyState`; reskin Identify, History, Community, Login, Register.

---

### Semana 3 — Nombres comunes España (cobertura dura)  
**Tema:** que suene a setas de aquí.

| Track | Subagentes | Entregables |
|-------|------------|-------------|
| Data | 1× | Expandir `COMMON_NAMES_ES` (regionales: níscalo, rovellón, oronja, senderuela…) |
| Data | 1× | Completar `FAMILY_NAMES_ES` + géneros huérfanos en `genusFamilyMap` |
| FE | 1× | `SpeciesNameBlock` en ResultCard, mapa, community, history |
| Tests | 1× | Tests cobertura ≥95% + búsqueda por sinónimos ES |

**DoD S3:** Buscar “níscalo”, “oronja”, “matacandil” devuelve taxones correctos; ficha muestra familia ES + latín.

**PRs:** `PR-06 names-es-bulk` → `PR-07 names-in-all-surfaces` → `PR-08 search-synonyms`

**Estado S3 (2026-07-17):** ✅ `commonNamesEsBulk` + búsqueda sin acentos; SpeciesNameBlock en ResultCard, History, Map, ficha; tests `namesEs.test.ts` (cobertura ≥95%, sinónimos).

---

### Semana 4 — Ciberseguridad sprint  
**Tema:** confianza de producción.

| Track | Subagentes | Entregables |
|-------|------------|-------------|
| Sec | 1× BE | Scopes API key, rate limit classify más estricto, CORS allowlist prod |
| Sec | 1× BE | Upload hardening (dimensiones max, strip EXIF opcional, quotas) |
| Sec | 1× FE/ops | CSP review, sanitización popups mapa, scrub secretos, `.env.example` limpio |
| Sec | 1× CI | `pip-audit`, `npm audit --omit=dev`, gitleaks, safety-copy CI |

**DoD S4:** Checklist OWASP top-10 documentado; CI falla en secretos/CVE high; tests seguridad verdes.

**PRs:** `PR-09 api-scopes-ratelimit` → `PR-10 upload-hardening` → `PR-11 security-ci`

**Estado S4 (2026-07-17):** ✅ scopes API (`classify`/`review`/`admin`), rate limit más estricto en `/classify`, dims max en uploads, CSP ampliada, tests S4, CI con pip-audit/npm audit + FE unit tests.

---

### Semana 5 — Rendimiento & PWA  
**Tema:** que vuele en el monte (4G malo).

| Track | Subagentes | Entregables |
|-------|------------|-------------|
| Perf | 1× | Code-split data: catálogo por familia o index ligero + detalle on demand |
| Perf | 1× | Image pipeline: `srcset`/webp preferencia, blurhash o SVG placeholder estable |
| Perf | 1× | Service worker: precache T0 + shell; runtime cache T1 |
| FE | 1× | Offline Pack UI (“Descargar top setas España”) |

**DoD S5:** LCP home ≤ 2.5s mid-mobile; offline abre identify shell + 50 fichas T0/T1.

**PRs:** `PR-12 catalog-split` → `PR-13 image-pipeline` → `PR-14 offline-pack`

**Estado S5 (2026-07-17):** ✅ `offlinePack` T0+T1 + página `/offline` + catalog index helper; PWA ya cachea wiki/iNat; tests offline pack.

---

### Semana 6 — Features novedosas (bloque A)  
**Tema:** producto memorable.

| Feature | Subagente | Scope |
|---------|-----------|-------|
| **Lookalike Studio** | FE | Comparador 2–3 taxones: foto + risk + chars + link ficha |
| **Field Notebook v1** | FE+lib | Historial enriquecido: tags, notas, clima snapshot, export JSON |
| **Season Radar** | FE | Home/mapa: temporada actual + top setas de la estación (educativo) |

**DoD S6:** 3 features usables en móvil; copy safety en cada una; sin promesas de consumo.

**PRs:** `PR-15 lookalike-studio` → `PR-16 field-notebook` → `PR-17 season-radar`

**Estado S6 (2026-07-17):** ✅ Lookalike Studio `/lookalikes`, Cuaderno (notas/tags/export JSON), Season Radar en Home + Mapa.

---

### Semana 7 — Features novedosas (bloque B) + Identify delight  
**Tema:** el flujo core se siente mágico y seguro.

| Feature | Subagente | Scope |
|---------|-----------|-------|
| Identify polish | FE | Progress real, tips de captura con siluetas, result hierarchy redesign |
| Expert handoff | FE+BE | Empaquetar evidencia multi-vista → `human-reviews` en 1 tap |
| Community lite | FE | Posts con risk-aware UI (sin “recetas”) |
| Optional | FE | AR-ish overlay “¿qué vista falta?” en cámara (heurística simple) |

**DoD S7:** Identify time-to-result UX percibida mejor; handoff expert E2E en dev.

**PRs:** `PR-18 identify-delight` → `PR-19 expert-handoff` → `PR-20 community-safety-ui`

**Estado S7 (2026-07-17):** ✅ Expert handoff 1-tap en ResultCard (empaqueta vistas/previews) + cola en `/revision-experta`.

---

### Semana 8 — Hardening, QA, release candidate  
**Tema:** cerrar el loop.

| Track | Subagentes | Entregables |
|-------|------------|-------------|
| Verify | 1× | Suite e2e smoke (Playwright: home, identify mock, enciclopedia, names) |
| Sec | 1× | Pen-test checklist manual + fix residual |
| Perf | 1× | Bundle budget CI; Lighthouse CI baseline |
| Docs | 1× | `MEMORY.md` + ROADMAP update + release notes ES |
| FE | 1× | Polish final: empty states, 404, loading, dark mode parity |

**DoD S8 (programa):**

- [ ] Nombres ES + familias en todas las superficies de especie
- [ ] Photo tiers activos (grid no descarga T2)
- [ ] Security CI + headers + rate limits classify
- [ ] LCP/home y budget de bundle en verde
- [ ] ≥3 features nuevas en menú
- [ ] 0 violaciones safety-copy en CI
- [ ] RC desplegable (Docker + FE)

**PRs:** `PR-21 e2e-smoke` → `PR-22 budgets-ci` → `PR-23 release-rc`

**Estado S8 (parcial 2026-07-17):** ✅ Revisión surface-by-surface (routes/nav + safety-copy tests); FE 90 tests + build; BE security tests verdes. Playwright e2e formal queda opcional (browser skip documentado).

---

## 6. DAG de PRs (resumen)

```text
S1: 01 ─┬─▶ 02 ─▶ 03
S2:      04 ─▶ 05
S3:      06 ─▶ 07 ─▶ 08
S4:      09 ─▶ 10 ─▶ 11
S5:      12 ─▶ 13 ─▶ 14     (12 depende de 01 conceptualmente)
S6:      15 │ 16 │ 17       (paralelos tras 05)
S7:      18 ─▶ 19 │ 20
S8:      21 ─▶ 22 ─▶ 23
```

Tracks **Data**, **Sec** y **FE** pueden ir en paralelo si no tocan los mismos archivos.

---

## 7. Spec corta: nombres comunes + familias

### Modelo de datos (FE + futuro BE)

```ts
type SpeciesDisplay = {
  taxon: string                 // "Lactarius deliciosus"
  common_names_es: string[]     // ["Níscalo", "Rovellón", ...]
  family: string | null         // "Russulaceae"
  family_es: string | null      // "Rúsulas y lactarios"
  risk_label: RiskLabel
  photo_tier: 'T0' | 'T1' | 'T2'
  photo_url?: string | null     // solo si tier permite catalog URL
}
```

### UI component obligatorio

`SpeciesNameBlock` — usado en: card, ficha, prediction, lookalike, mapa popup, notebook.

### Fuentes de nombres (prioridad)

1. Catálogo curado manual ES (este plan S3)
2. Sinónimos regionales (Cataluña, País Vasco, Galicia — etiquetados como “también”)
3. Nunca autotraducir basura del latín genérico

### Tests

- Snapshot de T0 (todas tienen nombre ES)
- Deadly taxa: nombre + risk mortal visible
- Search: “níscalo” → *Lactarius deliciosus* (o grupo)

---

## 8. Spec corta: carga de fotos

### API del hook

```ts
useSpeciesImage(taxon, {
  riskLabel?: string
  tier?: 'T0' | 'T1' | 'T2'   // default from catalog
  eager?: boolean              // solo T0 o above-the-fold
  allowNetwork?: boolean       // false en grid T2
})
```

### Reglas

| Contexto | Política |
|----------|----------|
| Home hero / features | Solo T0 URLs (catalog) |
| Enciclopedia grid | T0+T1 lazy; T2 = placeholder |
| Ficha detalle | Resolver async (wiki/iNat OK) |
| Resultados classify | Thumb de top-3 con network; resto placeholder |
| Offline pack | Precache T0+T1 |

### Anti-patrón a eliminar

Montar 48 `useSpeciesImage` que hacen `fetch` a Wikipedia/iNat en paralelo al filtrar “Todas”.

---

## 9. Spec corta: ciberseguridad (checklist S4)

| Control | Acción |
|---------|--------|
| Secrets | gitleaks + rotar cualquier key histórica |
| Headers | CSP, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy |
| CORS | allowlist prod; no `*` con credentials |
| Auth | API keys con scope; expert mode no público |
| Classify abuse | rate limit más bajo + body size cap |
| Uploads | magic bytes + max dims + max count multi-view |
| Deps | audit semanal en CI |
| FE | no eval; sanitizar HTML; cookies Secure/SameSite si auth cookie |
| Logging | no loguear imágenes ni PII en claro |

---

## 10. Cómo lanzar el loop cada semana (prompt plantilla)

### Lunes — Orchestrator

1. `explore` (quick): ¿qué se rompió desde la semana pasada?
2. Actualizar board: PRs de la semana (esta doc §5).
3. Lanzar hasta 3 subagentes en worktrees:

```
spawn_subagent(
  isolation="worktree",
  description="[FE] Photo tiers grid",
  prompt="Implementa KD-2: ... DoD: ... Archivos: ... Safety: no consumption language."
)
```

### Miércoles — Mid checkpoint

- Merge lo verde; re-stack.
- 1 subagente `review` sobre el stack.
- Ajustar scope (cortar feature, no bajar safety).

### Viernes — Verify & demo

- `/check-work` en main.
- Demo 3 min: identify + enciclopedia (nombres + fotos) + un feature nuevo.
- Actualizar `MEMORY.md` y esta doc (estado PRs).

---

## 11. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Scope creep features “bonitas” | Cap 3 features nuevas (S6–S7); resto backlog |
| Merge hell con 3 worktrees | Owners de paths: data/ vs pages/ vs backend/ |
| Nombres ES incorrectos | Solo fuentes curadas; flag “provisional”; review humano |
| Fotos wiki licencia/calidad | Preferir catalog verificado; atribución en ficha |
| ML pesado distrae el FE | Este plan **no** reentrena modelos; solo consume API |
| Falsa sensación de seguridad por UI bonita | Safety banner obligatorio; risk hierarchy; CI copy |

---

## 12. Backlog explícitamente fuera de estos 2 meses

- Reentrenamiento GPU / FungiCLEF full
- Multi-tenant enterprise / SSO
- App nativa stores
- Marketplace / pagos
- i18n multi-idioma completo (solo ES producto)

---

## 13. PR Plan (lista ejecutable)

| ID | Título | Deps | Semana |
|----|--------|------|--------|
| PR-01 | Photo tiers en catálogo + script generate | — | S1 |
| PR-02 | Hook lazy por tier + IntersectionObserver | PR-01 | S1 |
| PR-03 | Enciclopedia perf + SpeciesNameBlock básico | PR-02 | S1 |
| PR-04 | Design system atoms (PhotoFrame, RiskChip, Empty) | — | S2 |
| PR-05 | Reskin páginas legacy al atelier | PR-04 | S2 |
| PR-06 | Bulk nombres comunes ES España | — | S3 |
| PR-07 | Nombres/familias en result/mapa/historial | PR-06, PR-03 | S3 |
| PR-08 | Search sinónimos regionales | PR-06 | S3 |
| PR-09 | API scopes + rate limit classify | — | S4 |
| PR-10 | Upload hardening | PR-09 | S4 |
| PR-11 | Security CI (audit, gitleaks, safety copy) | — | S4 |
| PR-12 | Catalog split / index ligero | PR-01 | S5 |
| PR-13 | Image pipeline (srcset/webp policy) | PR-02 | S5 |
| PR-14 | Offline pack T0+T1 PWA | PR-13 | S5 |
| PR-15 | Lookalike Studio | PR-05, PR-07 | S6 |
| PR-16 | Field Notebook v1 | PR-05 | S6 |
| PR-17 | Season Radar ES | PR-07 | S6 |
| PR-18 | Identify delight UX | PR-05 | S7 |
| PR-19 | Expert handoff 1-tap | PR-18 | S7 |
| PR-20 | Community safety UI polish | PR-05 | S7 |
| PR-21 | Playwright smoke e2e | PR-18 | S8 |
| PR-22 | Bundle + Lighthouse budgets CI | PR-12 | S8 |
| PR-23 | RC docs + release packaging | PR-21, PR-22 | S8 |

---

## 14. Primer swarm recomendado (esta misma semana)

Para empezar **ya**, sin esperar el mes completo:

1. **Subagente Data** — definir lista T0 (20) + T1 (80) España + flag `photo_tier` en JSON.
2. **Subagente Perf** — `useSpeciesImage` + grid enciclopedia: T2 no network.
3. **Subagente Taxonomy** — rellenar huecos de nombres comunes de las T0/T1 y forzar UI `común + familia ES (latín)`.

Orden de merge: Data → Perf → Taxonomy UI.

---

## 15. Open questions (decidir con el usuario)

1. **¿Prioridad absoluta S1–S2?** A) Solo rendimiento fotos + nombres  B) Lavado visual primero  C) Seguridad primero  
2. **¿Offline pack** debe funcionar 100% sin API classify o solo catálogo educativo?  
3. **¿Atribución de fotos** visible siempre o solo en ficha detalle?  
4. **¿Auth de usuarios** (login actual) es obligatorio para notebook o local-first sin cuenta?

---

*Documento vivo: actualizar al cierre de cada semana con estado de PRs y métricas reales.*
