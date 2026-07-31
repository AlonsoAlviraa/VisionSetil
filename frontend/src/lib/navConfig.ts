/**
 * Nav SSOT — single source for Header primary, BottomNav, Más hub.
 * Architecture migration M1 (v1.15).
 *
 * Rules:
 * - Bottom nav: 5 tabs only (Inicio · Identificar · Juegos · Enciclopedia · Más)
 * - Header primary (web/desktop): may include Mapa for discovery
 * - Más overflow: never duplicates bottom-nav primary destinations (except
 *   games modes under learn, which are children of /juegos)
 * - Map is NOT a bottom tab (product lock B4 chrome; B4 = keep map UX)
 */

export type NavLabel = {
  labelKey: string
  fallback: string
}

export type PrimaryNavItem = NavLabel & {
  to: string
  /** Highlight as product CTA (Identify) */
  cta?: boolean
  /** Header desktop primary only (not bottom nav) */
  headerOnly?: boolean
}

export type BottomTabItem = NavLabel & {
  to: string
  testId: string
  end?: boolean
  primary?: boolean
  icon: string
  match?: (pathname: string) => boolean
}

export type MoreNavItem = NavLabel & {
  to: string
  blurbKey: string
  blurbFallback: string
  /** Material Symbols name for Más hub tiles */
  glyph?: string
  badge?: 'dev'
  testId?: string
}

export type MoreNavGroup = {
  id: string
  titleKey: string
  titleFallback: string
  glyph?: string
  items: MoreNavItem[]
}

/** Desktop / web header primary strip */
export const PRIMARY_NAV: readonly PrimaryNavItem[] = [
  { to: '/', labelKey: 'nav.home', fallback: 'Inicio' },
  { to: '/identificar', labelKey: 'nav.identify', fallback: 'Identificar', cta: true },
  { to: '/juegos', labelKey: 'nav.games', fallback: 'Juegos' },
  { to: '/enciclopedia', labelKey: 'nav.encyclopedia', fallback: 'Enciclopedia' },
  { to: '/mapa', labelKey: 'nav.map', fallback: 'Mapa', headerOnly: true },
] as const

/** Phone bottom nav (5 tabs) — map lives under Más */
export const BOTTOM_TABS: readonly BottomTabItem[] = [
  {
    to: '/',
    end: true,
    labelKey: 'nav.home',
    fallback: 'Inicio',
    testId: 'bottom-nav-home',
    icon: 'home',
  },
  {
    to: '/identificar',
    labelKey: 'nav.identify',
    fallback: 'Identificar',
    testId: 'bottom-nav-identify',
    primary: true,
    icon: 'center_focus',
  },
  {
    to: '/juegos',
    labelKey: 'nav.games',
    fallback: 'Juegos',
    testId: 'bottom-nav-games',
    icon: 'sports_esports',
    match: (p) =>
      p.startsWith('/juegos') ||
      p.startsWith('/setadle') ||
      p.startsWith('/wordle') ||
      p.startsWith('/reto'),
  },
  {
    to: '/enciclopedia',
    labelKey: 'nav.encyclopedia',
    fallback: 'Enciclopedia',
    testId: 'bottom-nav-ency',
    icon: 'menu_book',
    match: (p) => p.startsWith('/enciclopedia'),
  },
  {
    to: '/mas',
    labelKey: 'nav.more',
    fallback: 'Más',
    testId: 'bottom-nav-more',
    icon: 'apps',
    match: (p) =>
      p.startsWith('/mas') ||
      p.startsWith('/mapa') ||
      p.startsWith('/educacion') ||
      p.startsWith('/lookalikes') ||
      p.startsWith('/historial') ||
      p.startsWith('/offline') ||
      p.startsWith('/comunidad') ||
      p.startsWith('/revision') ||
      p.startsWith('/ml') ||
      p.startsWith('/beta') ||
      p.startsWith('/login') ||
      p.startsWith('/registro'),
  },
] as const

/**
 * Más hub + Header overflow panel.
 * Does not re-list /juegos or /mapa as peer of primary nav destinations
 * on Header: mapa is header-only primary; hub still exposes map under Campo.
 */
export const MORE_NAV_GROUPS: readonly MoreNavGroup[] = [
  {
    id: 'learn',
    titleKey: 'nav.moreGroup.learn',
    titleFallback: 'Aprender',
    glyph: 'school',
    items: [
      {
        to: '/educacion',
        labelKey: 'nav.education',
        fallback: 'Educación',
        blurbKey: 'nav.blurb.education',
        blurbFallback: 'Seguridad y campo',
        glyph: 'school',
      },
      {
        to: '/lookalikes',
        labelKey: 'nav.lookalikes',
        fallback: 'Confusiones',
        blurbKey: 'nav.blurb.lookalikes',
        blurbFallback: 'Especies que se parecen',
        glyph: 'compare',
      },
      {
        to: '/setadle',
        labelKey: 'nav.setadle',
        fallback: 'Setadle',
        blurbKey: 'nav.blurb.setadle',
        blurbFallback: 'Adivina la seta',
        glyph: 'extension',
      },
      {
        to: '/reto',
        labelKey: 'nav.quiz',
        fallback: 'Reto',
        blurbKey: 'nav.blurb.quiz',
        blurbFallback: 'Quiz diario',
        glyph: 'quiz',
      },
      {
        to: '/wordle',
        labelKey: 'nav.wordle',
        fallback: 'Wordle setas',
        blurbKey: 'nav.blurb.wordle',
        blurbFallback: 'Letras del nombre',
        glyph: 'spellcheck',
      },
    ],
  },
  {
    id: 'field',
    titleKey: 'nav.moreGroup.field',
    titleFallback: 'Campo',
    glyph: 'terrain',
    items: [
      {
        to: '/mapa',
        labelKey: 'nav.map',
        fallback: 'Mapa',
        blurbKey: 'nav.blurb.map',
        blurbFallback: 'Cotos y zonas',
        glyph: 'map',
      },
      {
        to: '/historial',
        labelKey: 'nav.notebook',
        fallback: 'Cuaderno',
        blurbKey: 'nav.blurb.notebook',
        blurbFallback: 'Tus observaciones',
        glyph: 'edit_note',
      },
      {
        to: '/offline',
        labelKey: 'nav.offline',
        fallback: 'Sin red',
        blurbKey: 'nav.blurb.offline',
        blurbFallback: 'Fichas sin conexión',
        glyph: 'cloud_off',
      },
    ],
  },
  {
    id: 'people',
    titleKey: 'nav.moreGroup.people',
    titleFallback: 'Comunidad',
    glyph: 'groups',
    items: [
      {
        to: '/comunidad',
        labelKey: 'nav.community',
        fallback: 'Comunidad',
        blurbKey: 'nav.blurb.community',
        blurbFallback: 'Opiniones humanas',
        glyph: 'forum',
      },
      {
        to: '/revision-experta',
        labelKey: 'nav.experts',
        fallback: 'Revisión experta',
        blurbKey: 'nav.blurb.experts',
        blurbFallback: 'Envío a un micólogo',
        glyph: 'support_agent',
      },
      {
        to: '/login',
        labelKey: 'nav.login',
        fallback: 'Entrar',
        blurbKey: 'nav.blurb.login',
        blurbFallback: 'Cuenta local',
        glyph: 'person',
      },
    ],
  },
  {
    id: 'dev',
    titleKey: 'nav.moreGroup.dev',
    titleFallback: 'Desarrollo',
    glyph: 'science',
    items: [
      {
        to: '/ml',
        labelKey: 'nav.ml',
        fallback: 'ML',
        blurbKey: 'nav.blurb.ml',
        blurbFallback: 'Lab del modelo',
        glyph: 'science',
        badge: 'dev',
      },
      {
        to: '/beta-feedback',
        labelKey: 'nav.beta',
        fallback: 'Beta',
        blurbKey: 'nav.blurb.beta',
        blurbFallback: 'Feedback de cohorte',
        glyph: 'feedback',
      },
    ],
  },
] as const

/** Flat overflow list (Header panel order). */
export const MORE_NAV_FLAT: MoreNavItem[] = MORE_NAV_GROUPS.flatMap((g) => [...g.items])

/** Header primary items (includes headerOnly destinations). */
export function headerPrimaryNav(): PrimaryNavItem[] {
  return [...PRIMARY_NAV]
}

export function isBottomTabActive(tab: BottomTabItem, pathname: string): boolean {
  if (tab.match) return tab.match(pathname)
  if (tab.end) return pathname === tab.to
  return pathname.startsWith(tab.to)
}

/** Whether a path is covered by the Más hub / bottom Más tab. */
export function isMorePath(pathname: string): boolean {
  const more = BOTTOM_TABS.find((t) => t.to === '/mas')
  return more?.match?.(pathname) ?? pathname.startsWith('/mas')
}
