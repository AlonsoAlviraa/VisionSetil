/**
 * Reset window scroll on client-side route changes.
 * Fixes encyclopedia → ficha landing mid-page / at bottom.
 * Double-rAF + short delayed pass: catches late layout from lazy routes/images.
 *
 * Hash deep-links (/educacion#multi-view): do NOT force top — Education (and
 * other anchors) own scrollIntoView after lazy mount.
 */
import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'

/** True when a non-empty URL hash should preserve scroll (deep-link anchors). */
export function shouldSkipScrollToTop(hash: string | null | undefined): boolean {
  if (!hash) return false
  // '#' alone is empty; require an id fragment
  return hash.replace(/^#/, '').length > 0
}

function forceScrollTop() {
  const main = document.getElementById('main-content')
  window.scrollTo(0, 0)
  if (main) main.scrollTop = 0
  document.documentElement.scrollTop = 0
  document.body.scrollTop = 0
}

export function ScrollToTop() {
  const { pathname, hash } = useLocation()

  useLayoutEffect(() => {
    // Deep-link anchors (PhotoCoach / Más → #multi-view): skip force-top race
    if (shouldSkipScrollToTop(hash)) return

    try {
      if ('scrollRestoration' in window.history) {
        window.history.scrollRestoration = 'manual'
      }
    } catch {
      /* ignore */
    }
    forceScrollTop()
    const id0 = requestAnimationFrame(() => {
      forceScrollTop()
      requestAnimationFrame(forceScrollTop)
    })
    // Lazy page content / images can push layout after first paint
    const t1 = window.setTimeout(forceScrollTop, 50)
    const t2 = window.setTimeout(forceScrollTop, 200)
    const t3 = window.setTimeout(forceScrollTop, 400)
    return () => {
      cancelAnimationFrame(id0)
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.clearTimeout(t3)
    }
  }, [pathname, hash])

  return null
}
