/**
 * Reset window scroll on client-side route changes.
 * Fixes encyclopedia → ficha landing mid-page / at bottom.
 * Double-rAF + short delayed pass: catches late layout from lazy routes/images.
 */
import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'

function forceScrollTop() {
  const main = document.getElementById('main-content')
  window.scrollTo(0, 0)
  if (main) main.scrollTop = 0
  document.documentElement.scrollTop = 0
  document.body.scrollTop = 0
}

export function ScrollToTop() {
  const { pathname } = useLocation()

  useLayoutEffect(() => {
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
  }, [pathname])

  return null
}
