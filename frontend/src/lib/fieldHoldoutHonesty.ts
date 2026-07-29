/**
 * M3 same-specimen multi-view field holdout — product honesty copy.
 * Numbers are educational defaults from local GBIF same-occurrence eval;
 * live values may come from /models/status.multiview_product.field_holdout_m3.
 * Never product_unlock · never forage/consumption permission.
 */

export const FIELD_HOLDOUT_PROTOCOL = 'same_specimen_field_holdout_m3'
export const FIELD_HOLDOUT_VERSION = '1.9.5-m3-field-holdout'

/** Static snapshot from field_multiview_holdout.json (orientation only). */
export const FIELD_HOLDOUT_SNAPSHOT = {
  map3_1: 0.8472,
  map3_2: 0.9167,
  map3_4: 0.9236,
  map3_4_minus_1: 0.0764,
  reject_1: 0.2083,
  reject_4: 0.0625,
  deadly_multiview_flat: true,
  n_eval_packs: 48,
  product_unlock: false as const,
}

export type FieldHoldoutHeadline = {
  map3_4_minus_1?: number | null
  map3_1?: number | null
  map3_4?: number | null
  deadly_multiview_caveat?: boolean
  gates_pass?: boolean | null
}

export function formatMap3Delta(delta: number | null | undefined): string {
  if (delta == null || !Number.isFinite(delta)) return '—'
  const pct = (delta * 100).toFixed(1)
  return `${delta >= 0 ? '+' : ''}${pct} pt`
}

/**
 * Identify / home coach: multi-view helps general packs; deadly may be flat.
 */
export function fieldHoldoutCoachLines(locale?: string): {
  title: string
  body: string
  deadlyNote: string
  policy: string
} {
  const en = (locale || 'es').toLowerCase().startsWith('en')
  const d = formatMap3Delta(FIELD_HOLDOUT_SNAPSHOT.map3_4_minus_1)
  if (en) {
    return {
      title: 'Same-specimen multi-view holdout (field media)',
      body: `On local GBIF multi-photo packs, MAP@3 rises about ${d} from 1→4 views (n≈${FIELD_HOLDOUT_SNAPSHOT.n_eval_packs}). Still orientation only.`,
      deadlyNote:
        'Deadly-only packs can stay flat — multi-view ≠ edible clearance. Keep lookalikes + open-set + mycologist.',
      policy:
        'Never product_unlock from multi-view metrics. Never consumption permission.',
    }
  }
  return {
    title: 'Holdout multi-vista mismo ejemplar (media de campo)',
    body: `En packs GBIF locales multi-foto, MAP@3 sube ~${d} de 1→4 vistas (n≈${FIELD_HOLDOUT_SNAPSHOT.n_eval_packs}). Sigue siendo solo orientación.`,
    deadlyNote:
      'En mortales el multi-vista puede quedar plano — multi-foto ≠ permiso de consumo. Mantén lookalikes + open-set + micólogo.',
    policy:
      'Nunca product_unlock por métricas multi-vista. Nunca permiso de consumo.',
  }
}

/** Normalize API field_holdout_m3 block for dashboard. */
export function normalizeFieldHoldoutApi(raw: unknown): {
  protocol: string
  gatesPass: boolean | null
  map3Delta: number | null
  deadlyCaveat: boolean
  productUnlock: false
  status: string
} {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const headline = (o.headline && typeof o.headline === 'object'
    ? o.headline
    : {}) as Record<string, unknown>
  const readiness = (o.readiness && typeof o.readiness === 'object'
    ? o.readiness
    : {}) as Record<string, unknown>
  const delta =
    typeof headline.map3_4_minus_1 === 'number'
      ? headline.map3_4_minus_1
      : typeof o.map3_4_minus_1 === 'number'
        ? o.map3_4_minus_1
        : null
  return {
    protocol: String(o.protocol || FIELD_HOLDOUT_PROTOCOL),
    gatesPass:
      typeof o.gates_pass === 'boolean'
        ? o.gates_pass
        : typeof (o.gates as { pass?: boolean } | undefined)?.pass === 'boolean'
          ? (o.gates as { pass: boolean }).pass
          : null,
    map3Delta: delta,
    deadlyCaveat: Boolean(o.deadly_multiview_caveat),
    productUnlock: false,
    status: String(readiness.status || o.status || 'unknown'),
  }
}
