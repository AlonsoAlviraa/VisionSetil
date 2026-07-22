/** Image attribution for species media (PR-04). */

export interface ImageAttributionMeta {
  creator?: string | null
  license?: string | null
  source_url?: string | null
  attribution_text?: string | null
}

interface ImageAttributionProps {
  meta?: ImageAttributionMeta | null
  className?: string
}

export function ImageAttribution({ meta, className = '' }: ImageAttributionProps) {
  if (!meta) return null
  const text =
    meta.attribution_text ||
    [meta.creator, meta.license].filter(Boolean).join(' · ') ||
    null
  if (!text) return null

  return (
    <p className={`species-image__attribution ${className}`.trim()} data-testid="image-attribution">
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
