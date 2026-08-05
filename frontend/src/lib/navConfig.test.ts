import { describe, expect, it } from 'vitest'
import {
  BOTTOM_TABS,
  headerPrimaryNav,
  isBottomTabActive,
  isMorePath,
  MORE_NAV_FLAT,
  MORE_NAV_GROUPS,
  PRIMARY_NAV,
} from './navConfig'

describe('navConfig SSOT (architecture M1)', () => {
  it('bottom nav has exactly 5 tabs and Identify is primary', () => {
    expect(BOTTOM_TABS).toHaveLength(5)
    const identify = BOTTOM_TABS.find((t) => t.to === '/identificar')
    expect(identify?.primary).toBe(true)
    expect(BOTTOM_TABS.map((t) => t.to)).toEqual([
      '/',
      '/identificar',
      '/juegos',
      '/enciclopedia',
      '/mas',
    ])
  })

  it('header primary includes map as headerOnly', () => {
    const header = headerPrimaryNav()
    expect(header.some((i) => i.to === '/mapa' && i.headerOnly)).toBe(true)
    expect(PRIMARY_NAV.some((i) => i.to === '/identificar' && i.cta)).toBe(true)
  })

  it('Más match covers field overflow paths', () => {
    expect(isMorePath('/mapa')).toBe(true)
    expect(isMorePath('/historial')).toBe(true)
    expect(isMorePath('/lookalikes')).toBe(true)
    expect(isMorePath('/identificar')).toBe(false)
    expect(isBottomTabActive(BOTTOM_TABS[2], '/setadle/classic')).toBe(true)
  })

  it('more groups expose confusiones and no duplicate bare /juegos tile is required', () => {
    const paths = MORE_NAV_FLAT.map((i) => i.to)
    expect(paths).toContain('/lookalikes')
    expect(paths).toContain('/mapa')
    expect(MORE_NAV_GROUPS.some((g) => g.id === 'learn')).toBe(true)
  })

  it('learn group blurbs cover multi-view + lookalikes (orientation only)', () => {
    const learn = MORE_NAV_GROUPS.find((g) => g.id === 'learn')
    expect(learn).toBeTruthy()
    const edu = learn!.items.find((i) => i.to === '/educacion')
    expect(edu?.to).toBe('/educacion')
    expect(edu?.blurbFallback.toLowerCase()).toMatch(/multi-vista|orientaci/)
    const look = learn!.items.find((i) => i.to === '/lookalikes')
    expect(look?.blurbFallback.toLowerCase()).toMatch(/lookalike|estudio|consumo/)
  })
})
