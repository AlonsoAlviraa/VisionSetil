/**
 * Games hub â€” LoLdle-inspired daily board:
 * - one civil day â†’ several modes
 * - foto del dÃ­a from verified pool
 * - continue CTA â†’ first incomplete daily mode
 * - honest share card (orientation footer Â· never forage)
 * Educational only Â· never consumption / never product_unlock.
 *
 * T3: await speciesPhotos hydrate before buildVerifiedGamesPool so the
 * verified deck is not empty/thin while photos db.version === 'pending'.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SpeciesImage } from '../components/SpeciesImage'
import { Button, Icon, LinkButton, PageShell } from '../components/ui'
import { useSpeciesCatalog } from '../hooks/useSpeciesCatalog'
import { readStudyStreak, readStudyStats } from '../lib/studyBadges'
import { HIGH_SEARCH_TAXA } from '../lib/encyclopediaPopularity'
import { getRiskMeta, isSevereRisk } from '../lib/riskLabels'
import { scientificNameToSlug } from '../lib/slug'
import {
  areSpeciesPhotosReady,
  hydrateSpeciesPhotos,
} from '../lib/speciesImageService'
import {
  buildVerifiedGamesPool,
  continueDailyPath,
  DAILY_GAME_MODES,
  dailyGamesCompletion,
  dailyModeTitle,
  firstIncompleteDailyMode,
  gamesDayKey,
  isDailyBoardComplete,
  pickDailyPhotoSpecies,
  pickDailySpeciesForMode,
  readDailyGamesProgress,
  type DailyGameModeId,
} from '../lib/dailyGames'
import {
  buildDailyBoardShareCard,
  shareFeedbackMessage,
  shareGameText,
} from '../lib/gameShare'

function useDeadlyHighlights() {
  const { catalog } = useSpeciesCatalog()
  return useMemo(() => {
    const byTaxon = new Map(catalog.map((s) => [s.taxon, s]))
    return HIGH_SEARCH_TAXA.map((t) => byTaxon.get(t))
      .filter((s) => s && isSevereRisk(s.risk_label))
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
  const boardComplete = useMemo(() => isDailyBoardComplete(day), [day])
  const continueTarget = useMemo(() => continueDailyPath(day), [day])
  const incompleteMode = useMemo(() => firstIncompleteDailyMode(day), [day])
  const [shareFeedback, setShareFeedback] = useState<string | null>(null)

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

  const onShareBoard = useCallback(async () => {
    const text = buildDailyBoardShareCard({
      day,
      streak: streak.current,
      locale,
    })
    const result = await shareGameText(text, {
      title: t('games.shareTitle', { defaultValue: 'VisionSetil Â· retos del dÃ­a' }),
    })
    setShareFeedback(shareFeedbackMessage(result, t))
  }, [day, streak.current, locale, t])

  const continueModeLabel = dailyModeTitle(incompleteMode || continueTarget, locale)

  const primaryCtaLabel = boardComplete
    ? t('games.primaryReplay', { defaultValue: 'Repetir retos del dÃ­a' })
    : progress.done === 0
      ? t('games.primaryStart', { defaultValue: 'Continuar Â· empezar retos' })
      : t('games.primaryContinue', {
          defaultValue: 'Continuar Â· {{mode}}',
          mode: continueModeLabel,
        })

  return (
    <PageShell
      className="page-games-hub page-games-hub--loldle"
      testId="games-hub-page"
      orientationSticky
      orientationText={t('games.orientation', {
        defaultValue: 'Solo educaciÃ³n Â· nunca consumo',
      })}
    >
      <header className="cn-page-head cn-page-pad">
        <p className="cn-kicker mkt-kicker">
          {t('games.kicker', { defaultValue: 'Juegos Â· diario' })}
        </p>
        <h1 className="cn-page-head__title">
          {t('games.title', { defaultValue: 'Entrena el ojo' })}
        </h1>
        <p className="cn-page-head__lead">
          {t('games.policyLoldle', {
            defaultValue:
              'Como LoLdle: varios retos al dÃ­a, mismos para todos. Solo educaciÃ³n â€” no identifica setas reales ni autoriza consumo.',
          })}
        </p>
        <p className="games-hub-day" data-testid="games-hub-day">
          {t('games.today', { defaultValue: 'Hoy Â· {{day}}', day })}
          {verifiedPool.length > 0 ? (
            <span className="games-hub-day__pool">
              {' Â· '}
              {t('games.verifiedPool', {
                defaultValue: '{{n}} especies verificadas',
                n: verifiedPool.length,
              })}
            </span>
          ) : null}
        </p>
      </header>

      {/* Foto del dÃ­a â€” LoLdle splash energy */}
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
                defaultValue: 'Foto del dÃ­a (educativa)',
              })}
              variant="detail"
              layout="fill"
              preferCatalog
              priority
              quality="display"
              sizes="(max-width: 640px) 100vw, 720px"
              // games_hub surface: display â‰¤500px (MEDIA_SURFACE_POLICY)
            />
            <div className="games-daily-photo__scrim" aria-hidden="true" />
            <div className="games-daily-photo__meta">
              <p className="games-daily-photo__kicker" id="games-daily-photo-title">
                {t('games.dailyPhotoKicker', { defaultValue: 'Foto del dÃ­a' })}
              </p>
              <p className="games-daily-photo__common">{fotoDelDia.common}</p>
              <p className="games-daily-photo__taxon">
                <em>{fotoDelDia.taxon}</em>
              </p>
              <p className="games-daily-photo__hint muted">
                {t('games.dailyPhotoHint', {
                  defaultValue:
                    'Cambia cada dÃ­a Â· misma para todos Â· solo orientaciÃ³n',
                })}
              </p>
              <LinkButton
                to={`/enciclopedia/${fotoDelDia.slug}`}
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

      {/* Daily progress â€” LoLdle multi-mode board */}
      <section
        className="games-daily-progress cn-glass cn-page-pad"
        data-testid="games-daily-progress"
        aria-label={t('games.dailyProgressAria', { defaultValue: 'Progreso diario' })}
      >
        <div className="games-daily-progress__head">
          <strong>
            {t('games.dailyProgress', {
              defaultValue: 'Retos de hoy Â· {{done}}/{{total}}',
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
              {t('games.streakDays', { defaultValue: 'dÃ­as seguidos' })}
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
              defaultValue: 'Tu progreso se guarda en este dispositivo. Â¡Empieza tu racha!',
            })}
          </p>
        )}
      </section>

      {/* Primary CTA â†’ first incomplete daily mode (UX-05 continue-path) */}
      <div className="games-hub-primary cn-page-pad" data-testid="games-hub-primary">
        <LinkButton
          to={continueTarget.to}
          variant="primary"
          size="lg"
          block
          className="games-hub-primary__cta"
          data-testid="games-hub-primary-continue"
          data-continue-mode={continueTarget.id}
        >
          <Icon name="emoji_events" size="md" aria-hidden="true" />
          {primaryCtaLabel}
        </LinkButton>
        <div className="games-hub-primary__row">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void onShareBoard()}
            data-testid="games-hub-share"
          >
            <Icon name="share" size="sm" aria-hidden="true" />
            {t('games.shareBoard', { defaultValue: 'Compartir tablero' })}
          </Button>
          <LinkButton
            to="/identificar"
            skin="cn"
            variant="ghost"
            size="sm"
            data-testid="games-hub-identify-secondary"
          >
            {t('games.identifyField', { defaultValue: 'Identificar en campo' })}
          </LinkButton>
        </div>
        {shareFeedback ? (
          <p className="games-hub-primary__share-fb muted" role="status" data-testid="games-hub-share-fb">
            {shareFeedback}
          </p>
        ) : null}
        <p className="games-hub-primary__hint muted">
          {t('games.primaryDailyHint', {
            defaultValue:
              'Continuar â†’ primer modo incompleto Â· misma fecha Â· solo orientaciÃ³n Â· nunca recolecciÃ³n',
          })}
        </p>
      </div>

      {/* Mode grid â€” LoLdle list of daily challenges */}
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
                  defaultValue: 'Estudia estas setas de cerca. Solo orientaciÃ³n.',
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
          <Link to="/educacion">{t('nav.education', { defaultValue: 'EducaciÃ³n' })}</Link>
          <Link to="/identificar">{t('nav.identify', { defaultValue: 'Identificar' })}</Link>
          <Link to="/setadle">{t('nav.setadle', { defaultValue: 'Todos los modos Setadle' })}</Link>
        </div>
      </div>
    </PageShell>
  )
}

export default GamesHubPage
