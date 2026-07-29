/** Games hub — Stitch B 04-juegos (photo cards + badges + study progress). */
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SpeciesImage } from '../components/SpeciesImage'
import { Icon } from '../components/ui'
import { useSpeciesCatalog } from '../hooks/useSpeciesCatalog'
import { readStudyStreak, readStudyStats } from '../lib/studyBadges'
import { HIGH_SEARCH_TAXA } from '../lib/encyclopediaPopularity'
import { getRiskMeta } from '../lib/riskLabels'
import { scientificNameToSlug } from '../lib/slug'

const GAMES = [
  {
    to: '/setadle',
    testId: 'games-hub-setadle',
    titleKey: 'games.setadleTitle',
    titleFb: 'Setadle',
    bodyKey: 'games.setadleBody',
    bodyFb: 'Puzzle diario de hábitat y forma.',
    ctaKey: 'games.play',
    ctaFb: 'Jugar',
    badgeKey: 'games.badgeDaily',
    badgeFb: 'Diario',
    taxon: 'Cantharellus cibarius',
  },
  {
    to: '/wordle',
    testId: 'games-hub-wordle',
    titleKey: 'games.wordleTitle',
    titleFb: 'Wordle de setas',
    bodyKey: 'games.wordleBody',
    bodyFb: 'Nombres, letra a letra.',
    ctaKey: 'games.playWordle',
    ctaFb: 'Jugar',
    badgeKey: 'games.badgePopular',
    badgeFb: 'Popular',
    taxon: 'Amanita muscaria',
  },
  {
    to: '/reto',
    testId: 'games-hub-quiz',
    titleKey: 'games.quizTitle',
    titleFb: 'Reto diario',
    bodyKey: 'games.quizBody',
    bodyFb: 'Confusiones y multi-vista.',
    ctaKey: 'games.playQuiz',
    ctaFb: 'Abrir',
    badgeKey: 'games.badgeChallenge',
    badgeFb: 'Reto',
    taxon: 'Morchella esculenta',
  },
] as const

/** High-risk taxa pulled from the catalog for the "deadly confusions" block. */
function useDeadlyHighlights() {
  const { catalog } = useSpeciesCatalog()
  return useMemo(() => {
    const byTaxon = new Map(catalog.map((s) => [s.taxon, s]))
    const deadly = HIGH_SEARCH_TAXA.map((t) => byTaxon.get(t))
      .filter((s) => s && (s.risk_label === 'deadly' || s.risk_label === 'poisonous'))
      .slice(0, 4)
    return deadly
  }, [catalog])
}

export function GamesHubPage() {
  const { t } = useTranslation()
  const streak = readStudyStreak()
  const stats = readStudyStats()
  const deadlyHighlights = useDeadlyHighlights()

  const totalActivities =
    stats.quizSessions + stats.setadleWins + stats.lookalikeCompares + stats.encyclopediaViews

  return (
    <div className="cn-page page-games-hub" data-testid="games-hub-page">
      <p className="cn-warn-strip" role="note">
        {t('games.orientation', {
          defaultValue: 'Solo educación · nunca consumo',
        })}
      </p>
      <header className="cn-page-head cn-page-pad">
        <p className="cn-kicker mkt-kicker">
          {t('games.kicker', { defaultValue: 'Juegos' })}
        </p>
        <h1 className="cn-page-head__title">
          {t('games.title', { defaultValue: 'Entrena el ojo' })}
        </h1>
        <p className="cn-page-head__lead">
          {t('games.policy', {
            defaultValue: 'Aprende jugando. No identifica setas reales.',
          })}
        </p>
      </header>

      {/* ── Study progress panel (real local data) ──────────────────────── */}
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
        {streak.best > 0 && (
          <p className="games-study-panel__best">
            {t('games.bestStreak', { defaultValue: 'Mejor racha: {{n}} días', n: streak.best })}
          </p>
        )}
      </section>

      <ul className="games-hub-grid cn-page-pad">
        {GAMES.map((g) => (
          <li key={g.to}>
            <article className="games-hub-card games-hub-card--photo" data-testid={g.testId}>
              <div className="games-hub-card__media" aria-hidden="true">
                <SpeciesImage
                  scientificName={g.taxon}
                  alt=""
                  variant="card"
                  layout="fill"
                  preferCatalog
                  quality="thumb"
                  sizes="(max-width: 640px) 50vw, 280px"
                />
              </div>
              <span className="games-hub-card__badge">
                {t(g.badgeKey, { defaultValue: g.badgeFb })}
              </span>
              <div className="games-hub-card__content">
                <h2 className="games-hub-card__title">
                  {t(g.titleKey, { defaultValue: g.titleFb })}
                </h2>
                <p className="games-hub-card__body">
                  {t(g.bodyKey, { defaultValue: g.bodyFb })}
                </p>
                <Link to={g.to} className="cn-btn cn-btn--sm">
                  {t(g.ctaKey, { defaultValue: g.ctaFb })}
                </Link>
              </div>
            </article>
          </li>
        ))}
      </ul>

      {/* ── Deadly confusions block (real catalog data) ─────────────────── */}
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
                        quality="thumb"
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
        </div>
      </div>
    </div>
  )
}

export default GamesHubPage
