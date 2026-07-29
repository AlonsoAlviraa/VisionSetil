/** Games hub — Setadle, Wordle, Reto (Option B Stitch style). */
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SpeciesImage } from '../components/SpeciesImage'

const GAMES = [
  {
    to: '/setadle',
    testId: 'games-hub-setadle',
    titleKey: 'games.setadleTitle',
    titleFb: 'Setadle',
    bodyKey: 'games.setadleBody',
    bodyFb: 'Puzzle diario de hábitat y rasgos de campo. Educativo, no identifica setas.',
    ctaKey: 'games.play',
    ctaFb: 'Jugar Setadle',
    tone: 'amber' as const,
    taxon: 'Cantharellus cibarius',
  },
  {
    to: '/wordle',
    testId: 'games-hub-wordle',
    titleKey: 'games.wordleTitle',
    titleFb: 'Wordle de setas',
    bodyKey: 'games.wordleBody',
    bodyFb: 'Adivina el taxón en letras. Solo orientación y vocabulario micológico.',
    ctaKey: 'games.playWordle',
    ctaFb: 'Jugar Wordle',
    tone: 'moss' as const,
    taxon: 'Amanita muscaria',
  },
  {
    to: '/reto',
    testId: 'games-hub-quiz',
    titleKey: 'games.quizTitle',
    titleFb: 'Reto diario',
    bodyKey: 'games.quizBody',
    bodyFb: 'Quiz de confusiones y lookalikes. Multi-vista que discrimina, nunca consumo.',
    ctaKey: 'games.playQuiz',
    ctaFb: 'Abrir reto',
    tone: 'primary' as const,
    taxon: 'Morchella esculenta',
  },
] as const

export function GamesHubPage() {
  const { t } = useTranslation()

  return (
    <div className="page-games-hub page-atelier-shell page-games-hub--cn" data-testid="games-hub-page">
      <p className="cn-orientation home-orientation-sticky" role="note">
        {t('games.orientation', {
          defaultValue: 'Solo orientación educativa · nunca consumo',
        })}
      </p>
      <header className="mkt-page-head">
        <p className="mkt-kicker">
          {t('games.kicker', { defaultValue: 'Juegos · VisionSetil' })}
        </p>
        <h1 className="mkt-page-head__title">
          {t('games.title', { defaultValue: 'Juegos de campo' })}
        </h1>
        <p className="mkt-page-head__lead" role="note">
          {t('games.policy', {
            defaultValue:
              'Solo educativos. No sustituyen Identify multi-vista ni dan permiso de consumo o recolección.',
          })}
        </p>
      </header>

      <ul className="games-hub-grid">
        {GAMES.map((g) => (
          <li key={g.to}>
            <article
              className={`games-hub-card games-hub-card--photo games-hub-card--${g.tone}`}
              data-testid={g.testId}
            >
              <div className="games-hub-card__media" aria-hidden="true">
                <SpeciesImage
                  scientificName={g.taxon}
                  alt=""
                  variant="card"
                  layout="fill"
                  preferCatalog
                />
              </div>
              <div className="games-hub-card__content">
                <h2 className="games-hub-card__title">
                  {t(g.titleKey, { defaultValue: g.titleFb })}
                </h2>
                <p className="games-hub-card__body">
                  {t(g.bodyKey, { defaultValue: g.bodyFb })}
                </p>
                <Link to={g.to} className="mkt-btn mkt-btn--primary mkt-btn--sm">
                  {t(g.ctaKey, { defaultValue: g.ctaFb })}
                </Link>
              </div>
            </article>
          </li>
        ))}
      </ul>

      <section className="games-hub-extra atelier-panel" aria-label="Más aprendizaje">
        <h2 className="games-hub-extra__title">
          {t('games.moreLearn', { defaultValue: 'También para aprender' })}
        </h2>
        <div className="games-hub-extra__links">
          <Link to="/lookalikes">{t('nav.lookalikes', { defaultValue: 'Lookalike Studio' })}</Link>
          <Link to="/educacion">{t('nav.education', { defaultValue: 'Educación' })}</Link>
          <Link to="/identificar">{t('nav.identify', { defaultValue: 'Identificar multi-vista' })}</Link>
        </div>
      </section>
    </div>
  )
}

export default GamesHubPage
