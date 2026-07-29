/**
 * Dual product layout:
 * - `app`  → iOS / Play Store / PWA shell (phone canvas, Stitch B)
 * - `web`  → browser page (wide, large spacing, multi-column)
 *
 * Resolution order:
 * 1) URL `?layout=app|web`
 * 2) localStorage `visionsetil_layout_mode`
 * 3) auto: standalone PWA or narrow viewport → app; else web
 */

export type LayoutMode = 'app' | 'web'
export type LayoutModeSource = 'url' | 'stored' | 'auto'

export const LAYOUT_MODE_KEY = 'visionsetil_layout_mode'
export const LAYOUT_MODES: LayoutMode[] = ['app', 'web']

export function isLayoutMode(value: unknown): value is LayoutMode {
  return value === 'app' || value === 'web'
}

export function isStandaloneAppShell(): boolean {
  if (typeof window === 'undefined') return false
  const mq = window.matchMedia?.('(display-mode: standalone)')?.matches
  const iosStandalone = Boolean(
    (navigator as Navigator & { standalone?: boolean }).standalone,
  )
  return Boolean(mq || iosStandalone)
}

export function autoLayoutMode(viewportWidth?: number): LayoutMode {
  if (typeof window !== 'undefined' && isStandaloneAppShell()) return 'app'
  const w =
    typeof viewportWidth === 'number'
      ? viewportWidth
      : typeof window !== 'undefined'
        ? window.innerWidth
        : 1200
  // Phones & small tablets default to store-like shell
  if (w < 900) return 'app'
  return 'web'
}

export function readStoredLayoutMode(): LayoutMode | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(LAYOUT_MODE_KEY)
    return isLayoutMode(raw) ? raw : null
  } catch {
    return null
  }
}

export function writeStoredLayoutMode(mode: LayoutMode): void {
  try {
    localStorage.setItem(LAYOUT_MODE_KEY, mode)
  } catch {
    /* private mode / quota */
  }
}

export function readUrlLayoutMode(search?: string): LayoutMode | null {
  if (typeof window === 'undefined' && search == null) return null
  const q = new URLSearchParams(search ?? window.location.search)
  const raw = q.get('layout')
  return isLayoutMode(raw) ? raw : null
}

export function resolveLayoutMode(opts?: {
  search?: string
  viewportWidth?: number
  preferStored?: boolean
}): { mode: LayoutMode; source: LayoutModeSource } {
  const fromUrl = readUrlLayoutMode(opts?.search)
  if (fromUrl) return { mode: fromUrl, source: 'url' }

  if (opts?.preferStored !== false) {
    const stored = readStoredLayoutMode()
    if (stored) return { mode: stored, source: 'stored' }
  }

  return { mode: autoLayoutMode(opts?.viewportWidth), source: 'auto' }
}

export function layoutModeLabelEs(mode: LayoutMode): string {
  return mode === 'app' ? 'Modo app' : 'Modo web'
}

export function layoutModeHintEs(mode: LayoutMode): string {
  return mode === 'app'
    ? 'Vista tienda (iOS / Play / PWA)'
    : 'Vista navegador (ancha y espaciada)'
}
