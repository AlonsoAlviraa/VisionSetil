# Frontend Architecture Migration Graph — v1.15

**Mode:** Graph Engineering  
**Target architecture:** Stitch **B Campo nocturno** · dual shell (app/web) · design primitives · media cascade · honesty Phase B  
**Policy:** orientation only · never product_unlock · never forage · **do not restyle Spain map** (B4)  
**Date:** 2026-07-30  

---

## 0. Why this graph

The product already has the **latest architecture** in pieces (dual Vite builds, CN skin, SpeciesImage, Phase B honesty), but surfaces still mix **legacy layers**:

| Layer | Status | Problem |
|-------|--------|---------|
| Dual shell `main-app` / `main-web` | SHIPPED | CSS still loads redesign + premium under CN |
| Campo nocturno tokens | SHIPPED | Competes with atelier / mkt / cn-btn dialects |
| `ui/Button` | Partial | Most CTAs are raw class strings |
| Nav | Fragmented | Header / BottomNav / MoreHub each own lists |
| Media | Partial | SpeciesImage + stacks + raw img |
| i18n | Partial | ES strong; CA/EU incomplete |

**Migration = topological adoption**, not a rewrite.

---

## 1. Target architecture (canonical)

```text
┌─────────────────────────────────────────────────────────────┐
│  Entries: main-app.tsx | main-web.tsx | main.tsx (dev)      │
│  CSS: tokens → atelier(btn) → marketing(mkt) → CN → web?    │
│  (no redesign/premium on product path)                      │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  App shell: Auth · Header · BottomNav · ErrorBoundary       │
│  Nav SSOT: lib/navConfig.ts                                 │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  Primitives: Button · LinkButton · PageShell · Icon ·       │
│              Skeleton · EmptyState · SpeciesImage           │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  Surfaces (routes) — one visual system, honesty shared       │
│  Home · Identify · Ency · Games · Map · Más · …             │
└─────────────────────────────────────────────────────────────┘
```

### Non-negotiables

1. **Skin SSOT:** Campo nocturno wins on color/type/chrome.  
2. **CTA SSOT:** `Button` / `LinkButton` only (variants: primary | secondary | ghost | danger | hero).  
3. **Media SSOT:** species photos only via `SpeciesImage` / `SpeciesPhotoCard` / `SpeciesThumb`.  
4. **Nav SSOT:** one module; Header primary ≠ Más overflow.  
5. **Honesty:** Phase B Identify contracts unchanged.  
6. **Map:** functional map stays (chrome only).  

---

## 2. Migration DAG (PR nodes)

```text
                    ┌──────────┐
                    │  M0 DOC  │  this file + STATE
                    └────┬─────┘
                         │
           ┌─────────────┼─────────────┐
           ▼             ▼             ▼
      ┌────────┐   ┌──────────┐  ┌──────────┐
      │ M1 NAV │   │ M2 PRIM  │  │ M3 CSS   │
      │ config │   │ Button/  │  │ entry    │
      │        │   │ LinkBtn  │  │ slim     │
      └───┬────┘   └────┬─────┘  └────┬─────┘
          │             │             │
          └──────┬──────┴──────┬──────┘
                 ▼             ▼
            ┌────────┐   ┌──────────┐
            │ M4 MED │   │ M5 PAGES │
            │ Species│   │ wave by  │
            │ Image  │   │ route    │
            └───┬────┘   └────┬─────┘
                │             │
                └──────┬──────┘
                       ▼
                 ┌──────────┐
                 │ M6 I18N  │  CA/EU parity residual
                 └────┬─────┘
                      ▼
                 ┌──────────┐
                 │ M7 PERF  │  foodQuality slim, virtualize
                 └────┬─────┘
                      ▼
                 ┌──────────┐
                 │ M8 DONE  │  lint ban raw btn-atelier in pages
                 └──────────┘
```

| ID | Title | Depends | Deliverable | Status |
|----|-------|---------|-------------|--------|
| **M0** | Canon doc + STATE v1.15 | — | This graph, BACKLOG, evolution | **THIS CYCLE** |
| **M1** | Nav config SSOT | M0 | `lib/navConfig.ts` → Header, BottomNav, MoreHub | **THIS CYCLE** |
| **M2** | LinkButton + PageShell | M0 | `ui/LinkButton`, `PageShell` | **THIS CYCLE** |
| **M3** | CSS entry slim | M0 | Drop redesign+premium from app/web entries | **THIS CYCLE** |
| **M4** | Media SSOT | M2 | No raw species img; Featured=SpeciesImage | **DONE / harden** |
| **M5a** | Migrate Home + Más + Ency chrome | M1,M2 | LinkButton CTAs | **THIS CYCLE** |
| **M5b** | Migrate Identify actions | M2 | Button on analyze/sticky/soft | **partial → finish** |
| **M5c** | Migrate Games / Offline / Auth | M2 | LinkButton | next cycle if time |
| **M6** | i18n CA/EU parity | M5* | key fill + tests | **SHIPPED v1.16** |
| **M7** | Perf graph | M4,M5 | foodQuality index (virtual list → N2) | **SHIPPED v1.16** |
| **M8** | Guardrails | M5 | architectureCtaContracts.test.ts | **SHIPPED v1.16** |

### Next cycle DAG (`v1.17`)

```text
N1 CTA allowlist shrink ──┐
N2 Ency virtualize ───────┼── N4 DocumentTitle ── (done)
N3 Ficha attribution ─────┘
N5 Operator deploy (human, parallel)
```

---

## 3. Page migration waves (M5 detail)

| Wave | Routes | Pattern |
|------|--------|---------|
| **W1** | `/`, `/mas`, `/enciclopedia` | PageShell + LinkButton primary CTAs |
| **W2** | `/identificar` | Button analyze/cancel/soft; sticky LinkButton experts |
| **W3** | `/juegos`, `/setadle`, `/wordle`, `/reto` | cn/mkt → LinkButton; keep game chrome |
| **W4** | `/historial`, `/offline`, `/comunidad` | overflow menus already; LinkButton |
| **W5** | `/lookalikes`, `/educacion`, detail | Confusiones naming + LinkButton |
| **W6** | `/mapa` | **chrome only** — no map UX rewrite |
| **W7** | auth, beta, 404, expert, ml | Block Button submit |

---

## 4. CSS target cascade

### App (`main-app.tsx`)

```text
global → tokens → atelier (btn/card) → marketing (mkt-*) → campo-nocturno
```

**Removed:** `redesign.css`, `premium.css` (override wars; CN owns product).  
**Optional later:** tree-shake unused `animations.css` blocks.

### Web (`main-web.tsx`)

Same + `campo-nocturno-web.css`.

---

## 5. Definition of Done (architecture migrated)

- [ ] Single `navConfig` drives Header primary, BottomNav, Más hub groups  
- [ ] No `redesign.css` / `premium.css` on product entries  
- [ ] Core CTAs on Home/Más/Ency/Identify use Button or LinkButton  
- [ ] Species photos never raw `<img>` with remote catalog URL (except user blobs)  
- [ ] `tsc` + targeted vitest green  
- [ ] `product_unlock` still false  

---

## 6. Key decisions

| Decision | Rationale |
|----------|-----------|
| **CN over atelier color** | Stitch B is product skin; atelier remains for component structure |
| **Keep mkt-btn aliases under CN** | Soft-land pages; LinkButton emits both `btn-atelier` + optional `cn-btn` |
| **Map not in BottomNav primary** | 5-tab model; map under Más / Header desktop |
| **No full Tailwind rewrite** | Tokens + CN already ship; migration cost ≠ value |
| **Dual build preserved** | App store vs browser packaging |

---

## 7. Open questions (resolved by defaults)

| Q | Default |
|---|---------|
| Kill `mkt-btn` class entirely? | **No** this cycle — LinkButton can emit mkt for games |
| Drop atelier.css? | **No** — still btn geometry source |
| Move Mapa out of Header primary? | **Keep** desktop discoverability |

---

*Graph Engineering · VisionSetil · 2026-07-30*
