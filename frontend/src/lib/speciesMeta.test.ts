import { describe, expect, it } from 'vitest'
import { resolveSpeciesMeta } from './speciesMeta'
import { getRiskMeta } from './riskLabels'

describe('speciesMeta', () => {
  it('resolves Lactarius acerrimus with real meta (not blanks)', () => {
    const m = resolveSpeciesMeta({
      taxon: 'Lactarius acerrimus',
      family: '',
      risk_label: 'dangerous_or_unknown',
      food_class: 'no_comestible',
      common_names: ['Lactarius acerrimus'],
      description:
        'Lactarius acerrimus (Russulaceae). Género Lactarius. Presencia en Iberia: Mediterránea.',
    })
    expect(m.family).toBe('Russulaceae')
    expect(m.genus).toBe('Lactarius')
    expect(m.season).toBe('Otoño')
    expect(m.iberian).toBe('Mediterránea')
    expect(m.educ).toBe('no_comestible')
    expect(m.educLabel).toMatch(/No comestible/i)
    expect(getRiskMeta(m.risk).label).not.toBe('Sin datos')
  })

  it('resolves Lactarius deliciosus as documented comestible + icono Iberia', () => {
    const m = resolveSpeciesMeta({
      taxon: 'Lactarius deliciosus',
      family: 'Russulaceae',
      risk_label: 'unknown_or_risky',
      food_class: 'comestible',
      common_names: ['Nízcalo', 'Robellón'],
    })
    expect(m.educ).toBe('comestible')
    expect(m.iberian).toBe('Icono')
    expect(m.season).toBe('Otoño')
    expect(getRiskMeta(m.risk).short).toBe('Orientación')
  })

  it('never invents comestible for unknown taxon without sources', () => {
    const m = resolveSpeciesMeta({
      taxon: 'Fakeus inventus',
      risk_label: 'dangerous_or_unknown',
    })
    expect(m.educ).toBe('sin_documentar')
    expect(m.educLabel).toMatch(/Sin documentar/i)
    expect(m.season.length).toBeGreaterThan(0)
    expect(m.iberian).toBe('Presente')
  })
})
