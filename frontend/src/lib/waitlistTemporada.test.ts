import { describe, expect, it } from 'vitest'
import {
  WAITLIST_NOTE_MAX,
  clearWaitlist,
  clampWaitlistNote,
  isValidWaitlistEmail,
  joinWaitlist,
  maskEmail,
  readWaitlist,
  regionLabelEs,
  temporadaBlurbEs,
  temporadaHeadlineEs,
  type StorageLike,
} from './waitlistTemporada'

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

describe('waitlist temporada', () => {
  it('validates emails', () => {
    expect(isValidWaitlistEmail('a@b.co')).toBe(true)
    expect(isValidWaitlistEmail('bad')).toBe(false)
    expect(isValidWaitlistEmail('')).toBe(false)
  })

  it('joins and reads local waitlist', () => {
    const s = memoryStorage()
    const res = joinWaitlist({ email: 'A@Example.COM', region: 'soria', source: 'test' }, s)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.already).toBe(false)
    expect(res.entry.email).toBe('a@example.com')
    expect(res.entry.region).toBe('soria')
    const again = joinWaitlist({ email: 'a@example.com', region: 'cyl' }, s)
    expect(again.ok && again.already).toBe(true)
    expect(readWaitlist(s)?.region).toBe('cyl')
    clearWaitlist(s)
    expect(readWaitlist(s)).toBeNull()
  })

  it('rejects invalid email', () => {
    const s = memoryStorage()
    const res = joinWaitlist({ email: 'not-an-email' }, s)
    expect(res.ok).toBe(false)
  })

  it('has seasonal safety-first copy', () => {
    expect(temporadaHeadlineEs(10)).toMatch(/otoño|Soria|CyL/i)
    expect(temporadaBlurbEs()).toMatch(/no es permiso/i)
    expect(regionLabelEs('soria')).toMatch(/Soria/)
  })

  it('caps note length and masks email', () => {
    const long = 'x'.repeat(WAITLIST_NOTE_MAX + 50)
    expect(clampWaitlistNote(long)?.length).toBe(WAITLIST_NOTE_MAX)
    expect(maskEmail('alice@example.com')).toBe('a***@example.com')
    const s = memoryStorage()
    const res = joinWaitlist({ email: 'bob@test.co', note: long, region: 'spain' }, s)
    expect(res.ok && res.entry.note?.length).toBe(WAITLIST_NOTE_MAX)
  })
})
