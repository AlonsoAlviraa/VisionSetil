/**
 * Sliding window for Encyclopedia grid (T5) — no react-window.
 * Scroll/resize + RO; resetKey → scroll-to-results then recompute (KD18).
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import {
  ENCYCLOPEDIA_CARD_ROW_ESTIMATE_PX,
  ENCYCLOPEDIA_DOM_WINDOW_SIZE,
  ENCYCLOPEDIA_FAMILY_SECTION_CHROME_PX,
  ENCYCLOPEDIA_FIRST_PAGE_SIZE,
  ENCYCLOPEDIA_WINDOW_OVERSCAN_ROWS,
  computeFamilyIndexWindow,
  computeFamilyListGeometry,
  computeIndexWindow,
  estimateColumns,
  initialFamilyWindow,
  initialFlatWindow,
  measureColumnsFromGrid,
  measureFirstCardHeight,
  type FamilyRun,
  type IndexWindow,
} from '../lib/encyclopediaWindow'

export type UseEncyclopediaGridWindowArgs = {
  itemCount: number
  /** filters + query + groupByFamily (+ catalog epoch if needed) */
  resetKey: string
  /** When false, caller may still use returned indices; default windows when count large. */
  enabled?: boolean
  /** Initial exclusive end before metrics. Default ENCYCLOPEDIA_FIRST_PAGE_SIZE */
  initialEnd?: number
  mode: 'flat' | 'family'
  /** Required when mode==='family' */
  runs?: FamilyRun[]
  /** Optional scroll target id (default ency-results). */
  resultsAnchorId?: string
}

export type UseEncyclopediaGridWindowResult = {
  listRef: RefObject<HTMLDivElement>
  startIndex: number
  endIndex: number
  topPadPx: number
  bottomPadPx: number
  columns: number
  /** True when windowing is active after first-frame expand. */
  isWindowing: boolean
  itemCount: number
}

function coldColumns(): number {
  if (typeof window === 'undefined') return 2
  return estimateColumns(window.innerWidth || 360)
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function scrollResultsIntoView(anchorId: string) {
  const el = document.getElementById(anchorId)
  if (!el) return
  el.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'start',
  })
}

function emptyWindow(): IndexWindow {
  return { startIndex: 0, endIndex: 0, startRow: 0, endRow: 0, topPadPx: 0, bottomPadPx: 0 }
}

export function useEncyclopediaGridWindow(
  args: UseEncyclopediaGridWindowArgs,
): UseEncyclopediaGridWindowResult {
  const {
    itemCount,
    resetKey,
    enabled = true,
    initialEnd = ENCYCLOPEDIA_FIRST_PAGE_SIZE,
    mode,
    runs = [],
    resultsAnchorId = 'ency-results',
  } = args

  const listRef = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState(coldColumns)
  const [rowHeight, setRowHeight] = useState(ENCYCLOPEDIA_CARD_ROW_ESTIMATE_PX)
  const [metricsReady, setMetricsReady] = useState(false)
  const [win, setWin] = useState<IndexWindow>(() =>
    mode === 'family'
      ? initialFamilyWindow(
          runs,
          itemCount,
          coldColumns(),
          ENCYCLOPEDIA_CARD_ROW_ESTIMATE_PX,
          ENCYCLOPEDIA_FAMILY_SECTION_CHROME_PX,
          initialEnd,
        )
      : initialFlatWindow(itemCount, coldColumns(), ENCYCLOPEDIA_CARD_ROW_ESTIMATE_PX, initialEnd),
  )

  const rafRef = useRef<number | null>(null)
  const firstResetRef = useRef(true)
  const columnsRef = useRef(columns)
  const rowHeightRef = useRef(rowHeight)
  const modeRef = useRef(mode)
  const runsRef = useRef(runs)
  const itemCountRef = useRef(itemCount)
  const enabledRef = useRef(enabled)
  const initialEndRef = useRef(initialEnd)
  const metricsReadyRef = useRef(metricsReady)

  columnsRef.current = columns
  rowHeightRef.current = rowHeight
  modeRef.current = mode
  runsRef.current = runs
  itemCountRef.current = itemCount
  enabledRef.current = enabled
  initialEndRef.current = initialEnd
  metricsReadyRef.current = metricsReady

  const recompute = useCallback(() => {
    const n = itemCountRef.current
    const cols = columnsRef.current
    const rowH = Math.max(ENCYCLOPEDIA_CARD_ROW_ESTIMATE_PX, rowHeightRef.current)
    const m = modeRef.current
    const r = runsRef.current
    const initEnd = initialEndRef.current

    if (n <= 0) {
      setWin(emptyWindow())
      return
    }

    // First-frame LCP gate until metrics trusted
    if (!metricsReadyRef.current) {
      setWin(
        m === 'family'
          ? initialFamilyWindow(
              r,
              n,
              cols,
              rowH,
              ENCYCLOPEDIA_FAMILY_SECTION_CHROME_PX,
              initEnd,
            )
          : initialFlatWindow(n, cols, rowH, initEnd),
      )
      return
    }

    // Short-circuit: small lists mount all after first-frame expand
    if (!enabledRef.current || n <= ENCYCLOPEDIA_DOM_WINDOW_SIZE) {
      setWin({
        startIndex: 0,
        endIndex: n,
        startRow: 0,
        endRow: 0,
        topPadPx: 0,
        bottomPadPx: 0,
      })
      return
    }

    const listEl = listRef.current
    const scrollY = typeof window !== 'undefined' ? window.scrollY || window.pageYOffset || 0 : 0
    const viewportH =
      typeof window !== 'undefined' ? window.innerHeight || 800 : 800
    let listTopDoc = 0
    if (listEl) {
      const rect = listEl.getBoundingClientRect()
      listTopDoc = rect.top + scrollY
    }

    if (m === 'family' && r.length > 0) {
      const geometry = computeFamilyListGeometry(
        r,
        n,
        cols,
        rowH,
        ENCYCLOPEDIA_FAMILY_SECTION_CHROME_PX,
      )
      setWin(
        computeFamilyIndexWindow({
          scrollY,
          viewportH,
          listTopDoc,
          geometry,
          itemCount: n,
          windowSize: ENCYCLOPEDIA_DOM_WINDOW_SIZE,
          overscanPx: ENCYCLOPEDIA_WINDOW_OVERSCAN_ROWS * rowH,
          columns: cols,
          rowHeight: rowH,
          sectionChromePx: ENCYCLOPEDIA_FAMILY_SECTION_CHROME_PX,
        }),
      )
      return
    }

    setWin(
      computeIndexWindow({
        scrollY,
        viewportH,
        listTopDoc,
        columns: cols,
        rowHeight: rowH,
        itemCount: n,
        windowSize: ENCYCLOPEDIA_DOM_WINDOW_SIZE,
        overscanRows: ENCYCLOPEDIA_WINDOW_OVERSCAN_ROWS,
      }),
    )
  }, [])

  const scheduleRecompute = useCallback(() => {
    if (rafRef.current != null) return
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null
      // Measure columns / row height from mounted DOM before pad math
      const listEl = listRef.current
      const measuredCols = measureColumnsFromGrid(listEl)
      if (measuredCols != null && measuredCols !== columnsRef.current) {
        setColumns(measuredCols)
        columnsRef.current = measuredCols
      }
      const measuredH = measureFirstCardHeight(listEl)
      if (measuredH != null) {
        const next = Math.max(ENCYCLOPEDIA_CARD_ROW_ESTIMATE_PX, measuredH)
        if (next !== rowHeightRef.current) {
          setRowHeight(next)
          rowHeightRef.current = next
        }
      }
      recompute()
    })
  }, [recompute])

  // resetKey (KD18): first mount = LCP gate; later = scroll-to-results then recompute
  useEffect(() => {
    const applyInitial = () => {
      metricsReadyRef.current = false
      setMetricsReady(false)
      setWin(
        modeRef.current === 'family'
          ? initialFamilyWindow(
              runsRef.current,
              itemCountRef.current,
              columnsRef.current,
              Math.max(ENCYCLOPEDIA_CARD_ROW_ESTIMATE_PX, rowHeightRef.current),
              ENCYCLOPEDIA_FAMILY_SECTION_CHROME_PX,
              initialEndRef.current,
            )
          : initialFlatWindow(
              itemCountRef.current,
              columnsRef.current,
              Math.max(ENCYCLOPEDIA_CARD_ROW_ESTIMATE_PX, rowHeightRef.current),
              initialEndRef.current,
            ),
      )
    }

    if (firstResetRef.current) {
      firstResetRef.current = false
      applyInitial()
      // Double rAF so first paint stays ≤ FIRST_PAGE_SIZE, then expand window
      let cancelled = false
      const id1 = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (cancelled) return
          metricsReadyRef.current = true
          setMetricsReady(true)
          scheduleRecompute()
        })
      })
      return () => {
        cancelled = true
        window.cancelAnimationFrame(id1)
      }
    }

    // Filter / group change: scroll to results, then measure at new scroll position
    applyInitial()
    scrollResultsIntoView(resultsAnchorId)

    let cancelled = false
    const t = window.setTimeout(() => {
      if (cancelled) return
      metricsReadyRef.current = true
      setMetricsReady(true)
      scheduleRecompute()
    }, prefersReducedMotion() ? 0 : 120)

    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [resetKey, resultsAnchorId, scheduleRecompute])

  // itemCount / mode / runs change without resetKey still need recompute
  useLayoutEffect(() => {
    scheduleRecompute()
  }, [itemCount, mode, runs, scheduleRecompute])

  // Scroll + resize listeners
  useEffect(() => {
    const onScrollOrResize = () => scheduleRecompute()
    window.addEventListener('scroll', onScrollOrResize, { passive: true })
    window.addEventListener('resize', onScrollOrResize, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScrollOrResize)
      window.removeEventListener('resize', onScrollOrResize)
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [scheduleRecompute])

  // ResizeObserver on outer list
  useEffect(() => {
    const el = listRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => scheduleRecompute())
    ro.observe(el)
    return () => ro.disconnect()
  }, [scheduleRecompute, itemCount, mode])

  const isWindowing =
    enabled &&
    metricsReady &&
    itemCount > ENCYCLOPEDIA_DOM_WINDOW_SIZE &&
    win.endIndex - win.startIndex < itemCount

  return {
    listRef,
    startIndex: win.startIndex,
    endIndex: win.endIndex,
    topPadPx: win.topPadPx,
    bottomPadPx: win.bottomPadPx,
    columns,
    isWindowing,
    itemCount,
  }
}
