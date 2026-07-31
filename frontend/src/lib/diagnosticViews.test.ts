import { describe, expect, it } from 'vitest'
import {
  deadlyCoach,
  deadlyDiagnosticPairs,
  deadlyPriorityViews,
  diagnosticForLookalikeMate,
  diagnosticPolicy,
  findDiagnosticPair,
  isDeadlyCriticalView,
  missingDeadlyCriticalViews,
  missingPairCriticalViews,
} from './diagnosticViews'
import { CLASSIC_LOOKALIKE_PAIRS } from './lookalikeStudio'

describe('diagnosticViews (deadly multi-view coaching)', () => {
  it('priority views start with gills/front (diagnostic)', () => {
    const p = deadlyPriorityViews()
    expect(p[0]).toBe('gills')
    expect(p).toContain('front')
    expect(p).toContain('detail')
  })

  it('lists deadly-involved pairs from map', () => {
    const pairs = deadlyDiagnosticPairs()
    expect(pairs.length).toBeGreaterThanOrEqual(5)
    expect(pairs.some((x) => x.id.includes('phalloides') || x.taxa.some((t) => /phalloides/i.test(t)))).toBe(
      true,
    )
  })

  it('marks gills as deadly-critical', () => {
    expect(isDeadlyCriticalView('gills')).toBe(true)
    expect(isDeadlyCriticalView('habitat')).toBe(false)
  })

  it('missing critical when only habitat filled', () => {
    const miss = missingDeadlyCriticalViews(['habitat'])
    expect(miss).toContain('gills')
    expect(miss).toContain('front')
  })

  it('coach copy is orientation-only', () => {
    expect(deadlyCoach('es').toLowerCase()).toMatch(/mortal|l[aá]minas|volva|perfil/)
    expect(deadlyCoach('en').toLowerCase()).toMatch(/deadly|gills|volva|profile/)
    expect(diagnosticPolicy()).toMatch(/orientation_only/)
  })

  it('findDiagnosticPair resolves caesarea↔phalloides order-independent', () => {
    const ab = findDiagnosticPair('Amanita caesarea', 'Amanita phalloides')
    const ba = findDiagnosticPair('Amanita phalloides', 'Amanita caesarea')
    expect(ab).not.toBeNull()
    expect(ba).not.toBeNull()
    expect(ab!.pair_id).toMatch(/caesarea|phalloides/)
    expect(ab!.critical_views).toContain('gills')
    expect(ab!.critical_views).toContain('front')
    expect(ab!.why.length).toBeGreaterThan(0)
    expect(ab!.pair_id).toBe(ba!.pair_id)
  })

  it('diagnosticForLookalikeMate wires prediction→mate critical_views', () => {
    const d = diagnosticForLookalikeMate(
      ['Amanita caesarea'],
      'Amanita phalloides',
    )
    expect(d).not.toBeNull()
    expect(d!.critical_views.length).toBeGreaterThanOrEqual(2)
    expect(d!.critical_views[0]).toBe('gills')
    // never invent forage permission wording in why
    expect(d!.why.toLowerCase()).not.toMatch(/consume|edible|comer|comestible/)
  })

  it('diagnosticForLookalikeMate returns null for unknown pair', () => {
    expect(diagnosticForLookalikeMate(['Amanita caesarea'], 'Boletus edulis')).toBeNull()
  })

  it('missingPairCriticalViews filters filled slots', () => {
    const d = diagnosticForLookalikeMate(['Amanita caesarea'], 'Amanita phalloides')
    expect(d).not.toBeNull()
    const miss = missingPairCriticalViews(d, ['gills'])
    expect(miss).not.toContain('gills')
    expect(miss.length).toBeGreaterThan(0)
  })

  it('T7: every CLASSIC_LOOKALIKE_PAIRS resolves non-empty critical_views', () => {
    expect(CLASSIC_LOOKALIKE_PAIRS.length).toBeGreaterThanOrEqual(20)
    for (const pair of CLASSIC_LOOKALIKE_PAIRS) {
      const [a, b] = pair.taxa
      const d = diagnosticForLookalikeMate([a], b)
      expect(d, `missing diagnostic for ${pair.id} (${a}↔${b})`).not.toBeNull()
      expect(d!.critical_views.length, pair.id).toBeGreaterThan(0)
      expect(d!.why.length, pair.id).toBeGreaterThan(0)
      expect(d!.why.toLowerCase()).not.toMatch(
        /safe to eat|puedes comer|permission to (eat|forage|consume)/,
      )
    }
    expect(diagnosticPolicy()).toMatch(/orientation_only/)
  })

  it('T7 expanded pairs: satanas and xanthodermus resolve', () => {
    const sat = findDiagnosticPair('Boletus edulis', 'Rubroboletus satanas')
    expect(sat).not.toBeNull()
    expect(sat!.critical_views).toContain('gills')
    const xan = findDiagnosticPair('Agaricus campestris', 'Agaricus xanthodermus')
    expect(xan).not.toBeNull()
    expect(xan!.why.toLowerCase()).toMatch(/fenol|amarill|xanthoderm/)
  })
})
