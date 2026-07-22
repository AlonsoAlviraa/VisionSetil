/** Multi-photo gallery with lightbox — works from static /media files. */
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  galleryImageUrl,
  mediaPublicPrefix,
  speciesImageUrl,
} from '../lib/speciesImageUrl'
import { ImageAttribution, type ImageAttributionMeta } from './ui/ImageAttribution'

export interface GalleryItem {
  role?: string
  url: string
  thumb_url?: string
  license?: string | null
  attribution_text?: string | null
  source?: string | null
}

interface SpeciesGalleryProps {
  slug: string
  scientificName: string
  alt: string
  riskLevel?: 'default' | 'toxic' | 'deadly' | 'unknown'
}

function probeImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(true)
    img.onerror = () => resolve(false)
    img.src = url
  })
}

async function buildStaticGallery(slug: string): Promise<GalleryItem[]> {
  const items: GalleryItem[] = []
  const detail = speciesImageUrl(slug, 'detail')
  const card = speciesImageUrl(slug, 'card')
  const heroOk = await probeImage(detail)
  const heroUrl = heroOk ? detail : card
  items.push({
    role: 'hero',
    url: heroUrl,
    thumb_url: speciesImageUrl(slug, 'thumb'),
  })
  // Probe gallery/01..04.webp
  for (let i = 1; i <= 4; i++) {
    const url = galleryImageUrl(slug, i)
    if (await probeImage(url)) {
      items.push({ role: 'gallery', url, thumb_url: url })
    }
  }
  return items
}

async function fetchGallery(
  slug: string,
): Promise<{ items: GalleryItem[]; meta: ImageAttributionMeta | null }> {
  // Try API gallery JSON first (attribution + ordered list)
  try {
    const base = mediaPublicPrefix()
    // Gallery JSON only on FastAPI — try /api first then /media
    const urls = [`/api/media/species/${encodeURIComponent(slug)}/gallery`, `${base}/species/${encodeURIComponent(slug)}/gallery`]
    for (const u of urls) {
      try {
        const res = await fetch(u)
        if (!res.ok) continue
        const data = await res.json()
        if (data.items?.length) {
          return {
            items: data.items as GalleryItem[],
            meta: data.meta
              ? {
                  attribution_text: data.meta.attribution_text,
                  license: data.meta.license,
                  source_url: data.meta.source_url,
                  creator: data.meta.creator,
                }
              : null,
          }
        }
      } catch {
        /* try next */
      }
    }
  } catch {
    /* static fallback */
  }

  const staticItems = await buildStaticGallery(slug)
  return { items: staticItems, meta: null }
}

export function SpeciesGallery({ slug, scientificName, alt }: SpeciesGalleryProps) {
  const { t } = useTranslation()
  const [items, setItems] = useState<GalleryItem[]>([])
  const [meta, setMeta] = useState<ImageAttributionMeta | null>(null)
  const [active, setActive] = useState(0)
  const [lightbox, setLightbox] = useState(false)

  useEffect(() => {
    let cancelled = false
    setItems([])
    setActive(0)
    void fetchGallery(slug).then((g) => {
      if (cancelled) return
      setItems(
        g.items.length
          ? g.items
          : [
              {
                role: 'hero',
                url: speciesImageUrl(slug, 'detail'),
                thumb_url: speciesImageUrl(slug, 'thumb'),
              },
            ],
      )
      setMeta(g.meta)
    })
    return () => {
      cancelled = true
    }
  }, [slug])

  const current = items[active] || items[0]
  const go = useCallback(
    (dir: number) => {
      if (!items.length) return
      setActive((i) => (i + dir + items.length) % items.length)
    },
    [items.length],
  )

  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(false)
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, go])

  if (!current) {
    return (
      <div className="species-gallery species-gallery--empty" data-testid="species-gallery">
        <div className="species-gallery__hero" style={{ minHeight: 200 }} />
      </div>
    )
  }

  return (
    <div className="species-gallery" data-testid="species-gallery">
      <button
        type="button"
        className="species-gallery__hero"
        onClick={() => setLightbox(true)}
        aria-label={t('gallery.open', { defaultValue: 'Ampliar imagen' })}
      >
        <img
          src={current.url}
          alt={alt}
          loading="eager"
          decoding="async"
          onError={(e) => {
            const el = e.currentTarget
            if (!el.dataset.fallback) {
              el.dataset.fallback = '1'
              el.src = speciesImageUrl(slug, 'card')
            }
          }}
        />
      </button>
      {meta?.attribution_text || meta?.license ? <ImageAttribution meta={meta} /> : null}

      {items.length > 1 ? (
        <div className="species-gallery__thumbs" role="list">
          {items.map((item, idx) => (
            <button
              key={`${item.url}-${idx}`}
              type="button"
              role="listitem"
              className={`species-gallery__thumb ${idx === active ? 'species-gallery__thumb--active' : ''}`}
              onClick={() => setActive(idx)}
              aria-label={`${scientificName} ${idx + 1}`}
              aria-current={idx === active}
            >
              <img src={item.thumb_url || item.url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      ) : null}

      {lightbox ? (
        <div
          className="species-gallery__lightbox"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightbox(false)}
        >
          <button
            type="button"
            className="species-gallery__lightbox-close"
            onClick={() => setLightbox(false)}
          >
            ✕
          </button>
          {items.length > 1 ? (
            <>
              <button
                type="button"
                className="species-gallery__nav species-gallery__nav--prev"
                onClick={(e) => {
                  e.stopPropagation()
                  go(-1)
                }}
              >
                ‹
              </button>
              <button
                type="button"
                className="species-gallery__nav species-gallery__nav--next"
                onClick={(e) => {
                  e.stopPropagation()
                  go(1)
                }}
              >
                ›
              </button>
            </>
          ) : null}
          <img
            src={current.url}
            alt={alt}
            className="species-gallery__lightbox-img"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  )
}
