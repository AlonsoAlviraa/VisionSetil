/**
 * B-36 — Map BE missing_evidence / questions_for_user strings → wizard slots.
 * Pure helpers; accent-insensitive keyword matching for ES (+ light EN).
 */
import { type CanonicalView } from './multiViewSlots'

/** Normalize for keyword match (lowercase, strip accents). */
export function normalizeEvidenceText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Pure-metadata lines from SafetyExplanationService — not photo slots.
 * e.g. "Informacion de arboles cercanos", "Informacion de sustrato",
 * "Que arboles habia cerca…", "Has observado cambio de color…"
 */
function isMetadataOnlyEvidence(n: string): boolean {
  if (/^informacion de (sustrato|arboles?)/.test(n)) return true
  if (/arboles?\b/.test(n) && !/\bfoto\b/.test(n) && !/\bentorno\b/.test(n)) return true
  if (/cambio de color/.test(n) && !/\bfoto\b/.test(n)) return true
  if (/nearby.?trees|substrate info|color.?change/.test(n) && !/\bphoto\b|\bfoto\b/.test(n)) {
    return true
  }
  return false
}

type SlotRule = { view: CanonicalView; re: RegExp }

/** Ordered: more specific photo cues first. */
const SLOT_RULES: SlotRule[] = [
  { view: 'gills', re: /\b(lamin|poros|himen|gills)\b/ },
  // base/volva/detail before generic "pie" noise
  { view: 'detail', re: /\b(base|volva|bulbo|anillo|detalle|detail|cross.?section|corte)\b/ },
  { view: 'habitat', re: /\b(entorno|environment|habitat|sustrato)\b/ },
  { view: 'front', re: /\b(sombrero|frente|front|perfil|cap_top|cap)\b/ },
]

/**
 * Map a single missing_evidence or questions_for_user string to a wizard slot.
 * Returns null when the cue is metadata-only or unrecognized.
 */
export function mapEvidenceToWizardSlot(text: string): CanonicalView | null {
  if (!text || !text.trim()) return null
  const n = normalizeEvidenceText(text)
  if (isMetadataOnlyEvidence(n)) return null

  for (const rule of SLOT_RULES) {
    if (rule.re.test(n)) return rule.view
  }
  return null
}

export type EvidenceItemLink = {
  text: string
  slot: CanonicalView | null
}

/** Decorate a list of evidence/question strings with optional wizard targets. */
export function linkEvidenceItems(items: string[]): EvidenceItemLink[] {
  return items.map((text) => ({
    text,
    slot: mapEvidenceToWizardSlot(text),
  }))
}
