import { describe, expect, it } from 'vitest'
import {
  addToStudioSelection,
  availableClassicPairs,
  buildCompareRows,
  canCompare,
  loadClassicPair,
  LOOKALIKE_STUDIO_MAX,
  removeFromStudioSelection,
  resolveFocusSlug,
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

  it('SSOT catalog lookalikes prefer curated mates for deadly taxa', async () => {
    await loadSpeciesCatalog()
    const peers = suggestStudioPeers('Amanita phalloides', 8)
    const taxa = peers.map((p) => p.taxon)
    // Expanded SSOT includes citrina / vaginata educational confusions
    expect(taxa.some((t) => /citrina|vaginata|caesarea|volvopluteus/i.test(t))).toBe(true)
    const pairs = availableClassicPairs()
    expect(pairs.some((p) => p.id === 'phalloides-citrina')).toBe(true)
    expect(pairs.some((p) => p.id === 'gambosa-inocybe')).toBe(true)
  })

  it('P0: Rubroboletus satanas resolves to Boletus satanas SSOT with edulis peers', async () => {
    await loadSpeciesCatalog()
    const card = resolveStudioTaxon('Rubroboletus satanas')
    expect(card).toBeTruthy()
    expect(card!.in_catalog).toBe(true)
    expect(card!.taxon).toBe('Boletus satanas')
    // Studio peers from SSOT LA / classic pair — not empty dual-row
    const peers = suggestStudioPeers('Rubroboletus satanas', 8)
    expect(peers.some((p) => /edulis/i.test(p.taxon))).toBe(true)
    // xanthodermus synonym → xanthoderma SSOT
    const xan = resolveStudioTaxon('Agaricus xanthodermus')
    expect(xan?.taxon).toBe('Agaricus xanthoderma')
  })

  it('resolveFocusSlug: blank → none; unknown → empty; known seeds focus (+ peer)', async () => {
    await loadSpeciesCatalog()
    expect(resolveFocusSlug(null).status).toBe('none')
    expect(resolveFocusSlug('').status).toBe('none')
    expect(resolveFocusSlug('   ').status).toBe('none')

    const unknown = resolveFocusSlug('definitely-not-a-real-taxon-xyz')
    expect(unknown.status).toBe('unknown')
    expect(unknown.selection).toEqual([])
    expect(unknown.focusSlug).toBe('definitely-not-a-real-taxon-xyz')

    const ok = resolveFocusSlug('amanita-phalloides')
    expect(ok.status).toBe('ok')
    expect(ok.focusSlug).toBe('amanita-phalloides')
    expect(ok.selection.length).toBeGreaterThanOrEqual(1)
    expect(ok.selection[0].taxon.toLowerCase()).toMatch(/phalloides/)
    expect(ok.selection[0].in_catalog).toBe(true)
    // Peer seed enables compare path when SSOT/classic mates exist
    if (ok.selection.length >= 2) {
      expect(canCompare(ok.selection)).toBe(true)
    }
  })

  it('resolveFocusSlug accepts scientific-name-like params via slug normalize', async () => {
    await loadSpeciesCatalog()
    const bySci = resolveFocusSlug('Amanita phalloides')
    expect(bySci.status).toBe('ok')
    expect(bySci.focusSlug).toBe('amanita-phalloides')
  })

  it('resolveFocusSlug forces explicit peer into selection (pair deep-link)', async () => {
    await loadSpeciesCatalog()
    const pair = resolveFocusSlug('amanita-caesarea', {
      peerParam: 'amanita-phalloides',
    })
    expect(pair.status).toBe('ok')
    expect(pair.focusSlug).toBe('amanita-caesarea')
    expect(pair.peerSlug).toBe('amanita-phalloides')
    expect(pair.selection.map((s) => s.slug)).toEqual(
      expect.arrayContaining(['amanita-caesarea', 'amanita-phalloides']),
    )
    expect(pair.selection[0].slug).toBe('amanita-caesarea')
    expect(canCompare(pair.selection)).toBe(true)

    // Unknown peer is ignored; focus still OK (may get curated fallback peer)
    const badPeer = resolveFocusSlug('amanita-phalloides', {
      peerParam: 'not-a-real-peer-xyz',
    })
    expect(badPeer.status).toBe('ok')
    expect(badPeer.peerSlug).toBeNull()
    expect(badPeer.selection[0].slug).toBe('amanita-phalloides')
  })
})
