/**
 * Sanitize educational copy so product UI never praises edibility / cooking.
 * Wave B — ficha editorial.
 */

const FORBIDDEN_PRAISE =
  /\b(excelente\s+comestible|muy\s+comestible|delicios[oa]s?|sabor\s+excelente|buena?\s+para\s+comer|apto\s+para\s+consumo|cocinar|fre[ií]r|guisar|receta|consume\s|cons[uú]melas?|comestible\s+seguro)\b/gi

/** Fallback when source text is mostly consumption-oriented. */
export const SAFE_SPECIES_BLURB =
  'Ficha orientativa. Observa caracteres, hábitat y confusiones de riesgo. No es guía de consumo.'

export function sanitizeEducationalText(
  text: string | null | undefined,
  fallback = SAFE_SPECIES_BLURB,
): string {
  const raw = (text || '').trim()
  if (!raw) return fallback
  let cleaned = raw.replace(FORBIDDEN_PRAISE, '—')
  cleaned = cleaned.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:])/g, '$1').trim()
  // If we stripped too much substance, use safe fallback
  if (cleaned.length < 24 || /^-+\s*$/.test(cleaned)) return fallback
  return cleaned
}

export function isConsumptionPraise(text: string | null | undefined): boolean {
  return FORBIDDEN_PRAISE.test(text || '')
}
