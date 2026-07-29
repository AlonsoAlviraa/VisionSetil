/** Human-readable labels for classification decisions (Wave A). */

export function decisionLabel(decision: string | undefined | null, locale?: string): string {
  const en = (locale || '').toLowerCase().startsWith('en')
  const d = (decision || '').toLowerCase().trim()
  if (d === 'accepted') return en ? 'Tentative cue' : 'Pista tentativa'
  if (d === 'rejected') return en ? 'No reliable ID' : 'Sin ID fiable'
  if (!d) return en ? 'No decision' : 'Sin decisión'
  return decision || (en ? 'No decision' : 'Sin decisión')
}

/** @deprecated Prefer decisionLabel(decision, locale) */
export function decisionLabelEs(decision: string | undefined | null): string {
  return decisionLabel(decision, 'es')
}

export function decisionHint(decision: string | undefined | null, locale?: string): string {
  const en = (locale || '').toLowerCase().startsWith('en')
  const d = (decision || '').toLowerCase().trim()
  if (d === 'accepted') {
    return en
      ? 'Model orientation — not certainty'
      : 'Orientación del modelo — no es certeza'
  }
  if (d === 'rejected') {
    return en ? 'The model preferred to abstain' : 'El modelo prefirió abstenerse'
  }
  return ''
}

/** @deprecated Prefer decisionHint(decision, locale) */
export function decisionHintEs(decision: string | undefined | null): string {
  return decisionHint(decision, 'es')
}
