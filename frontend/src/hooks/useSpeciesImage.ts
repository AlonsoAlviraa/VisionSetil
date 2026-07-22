import { useEffect, useState } from 'react'
import {
  resolveSpeciesImageAsync,
  resolveSpeciesImageSync,
  type PhotoProvider,
  type ResolveImageOptions,
} from '../lib/speciesImageService'
import type { ImageLoadContext, PhotoTier } from '../data/photoTiers'
import { getPhotoTier } from '../data/photoTiers'

export type UseSpeciesImageOptions = {
  riskLabel?: string
  /** grid = encyclopedia cards (no remote upgrade; T2 placeholder). detail/eager = full resolve. */
  context?: ImageLoadContext
  tier?: PhotoTier
  allowNetwork?: boolean
}

/**
 * Displayable mycology image URL.
 * Grid: sync only (catalog for T0/T1, placeholder for T2) — never wiki/iNat.
 * Detail/eager: may upgrade via network when not in catalog.
 */
export function useSpeciesImage(
  taxon: string | undefined | null,
  riskLabelOrOpts?: string | UseSpeciesImageOptions,
): {
  url: string
  loading: boolean
  source: PhotoProvider
  tier: PhotoTier
} {
  const opts: UseSpeciesImageOptions =
    typeof riskLabelOrOpts === 'string' || riskLabelOrOpts === undefined
      ? { riskLabel: riskLabelOrOpts, context: 'eager' }
      : riskLabelOrOpts

  const name = (taxon || '').trim() || 'Fungi'
  const context = opts.context ?? 'eager'
  const riskLabel = opts.riskLabel
  const tier = opts.tier ?? getPhotoTier(name, riskLabel)
  const resolveOpts: ResolveImageOptions = {
    riskLabel,
    context,
    tier,
    allowNetwork: opts.allowNetwork,
  }

  const initial = resolveSpeciesImageSync(name, resolveOpts)
  const [url, setUrl] = useState(initial.url)
  const [source, setSource] = useState<PhotoProvider>(initial.provider)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    const sync = resolveSpeciesImageSync(name, resolveOpts)
    setUrl(sync.url)
    setSource(sync.provider)

    // Grid path: never async-fetch remote photos
    if (context === 'grid') {
      setLoading(false)
      return
    }

    if (sync.provider === 'catalog') {
      setLoading(false)
      return
    }

    if (opts.allowNetwork === false) {
      setLoading(false)
      return
    }

    setLoading(true)
    void resolveSpeciesImageAsync(name, resolveOpts).then((r) => {
      if (cancelled) return
      setUrl(r.url)
      setSource(r.provider)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- opts flattened
  }, [name, riskLabel, context, tier, opts.allowNetwork])

  return { url, loading, source, tier }
}
