/**
 * Waitlist temporada — local-first (email + region in localStorage).
 * Seasonal messaging for Spain / Soria / Castilla y León.
 * No backend required; safe to upgrade later to API stub.
 */

export const WAITLIST_KEY = 'visionsetil_waitlist_temporada_v1'
export const WAITLIST_NOTE_MAX = 200

export type WaitlistRegion = 'soria' | 'cyl' | 'spain' | 'other'

export type WaitlistEntry = {
  email: string
  region: WaitlistRegion
  /** ISO timestamp */
  joinedAt: string
  /** Optional free-text interest (capped) */
  note?: string
  source?: string
}

export type StorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidWaitlistEmail(email: string): boolean {
  const e = email.trim().toLowerCase()
  if (e.length < 5 || e.length > 120) return false
  return EMAIL_RE.test(e)
}

export function normalizeRegion(raw: string | null | undefined): WaitlistRegion {
  const v = (raw || '').toLowerCase().trim()
  if (v === 'soria' || v === 'cyl' || v === 'spain' || v === 'other') return v
  return 'spain'
}

export function regionLabelEs(region: WaitlistRegion): string {
  switch (region) {
    case 'soria':
      return 'Soria / Pinares'
    case 'cyl':
      return 'Castilla y León'
    case 'spain':
      return 'España (general)'
    case 'other':
      return 'Otra zona'
    default:
      return 'España'
  }
}

/** Mask email for UI display (device-local waitlist; still reduce shoulder-surf PII). */
export function maskEmail(email: string): string {
  const e = email.trim().toLowerCase()
  const at = e.indexOf('@')
  if (at <= 0) return '***'
  const local = e.slice(0, at)
  const domain = e.slice(at + 1)
  const head = local.slice(0, 1) || '*'
  return `${head}***@${domain}`
}

export function clampWaitlistNote(note: string | undefined | null): string | undefined {
  if (!note) return undefined
  const t = note.trim()
  if (!t) return undefined
  return t.length > WAITLIST_NOTE_MAX ? t.slice(0, WAITLIST_NOTE_MAX) : t
}

export function readWaitlist(storage: StorageLike = localStorage): WaitlistEntry | null {
  try {
    const raw = storage.getItem(WAITLIST_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as WaitlistEntry
    if (!parsed?.email || !isValidWaitlistEmail(parsed.email)) return null
    return {
      email: parsed.email.trim().toLowerCase(),
      region: normalizeRegion(parsed.region),
      joinedAt: parsed.joinedAt || new Date().toISOString(),
      note: clampWaitlistNote(parsed.note),
      source: parsed.source,
    }
  } catch {
    return null
  }
}

export type JoinWaitlistResult =
  | { ok: true; entry: WaitlistEntry; already: boolean }
  | { ok: false; error: 'invalid_email' | 'storage' }

export function joinWaitlist(
  input: { email: string; region?: string; note?: string; source?: string },
  storage: StorageLike = localStorage,
): JoinWaitlistResult {
  const email = input.email.trim().toLowerCase()
  if (!isValidWaitlistEmail(email)) {
    return { ok: false, error: 'invalid_email' }
  }
  const existing = readWaitlist(storage)
  if (existing && existing.email === email) {
    const entry: WaitlistEntry = {
      ...existing,
      region: normalizeRegion(input.region ?? existing.region),
      note: clampWaitlistNote(input.note ?? existing.note),
      source: input.source || existing.source,
    }
    try {
      storage.setItem(WAITLIST_KEY, JSON.stringify(entry))
    } catch {
      return { ok: false, error: 'storage' }
    }
    return { ok: true, entry, already: true }
  }
  const entry: WaitlistEntry = {
    email,
    region: normalizeRegion(input.region),
    joinedAt: new Date().toISOString(),
    note: clampWaitlistNote(input.note),
    source: input.source || 'home',
  }
  try {
    storage.setItem(WAITLIST_KEY, JSON.stringify(entry))
  } catch {
    return { ok: false, error: 'storage' }
  }
  return { ok: true, entry, already: false }
}

export function clearWaitlist(storage: StorageLike = localStorage): void {
  try {
    storage.removeItem(WAITLIST_KEY)
  } catch {
    /* ignore */
  }
}

export function temporadaHeadlineEs(month = new Date().getMonth() + 1): string {
  if (month >= 9 && month <= 12) {
    return 'Temporada de otoño · Soria y CyL'
  }
  if (month >= 3 && month <= 5) {
    return 'Temporada de primavera · marzuelos y más'
  }
  if (month >= 6 && month <= 8) {
    return 'Prepara la temporada · waitlist VisionSetil'
  }
  return 'Waitlist temporada micológica · España'
}

export function temporadaBlurbEs(): string {
  return 'Avisos de temporada para estudiar fichas y cotos (Soria, CyL y España). Orientación educativa — no es permiso de recolección ni de consumo.'
}
