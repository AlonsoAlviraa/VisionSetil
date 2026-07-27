import { describe, expect, it } from 'vitest'
import {
  FREE_HISTORY_MAX,
  FREE_IDENTIFY_PER_DAY,
  PRO_HISTORY_MAX,
  activateProDemo,
  canAccess,
  canIdentify,
  canInstallOfflinePack,
  canPreviewOfflinePack,
  deactivatePro,
  freeVsProRows,
  historyLimit,
  readIdentifyQuota,
  readPlan,
  recordIdentifyUse,
  reserveIdentifyUse,
  rollbackIdentifyUse,
  sliceHistoryForPlan,
  writeIdentifyQuota,
  writePlan,
  type StorageLike,
} from './entitlements'

function memoryStorage(): StorageLike & { store: Record<string, string> } {
  const store: Record<string, string> = {}
  return {
    store,
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = v
    },
    removeItem: (k) => {
      delete store[k]
    },
  }
}

describe('entitlements freemium', () => {
  it('defaults to free plan', () => {
    const s = memoryStorage()
    expect(readPlan(s)).toBe('free')
    expect(historyLimit(readPlan(s))).toBe(FREE_HISTORY_MAX)
  })

  it('activates and deactivates pro demo', () => {
    const s = memoryStorage()
    expect(activateProDemo(s)).toBe('pro')
    expect(readPlan(s)).toBe('pro')
    expect(historyLimit(readPlan(s))).toBe(PRO_HISTORY_MAX)
    expect(deactivatePro(s)).toBe('free')
    expect(readPlan(s)).toBe('free')
  })

  it('gates identify quota for free users', () => {
    const s = memoryStorage()
    writeIdentifyQuota({ day: readIdentifyQuota(s).day, used: 0 }, s)
    for (let i = 0; i < FREE_IDENTIFY_PER_DAY; i++) {
      expect(canIdentify(s).allowed).toBe(true)
      recordIdentifyUse(s)
    }
    const blocked = canIdentify(s)
    expect(blocked.allowed).toBe(false)
    expect(blocked.reason).toBe('quota_exhausted')
    expect(blocked.remaining).toBe(0)
  })

  it('rejects NaN / non-finite used in quota (no unlimited Free leak)', () => {
    const s = memoryStorage()
    const day = readIdentifyQuota(s).day
    s.setItem('visionsetil_identify_quota_v1', JSON.stringify({ day, used: NaN }))
    const q = readIdentifyQuota(s)
    expect(q.used).toBe(0)
    expect(canIdentify(s).allowed).toBe(true)
    expect(Number.isFinite(canIdentify(s).remaining)).toBe(true)

    s.setItem('visionsetil_identify_quota_v1', JSON.stringify({ day, used: null }))
    expect(readIdentifyQuota(s).used).toBe(0)

    s.setItem('visionsetil_identify_quota_v1', JSON.stringify({ day, used: -3 }))
    expect(readIdentifyQuota(s).used).toBe(0)

    s.setItem('visionsetil_identify_quota_v1', JSON.stringify({ day, used: '4' }))
    expect(readIdentifyQuota(s).used).toBe(0)
  })

  it('day rollover resets quota', () => {
    const s = memoryStorage()
    s.setItem(
      'visionsetil_identify_quota_v1',
      JSON.stringify({ day: '1999-01-01', used: FREE_IDENTIFY_PER_DAY }),
    )
    const q = readIdentifyQuota(s)
    expect(q.day).not.toBe('1999-01-01')
    expect(q.used).toBe(0)
    expect(canIdentify(s).allowed).toBe(true)
  })

  it('reserveIdentifyUse is atomic for Free; rollback restores slot', () => {
    const s = memoryStorage()
    writeIdentifyQuota({ day: readIdentifyQuota(s).day, used: FREE_IDENTIFY_PER_DAY - 1 }, s)
    const r1 = reserveIdentifyUse(s)
    expect(r1.reserved).toBe(true)
    expect(canIdentify(s).allowed).toBe(false)
    // Second reserve blocked
    const r2 = reserveIdentifyUse(s)
    expect(r2.reserved).toBe(false)
    expect(r2.allowed).toBe(false)
    rollbackIdentifyUse(s)
    expect(canIdentify(s).allowed).toBe(true)
  })

  it('pro identify never blocked by quota', () => {
    const s = memoryStorage()
    activateProDemo(s)
    writeIdentifyQuota({ day: readIdentifyQuota(s).day, used: 999 }, s)
    expect(canIdentify(s).allowed).toBe(true)
    expect(canIdentify(s).limit).toBeNull()
    expect(reserveIdentifyUse(s).reserved).toBe(false)
  })

  it('offline pack install is pro-gated; preview always free', () => {
    const s = memoryStorage()
    expect(canPreviewOfflinePack(s)).toBe(true)
    expect(canInstallOfflinePack('season', s).allowed).toBe(false)
    expect(canInstallOfflinePack('priority', s).allowed).toBe(false)
    activateProDemo(s)
    expect(canInstallOfflinePack('season', s).allowed).toBe(true)
    expect(canInstallOfflinePack('priority', s).allowed).toBe(true)
  })

  it('setadle extras and history expanded are pro-only', () => {
    const s = memoryStorage()
    expect(canAccess('setadle_unlimited', s).allowed).toBe(false)
    expect(canAccess('history_expanded', s).allowed).toBe(false)
    activateProDemo(s)
    expect(canAccess('setadle_unlimited', s).allowed).toBe(true)
    expect(canAccess('history_expanded', s).allowed).toBe(true)
  })

  it('sliceHistoryForPlan enforces Free/Pro depth', () => {
    const items = Array.from({ length: 50 }, (_, i) => i)
    expect(sliceHistoryForPlan(items, 'free')).toHaveLength(FREE_HISTORY_MAX)
    expect(sliceHistoryForPlan(items, 'pro')).toHaveLength(50)
    const big = Array.from({ length: 150 }, (_, i) => i)
    expect(sliceHistoryForPlan(big, 'pro')).toHaveLength(PRO_HISTORY_MAX)
  })

  it('exposes free vs pro comparison rows', () => {
    const rows = freeVsProRows()
    expect(rows.length).toBeGreaterThanOrEqual(4)
    expect(rows.some((r) => /Identificar/i.test(r.feature))).toBe(true)
    expect(rows.some((r) => /offline/i.test(r.feature))).toBe(true)
  })

  it('writePlan persists pro flag', () => {
    const s = memoryStorage()
    writePlan('pro', s)
    expect(s.getItem('visionsetil_plan')).toBe('pro')
    writePlan('free', s)
    expect(s.getItem('visionsetil_plan')).toBeNull()
  })
})
