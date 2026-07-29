import { describe, expect, it } from 'vitest'
import {
  formatNotebookPin,
  isNotebookPin,
  listNotebookPinsFromEntries,
  notebookGeoPolicy,
  notebookPinsShareText,
  notebookPinMapHref,
  NOTEBOOK_GEO_POLICY_EN,
  NOTEBOOK_GEO_POLICY_ES,
  parseManualPinInput,
  sanitizeNotebookPin,
  summarizeNotebookPins,
} from './notebookGeo'

describe('notebookGeo (private pins, EXIF stripped)', () => {
  it('sanitizes GPS coords and stamps privacy', () => {
    const pin = sanitizeNotebookPin({
      lat: 41.7632,
      lng: -2.4645,
      accuracy_m: 12.4,
      source: 'gps',
      exifBlob: { dangerous: 'never store' },
    })
    expect(pin).not.toBeNull()
    expect(pin!.privacy).toBe('coords_only_no_exif')
    expect(pin!.lat).toBeCloseTo(41.7632, 4)
    expect(pin!.accuracy_m).toBe(12)
    expect(JSON.stringify(pin)).not.toMatch(/dangerous|exifBlob/i)
  })

  it('rejects invalid / null-island coords', () => {
    expect(sanitizeNotebookPin({ lat: NaN, lng: 1 })).toBeNull()
    expect(sanitizeNotebookPin({ lat: 0, lng: 0 })).toBeNull()
    expect(sanitizeNotebookPin({ lat: 91, lng: 0 })).toBeNull()
  })

  it('parses manual text and formats display', () => {
    const pin = parseManualPinInput('41.12, -2.55')
    expect(pin?.source).toBe('manual')
    expect(formatNotebookPin(pin!)).toMatch(/41\.12/)
    expect(notebookPinMapHref(pin!)).toMatch(/openstreetmap\.org/)
  })

  it('type guard requires privacy stamp', () => {
    expect(isNotebookPin({ lat: 41, lng: -2, source: 'gps' })).toBe(false)
    expect(
      isNotebookPin({
        lat: 41,
        lng: -2,
        source: 'gps',
        privacy: 'coords_only_no_exif',
      }),
    ).toBe(true)
  })

  it('lists private pin table (newest first, no EXIF, not marketplace)', () => {
    const gps = sanitizeNotebookPin({
      lat: 41.76,
      lng: -2.46,
      source: 'gps',
      accuracy_m: 8,
    })!
    const manual = sanitizeNotebookPin({
      lat: 40.4,
      lng: -3.7,
      source: 'manual',
    })!
    const rows = listNotebookPinsFromEntries([
      {
        id: 'old',
        timestamp: 1000,
        pin: manual,
        result: { predictions: [{ species: 'Boletus edulis' }] },
      },
      {
        id: 'new',
        timestamp: 2000,
        pin: gps,
        result: { predictions: [{ species: 'Amanita phalloides' }] },
      },
      {
        id: 'nopin',
        timestamp: 3000,
        pin: null,
        result: { predictions: [{ species: 'X' }] },
      },
      {
        id: 'badpin',
        timestamp: 4000,
        pin: { lat: 41, lng: -2, source: 'gps' },
      },
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0].entryId).toBe('new')
    expect(rows[0].speciesHint).toBe('Amanita phalloides')
    expect(rows[0].source).toBe('gps')
    expect(rows[1].entryId).toBe('old')
    expect(rows[1].source).toBe('manual')
    const summary = summarizeNotebookPins(rows)
    expect(summary).toEqual({ total: 2, gps: 1, manual: 1 })
    const share = notebookPinsShareText(rows, 'en')
    expect(share).toMatch(/private pins|no EXIF|orientation/i)
    expect(share).toMatch(/Amanita phalloides/)
    expect(share).not.toMatch(/exifBlob|marketplace|forage permission/i)
    expect(notebookGeoPolicy('en')).toBe(NOTEBOOK_GEO_POLICY_EN)
    expect(notebookGeoPolicy('es')).toBe(NOTEBOOK_GEO_POLICY_ES)
    expect(NOTEBOOK_GEO_POLICY_ES).toMatch(/sin EXIF|no se sube/i)
  })

  it('policy never implies forage permission', () => {
    expect(NOTEBOOK_GEO_POLICY_ES.toLowerCase()).toMatch(/privado|sin exif|no se sube/)
    expect(NOTEBOOK_GEO_POLICY_ES.toLowerCase()).not.toMatch(/permiso de consumo|safe to eat/)
  })
})
