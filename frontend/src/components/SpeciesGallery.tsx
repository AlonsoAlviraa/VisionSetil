/** Multi-photo gallery with lightbox — SpeciesImage cascade + a11y (D-06). */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  galleryImageUrl,
  mediaPublicPrefix,
  speciesImageUrl,
  type PlaceholderKind,
} from '../lib/speciesImageUrl'
import { SpeciesImage } from './SpeciesImage'
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
  riskLevel?: PlaceholderKind
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
  const thumb = speciesImageUrl(slug, 'thumb')
  const detailOk = await probeImage(detail)
  const cardOk = detailOk ? true : await probeImage(card)
  const heroUrl = detailOk ? detail : cardOk ? card : thumb
  // Always provide a hero URL — SpeciesImage cascade handles missing media.
  items.push({
    role: 'hero',
    url: heroUrl,
    thumb_url: thumb,
  })
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
  try {
    const base = mediaPublicPrefix()
    const urls = [
      `/api/media/species/${encodeURIComponent(slug)}/gallery`,
      `${base}/species/${encodeURIComponent(slug)}/gallery`,
    ]
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

export function SpeciesGallery({
  slug,
  scientificName,
  alt,
  riskLevel = 'default',
}: SpeciesGalleryProps) {
  const { t } = useTranslation()
  const [items, setItems] = useState<GalleryItem[]>([])
  const [meta, setMeta] = useState<ImageAttributionMeta | null>(null)
  const [active, setActive] = useState(0)
  const [lightbox, setLightbox] = useState(false)
  const [loading, setLoading] = useState(true)
  const heroBtnRef = useRef<HTMLButtonElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setItems([])
    setActive(0)
    setLoading(true)
    void fetchGallery(slug).then((g) => {
      if (cancelled) return
      setItems(g.items)
      setMeta(g.meta)
      setLoading(false)
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

  const closeLightbox = useCallback(() => {
    setLightbox(false)
    // restore focus to opener on next paint
    window.setTimeout(() => heroBtnRef.current?.focus(), 0)
  }, [])

  useEffect(() => {
    if (!lightbox) return
    closeBtnRef.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeLightbox()
      }
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
      // simple focus trap
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )
        if (!focusable.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, go, closeLightbox])

  // Main surface uses SpeciesImage cascade (no broken-img). Extra gallery
  // frames (thumbs idx>0) use URL + onError chain back to card/thumb.
  const useCascadeHero = !current || active === 0 || current.role === 'hero'
  const hero = (
    <button
      ref={heroBtnRef}
      type="button"
      className="species-gallery__hero species-gallery__hero--fill"
      onClick={() => setLightbox(true)}
      aria-label={t('gallery.open', { defaultValue: 'Ampliar imagen' })}
    >
      {useCascadeHero || loading ? (
        <SpeciesImage
          scientificName={scientificName}
          slug={slug}
          variant="detail"
          riskLevel={riskLevel}
          alt={alt}
          layout="fill"
          aspectRatio="4/3"
          showMediaBadge="auto"
          priority
        />
      ) : (
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
            } else if (el.dataset.fallback === '1') {
              el.dataset.fallback = '2'
              el.src = speciesImageUrl(slug, 'thumb')
            }
          }}
        />
      )}
    </button>
  )

  if (loading || !current) {
    return (
      <div
        className="species-gallery species-gallery--empty"
        data-testid="species-gallery"
        data-loading={loading ? 'true' : 'false'}
      >
        {hero}
        {!loading && (
          <p className="species-gallery__empty-hint muted">
            {t('gallery.empty', {
              defaultValue:
                'Sin galería extra — se muestra la ilustración o foto principal.',
            })}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="species-gallery" data-testid="species-gallery">
      {hero}
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
              <img
                src={item.thumb_url || item.url}
                alt=""
                loading="lazy"
                onError={(e) => {
                  const el = e.currentTarget
                  if (!el.dataset.fallback) {
                    el.dataset.fallback = '1'
                    el.src = speciesImageUrl(slug, 'thumb')
                  }
                }}
              />
            </button>
          ))}
        </div>
      ) : (
        <p className="species-gallery__empty-hint muted">
          {t('gallery.single', {
            defaultValue: 'Una imagen disponible',
          })}
        </p>
      )}

      {lightbox ? (
        <div
          ref={dialogRef}
          className="species-gallery__lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={closeLightbox}
        >
          <button
            ref={closeBtnRef}
            type="button"
            className="species-gallery__lightbox-close"
            onClick={closeLightbox}
            aria-label={t('actions.clear', { defaultValue: 'Cerrar' })}
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
                aria-label={t('actions.previous', { defaultValue: 'Anterior' })}
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
                aria-label={t('actions.next', { defaultValue: 'Siguiente' })}
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
            onError={(e) => {
              const el = e.currentTarget
              if (!el.dataset.fallback) {
                el.dataset.fallback = '1'
                el.src = speciesImageUrl(slug, 'card')
              } else if (el.dataset.fallback === '1') {
                el.dataset.fallback = '2'
                el.src = speciesImageUrl(slug, 'thumb')
              }
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
