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
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import feDiagMap from '../data/multiview_diagnostic_map.json'
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

  it('FE and data multiview classic_pairs id sets are equal (parity)', () => {
    const dataPath = resolve(
      __dirname,
      '../../../data/species_catalog/multiview_diagnostic_map.json',
    )
    const data = JSON.parse(readFileSync(dataPath, 'utf8')) as {
      classic_pairs?: Array<{ id?: string }>
    }
    const feIds = new Set(
      ((feDiagMap as { classic_pairs?: Array<{ id?: string }> }).classic_pairs || [])
        .map((p) => p.id)
        .filter(Boolean) as string[],
    )
    const dataIds = new Set(
      (data.classic_pairs || []).map((p) => p.id).filter(Boolean) as string[],
    )
    expect(feIds.size).toBeGreaterThanOrEqual(28)
    expect(dataIds.size).toBe(feIds.size)
    expect([...feIds].sort()).toEqual([...dataIds].sort())
  })

  it('P0: xanthoderma + edulis↔satanas resolve via canonical and synonym forms', () => {
    // Canonical SSOT names on classic pairs
    const xanCanon = findDiagnosticPair('Agaricus campestris', 'Agaricus xanthoderma')
    expect(xanCanon, 'xanthoderma pair').not.toBeNull()
    expect(xanCanon!.pair_id).toBe('xanthodermus-campestris')
    expect(xanCanon!.why.toLowerCase()).toMatch(/fenol|amarill|xanthoderm/)
    expect(xanCanon!.critical_views.length).toBeGreaterThan(0)

    // Reverse order + synonym spelling still resolve
    const xanRev = findDiagnosticPair('Agaricus xanthoderma', 'Agaricus campestris')
    expect(xanRev).not.toBeNull()
    expect(xanRev!.pair_id).toBe(xanCanon!.pair_id)
    const xanSyn = findDiagnosticPair('Agaricus campestris', 'Agaricus xanthodermus')
    expect(xanSyn).not.toBeNull()
    expect(xanSyn!.pair_id).toBe(xanCanon!.pair_id)

    // Classic pair taxa use Boletus satanas; Rubroboletus synonym also matches
    const satCanon = findDiagnosticPair('Boletus edulis', 'Boletus satanas')
    expect(satCanon, 'edulis-satanas pair').not.toBeNull()
    expect(satCanon!.pair_id).toBe('edulis-satanas')
    expect(satCanon!.critical_views).toContain('gills')
    const satRev = findDiagnosticPair('Boletus satanas', 'Boletus edulis')
    expect(satRev).not.toBeNull()
    expect(satRev!.pair_id).toBe('edulis-satanas')
    const satSyn = findDiagnosticPair('Boletus edulis', 'Rubroboletus satanas')
    expect(satSyn).not.toBeNull()
    expect(satSyn!.pair_id).toBe('edulis-satanas')

    // CLASSIC_LOOKALIKE_PAIRS ids still resolve via diagnosticForLookalikeMate
    const classicXan = CLASSIC_LOOKALIKE_PAIRS.find((p) => p.id === 'xanthodermus-campestris')
    const classicSat = CLASSIC_LOOKALIKE_PAIRS.find((p) => p.id === 'edulis-satanas')
    expect(classicXan?.taxa).toEqual(['Agaricus campestris', 'Agaricus xanthoderma'])
    expect(classicSat?.taxa).toEqual(['Boletus edulis', 'Boletus satanas'])
    expect(diagnosticForLookalikeMate([classicXan!.taxa[0]], classicXan!.taxa[1])).not.toBeNull()
    expect(diagnosticForLookalikeMate([classicXan!.taxa[1]], classicXan!.taxa[0])).not.toBeNull()
    expect(diagnosticForLookalikeMate([classicSat!.taxa[0]], classicSat!.taxa[1])).not.toBeNull()
    expect(diagnosticForLookalikeMate([classicSat!.taxa[1]], classicSat!.taxa[0])).not.toBeNull()
  })
})
