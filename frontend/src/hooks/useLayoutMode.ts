/**
 * Reactive layout mode (app | web) for dual store/browser skins.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  type LayoutMode,
  type LayoutModeSource,
  resolveLayoutMode,
  writeStoredLayoutMode,
} from '../lib/layoutMode'

export function useLayoutMode() {
  const initial = resolveLayoutMode()
  const [mode, setModeState] = useState<LayoutMode>(initial.mode)
  const [source, setSource] = useState<LayoutModeSource>(initial.source)

  const apply = useCallback((next: LayoutMode, src: LayoutModeSource) => {
    setModeState(next)
    setSource(src)
    document.documentElement.dataset.layoutMode = next
    document.body.dataset.layoutMode = next
  }, [])

  useEffect(() => {
    const resolved = resolveLayoutMode()
    apply(resolved.mode, resolved.source)

    const onResize = () => {
      // Only re-auto when user hasn't locked a preference and URL doesn't force
      const again = resolveLayoutMode()
      if (again.source === 'auto') {
        apply(again.mode, 'auto')
      }
    }
    window.addEventListener('resize', onResize, { passive: true })
    return () => window.removeEventListener('resize', onResize)
  }, [apply])

  const setMode = useCallback(
    (next: LayoutMode) => {
      writeStoredLayoutMode(next)
      apply(next, 'stored')
      // Keep URL clean unless already forcing
      try {
        const url = new URL(window.location.href)
        if (url.searchParams.has('layout')) {
          url.searchParams.set('layout', next)
          window.history.replaceState({}, '', url.toString())
        }
      } catch {
        /* ignore */
      }
    },
    [apply],
  )

  const resetToAuto = useCallback(() => {
    try {
      localStorage.removeItem('visionsetil_layout_mode')
      const url = new URL(window.location.href)
      url.searchParams.delete('layout')
      window.history.replaceState({}, '', url.toString())
    } catch {
      /* ignore */
    }
    const resolved = resolveLayoutMode({ preferStored: false })
    apply(resolved.mode, 'auto')
  }, [apply])

  return { mode, source, setMode, resetToAuto, isApp: mode === 'app', isWeb: mode === 'web' }
}
