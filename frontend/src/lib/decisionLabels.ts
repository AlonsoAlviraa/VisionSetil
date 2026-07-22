/** Human-readable Spanish labels for classification decisions (Wave A). */

export function decisionLabelEs(decision: string | undefined | null): string {
  const d = (decision || '').toLowerCase().trim()
  if (d === 'accepted') return 'Pista tentativa'
  if (d === 'rejected') return 'Sin ID fiable'
  if (!d) return 'Sin decisión'
  return decision || 'Sin decisión'
}

export function decisionHintEs(decision: string | undefined | null): string {
  const d = (decision || '').toLowerCase().trim()
  if (d === 'accepted') return 'Orientación del modelo — no es certeza'
  if (d === 'rejected') return 'El modelo prefirió abstenerse'
  return ''
}
