/**
 * Encyclopedia species grid — flat + family windowed render (T5).
 * Spacers + load-more BEFORE bottom pad (KD17). No IO page++.
 */
import { useTranslation } from 'react-i18next'
import type { CatalogSpecies } from '../data/speciesCatalog'
import { useEncyclopediaGridWindow } from '../hooks/useEncyclopediaGridWindow'
import type { FamilyRun } from '../lib/encyclopediaWindow'
import { SpeciesPhotoCard } from './SpeciesPhotoCard'
import { Button, Icon } from './ui'

export type EncyclopediaSpeciesGridProps = {
  windowSource: CatalogSpecies[]
  runs: FamilyRun[]
  groupByFamily: boolean
  resetKey: string
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function scrollLoadMoreAssist() {
  const vh = window.innerHeight || 800
  window.scrollBy({
    top: vh * 0.9,
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
  })
}

export function EncyclopediaSpeciesGrid({
  windowSource,
  runs,
  groupByFamily,
  resetKey,
}: EncyclopediaSpeciesGridProps) {
  const { t } = useTranslation()
  const mode = groupByFamily ? 'family' : 'flat'
  const {
    listRef,
    startIndex,
    endIndex,
    topPadPx,
    bottomPadPx,
    itemCount,
  } = useEncyclopediaGridWindow({
    itemCount: windowSource.length,
    resetKey,
    mode,
    runs: groupByFamily ? runs : [],
  })

  const hasMore = endIndex < itemCount
  const remaining = Math.max(0, itemCount - endIndex)

  const loadMore = (
    <>
      {hasMore && (
        <div className="ency-more" data-testid="encyclopedia-load-more-wrap">
          <Button
            type="button"
            variant="primary"
            data-testid="encyclopedia-load-more"
            onClick={scrollLoadMoreAssist}
          >
            {t('encyclopedia.loadMoreRest', { defaultValue: 'Cargar más' })}
            <span className="muted"> ({remaining})</span>
          </Button>
        </div>
      )}
    </>
  )

  const topSpacer =
    topPadPx > 0 ? (
      <div
        className="ency-window-spacer ency-window-spacer--top"
        data-testid="ency-window-spacer-top"
        style={{ height: topPadPx }}
        aria-hidden
      />
    ) : null

  const bottomSpacer =
    bottomPadPx > 0 ? (
      <div
        className="ency-window-spacer ency-window-spacer--bottom"
        data-testid="ency-window-spacer-bottom"
        style={{ height: bottomPadPx }}
        aria-hidden
      />
    ) : null

  if (groupByFamily && runs.length > 0) {
    const visibleRuns = runs.filter(
      (run) => run.end > startIndex && run.start < endIndex,
    )
    return (
      <div
        ref={listRef}
        className="ency-window-list"
        data-testid="ency-species-list"
      >
        {topSpacer}
        {visibleRuns.map((run) => {
          const from = Math.max(run.start, startIndex)
          const to = Math.min(run.end, endIndex)
          const cards: CatalogSpecies[] = []
          for (let i = from; i < to; i++) {
            const s = windowSource[i]
            if (s) cards.push(s)
          }
          if (cards.length === 0) return null
          return (
            <section className="ency-family-section" key={run.familyLabel}>
              <h3 className="ency-family-section__title">
                <Icon name="auto_awesome_mosaic" size="sm" aria-hidden="true" />
                {run.familyLabel}
                <span className="ency-family-section__count">
                  {t('encyclopedia.familyCount', {
                    defaultValue: '{{n}} especies',
                    n: run.count,
                  })}
                </span>
              </h3>
              <div className="species-photo-grid">
                {cards.map((s, i) => {
                  const sourceIndex = from + i
                  return (
                    <SpeciesPhotoCard
                      key={s.slug}
                      species={s}
                      priority={sourceIndex < 4}
                    />
                  )
                })}
              </div>
            </section>
          )
        })}
        {/* KD17: load-more BEFORE bottom spacer */}
        {loadMore}
        {bottomSpacer}
      </div>
    )
  }

  // Flat mode
  const slice = windowSource.slice(startIndex, endIndex)
  return (
    <div
      ref={listRef}
      className="ency-window-list"
      data-testid="ency-species-list"
    >
      {topSpacer}
      <div className="species-photo-grid" data-testid="ency-species-grid">
        {slice.map((s, i) => {
          const sourceIndex = startIndex + i
          return (
            <SpeciesPhotoCard
              key={s.slug}
              species={s}
              priority={sourceIndex < 4}
            />
          )
        })}
      </div>
      {/* KD17: load-more BEFORE bottom spacer */}
      {loadMore}
      {bottomSpacer}
    </div>
  )
}
