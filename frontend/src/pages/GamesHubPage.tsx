/**
 * Games hub — LoLdle-inspired daily board:
 * - one civil day → several modes
 * - foto del día from verified pool
 * - progress chips per mode
 * Educational only · never consumption.
 *
 * T3: await speciesPhotos hydrate before buildVerifiedGamesPool so the
 * verified deck is not empty/thin while photos db.version === 'pending'.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SpeciesImage } from '../components/SpeciesImage'
import { Icon, LinkButton, PageShell } from '../components/ui'
import { useSpeciesCatalog } from '../hooks/useSpeciesCatalog'
import { readStudyStreak, readStudyStats } from '../lib/studyBadges'
import { HIGH_SEARCH_TAXA } from '../lib/encyclopediaPopularity'
import { getRiskMeta } from '../lib/riskLabels'
import { scientificNameToSlug } from '../lib/slug'
import {
  areSpeciesPhotosReady,
  hydrateSpeciesPhotos,
} from '../lib/speciesImageService'
import {
  buildVerifiedGamesPool,
  DAILY_GAME_MODES,
  dailyGamesCompletion,
  gamesDayKey,
  pickDailyPhotoSpecies,
  pickDailySpeciesForMode,
  readDailyGamesProgress,
  type DailyGameModeId,
} from '../lib/dailyGames'

function useDeadlyHighlights() {
  const { catalog } = useSpeciesCatalog()
  return useMemo(() => {
    const byTaxon = new Map(catalog.map((s) => [s.taxon, s]))
    return HIGH_SEARCH_TAXA.map((t) => byTaxon.get(t))
      .filter((s) => s && (s.risk_label === 'deadly' || s.risk_label === 'poisonous'))
      .slice(0, 4)
  }, [catalog])
}

/** Photos catalog readiness for verified games pool (audit T3). */
function useSpeciesPhotosReady(): boolean {
  const [ready, setReady] = useState(() => areSpeciesPhotosReady())
  useEffect(() => {
    if (areSpeciesPhotosReady()) {
      setReady(true)
      return
    }
    let cancelled = false
    void hydrateSpeciesPhotos().then(() => {
      if (!cancelled) setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return ready
}

export function GamesHubPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage || i18n.language || 'es'
  const { catalog } = useSpeciesCatalog()
  const photosReady = useSpeciesPhotosReady()
  const streak = readStudyStreak()
  const stats = readStudyStats()
  const deadlyHighlights = useDeadlyHighlights()
  const day = gamesDayKey()

  // Gate on hydrate: pending photos db thins the pool to ~0 (getCatalogPhotoUrl null).
  const verifiedPool = useMemo(
    () => (photosReady ? buildVerifiedGamesPool(catalog, locale) : []),
    [catalog, locale, photosReady],
  )

  const fotoDelDia = useMemo(() => {
    if (verifiedPool.length === 0) return null
    try {
      return pickDailyPhotoSpecies(verifiedPool, day)
    } catch {
      return verifiedPool[0] || null
    }
  }, [verifiedPool, day])

  const progress = useMemo(() => dailyGamesCompletion(day), [day])
  const doneMap = useMemo(() => readDailyGamesProgress(day).done, [day])

  const modeCards = useMemo(() => {
    return DAILY_GAME_MODES.map((m) => {
      let taxon = fotoDelDia?.taxon || 'Boletus edulis'
      try {
        if (verifiedPool.length > 0) {
          taxon = pickDailySpeciesForMode(verifiedPool, m.id, day).taxon
        }
      } catch {
        /* keep fallback */
      }
      return {
        ...m,
        taxon,
        done: Boolean(doneMap[m.id as DailyGameModeId]),
      }
    })
  }, [verifiedPool, day, doneMap, fotoDelDia?.taxon])

  const totalActivities =
    stats.quizSessions + stats.setadleWins + stats.lookalikeCompares + stats.encyclopediaViews

  return (
    <PageShell
      className="page-games-hub page-games-hub--loldle"
      testId="games-hub-page"
      orientationSticky
      orientationText={t('games.orientation', {
        defaultValue: 'Solo educación · nunca consumo',
      })}
    >
      <header className="cn-page-head cn-page-pad">
        <p className="cn-kicker mkt-kicker">
          {t('games.kicker', { defaultValue: 'Juegos · diario' })}
        </p>
        <h1 className="cn-page-head__title">
          {t('games.title', { defaultValue: 'Entrena el ojo' })}
        </h1>
        <p className="cn-page-head__lead">
          {t('games.policyLoldle', {
            defaultValue:
              'Como LoLdle: varios retos al día, mismos para todos. Solo educación — no identifica setas reales ni autoriza consumo.',
          })}
        </p>
        <p className="games-hub-day" data-testid="games-hub-day">
          {t('games.today', { defaultValue: 'Hoy · {{day}}', day })}
          {verifiedPool.length > 0 ? (
            <span className="games-hub-day__pool">
              {' · '}
              {t('games.verifiedPool', {
                defaultValue: '{{n}} especies verificadas',
                n: verifiedPool.length,
              })}
            </span>
          ) : null}
        </p>
      </header>

      {/* Foto del día — LoLdle splash energy */}
      {fotoDelDia ? (
        <section
          className="games-daily-photo cn-page-pad"
          data-testid="games-daily-photo"
          aria-labelledby="games-daily-photo-title"
        >
          <div className="games-daily-photo__frame">
            <SpeciesImage
              scientificName={fotoDelDia.taxon}
              slug={fotoDelDia.slug}
              alt={t('games.dailyPhotoAlt', {
                defaultValue: 'Foto del día (educativa)',
              })}
              variant="detail"
              layout="fill"
              preferCatalog
              priority
              quality="display"
              sizes="(max-width: 640px) 100vw, 720px"
              // games_hub surface: display ≤500px (MEDIA_SURFACE_POLICY)
            />
            <div className="games-daily-photo__scrim" aria-hidden="true" />
            <div className="games-daily-photo__meta">
              <p className="games-daily-photo__kicker" id="games-daily-photo-title">
                {t('games.dailyPhotoKicker', { defaultValue: 'Foto del día' })}
              </p>
              <p className="games-daily-photo__common">{fotoDelDia.common}</p>
              <p className="games-daily-photo__taxon">
                <em>{fotoDelDia.taxon}</em>
              </p>
              <p className="games-daily-photo__hint muted">
                {t('games.dailyPhotoHint', {
                  defaultValue:
                    'Cambia cada día · misma para todos · solo orientación',
                })}
              </p>
              <LinkButton
                to={`/enciclopedia/${fotoDelDia.slug}`}
                skin="cn"
                variant="ghost"
                size="sm"
                data-testid="games-daily-photo-fiche"
              >
                {t('games.openFiche', { defaultValue: 'Ver ficha' })}
              </LinkButton>
            </div>
          </div>
        </section>
      ) : null}

      {/* Daily progress — LoLdle multi-mode board */}
      <section
        className="games-daily-progress cn-glass cn-page-pad"
        data-testid="games-daily-progress"
        aria-label={t('games.dailyProgressAria', { defaultValue: 'Progreso diario' })}
      >
        <div className="games-daily-progress__head">
          <strong>
            {t('games.dailyProgress', {
              defaultValue: 'Retos de hoy · {{done}}/{{total}}',
              done: progress.done,
              total: progress.total,
            })}
          </strong>
          <span className="games-daily-progress__pct">{progress.pct}%</span>
        </div>
        <div
          className="games-daily-progress__bar"
          role="progressbar"
          aria-valuenow={progress.pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${progress.pct}%` }} />
        </div>
      </section>

      {/* Study streak */}
      <section className="games-study-panel cn-glass cn-page-pad" data-testid="games-study-panel">
        <div className="games-study-panel__streak">
          <Icon name="local_fire_department" size="lg" aria-hidden="true" />
          <div>
            <strong className="games-study-panel__streak-num">{streak.current}</strong>
            <span className="games-study-panel__streak-label">
              {t('games.streakDays', { defaultValue: 'días seguidos' })}
            </span>
          </div>
        </div>
        <div className="games-study-panel__stats">
          <div className="games-study-panel__stat">
            <span className="games-study-panel__stat-num">{stats.quizSessions}</span>
            <span className="games-study-panel__stat-label">
              {t('games.statQuiz', { defaultValue: 'Retos' })}
            </span>
          </div>
          <div className="games-study-panel__stat">
            <span className="games-study-panel__stat-num">{stats.setadleWins}</span>
            <span className="games-study-panel__stat-label">
              {t('games.statSetadle', { defaultValue: 'Setadle' })}
            </span>
          </div>
          <div className="games-study-panel__stat">
            <span className="games-study-panel__stat-num">{stats.lookalikeCompares}</span>
            <span className="games-study-panel__stat-label">
              {t('games.statLookalike', { defaultValue: 'Confusiones' })}
            </span>
          </div>
        </div>
        {totalActivities === 0 && (
          <p className="games-study-panel__hint">
            {t('games.progressHint', {
              defaultValue: 'Tu progreso se guarda en este dispositivo. ¡Empieza tu racha!',
            })}
          </p>
        )}
      </section>

      {/* Primary CTA → first incomplete daily mode (or quiz) */}
      <div className="games-hub-primary cn-page-pad" data-testid="games-hub-primary">
        <LinkButton
          to={modeCards.find((m) => !m.done)?.to || '/reto'}
          skin="cn"
          variant="primary"
          size="lg"
          block
          className="games-hub-primary__cta"
          data-testid="games-hub-primary-reto"
        >
          <Icon name="emoji_events" size="md" aria-hidden="true" />
          {t('games.primaryDaily', {
            defaultValue: progress.done === 0 ? 'Empezar retos del día' : 'Seguir retos del día',
          })}
        </LinkButton>
        <p className="games-hub-primary__hint muted">
          {t('games.primaryDailyHint', {
            defaultValue: 'Varios modos · misma fecha · solo educación',
          })}
        </p>
      </div>

      {/* Mode grid — LoLdle list of daily challenges */}
      <ul className="games-hub-grid games-hub-grid--modes cn-page-pad" data-testid="games-daily-modes">
        {modeCards.map((g) => (
          <li key={g.id}>
            <Link
              to={g.to}
              className={`games-hub-card games-hub-card--photo games-hub-card--link${
                g.done ? ' games-hub-card--done' : ''
              }${g.id === 'quiz' ? ' games-hub-card--featured' : ''}`}
              data-testid={`games-mode-${g.id}`}
              data-done={g.done ? '1' : '0'}
            >
              <div className="games-hub-card__media" aria-hidden="true">
                <SpeciesImage
                  scientificName={g.taxon}
                  alt=""
                  variant="card"
                  layout="fill"
                  preferCatalog
                  quality="display"
                  sizes="(max-width: 640px) 50vw, 280px"
                />
              </div>
              <span className="games-hub-card__badge">
                {g.done
                  ? t('games.badgeDone', { defaultValue: 'Hecho' })
                  : t('games.badgeDaily', { defaultValue: g.badgeEs })}
              </span>
              <div className="games-hub-card__content">
                <h2 className="games-hub-card__title">{g.titleEs}</h2>
                <p className="games-hub-card__body">{g.blurbEs}</p>
                <span className="games-hub-card__cta" aria-hidden="true">
                  {g.done
                    ? t('games.replay', { defaultValue: 'Repetir' })
                    : t('games.play', { defaultValue: 'Jugar' })}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {deadlyHighlights.length > 0 && (
        <section className="games-deadly-block cn-page-pad" data-testid="games-deadly-block">
          <header className="games-deadly-block__head">
            <Icon name="warning" size="md" aria-hidden="true" />
            <div>
              <h2 className="games-deadly-block__title cn-text-cream">
                {t('games.deadlyTitle', { defaultValue: 'Confusiones que matan' })}
              </h2>
              <p className="games-deadly-block__lead">
                {t('games.deadlyLead', {
                  defaultValue: 'Estudia estas setas de cerca. Solo orientación.',
                })}
              </p>
            </div>
          </header>
          <ul className="games-deadly-block__list">
            {deadlyHighlights.map((s) => {
              const meta = getRiskMeta(s!.risk_label)
              const slug = s!.slug || scientificNameToSlug(s!.taxon)
              return (
                <li key={s!.taxon} className={`games-deadly-block__item ${meta.className}`}>
                  <Link to={`/enciclopedia/${slug}`} className="games-deadly-block__link">
                    <div className="games-deadly-block__media" aria-hidden="true">
                      <SpeciesImage
                        scientificName={s!.taxon}
                        alt=""
                        variant="thumb"
                        preferCatalog
                        quality="display"
                        className="games-deadly-block__img"
                      />
                    </div>
                    <div className="games-deadly-block__info">
                      <em className="games-deadly-block__taxon">{s!.taxon}</em>
                      <span className={`risk-chip risk-chip--${s!.risk_label}`}>
                        {meta.label}
                      </span>
                    </div>
                    <Icon name="chevron_right" size="sm" aria-hidden="true" />
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <div className="games-hub-extra atelier-panel cn-page-pad">
        <p className="cn-kicker" style={{ marginBottom: '0.5rem' }}>
          {t('games.alsoStudy', { defaultValue: 'Seguir aprendiendo' })}
        </p>
        <div className="games-hub-extra__links">
          <Link to="/lookalikes">
            {t('nav.lookalikes', { defaultValue: 'Confusiones' })}
          </Link>
          <Link to="/educacion">{t('nav.education', { defaultValue: 'Educación' })}</Link>
          <Link to="/identificar">{t('nav.identify', { defaultValue: 'Identificar' })}</Link>
          <Link to="/setadle">{t('nav.setadle', { defaultValue: 'Todos los modos Setadle' })}</Link>
        </div>
      </div>
    </PageShell>
  )
}

export default GamesHubPage
