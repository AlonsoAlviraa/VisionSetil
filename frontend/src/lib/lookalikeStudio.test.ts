import { describe, expect, it } from 'vitest'
import {
  addToStudioSelection,
  availableClassicPairs,
  buildCompareRows,
  canCompare,
  loadClassicPair,
  LOOKALIKE_STUDIO_MAX,
  removeFromStudioSelection,
  resolveStudioTaxon,
  suggestStudioPeers,
} from './lookalikeStudio'
import { loadSpeciesCatalog } from '../data/speciesCatalog'

describe('lookalike studio', () => {
  it('resolves catalog taxa by common Spanish name', async () => {
    await loadSpeciesCatalog()
    const bySci = resolveStudioTaxon('Lactarius deliciosus')
    expect(bySci).toBeTruthy()
    expect(bySci!.taxon).toBe('Lactarius deliciosus')
    expect(bySci!.in_catalog).toBe(true)
    const byCommon = resolveStudioTaxon('níscalo')
    expect(byCommon).toBeTruthy()
    expect(byCommon!.in_catalog).toBe(true)
    expect(byCommon!.common_names.length).toBeGreaterThan(0)
  })

  it('loads classic pair with deadly contrast', async () => {
    await loadSpeciesCatalog()
    const pairs = availableClassicPairs()
    expect(pairs.length).toBeGreaterThan(0)
    const pair = pairs.find((p) => p.id === 'caesarea-phalloides') || pairs[0]
    const { selection } = loadClassicPair(pair)
    expect(selection.length).toBeGreaterThanOrEqual(2)
    expect(canCompare(selection)).toBe(true)
  })

  it('adds up to 3 taxa and rejects duplicates / overflow', () => {
    let sel = addToStudioSelection([], 'Amanita phalloides').selection
    sel = addToStudioSelection(sel, 'Galerina marginata').selection
    expect(canCompare(sel)).toBe(true)
    sel = addToStudioSelection(sel, 'Amanita muscaria').selection
    expect(sel.length).toBe(3)
    const overflow = addToStudioSelection(sel, 'Boletus edulis')
    expect(overflow.selection.length).toBe(LOOKALIKE_STUDIO_MAX)
    expect(overflow.error).toMatch(/Máximo/i)
    const dup = addToStudioSelection(sel.slice(0, 1), 'Amanita phalloides')
    expect(dup.error).toMatch(/Ya está/i)
  })

  it('builds compare rows for 2+ taxa', () => {
    let sel = addToStudioSelection([], 'Amanita phalloides').selection
    sel = addToStudioSelection(sel, 'Amanita muscaria').selection
    const rows = buildCompareRows(sel)
    expect(rows.length).toBeGreaterThanOrEqual(3)
    expect(rows.some((r) => r.field === 'Riesgo')).toBe(true)
    expect(rows[0].values.length).toBe(2)
  })

  it('removes taxa and suggests peers', () => {
    let sel = addToStudioSelection([], 'Amanita phalloides').selection
    sel = addToStudioSelection(sel, 'Amanita muscaria').selection
    sel = removeFromStudioSelection(sel, 'Amanita muscaria')
    expect(sel.length).toBe(1)
    const peers = suggestStudioPeers('Amanita phalloides', 4)
    expect(peers.length).toBeGreaterThan(0)
    expect(peers.every((p) => p.taxon !== 'Amanita phalloides')).toBe(true)
  })
})
