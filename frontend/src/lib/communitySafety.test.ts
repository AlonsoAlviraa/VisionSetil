import { describe, expect, it } from 'vitest'
import {
  authorInitials,
  communityConsensusChip,
  communityTextIsSafe,
  findForbiddenCommunityPhrase,
  relativeTimeEs,
} from './communitySafety'

describe('communitySafety', () => {
  it('blocks consumption-permission phrases', () => {
    expect(findForbiddenCommunityPhrase('Esta es segura para comer')).toBeTruthy()
    expect(findForbiddenCommunityPhrase('you can eat this one')).toBeTruthy()
    expect(communityTextIsSafe('Bonito sombrero anaranjado bajo pino')).toBe(true)
    expect(communityTextIsSafe('safe to eat')).toBe(false)
  })

  it('formats relative time and initials', () => {
    const now = Date.parse('2026-07-25T12:00:00Z')
    expect(relativeTimeEs(new Date(now - 30_000).toISOString(), now)).toBe('Ahora')
    expect(relativeTimeEs(new Date(now - 120_000).toISOString(), now)).toMatch(/min/)
    expect(authorInitials('Ana Pérez')).toBe('AP')
    expect(authorInitials('Nízcalo')).toBe('NÍ')
  })

  it('human consensus cues never claim research-grade or edible', () => {
    const help = communityConsensusChip('Tengo duda, ¿segunda opinión?', 0)
    expect(help.cue).toBe('needs_human_second_opinion')
    expect(help.policyEs.toLowerCase()).toMatch(/nunca|no es research/)
    expect(help.policyEn.toLowerCase()).not.toMatch(/safe to eat|edible clearance/)

    const active = communityConsensusChip('Observación bajo pino', 3)
    expect(active.cue).toBe('active_discussion')
    expect(active.policyEs.toLowerCase()).toMatch(/nunca consumo|nunca certificado/)

    const base = communityConsensusChip('Bonito basidiocarpo', 1)
    expect(base.cue).toBe('orientation_only')
  })
})
