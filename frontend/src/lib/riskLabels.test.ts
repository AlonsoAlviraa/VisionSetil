/**
 * SSOT risk labels — poisonous ≠ toxic copy; no consumption permission.
 */
import { describe, expect, it } from 'vitest'
import {
  FORBIDDEN_CONSUMPTION_PHRASES,
  getRiskMeta,
  isSevereRisk,
  resolveJoinRisk,
  RISK_DEFAULT,
  RISK_META,
  toRiskLabel,
} from './riskLabels'

import es from '../locales/es/common.json'
import en from '../locales/en/common.json'
import ca from '../locales/ca/common.json'
import eu from '../locales/eu/common.json'

describe('riskLabels SSOT', () => {
  it('keeps poisonous and toxic as distinct RiskLabels', () => {
    expect(toRiskLabel('poisonous')).toBe('poisonous')
    expect(toRiskLabel('toxic')).toBe('toxic')
    expect(toRiskLabel('toxico')).toBe('toxic')
    expect(toRiskLabel('high')).toBe('poisonous')
    expect(toRiskLabel('deadly')).toBe('deadly')
    expect(toRiskLabel('mortifero')).toBe('deadly')
  })

  it('RISK_META: poisonous=Venenosa, toxic=Tóxica (never collapse)', () => {
    expect(RISK_META.poisonous.short).toBe('Venenosa')
    expect(RISK_META.poisonous.label).toBe('Venenosa')
    expect(RISK_META.toxic.short).toBe('Tóxica')
    expect(RISK_META.toxic.label).toBe('Tóxica')
    expect(RISK_META.poisonous.short).not.toBe(RISK_META.toxic.short)
  })

  it('RISK_DEFAULT matches RISK_META (RiskChip fallback)', () => {
    expect(RISK_DEFAULT.poisonous).toBe('Venenosa')
    expect(RISK_DEFAULT.toxic).toBe('Tóxica')
    expect(RISK_DEFAULT.poisonous).not.toBe('Tóxica')
    expect(RISK_DEFAULT.deadly).toBe(RISK_META.deadly.short)
    for (const key of Object.keys(RISK_META) as Array<keyof typeof RISK_META>) {
      expect(RISK_DEFAULT[key]).toBe(RISK_META[key].short)
    }
  })

  it('getRiskMeta returns distinct chip copy for poisonous vs toxic', () => {
    expect(getRiskMeta('poisonous').short).toBe('Venenosa')
    expect(getRiskMeta('toxic').short).toBe('Tóxica')
    expect(getRiskMeta('high').short).toBe('Venenosa')
  })

  it('collapses edible/safe strings to non-consumption risk', () => {
    expect(toRiskLabel('edible')).toBe('unknown_or_risky')
    expect(toRiskLabel('safe')).toBe('unknown_or_risky')
    expect(toRiskLabel('excelente')).toBe('unknown_or_risky')
    expect(toRiskLabel('buen_comestible')).toBe('unknown_or_risky')
  })

  it('isSevereRisk covers deadly/poisonous/toxic', () => {
    expect(isSevereRisk('deadly')).toBe(true)
    expect(isSevereRisk('poisonous')).toBe(true)
    expect(isSevereRisk('toxic')).toBe(true)
    expect(isSevereRisk('unknown_or_risky')).toBe(false)
  })

  it('resolveJoinRisk prefers more severe catalog risk', () => {
    expect(resolveJoinRisk('unknown', 'deadly')).toBe('deadly')
    expect(resolveJoinRisk('poisonous', 'toxic')).toBe('poisonous')
  })

  it('FORBIDDEN_CONSUMPTION_PHRASES is non-empty for CI', () => {
    expect(FORBIDDEN_CONSUMPTION_PHRASES.length).toBeGreaterThan(0)
    expect(FORBIDDEN_CONSUMPTION_PHRASES).toEqual(
      expect.arrayContaining(['safe to eat', 'segura para comer']),
    )
  })
})

describe('risk i18n locale parity (es/en/ca/eu)', () => {
  const locales = { es, en, ca, eu } as const
  const requiredKeys = ['deadly', 'poisonous', 'toxic'] as const

  it('exposes deadly/poisonous/toxic under risk.* in all locales', () => {
    for (const [lang, pack] of Object.entries(locales)) {
      const risk = (pack as { risk: Record<string, string> }).risk
      expect(risk, lang).toBeTruthy()
      for (const k of requiredKeys) {
        expect(typeof risk[k], `${lang}.risk.${k}`).toBe('string')
        expect(risk[k].trim().length, `${lang}.risk.${k}`).toBeGreaterThan(0)
      }
    }
  })

  it('keeps poisonous and toxic copy distinct in each locale', () => {
    for (const [lang, pack] of Object.entries(locales)) {
      const risk = (pack as { risk: Record<string, string> }).risk
      expect(risk.poisonous, lang).not.toBe(risk.toxic)
    }
  })

  it('ES primary: poisonous=Venenosa toxic=Tóxica', () => {
    expect(es.risk.poisonous).toBe('Venenosa')
    expect(es.risk.toxic).toBe('Tóxica')
    expect(es.risk.deadly).toBe('Mortal')
  })

  it('EN: poisonous=Poisonous toxic=Toxic', () => {
    expect(en.risk.poisonous).toBe('Poisonous')
    expect(en.risk.toxic).toBe('Toxic')
    expect(en.risk.deadly).toBe('Deadly')
  })

  it('encyclopedia riskPoisonous key parity', () => {
    for (const [lang, pack] of Object.entries(locales)) {
      const enc = (pack as { encyclopedia: Record<string, string> }).encyclopedia
      expect(typeof enc.riskPoisonous, `${lang}.encyclopedia.riskPoisonous`).toBe('string')
      expect(enc.riskPoisonous).not.toBe(enc.riskToxic)
    }
  })
})
