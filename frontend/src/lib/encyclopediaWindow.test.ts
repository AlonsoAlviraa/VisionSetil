/**
 * Pure unit tests for encyclopedia grid windowing (T5).
 */
import { describe, expect, it } from 'vitest'
import {
  ENCYCLOPEDIA_CARD_ROW_ESTIMATE_PX,
  ENCYCLOPEDIA_DOM_WINDOW_SIZE,
  ENCYCLOPEDIA_FAMILY_SECTION_CHROME_PX,
  ENCYCLOPEDIA_FIRST_PAGE_SIZE,
  ENCYCLOPEDIA_WINDOW_OVERSCAN_ROWS,
  bucketByFamilyThenFlatten,
  computeFamilyIndexWindow,
  computeFamilyListGeometry,
  computeIndexWindow,
  estimateColumns,
  familyLabelOf,
  heightThroughIndex,
  initialFlatWindow,
  initialFamilyWindow,
  measureColumnsFromGrid,
  type FamilyRun,
  type WindowMetrics,
} from './encyclopediaWindow'

/** Minimal DOM stand-in for measureColumnsFromGrid (vitest env is node). */
function mockListRoot(cardOffsetTops: number[] | null): HTMLElement {
  if (cardOffsetTops === null) {
    return {
      querySelector: () => null,
    } as unknown as HTMLElement
  }
  const cards = cardOffsetTops.map((offsetTop) => ({ offsetTop }))
  const grid = {
    querySelectorAll: () => cards,
  }
  return {
    querySelector: (sel: string) => (sel === '.species-photo-grid' ? grid : null),
  } as unknown as HTMLElement
}

describe('encyclopedia window constants', () => {
  it('FIRST_PAGE_SIZE is in (0, 16]', () => {
    expect(ENCYCLOPEDIA_FIRST_PAGE_SIZE).toBeGreaterThan(0)
    expect(ENCYCLOPEDIA_FIRST_PAGE_SIZE).toBeLessThanOrEqual(16)
  })

  it('DOM_WINDOW_SIZE is in [FIRST, 64]', () => {
    expect(ENCYCLOPEDIA_DOM_WINDOW_SIZE).toBeGreaterThanOrEqual(ENCYCLOPEDIA_FIRST_PAGE_SIZE)
    expect(ENCYCLOPEDIA_DOM_WINDOW_SIZE).toBeLessThanOrEqual(64)
    expect(ENCYCLOPEDIA_DOM_WINDOW_SIZE).toBe(48)
  })

  it('overscan, chrome, and row estimate are non-negative / sane', () => {
    expect(ENCYCLOPEDIA_WINDOW_OVERSCAN_ROWS).toBeGreaterThanOrEqual(0)
    expect(ENCYCLOPEDIA_FAMILY_SECTION_CHROME_PX).toBeGreaterThanOrEqual(0)
    expect(ENCYCLOPEDIA_CARD_ROW_ESTIMATE_PX).toBeGreaterThan(0)
  })
})

describe('estimateColumns (KD19 cold-start breakpoints)', () => {
  it('matches app campo-nocturno breakpoints', () => {
    expect(estimateColumns(320)).toBe(2)
    expect(estimateColumns(639)).toBe(2)
    expect(estimateColumns(640)).toBe(3)
    expect(estimateColumns(959)).toBe(3)
    expect(estimateColumns(960)).toBe(5)
    expect(estimateColumns(1599)).toBe(5)
    expect(estimateColumns(1600)).toBe(6)
    expect(estimateColumns(2400)).toBe(6)
  })
})

describe('measureColumnsFromGrid', () => {
  it('returns null when list root is null', () => {
    expect(measureColumnsFromGrid(null)).toBeNull()
  })

  it('returns null when no grid under list root', () => {
    expect(measureColumnsFromGrid(mockListRoot(null))).toBeNull()
  })

  it('returns null with 0 cards (keep estimateColumns)', () => {
    expect(measureColumnsFromGrid(mockListRoot([]))).toBeNull()
  })

  it('returns null with a single card — never force columns=1', () => {
    // Bugfix: 1 mounted card must not report 1 column (would thrash pads vs estimateColumns)
    expect(measureColumnsFromGrid(mockListRoot([0]))).toBeNull()
  })

  it('counts first row via offsetTop when ≥2 cards', () => {
    // 3 cards same row, 4th next row
    expect(measureColumnsFromGrid(mockListRoot([10, 10, 10, 50]))).toBe(3)
    expect(measureColumnsFromGrid(mockListRoot([0, 0]))).toBe(2)
  })
})

function baseMetrics(over: Partial<WindowMetrics> = {}): WindowMetrics {
  return {
    scrollY: 0,
    viewportH: 800,
    listTopDoc: 0,
    columns: 3,
    rowHeight: 280,
    itemCount: 100,
    windowSize: ENCYCLOPEDIA_DOM_WINDOW_SIZE,
    overscanRows: ENCYCLOPEDIA_WINDOW_OVERSCAN_ROWS,
    ...over,
  }
}

describe('computeIndexWindow (flat)', () => {
  it('starts at top with startIndex 0 and pads consistent', () => {
    const w = computeIndexWindow(baseMetrics({ scrollY: 0, listTopDoc: 0 }))
    expect(w.startIndex).toBe(0)
    expect(w.endIndex).toBeGreaterThan(0)
    expect(w.endIndex - w.startIndex).toBeLessThanOrEqual(ENCYCLOPEDIA_DOM_WINDOW_SIZE)
    expect(w.topPadPx).toBe(0)
    expect(w.bottomPadPx).toBeGreaterThanOrEqual(0)
  })

  it('mid-scroll advances indices and keeps mount ≤ WINDOW', () => {
    // listTopDoc 0, rowH 280 → row 10 starts at y=2800
    const w = computeIndexWindow(
      baseMetrics({ scrollY: 2800, listTopDoc: 0, itemCount: 200 }),
    )
    expect(w.startIndex).toBeGreaterThan(0)
    expect(w.endIndex).toBeGreaterThan(w.startIndex)
    expect(w.endIndex - w.startIndex).toBeLessThanOrEqual(ENCYCLOPEDIA_DOM_WINDOW_SIZE)
    expect(w.topPadPx).toBe(w.startRow * 280)
    expect(w.bottomPadPx).toBeGreaterThanOrEqual(0)
  })

  it('end of list clamps endIndex to itemCount', () => {
    const itemCount = 50
    const w = computeIndexWindow(
      baseMetrics({
        scrollY: 50_000,
        listTopDoc: 0,
        itemCount,
        columns: 2,
      }),
    )
    expect(w.endIndex).toBe(itemCount)
    expect(w.endIndex - w.startIndex).toBeLessThanOrEqual(ENCYCLOPEDIA_DOM_WINDOW_SIZE)
    expect(w.bottomPadPx).toBe(0)
  })

  it('hard cap when windowSize not divisible by cols (F7 epilogue)', () => {
    // windowSize 10, cols 3 → after row-align must still end-start ≤ 10
    const w = computeIndexWindow(
      baseMetrics({
        scrollY: 2000,
        listTopDoc: 0,
        itemCount: 200,
        columns: 3,
        windowSize: 10,
        overscanRows: 20, // force greedy then cap
        viewportH: 4000,
        rowHeight: 100,
      }),
    )
    expect(w.endIndex - w.startIndex).toBeLessThanOrEqual(10)
    expect(w.topPadPx).toBeGreaterThanOrEqual(0)
    expect(w.bottomPadPx).toBeGreaterThanOrEqual(0)
    // pads consistent with final indices
    const cols = 3
    const rowH = 100
    const totalRows = Math.ceil(200 / cols)
    expect(w.topPadPx).toBe(Math.floor(w.startIndex / cols) * rowH)
    expect(w.bottomPadPx).toBe(Math.max(0, (totalRows - Math.ceil(w.endIndex / cols)) * rowH))
  })

  it('empty itemCount returns zero window', () => {
    const w = computeIndexWindow(baseMetrics({ itemCount: 0 }))
    expect(w).toEqual({
      startIndex: 0,
      endIndex: 0,
      startRow: 0,
      endRow: 0,
      topPadPx: 0,
      bottomPadPx: 0,
    })
  })
})

describe('initialFlatWindow (LCP)', () => {
  it('mounts at most FIRST_PAGE_SIZE', () => {
    const w = initialFlatWindow(523, 3, 280)
    expect(w.startIndex).toBe(0)
    expect(w.endIndex).toBe(ENCYCLOPEDIA_FIRST_PAGE_SIZE)
    expect(w.topPadPx).toBe(0)
    expect(w.bottomPadPx).toBeGreaterThan(0)
  })
})

describe('bucketByFamilyThenFlatten (KD15)', () => {
  it('orders runs by first-seen family and flattens contiguously', () => {
    const items = [
      { slug: 'a', family: 'Amanitaceae', family_es: 'Amanitáceas' },
      { slug: 'b', family: 'Boletaceae', family_es: 'Boletáceas' },
      { slug: 'c', family: 'Amanitaceae', family_es: 'Amanitáceas' },
      { slug: 'd', family: 'Russulaceae', family_es: 'Russuláceas' },
      { slug: 'e', family: 'Boletaceae', family_es: 'Boletáceas' },
    ]
    const { windowSource, runs } = bucketByFamilyThenFlatten(items, 'Sin familia')
    expect(windowSource.map((s) => s.slug)).toEqual(['a', 'c', 'b', 'e', 'd'])
    expect(runs.map((r) => r.familyLabel)).toEqual([
      'Amanitáceas',
      'Boletáceas',
      'Russuláceas',
    ])
    expect(runs[0]).toMatchObject({ start: 0, end: 2, count: 2 })
    expect(runs[1]).toMatchObject({ start: 2, end: 4, count: 2 })
    expect(runs[2]).toMatchObject({ start: 4, end: 5, count: 1 })
    // each run is contiguous in windowSource
    for (const run of runs) {
      expect(run.end - run.start).toBe(run.count)
    }
  })

  it('uses noFamilyLabel when family missing', () => {
    expect(familyLabelOf({ slug: 'x' }, 'Sin familia')).toBe('Sin familia')
    expect(familyLabelOf({ slug: 'y', family: '  ' }, 'Sin familia')).toBe('Sin familia')
    expect(familyLabelOf({ slug: 'z', family: 'Amanitaceae' }, 'Sin familia')).toBe(
      'Amanitaceae',
    )
  })
})

describe('heightThroughIndex + family geometry', () => {
  /** 3 families × 5 cards, cols=2, chrome=56, rowH=280 */
  function threeByFive(): { runs: FamilyRun[]; itemCount: number } {
    const runs: FamilyRun[] = [
      { familyLabel: 'A', start: 0, end: 5, count: 5 },
      { familyLabel: 'B', start: 5, end: 10, count: 5 },
      { familyLabel: 'C', start: 10, end: 15, count: 5 },
    ]
    return { runs, itemCount: 15 }
  }

  it('totalHeight matches known formula (3 fam × 5, cols=2)', () => {
    const { runs, itemCount } = threeByFive()
    const cols = 2
    const rowH = 280
    const chrome = 56
    // each run: chrome + ceil(5/2)*rowH = 56 + 3*280 = 56 + 840 = 896
    // total = 3 * 896 = 2688
    const total = heightThroughIndex(itemCount, cols, rowH, chrome, runs)
    expect(total).toBe(3 * (56 + 3 * 280))

    const geo = computeFamilyListGeometry(runs, itemCount, cols, rowH, chrome)
    expect(geo.totalHeight).toBe(total)
    expect(geo.offsetOfIndex[0]).toBe(chrome)
    expect(geo.offsetOfIndex[5]).toBe(chrome + 3 * rowH + chrome)
  })

  it('topPad for middle family includes prior chrome + rows', () => {
    const { runs, itemCount } = threeByFive()
    const cols = 2
    const rowH = 280
    const chrome = 56
    // Window middle family only: indices [5, 10)
    const topPad = heightThroughIndex(5, cols, rowH, chrome, runs)
    expect(topPad).toBe(56 + 3 * 280) // family A fully above
    const mounted = heightThroughIndex(10, cols, rowH, chrome, runs) - topPad
    // family B: chrome + 3 rows
    expect(mounted).toBe(56 + 3 * 280)
    const total = heightThroughIndex(itemCount, cols, rowH, chrome, runs)
    const bottomPad = total - heightThroughIndex(10, cols, rowH, chrome, runs)
    expect(bottomPad).toBe(56 + 3 * 280) // family C
    expect(topPad + mounted + bottomPad).toBe(total)
  })

  it('partial last run in prefix counts chrome once', () => {
    const { runs } = threeByFive()
    const cols = 2
    const rowH = 280
    const chrome = 56
    // first 2 cards of family A only
    const h = heightThroughIndex(2, cols, rowH, chrome, runs)
    expect(h).toBe(chrome + 1 * rowH) // ceil(2/2)=1 row
  })
})

describe('computeFamilyIndexWindow', () => {
  it('caps mount ≤ WINDOW mid multi-family list', () => {
    // 20 families × 10 cards = 200
    const runs: FamilyRun[] = []
    for (let f = 0; f < 20; f++) {
      runs.push({
        familyLabel: `F${f}`,
        start: f * 10,
        end: (f + 1) * 10,
        count: 10,
      })
    }
    const itemCount = 200
    const cols = 3
    const rowH = 280
    const chrome = ENCYCLOPEDIA_FAMILY_SECTION_CHROME_PX
    const geometry = computeFamilyListGeometry(runs, itemCount, cols, rowH, chrome)
    // Scroll deep into middle
    const midY = geometry.totalHeight / 2
    const w = computeFamilyIndexWindow({
      scrollY: midY,
      viewportH: 900,
      listTopDoc: 0,
      geometry,
      itemCount,
      windowSize: ENCYCLOPEDIA_DOM_WINDOW_SIZE,
      overscanPx: ENCYCLOPEDIA_WINDOW_OVERSCAN_ROWS * rowH,
      columns: cols,
      rowHeight: rowH,
      sectionChromePx: chrome,
    })
    expect(w.endIndex - w.startIndex).toBeLessThanOrEqual(ENCYCLOPEDIA_DOM_WINDOW_SIZE)
    expect(w.topPadPx).toBeGreaterThanOrEqual(0)
    expect(w.bottomPadPx).toBeGreaterThanOrEqual(0)
    const total = heightThroughIndex(itemCount, cols, rowH, chrome, runs)
    const throughEnd = heightThroughIndex(w.endIndex, cols, rowH, chrome, runs)
    expect(w.bottomPadPx).toBe(Math.max(0, total - throughEnd))
  })

  it('initialFamilyWindow honors FIRST_PAGE_SIZE', () => {
    const runs: FamilyRun[] = [
      { familyLabel: 'A', start: 0, end: 20, count: 20 },
      { familyLabel: 'B', start: 20, end: 40, count: 20 },
    ]
    const w = initialFamilyWindow(runs, 40, 3, 280, 56)
    expect(w.startIndex).toBe(0)
    expect(w.endIndex).toBe(ENCYCLOPEDIA_FIRST_PAGE_SIZE)
    expect(w.topPadPx).toBe(0)
    expect(w.bottomPadPx).toBeGreaterThan(0)
  })
})
