/**
 * S9 live Identify reject monitor — FE honesty helpers (v1.9.8).
 * Advisory traffic depth · never product_unlock · never forage.
 */

export type S9TrafficDepth = 'empty' | 'sparse' | 'thin' | 'moderate' | 'rich' | 'unknown'

export const S9_SPARSE_N = 5

export function classifyS9TrafficDepth(
  nEntries: number,
  nWithViewLabels = 0,
): S9TrafficDepth {
  const n = Math.max(0, Math.floor(nEntries || 0))
  if (n <= 0) return 'empty'
  if (n < S9_SPARSE_N) return 'sparse'
  if (n < 25) return 'thin'
  if (n < 100) return nWithViewLabels >= 5 ? 'moderate' : 'thin'
  return nWithViewLabels >= 20 ? 'rich' : 'moderate'
}

export type S9MonitorNormalized = {
  status: string
  nEntries: number
  rejectRate: number | null
  trafficDepth: S9TrafficDepth
  topReason: string | null
  modes: Record<string, number>
  nReal: number
  nMock: number
  multiviewLabeled: number
  multiviewGe2: number
  diagFull: number
  healthFlags: string[]
  productUnlock: false
  noteEs: string
  noteEn: string
}

export function s9TrafficNote(
  depth: S9TrafficDepth,
  _locale?: string,
): { es: string; en: string } {
  const notes: Record<S9TrafficDepth, { es: string; en: string }> = {
    empty: {
      es: 'Sin tráfico Identify aún · S9 SKIP · nunca product_unlock.',
      en: 'No Identify traffic yet · S9 SKIP · never product_unlock.',
    },
    sparse: {
      es: 'Muestra escasa · crece con Identificar real · open-set + multi-vista · nunca consumo.',
      en: 'Sparse sample · grow with real Identify · open-set + multi-view · never consumption.',
    },
    thin: {
      es: 'Tráfico fino · aún no basta para tasas estables · solo orientación.',
      en: 'Thin traffic · not enough for stable rates · orientation only.',
    },
    moderate: {
      es: 'Tráfico moderado · revisa razones de rechazo y cobertura multi-vista · nunca unlock.',
      en: 'Moderate traffic · review reject reasons + multi-view coverage · never unlock.',
    },
    rich: {
      es: 'Tráfico rico · sigue sin desbloquear Identify · multi-vista ≠ permiso de consumo.',
      en: 'Rich traffic · still never unlocks Identify · multi-view ≠ consumption permission.',
    },
    unknown: {
      es: 'Profundidad de tráfico desconocida · fail-closed · nunca consumo.',
      en: 'Unknown traffic depth · fail-closed · never consumption.',
    },
  }
  return notes[depth] || notes.unknown
}

/** Normalize live_reject_monitor block from /models/status. */
export function normalizeS9LiveReject(raw: unknown): S9MonitorNormalized {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const mv = (o.multiview && typeof o.multiview === 'object'
    ? o.multiview
    : {}) as Record<string, unknown>
  const modes = (o.modes && typeof o.modes === 'object'
    ? (o.modes as Record<string, number>)
    : {}) as Record<string, number>
  const nEntries = typeof o.n_entries === 'number' ? o.n_entries : 0
  const nLabeled =
    typeof mv.n_with_view_labels === 'number' ? mv.n_with_view_labels : 0
  const depthRaw = String(o.traffic_depth || '')
  const trafficDepth: S9TrafficDepth =
    depthRaw === 'empty' ||
    depthRaw === 'sparse' ||
    depthRaw === 'thin' ||
    depthRaw === 'moderate' ||
    depthRaw === 'rich'
      ? depthRaw
      : classifyS9TrafficDepth(nEntries, nLabeled)
  const note = s9TrafficNote(trafficDepth)
  return {
    status: String(o.status || 'unknown'),
    nEntries,
    rejectRate: typeof o.reject_rate === 'number' ? o.reject_rate : null,
    trafficDepth,
    topReason: o.top_reason != null ? String(o.top_reason) : null,
    modes,
    nReal:
      typeof o.n_real_mode === 'number'
        ? o.n_real_mode
        : typeof modes.real === 'number'
          ? modes.real
          : 0,
    nMock:
      typeof o.n_mock_mode === 'number'
        ? o.n_mock_mode
        : typeof modes.mock === 'number'
          ? modes.mock
          : 0,
    multiviewLabeled: nLabeled,
    multiviewGe2: typeof mv.n_multiview_ge2 === 'number' ? mv.n_multiview_ge2 : 0,
    diagFull:
      typeof mv.n_diag_full_gills_front_detail === 'number'
        ? mv.n_diag_full_gills_front_detail
        : 0,
    healthFlags: Array.isArray(o.health_flags)
      ? o.health_flags.map(String)
      : [],
    productUnlock: false,
    noteEs: note.es,
    noteEn: note.en,
  }
}
