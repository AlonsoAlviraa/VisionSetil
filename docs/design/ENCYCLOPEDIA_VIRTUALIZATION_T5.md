# Design: Encyclopedia list virtualization / windowing (T5 / BACKLOG Y2)

| Field | Value |
|--------|--------|
| **Ticket** | T5 / PERF-3 (mega-audit residual) / BACKLOG Y2 |
| **Surface** | `/enciclopedia` — `EncyclopediaPage` grid only |
| **Product posture** | Orientation-only field guide; `product_unlock=false`; never forage/consume language |
| **FE stack** | React 18 + Vite dual-build (`app` + `web`); **no** `react-window` / `react-virtuoso` today |
| **Catalog scale** | ~523 taxa (SSOT snapshot); empty-query browse walks full filtered list |
| **Primary paths** | `frontend/src/pages/EncyclopediaPage.tsx`, `frontend/src/data/photoTiers.ts`, `frontend/src/components/SpeciesPhotoCard.tsx`, new helpers under `frontend/src/lib/` + `frontend/src/hooks/` |
| **Depends on** | T1/T6 media surface policy already shipped (`encyclopedia_grid`: thumb, preferLocal, maxCandidates≤3) |
| **PR shape** | Prefer **single PR** (see § PR Plan) |
| **Review** | Addresses design-review F1–F14 (majors F1–F4 locked as KD15–KD19) |

---

## 1. Problem

Browsing the encyclopedia with infinite “load more” **appends** full `SpeciesPhotoCard` trees:

```ts
// EncyclopediaPage.tsx (current)
const results = allResults.slice(0, (page + 1) * PAGE_SIZE)
// … then results.map → <SpeciesPhotoCard /> for every disclosed row
// IntersectionObserver rootMargin 320px → setPage(p => p + 1)
```

Facts that make this a real perf bug, not micro-optimization:

1. **DOM grows with scroll.** Unfiltered browse can mount O(n) cards and `<img>` nodes up to ~523 taxa. Each card builds a media stack, risk/food chips, dual `Link`s, and image error cascade.
2. **Data is already in memory.** `allResults` is a full filtered catalog array (popularity-sorted empty browse, or ranked search). `page` / `slice` only gate **React mount cost**, not network catalog fetch.
3. **Media is already tiered correctly for grid.** T1/T6 ship `MEDIA_SURFACE_POLICY.encyclopedia_grid` (thumb, preferLocal, maxCandidates≤3). Windowing is the remaining DOM/memory lever; do not re-litigate media policy here.
4. **CSS `content-visibility` is not a substitute.** Cards intentionally do **not** use `content-visibility` (black frames with opacity loading). Family sections still use `content-visibility: auto` + `contain-intrinsic-size` — residual jank risk with opacity fades (PERF-6 / T10 adjacent). Skipping paint ≠ unmounting React or releasing image decode memory.
5. **Grid is multi-column and breakpoint-driven** (2 cols mobile → 3/5/6 desktop in `campo-nocturno.css`). Any solution must tolerate column count changes without hard-coding a single FixedSizeGrid.
6. **Group-by-family is not a contiguous reorder of popularity order.** Today `resultsByFamily` buckets the **visible slice** with Map insertion = first-seen family in that slice; empty browse `allResults` is popularity-sorted, so the same family is **not** contiguous in raw `allResults`. Window indices must use an explicit **family-flattened source** when grouped (see §4.6 / KD15).

Mega-audit acceptance (PERF-3 / T5): after scrolling ~100+ taxa, mounted `.species-photo-card` count stays ≤ ~2 viewports (e.g. ≤36–48); first paint still honors `ENCYCLOPEDIA_FIRST_PAGE_SIZE = 12` for LCP; family headers / keyboard / Link to ficha preserved; orientation sticky unchanged.

---

## 2. Goals / Non-goals

### Goals

| ID | Goal |
|----|------|
| G1 | Bound **mounted** card DOM while browsing full catalog and all filter combinations (risk / food / family / trait / genus / query), **including group-by-family**. |
| G2 | Preserve **first-paint LCP** semantics for the first **12** cards (`ENCYCLOPEDIA_FIRST_PAGE_SIZE`). Priority uses **global** `sourceIndex < 4` on `windowSource` (not per family section); featured hero unchanged. |
| G3 | Preserve **group-by-family** UX: family-contiguous order (first-seen buckets), section headers with **full-family** counts, cards navigable. |
| G4 | Preserve **a11y**: keyboard focus in the visible window; `Link` to `/enciclopedia/:slug`; load-more button **before bottom spacer**, keyboard-reachable without IO-only traps. |
| G5 | Prefer **no new npm dependency**. Justify any library with concrete failure of the zero-dep approach. |
| G6 | Export a **unit-testable window size constant**; pure pad math (flat + family chrome); optional e2e note. |
| G7 | Single-PR delivery if feasible; max 2 PRs. No `product_unlock`, no forage/consume copy changes. |

### Non-goals

| ID | Non-goal |
|----|----------|
| NG1 | Virtualizing other surfaces (Home featured, Games hub, marketing reels, FamilyGuideStrip). |
| NG2 | Changing catalog SSOT, search ranking, Index Fungorum hints, or filter **semantics** (risk/food/etc.). Presentation order when grouped **does** switch to family-flattened (same as today’s visual grouping intent). |
| NG3 | Masonry / variable-height photo layout; cards stay CSS grid with **estimated min** card row height (image load may drift slightly; see §4.9). |
| NG4 | Fixing PERF-6 / T10 content-visibility vs opacity globally (only touch if required for window spacers; default: leave card opacity rules alone). |
| NG5 | Lazy-loading catalog JSON; catalog hydrate is already separate. |
| NG6 | Adding react-window/virtuoso “because industry default” without measuring zero-dep failure. |
| NG7 | Backend pagination of `/species`; FE already holds filtered rows for ~523 taxa. |
| NG8 | Any language or UI that implies foraging, edibility permission, or product unlock. |
| NG9 | Focus restoration maps when a focused card unmounts; sticky family headers while virtualizing. |

---

## 3. Current state

### 3.1 List pipeline

```
useSpeciesCatalog()
  → allResults (useMemo: empty browse | ranked search + filters)
  → results = allResults.slice(0, (page+1)*PAGE_SIZE)
  → optional resultsByFamily (Map buckets when groupByFamily; first-seen in visible slice)
  → render SpeciesPhotoCard × results.length
  → IO sentinel + Button "Cargar más" advances page
```

- `PAGE_SIZE = ENCYCLOPEDIA_FIRST_PAGE_SIZE` (= **12**) from `photoTiers.ts`.
- Filter changes reset `page` to 0; only **some** handlers call `scrollToResults()`.
- Featured hero is **outside** the grid (`ency-featured-flat`); outside the window budget.
- Empty query uses `buildEmptyEncyclopediaBrowseList` (full filtered catalog, **popularity sort**). Non-empty query uses `limit: 200` in `searchCatalogRanked`.

### 3.2 Card / media

- `SpeciesPhotoCard` default `surface='encyclopedia_grid'` → thumb, preferLocal, maxCandidates≤3.
- `priority` upgrades quality toward `display` for LCP rows.
- Links: media frame + body → `/enciclopedia/${slug}`.
- `data-testid="species-photo-card"` on each card (useful for mount counts).

### 3.3 Layout CSS (relevant)

- `.page-encyclopedia--cn .species-photo-grid`: 2 / 3 / 5 / 6 columns by breakpoint (app).
- Web (`campo-nocturno-web.css`): `auto-fill, minmax(12rem, 1fr)` — measurement still wins after paint; cold-start uses `estimateColumns` (KD19).
- `.ency-family-section`: `content-visibility: auto; contain-intrinsic-size: auto 400px`; section title + margins add chrome height beyond cards.
- Cards: **no** content-visibility (comment in `campo-nocturno.css` documents black-frame bug).

### 3.4 Dependencies

`frontend/package.json` has no list virtualization library. Dual-build means any new dep hits both bundles.

### 3.5 Tests already green around this surface

- Unit: `photoTiers.test.ts` locks `ENCYCLOPEDIA_FIRST_PAGE_SIZE ≤ 16`.
- E2E: `encyclopedia-count.spec.ts`, `encyclopedia-family-detail.spec.ts`, `loop-3h-smoke.spec.ts`, `media-smoke.spec.ts`, `loop-next.spec.ts`.
- No e2e asserts on progressive `encyclopedia.showingN` / “mostrando” fragment (safe to drop that copy).

---

## 4. Proposed design

### 4.1 Decision summary (recommended)

| Choice | Decision |
|--------|----------|
| Approach | **Zero-dep sliding window** + measured/estimated spacers |
| Window source (`windowSource`) | Flat: `allResults`. Grouped: `flatten(bucketByFamily(allResults))` first-seen Map order (**KD15**) |
| Progressive `page` slice | **Retire as DOM gate**; indices always into `windowSource` |
| Initial mount | ≤ **12** cards until metrics; then viewport + overscan ≤ **48** |
| Family pads | Pure height model: card rows + **section chrome** per unmounted run (**KD16**) |
| `resetKey` | Scroll results into view **then** recompute — never force `startIndex=0` at deep `scrollY` (**KD18**) |
| Load-more | `scrollBy(0, 0.9 * viewportH)`; DOM order: after last mounted card/section, **before** bottom spacer (**KD17**); **no** IO `page++` |
| Sentinel | **Omit** (scroll + button only) — F5 default |
| Cold-start columns | `estimateColumns(width)` then RO override (**KD19**) |
| Library | **Do not add** react-window / react-virtuoso in v1 |
| Media / unlock | Unchanged |

### 4.2 Why not “content-visibility only”

| Mechanism | Unmounts React? | Releases img decode? | Stable with opacity fade? | Meets T5 mounted-count AC? |
|-----------|-----------------|----------------------|---------------------------|----------------------------|
| `content-visibility: auto` on cards | No | Partial / unreliable | **No** (known black frames) | **No** |
| `content-visibility` on family sections only | No | Partial | Risk residual | **No** |
| Sliding window unmount | **Yes** | **Yes** | Yes | **Yes** |
| react-virtuoso Grid | Yes | Yes | Yes | Yes (cost: dep × dual-build) |

### 4.3 Constants (testable)

`ENCYCLOPEDIA_FIRST_PAGE_SIZE` stays in `photoTiers.ts` (existing imports). Window knobs + pure math live in `frontend/src/lib/encyclopediaWindow.ts` (OQ3).

```ts
// photoTiers.ts (existing)
export const ENCYCLOPEDIA_FIRST_PAGE_SIZE = 12

// encyclopediaWindow.ts (new)
import { ENCYCLOPEDIA_FIRST_PAGE_SIZE } from '../data/photoTiers'

/** Hard cap on simultaneously mounted SpeciesPhotoCard nodes (grid only; featured outside). */
export const ENCYCLOPEDIA_DOM_WINDOW_SIZE = 48

/** Extra rows above/below the viewport when computing the index window (flat mode). */
export const ENCYCLOPEDIA_WINDOW_OVERSCAN_ROWS = 2

/**
 * Fallback card **row** height (px) before first ResizeObserver sample.
 * Must be ≥ real min card height to avoid under-estimated spacers (overlap/jump).
 */
export const ENCYCLOPEDIA_CARD_ROW_ESTIMATE_PX = 280

/**
 * Family section chrome above a run of cards: h3 block + section margin-bottom + gaps.
 * Used only when groupByFamily; unit-tested in pad math.
 * Calibrate against .ency-family-section / __title in campo-nocturno (~title + 1.5rem margin).
 */
export const ENCYCLOPEDIA_FAMILY_SECTION_CHROME_PX = 56

// re-export FIRST for co-location in tests
export { ENCYCLOPEDIA_FIRST_PAGE_SIZE }
```

Unit tests:

- `FIRST_PAGE_SIZE` in (0, 16]; `DOM_WINDOW_SIZE` in `[FIRST, 64]`; overscan ≥ 0; chrome ≥ 0.
- Flat `computeIndexWindow` cases (top / mid / end / cap).
- Family: `bucketByFamily` order + `computeFamilyListGeometry` / pad cases (see §4.6).
- Cap: `windowSize` not divisible by `cols` → `endIndex - startIndex <= windowSize`, pads ≥ 0 (F7).

### 4.4 Pure window math — flat mode

```ts
// frontend/src/lib/encyclopediaWindow.ts

export type WindowMetrics = {
  scrollY: number
  viewportH: number
  /** listRef top in document coords: getBoundingClientRect().top + scrollY */
  listTopDoc: number
  columns: number
  rowHeight: number
  itemCount: number
  windowSize: number
  overscanRows: number
}

export type IndexWindow = {
  startIndex: number
  endIndex: number // exclusive
  startRow: number
  endRow: number
  topPadPx: number
  bottomPadPx: number
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

export function computeIndexWindow(m: WindowMetrics): IndexWindow {
  const cols = Math.max(1, m.columns | 0)
  const rowH = Math.max(1, m.rowHeight)
  const totalRows = Math.ceil(m.itemCount / cols) || 0

  const yInList = m.scrollY - m.listTopDoc
  const firstVisibleRow = clamp(
    Math.floor(yInList / rowH),
    0,
    Math.max(0, totalRows - 1),
  )
  const visibleRows = Math.ceil(m.viewportH / rowH) + 1

  let startRow = Math.max(0, firstVisibleRow - m.overscanRows)
  let endRow = Math.min(totalRows, firstVisibleRow + visibleRows + m.overscanRows)

  let startIndex = startRow * cols
  let endIndex = Math.min(m.itemCount, endRow * cols)

  // Hard cap mounted cards (shrink around viewport center if overscan too greedy)
  if (endIndex - startIndex > m.windowSize) {
    const center = startIndex + Math.floor((endIndex - startIndex) / 2)
    startIndex = clamp(
      center - Math.floor(m.windowSize / 2),
      0,
      Math.max(0, m.itemCount - m.windowSize),
    )
    endIndex = Math.min(m.itemCount, startIndex + m.windowSize)
    // Row-align for multi-col grid
    startIndex = Math.floor(startIndex / cols) * cols
    endIndex = Math.min(m.itemCount, Math.ceil(endIndex / cols) * cols)
    if (endIndex - startIndex > m.windowSize) {
      endIndex = Math.min(m.itemCount, startIndex + m.windowSize)
    }
  }

  // F7: single epilogue after all clamps — pads always consistent with final indices
  startRow = Math.floor(startIndex / cols)
  endRow = Math.ceil(endIndex / cols)
  const topPadPx = startRow * rowH
  const bottomPadPx = Math.max(0, (totalRows - endRow) * rowH)

  return { startIndex, endIndex, startRow, endRow, topPadPx, bottomPadPx }
}
```

**Initial paint path (LCP):** before scroll metrics are trusted:

```ts
{
  startIndex: 0,
  endIndex: Math.min(ENCYCLOPEDIA_FIRST_PAGE_SIZE, itemCount),
  topPadPx: 0,
  bottomPadPx: estimateBottomPadForInitial(itemCount, columns, rowH),
}
// columns from estimateColumns(window.innerWidth) on first commit (KD19)
// After rAF + RO: full computeIndexWindow; still end-start ≤ DOM_WINDOW_SIZE
```

Do **not** mount 48 cards on first commit.

### 4.5 `windowSource` construction (parent owns list)

```ts
// Pure helpers in encyclopediaWindow.ts

export type CatalogLike = {
  slug: string
  family?: string
  family_es?: string
  // … CatalogSpecies fields as needed
}

/** Family label used for section chrome (matches EncyclopediaPage today). */
export function familyLabelOf(s: CatalogLike, noFamilyLabel: string): string {
  const latin = (s.family || '').trim()
  return s.family_es || (latin ? latin : noFamilyLabel)
}

/**
 * KD15 / F1: Map insertion order = first appearance in `items` (same as today's
 * resultsByFamily on a full list). Flattens to family-contiguous windowSource.
 * Never window raw popularity order when groupByFamily is on.
 */
export function bucketByFamilyThenFlatten<T extends CatalogLike>(
  items: T[],
  noFamilyLabel: string,
): { windowSource: T[]; runs: FamilyRun[] } {
  const buckets = new Map<string, T[]>()
  for (const s of items) {
    const key = familyLabelOf(s, noFamilyLabel)
    const arr = buckets.get(key) ?? []
    arr.push(s)
    buckets.set(key, arr)
  }
  const runs: FamilyRun[] = []
  const windowSource: T[] = []
  for (const [label, arr] of buckets) {
    const start = windowSource.length
    windowSource.push(...arr)
    runs.push({ familyLabel: label, start, end: windowSource.length, count: arr.length })
  }
  return { windowSource, runs }
}

export type FamilyRun = {
  familyLabel: string
  start: number // inclusive index into windowSource
  end: number   // exclusive
  count: number // full family size (= end - start)
}
```

**Parent (`EncyclopediaPage`):**

```ts
const noFamily = t('encyclopedia.noFamily', { defaultValue: 'Sin familia' })

const { windowSource, runs } = useMemo(() => {
  if (!groupByFamily) {
    return {
      windowSource: allResults,
      runs: [] as FamilyRun[],
    }
  }
  return bucketByFamilyThenFlatten(allResults, noFamily)
}, [allResults, groupByFamily, noFamily])

const resetKey = [
  debouncedQuery, risk, food, family, trait, genus,
  groupByFamily ? '1' : '0',
  // catalog identity if needed
].join('|')
```

Window indices **always** refer to `windowSource`, never to a parallel raw popularity index when grouped.

### 4.6 Family mode — height model (F2 / KD16)

Family markup (CSS parity with v1.11):

```
outer list (listRef, data-testid="ency-species-list")
  [top spacer]
  section.ency-family-section
    h3 (full family count)
    div.species-photo-grid
      cards in intersection(run, [startIndex, endIndex))
  …
  [load-more row]          ← BEFORE bottom spacer (KD17)
  [bottom spacer]
```

**Ambiguity resolved:**

| Ref | Target |
|-----|--------|
| `listRef` | **Outer** list container (spacers + sections + load-more) |
| Column sample | **First mounted** inner `.species-photo-grid` (or first card row tops) |
| Card `rowHeight` | First mounted `[data-testid=species-photo-card]` |
| Pad math | Pure function of runs + cols + rowH + chrome — **not** flat `startRow * rowH` alone |

#### 4.6.1 Geometry: prefix heights (unit-tested)

Treat the list as a sequence of **runs**. Each run contributes:

```
runHeight(run) =
  FAMILY_SECTION_CHROME_PX
  + ceil(run.count / columns) * rowHeight
```

```ts
export type FamilyGeometry = {
  /** Document offset of each index relative to list top (card top within its run). */
  offsetOfIndex: number[] // length itemCount
  /** Total scroll height of full list (all runs). */
  totalHeight: number
  runs: FamilyRun[]
}

/**
 * Build cumulative geometry for family-contiguous windowSource.
 * offsets[i] = Y of card i's row within the list (approx: top of that card's row).
 */
export function computeFamilyListGeometry(
  runs: FamilyRun[],
  itemCount: number,
  columns: number,
  rowHeight: number,
  sectionChromePx: number,
): FamilyGeometry {
  const cols = Math.max(1, columns)
  const rowH = Math.max(1, rowHeight)
  const chrome = Math.max(0, sectionChromePx)
  const offsetOfIndex = new Array<number>(itemCount)
  let y = 0

  for (const run of runs) {
    const runStartY = y
    y += chrome // header + section margin before cards
    const n = run.end - run.start
    for (let i = 0; i < n; i++) {
      const rowInRun = Math.floor(i / cols)
      offsetOfIndex[run.start + i] = y + rowInRun * rowH
    }
    const rows = Math.ceil(n / cols) || 0
    y += rows * rowH
    void runStartY
  }

  return { offsetOfIndex, totalHeight: y, runs }
}

/**
 * Given scroll metrics + geometry, pick [startIndex, endIndex) capped by windowSize,
 * and top/bottom pads that preserve totalHeight.
 */
export function computeFamilyIndexWindow(args: {
  scrollY: number
  viewportH: number
  listTopDoc: number
  geometry: FamilyGeometry
  itemCount: number
  windowSize: number
  /** overscan in px (e.g. overscanRows * rowHeight) */
  overscanPx: number
}): IndexWindow {
  const { geometry, itemCount, windowSize } = args
  if (itemCount === 0) {
    return { startIndex: 0, endIndex: 0, startRow: 0, endRow: 0, topPadPx: 0, bottomPadPx: 0 }
  }

  const yTop = args.scrollY - args.listTopDoc - args.overscanPx
  const yBot = args.scrollY - args.listTopDoc + args.viewportH + args.overscanPx

  // Binary search / linear scan for first index with offset+rowH >= yTop — linear OK at ≤523
  let startIndex = 0
  while (
    startIndex < itemCount - 1 &&
    geometry.offsetOfIndex[startIndex]! + /* rowH slack via overscan */ 0 < yTop
  ) {
    // Advance while card offset is above viewport top (strict: while offset < yTop)
    if (geometry.offsetOfIndex[startIndex]! < yTop) startIndex++
    else break
  }
  // Back up one if we overshot
  while (startIndex > 0 && geometry.offsetOfIndex[startIndex]! > yTop) startIndex--

  let endIndex = startIndex
  while (endIndex < itemCount && geometry.offsetOfIndex[endIndex]! < yBot) {
    endIndex++
  }
  endIndex = Math.min(itemCount, Math.max(endIndex, startIndex + 1))

  // Hard cap
  if (endIndex - startIndex > windowSize) {
    const center = startIndex + Math.floor((endIndex - startIndex) / 2)
    startIndex = clamp(center - Math.floor(windowSize / 2), 0, Math.max(0, itemCount - windowSize))
    endIndex = Math.min(itemCount, startIndex + windowSize)
  }

  // Pads: unmounted prefix/suffix height including family chrome for fully off-window runs
  const topPadPx = startIndex === 0 ? 0 : geometry.offsetOfIndex[startIndex]!
  // Height of mounted block ≈ last mounted offset - first mounted offset + one row
  // Simpler correct approach: totalHeight - topPad - heightOfMountedRange
  const bottomPadPx = Math.max(
    0,
    geometry.totalHeight - topPadPx - estimateMountedBlockHeight(geometry, startIndex, endIndex, args),
  )

  return {
    startIndex,
    endIndex,
    startRow: 0, // unused in family mode (pads are absolute)
    endRow: 0,
    topPadPx,
    bottomPadPx,
  }
}
```

**Simpler pad identity (preferred implementation — implementers must use this):**

```ts
/** Height from list start through index `endExclusive` (not including card endExclusive). */
export function heightThroughIndex(
  geometry: FamilyGeometry,
  endExclusive: number,
  columns: number,
  rowHeight: number,
  sectionChromePx: number,
  runs: FamilyRun[],
): number {
  // Prefer: recompute from runs for [0, endExclusive) so chrome of partial last run is correct
  let h = 0
  const cols = Math.max(1, columns)
  const rowH = Math.max(1, rowHeight)
  for (const run of runs) {
    if (run.start >= endExclusive) break
    const visibleInRun = Math.min(run.end, endExclusive) - run.start
    if (visibleInRun <= 0) continue
    h += sectionChromePx
    h += Math.ceil(visibleInRun / cols) * rowH
  }
  return h
}

// topPadPx  = heightThroughIndex(0..startIndex)
// bottomPad = totalHeight - heightThroughIndex(0..endIndex)
// where totalHeight = heightThroughIndex(0..itemCount)
```

This folds **header + margin chrome for every fully or partially included run in the prefix**, so unmounted families above the window contribute correct height (F2). Unit-test:

- 3 families × 5 cards, cols=2, chrome=56 → totalHeight known.
- Window middle family only → topPad includes prior runs’ chrome + card rows; bottomPad non-negative; sum pads + mounted estimate ≈ totalHeight.

**Mounted block height** does not need to be perfect pixel-match if pads use the same pure function (prefix/suffix consistency avoids jumps).

#### 4.6.2 Render rules (family)

- For each `run` overlapping `[startIndex, endIndex)`: render `<section className="ency-family-section">` with:
  - `h3`: `run.familyLabel` + count = **`run.count`** (full family in `windowSource`, not intersection size).
  - Inner grid: cards `windowSource[i]` for `i ∈ [max(run.start,startIndex), min(run.end,endIndex))`.
- **Do not** split one family into multiple headers within a contiguous run (runs are contiguous by construction of KD15).
- If a family run is huge and window only covers the middle: still **one** section header when any card of that run is mounted (header shown whenever intersection non-empty). Accept SR heading appear/disappear as known virt limitation (a11y nit).
- Section `content-visibility`: leave CSS as-is; offscreen sections are unmounted so CV is moot for them. **Never** CV on cards.
- Toggle `groupByFamily`: included in `resetKey` → scroll-to-results then recompute (KD18).

### 4.7 Flat mode render

```tsx
<div ref={listRef} className="ency-window-list" data-testid="ency-species-list">
  {topPadPx > 0 && (
    <div
      className="ency-window-spacer ency-window-spacer--top"
      data-testid="ency-window-spacer-top"
      style={{ height: topPadPx }}
      aria-hidden
    />
  )}

  <div className="species-photo-grid" data-testid="ency-species-grid">
    {windowSource.slice(startIndex, endIndex).map((s, i) => {
      const sourceIndex = startIndex + i
      return (
        <SpeciesPhotoCard
          key={s.slug}
          species={s}
          priority={sourceIndex < 4}  // F9: global on windowSource, not per-section
        />
      )
    })}
  </div>

  {/* KD17: load-more BEFORE bottom spacer */}
  {endIndex < windowSource.length && (
    <div className="ency-more" data-testid="encyclopedia-load-more-wrap">
      <Button
        type="button"
        variant="primary"
        data-testid="encyclopedia-load-more"
        onClick={() => window.scrollBy({ top: window.innerHeight * 0.9, behavior: 'smooth' })}
      >
        {t('encyclopedia.loadMoreRest', { defaultValue: 'Cargar más' })}
        <span className="muted"> ({windowSource.length - endIndex})</span>
      </Button>
    </div>
  )}

  {bottomPadPx > 0 && (
    <div
      className="ency-window-spacer ency-window-spacer--bottom"
      data-testid="ency-window-spacer-bottom"
      style={{ height: bottomPadPx }}
      aria-hidden
    />
  )}
</div>
```

Family mode: same outer structure; middle = mapped sections instead of one grid; **same** load-more placement (after last visible section chrome, before bottom spacer).

**Spacer CSS (F14):** height + `aria-hidden` only. **No** `visibility: hidden`. **No** `content-visibility` on spacers/cards.

```css
.ency-window-spacer {
  pointer-events: none;
  flex-shrink: 0;
  width: 100%;
}
/* Do NOT set visibility:hidden or content-visibility on spacers or cards */
```

### 4.8 Hook: `useEncyclopediaGridWindow` (F13)

```ts
export type UseEncyclopediaGridWindowArgs = {
  itemCount: number
  /** filters + query + groupByFamily (+ catalog epoch if needed) */
  resetKey: string
  /** When false, caller renders all items (itemCount ≤ WINDOW short-circuit). Default true if itemCount > WINDOW. */
  enabled?: boolean
  /** Initial exclusive end before metrics. Default ENCYCLOPEDIA_FIRST_PAGE_SIZE */
  initialEnd?: number
  /**
   * Mode selects pad math:
   * - 'flat': computeIndexWindow
   * - 'family': computeFamilyIndexWindow + geometry from runs
   */
  mode: 'flat' | 'family'
  /** Required when mode==='family' */
  runs?: FamilyRun[]
}

export type UseEncyclopediaGridWindowResult = {
  listRef: RefObject<HTMLDivElement | null>
  startIndex: number
  endIndex: number
  topPadPx: number
  bottomPadPx: number
  columns: number
  /** True when windowing is active (enabled && itemCount > window size path). */
  isWindowing: boolean
  /** For remaining count on load-more */
  itemCount: number
}
```

**Responsibilities:**

1. `listRef` on **outer** list (not an inner grid when family has N grids).
2. `columns`: cold-start `estimateColumns(window.innerWidth)` (KD19); after paint, measure first mounted inner grid / card row tops; `ResizeObserver` on `listRef` (and/or sample grid).
3. `rowHeight`: `max(ENCYCLOPEDIA_CARD_ROW_ESTIMATE_PX, measuredFirstCard)` (F8 — never shrink below estimate without hysteresis; **do not** average all cards / thrash on every image `onLoad`).
4. `window` `scroll` + `resize` (passive), rAF-throttle (one scheduled frame).
5. **`resetKey` change (KD18 / F3):**
   - Schedule scroll to results: existing `scrollToResults()` → `#ency-results` `scrollIntoView({ block: 'start' })` (or scroll so list top is in view).
   - On next frame(s) after layout, read `scrollY` / `listTopDoc` and run normal compute (initial path at top: `startIndex=0`, `endIndex=min(initialEnd,itemCount)`).
   - **Forbidden:** set `startIndex=0` while leaving a deep `scrollY` (wrong pads / empty viewport).
6. All filter handlers that used `setPage(0)` must bump the same `resetKey` inputs **and** call the same scroll-to-results path (unify: even handlers that previously only `setPage(0)` now scroll-to-results via reset effect).
7. If `enabled === false` or `itemCount <= ENCYCLOPEDIA_DOM_WINDOW_SIZE`: still honor **first-frame** `endIndex <= FIRST_PAGE_SIZE`, then after rAF mount all `itemCount` with pads 0 (`isWindowing` false after expand).

### 4.9 Cold-start columns (F6 / KD19)

```ts
/**
 * Cold-start only — duplicated breakpoint intent from campo-nocturno encyclopedia grid.
 * RO measurement always overrides after first cards exist.
 *
 * App (page-encyclopedia--cn):
 *   default / <640: 2
 *   ≥640: 3
 *   ≥960: 5
 *   ≥1600: 6
 *
 * Web overrides use auto-fill minmax(12rem) — measurement wins; this estimate
 * is only for first-commit bottomPad. Prefer matching app table for stability.
 */
export function estimateColumns(viewportWidth: number): 2 | 3 | 5 | 6 {
  if (viewportWidth >= 1600) return 6
  if (viewportWidth >= 960) return 5
  if (viewportWidth >= 640) return 3
  return 2
}
```

Document next to the helper that web CSS may differ slightly until RO fires; acceptable one-frame bottomPad error.

### 4.10 Load-more + sentinel (F4 / F5 / KD17)

| Control | Spec |
|---------|------|
| **Button** | After last mounted card (flat) or last visible family section; **before** bottom spacer. Visible iff `endIndex < windowSource.length`. `onClick` → `window.scrollBy({ top: innerHeight * 0.9, behavior: 'smooth' })`. Keep existing i18n key; remaining = `length - endIndex`. |
| **IO sentinel** | **Omit.** No `page++`. No “no-op recompute.” Scroll listener + button are sufficient. |
| **a11y** | Button always in mounted DOM near viewport when more content exists; user never tabs through a multi-thousand-px empty pad to reach it. |

### 4.11 Keyboard / a11y / Link

| Concern | Behavior |
|---------|----------|
| Tab order | Only mounted cards + load-more (expected for virt lists). Overscan/buffer reduces edge focus loss. |
| Focus loss on unmount | Accepted v1; no restoration map. |
| Links | Unchanged `SpeciesPhotoCard` routes. |
| `#ency-results` | Still `tabIndex={-1}` for filter scroll target. |
| Load-more | Keyboard-activatable; placement KD17. |
| Family heading churn | Known virt limitation when sections mount/unmount — document; no extra live-region. |
| `aria-setsize` / `posinset` | Skip unless free (KD12). |
| Reduced motion | No new animations; `scrollBy` may use `behavior: 'smooth'` — if `prefers-reduced-motion`, use `'auto'`. |

### 4.12 Column detection (after paint)

1. Prefer first mounted `.species-photo-grid` under `listRef`.
2. If ≥2 cards, walk until `offsetTop` changes → `columns`.
3. Else keep `estimateColumns` until measurable.
4. On `columns` change: recompute window **without** `resetKey` (may micro-jump; remeasure `rowHeight` same frame).

### 4.13 Row height (F8)

- `rowHeight = max(ENCYCLOPEDIA_CARD_ROW_ESTIMATE_PX, ceil(measuredFirstCardHeight))`.
- Observe **first** mounted card only (and list width); **do not** average all visible cards; **do not** remeasure every image `onLoad` into a thrashing loop.
- Image/font growth → minor scroll drift acceptable for v1.

### 4.14 Priority / LCP (F9)

| Rule | Detail |
|------|--------|
| First commit | Mount `[0, min(FIRST_PAGE_SIZE, n))` on `windowSource` |
| `priority` | **`sourceIndex < 4`** global on `windowSource` (not per-section `i < 4`) |
| Featured hero | Unchanged; outside window budget |
| Media policy | Unchanged `encyclopedia_grid` |

### 4.15 Copy (F10)

- Results line: total filtered count + filter suffixes only.
- **Drop** progressive `encyclopedia.showingN` / “mostrando N”.
- No e2e dependency on that fragment today.

### 4.16 Dual-build

Shared `src/`; no build-flag branching. Column **measurement** after paint covers web minmax differences; `estimateColumns` is cold-start only.

### 4.17 Replace `page` / infinite append

| Before | After |
|--------|--------|
| `results = allResults.slice(0, (page+1)*PAGE_SIZE)` | `windowSource` + `[startIndex, endIndex)` |
| IO `page++` | Removed |
| “mostrando N” | Dropped; total count only |
| Load-more appends DOM | Load-more `scrollBy`; mount cap held |

---

## 5. Alternatives considered

### A. content-visibility on cards only
Reject — black frames; no mount bound.

### B. Trailing window without spacers
Reject — breaks scroll-up.

### C. Zero-dep sliding window + spacers (**chosen**)
Flat + family height model as specified.

### D. react-virtuoso / tanstack-virtual / react-window
Escape hatch only after zero-dep fails device QA; prefer `@tanstack/react-virtual` if escalating. **Not this PR.**

### E. Inner scroll + FixedSizeList
Reject — breaks sticky chrome / e2e.

### F. Short-circuit when `itemCount ≤ WINDOW`
Accept inside hook: after first-frame LCP gate, mount all, pads 0.

### G. Defer family windowing (review R2)
**Rejected** (OQ7 / KD15–16): family mode must window with flattened source + chrome pads in the same PR so T5 AC holds for the group toggle.

---

## 6. Risks / honesty

| Risk | Severity | Mitigation |
|------|----------|------------|
| Flat spacer under-estimate | Med | `max(estimate, measured)`; ceil math; F7 epilogue |
| Family chrome mis-estimate → jump | Med | `FAMILY_SECTION_CHROME_PX` + pure `heightThroughIndex`; unit tests; calibrate once against CSS |
| Column mis-detect | Med | RO after paint; `estimateColumns` cold-start only |
| reset without scroll → empty viewport | High if ignored | **KD18 mandatory** |
| Load-more after bottom pad | High a11y | **KD17 mandatory** |
| Focus lost on unmount | Low | Accept; overscan |
| Family SR heading churn | Low | Document |
| Dual-build column CSS drift | Low | Measure after paint |
| E2E load-more assumptions | Med | Re-run family-detail; button still present while `endIndex < n` |
| product_unlock / forage regression | Process | No touch; Appendix B |

---

## 7. Testing

### 7.1 Unit (required)

| Test | Assert |
|------|--------|
| Constants | FIRST ∈ (0,16]; WINDOW ∈ [FIRST,64]; chrome ≥ 0 |
| `bucketByFamilyThenFlatten` | Contiguous runs; first-seen order; popularity input reordered by family |
| `computeIndexWindow` top/mid/end | indices + pads; mount ≤ WINDOW |
| Cap + non-divisible cols | `end−start ≤ WINDOW`; pads ≥ 0; epilogue consistency (F7) |
| `estimateColumns` | Breakpoint table stable |
| `heightThroughIndex` / family window | Chrome of off-window families included in topPad; totalHeight identity |
| Cap family window | mount ≤ WINDOW mid large multi-family list |

### 7.2 Integration (optional)

- 100 fake species; mock metrics; card count ≤ 48.
- `resetKey` change triggers scroll-to-results path (mock `scrollIntoView`).

### 7.3 E2E

Existing suite must stay green:

```bash
npx playwright test e2e/encyclopedia-count.spec.ts
npx playwright test e2e/encyclopedia-family-detail.spec.ts
npx playwright test e2e/loop-3h-smoke.spec.ts
npx playwright test e2e/media-smoke.spec.ts
```

Optional window mount-count note (non-blocking):

```js
// mid-scroll flat
document.querySelectorAll(
  '[data-testid=ency-species-list] [data-testid=species-photo-card]'
).length // ≤ 48
// group-by-family: same bound; scroll without gross gap/overlap
// no product_unlock strings; orientation sticky visible
```

### 7.4 Regression checklist

- [ ] Filters narrow `allResults` → `windowSource` correctly.
- [ ] Group-by-family: family-contiguous order; full counts; no unbounded mount.
- [ ] Filter/toggle reset scrolls to results then windows from top.
- [ ] Load-more is before bottom spacer and keyboard-reachable.
- [ ] Encyclopedia count ≥ SSOT min (520).
- [ ] Orientation sticky; no forage/unlock copy.
- [ ] `package.json` deps unchanged.
- [ ] App + web `tsc && vite build`.

---

## 8. Implementation sketch (file-level)

| File | Change |
|------|--------|
| `frontend/src/data/photoTiers.ts` | Keep `ENCYCLOPEDIA_FIRST_PAGE_SIZE` only (no need to pile window knobs here) |
| `frontend/src/lib/encyclopediaWindow.ts` | **New** — constants, `estimateColumns`, `bucketByFamilyThenFlatten`, flat + family pad math |
| `frontend/src/lib/encyclopediaWindow.test.ts` | **New** — all pure tests above |
| `frontend/src/hooks/useEncyclopediaGridWindow.ts` | **New** — listRef, RO, scroll, resetKey→scroll-then-compute |
| `frontend/src/components/EncyclopediaSpeciesGrid.tsx` | **New** — flat + family render, spacers, load-more placement |
| `frontend/src/pages/EncyclopediaPage.tsx` | Build `windowSource` / `resetKey`; drop page-append; wire grid |
| `frontend/src/styles/campo-nocturno.css` | Minimal `.ency-window-spacer` / list wrapper if needed |
| `frontend/package.json` | **No change** |

`SpeciesPhotoCard.tsx` — no required changes (priority decided by parent via prop).

---

## 9. Rollout / feature flag

No remote flag. No `ENCYCLOPEDIA_WINDOWING_ENABLED` unless a hotfix needs it — **default: ship on**.

---

## 10. Success metrics

| Metric | Target |
|--------|--------|
| Mounted grid cards mid-scroll | ≤ 48 (`ency-species-list` scope) |
| First commit grid cards | ≤ 12 |
| Family mode mount bound | Same 48 |
| New dependencies | 0 |
| E2E encyclopedia paths | Green |
| product_unlock / forage | Unchanged / absent |

---

## Key Decisions

| # | Decision | Default / rationale |
|---|----------|---------------------|
| KD1 | **Zero-dep sliding window** with spacers | T5 mount bound without dual-build dep cost |
| KD2 | **No** content-visibility-on-cards as the fix | Black frames; no unmount |
| KD3 | **No** virt library in this ticket | Escape hatch only after zero-dep QA failure |
| KD4 | Retire page-append; indices into **`windowSource`** | Catalog already in memory |
| KD5 | First paint ≤ **12**; hard cap **48** | LCP + ~2 viewports |
| KD6 | Window constants + math in `encyclopediaWindow.ts`; `FIRST_PAGE_SIZE` stays in `photoTiers.ts` | OQ3; avoid breaking imports |
| KD7 | Window over **window scroll**, not inner scroller | Sticky toolbar + orientation sticky + e2e |
| KD8 | Family: global index window + section chrome; header counts = **full** family size | v1.11 pattern without N virtualizers |
| KD9 | Load-more = **`scrollBy(0.9 * vh)`**, not DOM append; **no** IO `page++` | a11y without mount blowup |
| KD10 | `SpeciesPhotoCard` + `encyclopedia_grid` policy unchanged | T1/T6 already correct |
| KD11 | Featured hero outside window budget | DOM: hero outside list |
| KD12 | aria-setsize/posinset optional skip | Ship window first |
| KD13 | No product_unlock, no forage/consume language changes | Orientation-only product law |
| KD14 | Prefer **1 PR** after family geometry locked in-doc | FE presentation only |
| **KD15** | When `groupByFamily`, `windowSource = flatten(bucketByFamily(allResults))` (Map first-seen order). **Never** window raw popularity order for section chrome. Flat mode: `windowSource = allResults`. | Fixes F1; matches today’s grouping intent on the full list |
| **KD16** | Family pads via pure `heightThroughIndex(runs, cols, rowH, FAMILY_SECTION_CHROME_PX)`; spacers on outer **`listRef`**; columns from first mounted inner grid; card rowH from first card | Fixes F2 |
| **KD17** | Load-more (+ no sentinel) sits **after last mounted content, before bottom spacer**; action = `scrollBy(0, 0.9 * viewportH)` | Fixes F4/F5 a11y |
| **KD18** | `resetKey` change → scroll results into view → then measure/recompute. **Never** force `startIndex=0` while `scrollY` remains deep. | Fixes F3 |
| **KD19** | Cold-start columns via `estimateColumns(innerWidth)` (documented breakpoints); RO/measurement overrides after paint | Fixes F6 |
| **KD20** | Cap path ends with single epilogue recompute of rows/pads (flat); family uses heightThroughIndex identity | Fixes F7 |
| **KD21** | `rowHeight = max(estimate, measuredFirstCard)`; sample first card only; no per-image RO thrash | Fixes F8 |
| **KD22** | `priority={sourceIndex < 4}` on **global** `windowSource` index | Fixes F9 / G2 |

---

## Open Questions

| # | Question | **Resolved default** |
|---|----------|----------------------|
| OQ1 | Keep progressive “mostrando N”? | **No** — total filtered count only. |
| OQ2 | Load-more label? | **Keep i18n**; behavior = scroll-assist. |
| OQ3 | Constant file split? | **Math module owns window knobs**; FIRST stays in `photoTiers.ts`. |
| OQ4 | Extract `EncyclopediaSpeciesGrid`? | **Yes** — flat + family + load-more placement. |
| OQ5 | aria-posinset in v1? | **Skip**. |
| OQ6 | New Playwright window spec? | **Optional**; unit + manual mid-scroll required. |
| OQ7 | Disable windowing in family mode? | **No** — KD15/KD16. |
| OQ8 | Catalog 2k+? | Revisit library escape hatch. |
| OQ9 | Keep IO sentinel? | **No** — omit (F5). |
| OQ10 | Family chrome constant value? | **56px** default; calibrate in PR if visual gap; unit tests use injected chrome. |

---

## PR Plan

### Prefer: single PR — `feat(ency): T5 windowed encyclopedia grid (no new deps)`

**Scope**

1. `encyclopediaWindow.ts` + unit tests (flat math, family bucket/flatten, heightThroughIndex, estimateColumns, constants).
2. `useEncyclopediaGridWindow` (resetKey→scroll-then-compute, listRef, RO).
3. `EncyclopediaSpeciesGrid` (flat + family, spacers, **load-more before bottom pad**).
4. `EncyclopediaPage`: `windowSource` / `runs` / `resetKey`; remove page-append + IO page++.
5. Minimal CSS for spacers/list wrapper.
6. Vitest + encyclopedia Playwright suite; dual-build.

**Out of PR**

- New npm dependencies.
- PERF-6 global CV cleanup.
- Other pages’ grids.
- product_unlock / forage copy.

**Review focus**

- Mount cap flat **and** family.
- Family scroll jump mid-list (chrome pads).
- resetKey scrolls to results before windowing.
- Load-more before bottom spacer + keyboard.
- No forage/unlock regressions.

**Test commands**

```bash
cd frontend
npx vitest run src/lib/encyclopediaWindow.test.ts src/data/photoTiers.test.ts
npx playwright test e2e/encyclopedia-count.spec.ts e2e/encyclopedia-family-detail.spec.ts e2e/loop-3h-smoke.spec.ts e2e/media-smoke.spec.ts
npm run build
```

### Fallback 2-PR (only if family soak needed)

| PR | Contents |
|----|----------|
| PR1 | Flat windowing only; when `groupByFamily`, still use flattened source + same window (do **not** re-enable unbounded page-append) |
| PR2 | N/A if KD16 ships in PR1 |

**Recommendation:** **1 PR** — F1–F4 are design-locked; family pure math is small enough to ship together.

---

## Appendix A — Acceptance criteria mapping (T5 / PERF-3)

| AC | How this design meets it |
|----|---------------------------|
| Filtered browse mount bound | Sliding window + `DOM_WINDOW_SIZE` on `windowSource` |
| Scroll 100+ → bounded cards | Same; unit + optional e2e/manual |
| Filters / progressive browse | Filters rebuild `allResults` → `windowSource`; resetKey scrolls then windows; load-more scrollBy |
| Orientation sticky + chips | Untouched; orientation-only |
| No product_unlock in smoke | No unlock paths; optional e2e string check |
| LCP first 12 | Initial `endIndex ≤ FIRST_PAGE_SIZE` |
| Family headers + keyboard + Link | KD15 order + full counts; Links unchanged; button KD17 |

## Appendix B — Explicit non-requirements for implementers

- Do not introduce `product_unlock` checks on the encyclopedia grid.
- Do not change food/risk chip semantics or safety copy.
- Do not scrape or widen media candidates beyond `encyclopedia_grid` policy.
- Do not virtualize by deleting taxa from the filtered list (toxic taxa remain).
- Do not force `startIndex=0` without scrolling when filters change.
- Do not place load-more after the bottom spacer.
- Do not window raw popularity-ordered `allResults` while rendering family section chrome.

## Appendix C — Implementability checklist (review)

1. [x] Family `windowSource` = flatten(bucketByFamily) (F1 / KD15)
2. [x] Family pad/height model via heightThroughIndex + chrome (F2 / KD16)
3. [x] `listRef` outer; column sample from first mounted inner grid
4. [x] `resetKey` → scroll-to-results then recompute (F3 / KD18)
5. [x] Load-more before bottom spacer (F4 / KD17)
6. [x] Sentinel omit; button scrollBy (F5)
7. [x] `estimateColumns` cold-start (F6 / KD19)
8. [x] Cap epilogue / height identity (F7 / KD20)
9. [x] Hook full props/return (F13)
10. [x] priority global sourceIndex (F9 / KD22)
11. [x] No visibility:hidden on spacers (F14)
