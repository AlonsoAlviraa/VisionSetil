/**
 * Encyclopedia grid windowing (T5 / PERF-3) — pure math + constants.
 * No React. Zero deps. Flat + family pad model.
 *
 * FIRST_PAGE_SIZE stays in photoTiers (existing imports); window knobs live here.
 */
import { ENCYCLOPEDIA_FIRST_PAGE_SIZE } from '../data/photoTiers'

export { ENCYCLOPEDIA_FIRST_PAGE_SIZE }

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
 */
export const ENCYCLOPEDIA_FAMILY_SECTION_CHROME_PX = 56

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

export type CatalogLike = {
  slug: string
  family?: string | null
  family_es?: string | null
}

export type FamilyRun = {
  familyLabel: string
  start: number // inclusive index into windowSource
  end: number // exclusive
  count: number // full family size (= end - start)
}

export type FamilyGeometry = {
  /** Y of each card's row within the list (approx top of that card's row). */
  offsetOfIndex: number[]
  /** Total scroll height of full list (all runs). */
  totalHeight: number
  runs: FamilyRun[]
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

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
 * Web CSS may differ slightly until RO fires; acceptable one-frame bottomPad error.
 */
export function estimateColumns(viewportWidth: number): 2 | 3 | 5 | 6 {
  if (viewportWidth >= 1600) return 6
  if (viewportWidth >= 960) return 5
  if (viewportWidth >= 640) return 3
  return 2
}

/** Flat multi-column index window with hard mount cap and consistent pads (F7). */
export function computeIndexWindow(m: WindowMetrics): IndexWindow {
  const cols = Math.max(1, m.columns | 0)
  const rowH = Math.max(1, m.rowHeight)
  const totalRows = Math.ceil(m.itemCount / cols) || 0

  if (m.itemCount <= 0 || totalRows === 0) {
    return { startIndex: 0, endIndex: 0, startRow: 0, endRow: 0, topPadPx: 0, bottomPadPx: 0 }
  }

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

/** Initial LCP window: first N cards, top pad 0, bottom pad for remaining rows. */
export function initialFlatWindow(
  itemCount: number,
  columns: number,
  rowHeight: number,
  initialEnd: number = ENCYCLOPEDIA_FIRST_PAGE_SIZE,
): IndexWindow {
  const cols = Math.max(1, columns)
  const rowH = Math.max(1, rowHeight)
  const endIndex = Math.min(initialEnd, itemCount)
  const totalRows = Math.ceil(itemCount / cols) || 0
  const endRow = Math.ceil(endIndex / cols) || 0
  return {
    startIndex: 0,
    endIndex,
    startRow: 0,
    endRow,
    topPadPx: 0,
    bottomPadPx: Math.max(0, (totalRows - endRow) * rowH),
  }
}

/** Family label used for section chrome (matches EncyclopediaPage today). */
export function familyLabelOf(s: CatalogLike, noFamilyLabel: string): string {
  const latin = (s.family || '').trim()
  return s.family_es || (latin ? latin : noFamilyLabel)
}

/**
 * KD15 / F1: Map insertion order = first appearance in `items`.
 * Flattens to family-contiguous windowSource. Never window raw popularity when grouped.
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

/**
 * Build cumulative geometry for family-contiguous windowSource.
 * offsets[i] = Y of card i's row within the list.
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
    y += chrome
    const n = run.end - run.start
    for (let i = 0; i < n; i++) {
      const rowInRun = Math.floor(i / cols)
      offsetOfIndex[run.start + i] = y + rowInRun * rowH
    }
    const rows = Math.ceil(n / cols) || 0
    y += rows * rowH
  }

  return { offsetOfIndex, totalHeight: y, runs }
}

/**
 * Height from list start through index `endExclusive` (not including card endExclusive).
 * Includes section chrome for every fully or partially included run in the prefix (F2 / KD16).
 */
export function heightThroughIndex(
  endExclusive: number,
  columns: number,
  rowHeight: number,
  sectionChromePx: number,
  runs: FamilyRun[],
): number {
  let h = 0
  const cols = Math.max(1, columns)
  const rowH = Math.max(1, rowHeight)
  const chrome = Math.max(0, sectionChromePx)
  const end = Math.max(0, endExclusive)
  for (const run of runs) {
    if (run.start >= end) break
    const visibleInRun = Math.min(run.end, end) - run.start
    if (visibleInRun <= 0) continue
    h += chrome
    h += Math.ceil(visibleInRun / cols) * rowH
  }
  return h
}

/**
 * Family mode index window: scan geometry offsets, hard-cap mount count,
 * pads via heightThroughIndex identity (preferred).
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
  columns: number
  rowHeight: number
  sectionChromePx: number
}): IndexWindow {
  const {
    geometry,
    itemCount,
    windowSize,
    columns,
    rowHeight,
    sectionChromePx,
  } = args

  if (itemCount === 0) {
    return { startIndex: 0, endIndex: 0, startRow: 0, endRow: 0, topPadPx: 0, bottomPadPx: 0 }
  }

  const yTop = args.scrollY - args.listTopDoc - args.overscanPx
  const yBot = args.scrollY - args.listTopDoc + args.viewportH + args.overscanPx
  const offsets = geometry.offsetOfIndex

  let startIndex = 0
  while (startIndex < itemCount - 1 && (offsets[startIndex] ?? 0) < yTop) {
    startIndex++
  }
  // Back up one if we overshot
  while (startIndex > 0 && (offsets[startIndex] ?? 0) > yTop) {
    startIndex--
  }

  let endIndex = startIndex
  while (endIndex < itemCount && (offsets[endIndex] ?? 0) < yBot) {
    endIndex++
  }
  endIndex = Math.min(itemCount, Math.max(endIndex, startIndex + 1))

  // Hard cap
  if (endIndex - startIndex > windowSize) {
    const center = startIndex + Math.floor((endIndex - startIndex) / 2)
    startIndex = clamp(
      center - Math.floor(windowSize / 2),
      0,
      Math.max(0, itemCount - windowSize),
    )
    endIndex = Math.min(itemCount, startIndex + windowSize)
  }

  const totalHeight = heightThroughIndex(
    itemCount,
    columns,
    rowHeight,
    sectionChromePx,
    geometry.runs,
  )
  const topPadPx = heightThroughIndex(
    startIndex,
    columns,
    rowHeight,
    sectionChromePx,
    geometry.runs,
  )
  const mountedThrough = heightThroughIndex(
    endIndex,
    columns,
    rowHeight,
    sectionChromePx,
    geometry.runs,
  )
  const bottomPadPx = Math.max(0, totalHeight - mountedThrough)

  return {
    startIndex,
    endIndex,
    startRow: 0,
    endRow: 0,
    topPadPx,
    bottomPadPx,
  }
}

/** Initial LCP window for family mode. */
export function initialFamilyWindow(
  runs: FamilyRun[],
  itemCount: number,
  columns: number,
  rowHeight: number,
  sectionChromePx: number,
  initialEnd: number = ENCYCLOPEDIA_FIRST_PAGE_SIZE,
): IndexWindow {
  const endIndex = Math.min(initialEnd, itemCount)
  const totalHeight = heightThroughIndex(
    itemCount,
    columns,
    rowHeight,
    sectionChromePx,
    runs,
  )
  const mountedThrough = heightThroughIndex(
    endIndex,
    columns,
    rowHeight,
    sectionChromePx,
    runs,
  )
  return {
    startIndex: 0,
    endIndex,
    startRow: 0,
    endRow: 0,
    topPadPx: 0,
    bottomPadPx: Math.max(0, totalHeight - mountedThrough),
  }
}

/**
 * Measure columns from first mounted grid under list root: walk cards until offsetTop changes.
 * Returns null if not measurable yet.
 */
export function measureColumnsFromGrid(listRoot: HTMLElement | null): number | null {
  if (!listRoot) return null
  const grid = listRoot.querySelector('.species-photo-grid')
  if (!grid) return null
  const cards = grid.querySelectorAll<HTMLElement>('[data-testid="species-photo-card"]')
  // Need ≥2 cards to detect columns via offsetTop change; keep estimateColumns until then
  if (cards.length < 2) return null
  const firstTop = cards[0]!.offsetTop
  let cols = 1
  for (let i = 1; i < cards.length; i++) {
    if (cards[i]!.offsetTop !== firstTop) break
    cols++
  }
  return Math.max(1, cols)
}

/** Measure first card height under list root. */
export function measureFirstCardHeight(listRoot: HTMLElement | null): number | null {
  if (!listRoot) return null
  const card = listRoot.querySelector<HTMLElement>('[data-testid="species-photo-card"]')
  if (!card) return null
  const h = card.getBoundingClientRect().height
  if (!Number.isFinite(h) || h <= 0) return null
  return Math.ceil(h)
}
