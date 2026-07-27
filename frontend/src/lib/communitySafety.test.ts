import { describe, expect, it } from 'vitest'
import {
  authorInitials,
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
})
