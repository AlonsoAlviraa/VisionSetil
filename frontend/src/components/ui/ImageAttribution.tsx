/** Image attribution for species media (PR-04 / U5 / N3). Hide when no usable meta. */

export interface ImageAttributionMeta {
  creator?: string | null
  license?: string | null
  source_url?: string | null
  attribution_text?: string | null
}

interface ImageAttributionProps {
  meta?: ImageAttributionMeta | null
  className?: string
  /** Optional prefix (e.g. "Foto") — omitted when empty so no bare "Crédito:" lines. */
  label?: string
  /**
   * When true (default), surface a short non-commercial note for CC BY-NC* licences
   * so users never confuse open photos with free commercial reuse / forage OK.
   */
  showNcNote?: boolean
}

function isNonCommercialLicense(license: string | null | undefined): boolean {
  if (!license) return false
  const l = license.toLowerCase()
  return l.includes('nc') || l.includes('by-nc') || l.includes('noncommercial')
}

export function ImageAttribution({
  meta,
  className = '',
  label,
  showNcNote = true,
}: ImageAttributionProps) {
  if (!meta) return null
  const text =
    meta.attribution_text?.trim() ||
    [meta.creator, meta.license].filter((v) => Boolean(v && String(v).trim())).join(' · ') ||
    null
  if (!text) return null

  const prefix = label?.trim() ? `${label.trim()}: ` : ''
  const nc = showNcNote && isNonCommercialLicense(meta.license)

  return (
    <p
      className={`species-image__attribution ${className}`.trim()}
      data-testid="image-attribution"
      data-nc={nc ? '1' : '0'}
    >
      {prefix}
      {meta.source_url ? (
        <a href={meta.source_url} target="_blank" rel="noopener noreferrer">
          {text}
        </a>
      ) : (
        text
      )}
      {nc ? (
        <span className="species-image__attribution-nc" data-testid="image-attribution-nc">
          {' '}
          · no comercial (NC)
        </span>
      ) : null}
    </p>
  )
}
