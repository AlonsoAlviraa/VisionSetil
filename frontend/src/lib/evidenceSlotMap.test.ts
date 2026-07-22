import { describe, expect, it } from 'vitest'
import {
  linkEvidenceItems,
  mapEvidenceToWizardSlot,
  normalizeEvidenceText,
} from './evidenceSlotMap'

describe('evidenceSlotMap (B-36)', () => {
  it('normalizes accents for matching', () => {
    expect(normalizeEvidenceText('Láminas o poros')).toBe('laminas o poros')
  })

  it('maps BE missing_evidence photo labels to wizard slots', () => {
    expect(mapEvidenceToWizardSlot('Foto del sombrero/frente')).toBe('front')
    expect(mapEvidenceToWizardSlot('Foto clara de laminas o poros')).toBe('gills')
    expect(mapEvidenceToWizardSlot('Foto clara de láminas o poros')).toBe('gills')
    expect(mapEvidenceToWizardSlot('Foto de la base del pie o detalle')).toBe('detail')
    expect(mapEvidenceToWizardSlot('Foto del entorno o sustrato')).toBe('habitat')
  })

  it('maps questions that request photos to slots', () => {
    expect(
      mapEvidenceToWizardSlot(
        'Puedes anadir una foto de la base para revisar volva o bulbo?',
      ),
    ).toBe('detail')
    expect(
      mapEvidenceToWizardSlot(
        'Puedes añadir una foto de la base para revisar volva o bulbo?',
      ),
    ).toBe('detail')
  })

  it('does not deep-link pure metadata cues', () => {
    expect(mapEvidenceToWizardSlot('Informacion de arboles cercanos')).toBeNull()
    expect(mapEvidenceToWizardSlot('Información de árboles cercanos')).toBeNull()
    expect(mapEvidenceToWizardSlot('Informacion de sustrato')).toBeNull()
    expect(mapEvidenceToWizardSlot('Que arboles habia cerca del ejemplar?')).toBeNull()
    expect(mapEvidenceToWizardSlot('Has observado cambio de color al corte?')).toBeNull()
  })

  it('handles English light aliases', () => {
    expect(mapEvidenceToWizardSlot('Clear photo of gills or pores')).toBe('gills')
    expect(mapEvidenceToWizardSlot('Front/cap profile photo')).toBe('front')
    expect(mapEvidenceToWizardSlot('Habitat / environment photo')).toBe('habitat')
  })

  it('returns null for empty / unknown', () => {
    expect(mapEvidenceToWizardSlot('')).toBeNull()
    expect(mapEvidenceToWizardSlot('   ')).toBeNull()
    expect(mapEvidenceToWizardSlot('Something unrelated about weather')).toBeNull()
  })

  it('linkEvidenceItems decorates lists', () => {
    const linked = linkEvidenceItems([
      'Foto clara de laminas o poros',
      'Informacion de arboles cercanos',
    ])
    expect(linked).toEqual([
      { text: 'Foto clara de laminas o poros', slot: 'gills' },
      { text: 'Informacion de arboles cercanos', slot: null },
    ])
  })
})
