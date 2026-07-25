/** Image attribution for species media (PR-04 / U5). Hide when no usable meta. */

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
}

export function ImageAttribution({ meta, className = '', label }: ImageAttributionProps) {
  if (!meta) return null
  const text =
    meta.attribution_text?.trim() ||
    [meta.creator, meta.license].filter((v) => Boolean(v && String(v).trim())).join(' · ') ||
    null
  if (!text) return null

  const prefix = label?.trim() ? `${label.trim()}: ` : ''

  return (
    <p
      className={`species-image__attribution ${className}`.trim()}
      data-testid="image-attribution"
    >
      {prefix}
      {meta.source_url ? (
        <a href={meta.source_url} target="_blank" rel="noopener noreferrer">
          {text}
        </a>
      ) : (
        text
      )}
    </p>
  )
}
