/**
 * Freemium entitlements (local-first).
 * Free: core identify (limited), encyclopedia, safety education.
 * Pro: offline pack, expanded history, setadle extras.
 *
 * Demo unlock via localStorage — no payment backend yet.
 * Client quotas are best-effort; production must enforce server-side.
 * Never frames Pro as consumption permission.
 */

import { useCallback, useSyncExternalStore } from 'react'

export type PlanId = 'free' | 'pro'

export const ENTITLEMENTS_KEY = 'visionsetil_plan'
export const IDENTIFY_QUOTA_KEY = 'visionsetil_identify_quota_v1'
/** Fired on same-tab plan changes (storage event covers multi-tab). */
export const PLAN_CHANGE_EVENT = 'visionsetil:plan-change'

/** Free daily identify submissions (calendar day, local). */
export const FREE_IDENTIFY_PER_DAY = 5
/** Free history depth (older entries remain stored but UI/list is capped). */
export const FREE_HISTORY_MAX = 10
/** Pro history depth (also absolute append cap when Pro). */
export const PRO_HISTORY_MAX = 100

export type StorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type IdentifyQuota = {
  /** YYYY-MM-DD local */
  day: string
  used: number
}

/** Product-live gates only (no dead API surface). */
export type FeatureGate =
  | 'identify'
  | 'history_expanded'
  | 'offline_pack'
  | 'offline_priority'
  | 'setadle_unlimited'
  | 'setadle_extra_modes'

function todayKey(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function normalizeUsed(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return null
  return Math.max(0, Math.floor(raw))
}

const planListeners = new Set<() => void>()

function emitPlanChange(): void {
  for (const cb of planListeners) {
    try {
      cb()
    } catch {
      /* ignore subscriber errors */
    }
  }
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new Event(PLAN_CHANGE_EVENT))
    } catch {
      /* ignore */
    }
  }
}

/** Subscribe to plan changes (same-tab + storage multi-tab). */
export function subscribePlan(onStoreChange: () => void): () => void {
  planListeners.add(onStoreChange)
  if (typeof window !== 'undefined') {
    const onStorage = (e: StorageEvent) => {
      if (e.key === ENTITLEMENTS_KEY || e.key === null) onStoreChange()
    }
    const onCustom = () => onStoreChange()
    window.addEventListener('storage', onStorage)
    window.addEventListener(PLAN_CHANGE_EVENT, onCustom)
    return () => {
      planListeners.delete(onStoreChange)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(PLAN_CHANGE_EVENT, onCustom)
    }
  }
  return () => {
    planListeners.delete(onStoreChange)
  }
}

export function getPlanSnapshot(storage: StorageLike = localStorage): PlanId {
  return readPlan(storage)
}

/** React hook: plan re-renders when unlock/deactivate happens anywhere. */
export function usePlan(): PlanId {
  return useSyncExternalStore(
    subscribePlan,
    () => readPlan(),
    () => 'free' as PlanId,
  )
}

export function useIsPro(): boolean {
  return usePlan() === 'pro'
}

export function readPlan(storage: StorageLike = localStorage): PlanId {
  try {
    const raw = storage.getItem(ENTITLEMENTS_KEY)
    if (raw === 'pro') return 'pro'
    return 'free'
  } catch {
    return 'free'
  }
}

export function writePlan(plan: PlanId, storage: StorageLike = localStorage): PlanId {
  try {
    if (plan === 'pro') storage.setItem(ENTITLEMENTS_KEY, 'pro')
    else storage.removeItem(ENTITLEMENTS_KEY)
  } catch {
    /* ignore quota / private mode */
  }
  emitPlanChange()
  return plan
}

export function isPro(storage: StorageLike = localStorage): boolean {
  return readPlan(storage) === 'pro'
}

/** Soft demo unlock — product packaging only, not a payment flow. */
export function activateProDemo(storage: StorageLike = localStorage): PlanId {
  return writePlan('pro', storage)
}

export function deactivatePro(storage: StorageLike = localStorage): PlanId {
  return writePlan('free', storage)
}

export function historyLimit(plan: PlanId = readPlan()): number {
  return plan === 'pro' ? PRO_HISTORY_MAX : FREE_HISTORY_MAX
}

/** Visible history list for Free/Pro UI (always re-apply after store writes). */
export function sliceHistoryForPlan<T>(entries: T[], plan: PlanId = readPlan()): T[] {
  return entries.slice(0, historyLimit(plan))
}

export function readIdentifyQuota(storage: StorageLike = localStorage): IdentifyQuota {
  const day = todayKey()
  try {
    const raw = storage.getItem(IDENTIFY_QUOTA_KEY)
    if (!raw) return { day, used: 0 }
    const parsed = JSON.parse(raw) as Partial<IdentifyQuota>
    if (!parsed || parsed.day !== day) {
      return { day, used: 0 }
    }
    const used = normalizeUsed(parsed.used)
    if (used === null) return { day, used: 0 }
    return { day, used }
  } catch {
    return { day, used: 0 }
  }
}

export function writeIdentifyQuota(
  quota: IdentifyQuota,
  storage: StorageLike = localStorage,
): void {
  const used = normalizeUsed(quota.used)
  const safe: IdentifyQuota = {
    day: quota.day || todayKey(),
    used: used === null ? 0 : used,
  }
  try {
    storage.setItem(IDENTIFY_QUOTA_KEY, JSON.stringify(safe))
  } catch {
    /* ignore */
  }
}

export type IdentifyGateResult = {
  allowed: boolean
  plan: PlanId
  used: number
  limit: number | null
  remaining: number | null
  reason?: 'quota_exhausted'
}

/** Check whether a free/pro user may submit another identify today. */
export function canIdentify(storage: StorageLike = localStorage): IdentifyGateResult {
  const plan = readPlan(storage)
  if (plan === 'pro') {
    const q = readIdentifyQuota(storage)
    return {
      allowed: true,
      plan,
      used: q.used,
      limit: null,
      remaining: null,
    }
  }
  const q = readIdentifyQuota(storage)
  const used = Number.isFinite(q.used) ? q.used : 0
  const remaining = Math.max(0, FREE_IDENTIFY_PER_DAY - used)
  if (remaining <= 0) {
    return {
      allowed: false,
      plan,
      used,
      limit: FREE_IDENTIFY_PER_DAY,
      remaining: 0,
      reason: 'quota_exhausted',
    }
  }
  return {
    allowed: true,
    plan,
    used,
    limit: FREE_IDENTIFY_PER_DAY,
    remaining,
  }
}

/**
 * Atomically reserve one Free identify slot before network I/O.
 * Pro: no-op reservation (still allowed). Returns gate after reserve.
 * On classify failure, call `rollbackIdentifyUse`.
 * Note: real production quotas must be enforced server-side.
 */
export function reserveIdentifyUse(
  storage: StorageLike = localStorage,
): IdentifyGateResult & { reserved: boolean } {
  const before = canIdentify(storage)
  if (!before.allowed) {
    return { ...before, reserved: false }
  }
  if (before.plan === 'free') {
    recordIdentifyUse(storage)
    const after = canIdentify(storage)
    // reserved means we burned a slot; allowed reflects post-reserve remaining for UI
    return {
      allowed: true,
      plan: 'free',
      used: after.used,
      limit: FREE_IDENTIFY_PER_DAY,
      remaining: after.remaining,
      reserved: true,
    }
  }
  // Pro: track for honesty UI only after success path prefers recordIdentifyUse;
  // reserve does not increment for Pro to keep "failed don't burn" for Pro stats.
  return { ...before, reserved: false }
}

/** Undo a Free reserve when classify fails (network/API). */
export function rollbackIdentifyUse(storage: StorageLike = localStorage): IdentifyQuota {
  const day = todayKey()
  const prev = readIdentifyQuota(storage)
  if (prev.day !== day || prev.used <= 0) {
    return { day, used: prev.day === day ? prev.used : 0 }
  }
  const next = { day, used: prev.used - 1 }
  writeIdentifyQuota(next, storage)
  return next
}

/** Call after a successful classify (Pro tracking / free already reserved). */
export function recordIdentifyUse(storage: StorageLike = localStorage): IdentifyQuota {
  const day = todayKey()
  const prev = readIdentifyQuota(storage)
  const base = prev.day === day && Number.isFinite(prev.used) ? prev.used : 0
  const used = base + 1
  const next = { day, used }
  writeIdentifyQuota(next, storage)
  return next
}

export type FeatureAccess = {
  allowed: boolean
  plan: PlanId
  feature: FeatureGate
  /** Short ES reason for UI */
  messageEs: string
}

const PRO_ONLY: FeatureGate[] = [
  'offline_pack',
  'offline_priority',
  'history_expanded',
  'setadle_unlimited',
  'setadle_extra_modes',
]

export function canAccess(
  feature: FeatureGate,
  storage: StorageLike = localStorage,
): FeatureAccess {
  const plan = readPlan(storage)
  if (plan === 'pro' || !PRO_ONLY.includes(feature)) {
    return {
      allowed: true,
      plan,
      feature,
      messageEs: '',
    }
  }
  const messages: Record<FeatureGate, string> = {
    identify: 'Límite diario de identificaciones Free alcanzado.',
    history_expanded: 'El historial ampliado es Pro (Free guarda las últimas 10).',
    offline_pack: 'Descargar el pack offline completo es Pro.',
    offline_priority: 'El pack prioritario T0/T1 es Pro.',
    setadle_unlimited: 'Modo ilimitado de Setadle es Pro.',
    setadle_extra_modes: 'Modos extra de Setadle son Pro.',
  }
  return {
    allowed: false,
    plan,
    feature,
    messageEs: messages[feature],
  }
}

/**
 * Free can open offline page and preview list; install is Pro-gated.
 * Preview is always allowed for Free (list UI only — no Cache API install).
 */
export function canInstallOfflinePack(
  kind: 'season' | 'priority',
  storage: StorageLike = localStorage,
): FeatureAccess {
  if (kind === 'priority') return canAccess('offline_priority', storage)
  return canAccess('offline_pack', storage)
}

/** Free users may always preview pack taxa lists (no download). */
export function canPreviewOfflinePack(_storage: StorageLike = localStorage): boolean {
  return true
}

export function planLabelEs(plan: PlanId): string {
  return plan === 'pro' ? 'Pro' : 'Free'
}

export function freeVsProRows(): Array<{ feature: string; free: string; pro: string }> {
  return [
    {
      feature: 'Identificar (orientación de campo)',
      free: `${FREE_IDENTIFY_PER_DAY}/día`,
      pro: 'Ilimitado',
    },
    {
      feature: 'Enciclopedia y educación de seguridad',
      free: 'Incluido',
      pro: 'Incluido',
    },
    {
      feature: 'Historial local',
      free: `${FREE_HISTORY_MAX} entradas`,
      pro: `${PRO_HISTORY_MAX} entradas`,
    },
    {
      feature: 'Pack offline (fichas + fotos de estudio)',
      free: 'Vista previa del listado',
      pro: 'Descarga temporada + prioritario',
    },
    {
      feature: 'Setadle',
      free: 'Diario clásico',
      pro: 'Ilimitado + modos extra',
    },
    {
      feature: 'Mapa cotos / parques (enlaces oficiales)',
      free: 'Incluido',
      pro: 'Incluido',
    },
  ]
}

/** Hook helpers for pages that need plan + activate/deactivate without local useState drift. */
export function usePlanActions() {
  const plan = usePlan()
  const unlock = useCallback(() => activateProDemo(), [])
  const lock = useCallback(() => deactivatePro(), [])
  return { plan, isPro: plan === 'pro', unlock, lock }
}
