/** Games hub — Stitch B 04-juegos (photo cards + badges). */
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
    bodyFb:
      'Puzzle diario con pistas de hábitat y forma. Solo educación: no identifica setas reales.',
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
    bodyFb:
      'Adivina el nombre en letras. Sirve para vocabulario, no para salir a recolectar.',
    ctaKey: 'games.playWordle',
    ctaFb: 'Jugar Wordle',
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
    bodyFb:
      'Preguntas sobre confusiones y multi-vista. Entrena el ojo, no el plato.',
    ctaKey: 'games.playQuiz',
    ctaFb: 'Abrir reto',
    badgeKey: 'games.badgeChallenge',
    badgeFb: 'Reto',
    taxon: 'Morchella esculenta',
  },
] as const

export function GamesHubPage() {
  const { t } = useTranslation()

  return (
    <div className="cn-page page-games-hub" data-testid="games-hub-page">
      <p className="cn-warn-strip" role="note">
        {t('games.orientation', {
          defaultValue: 'Juegos educativos · nunca permiso de consumo',
        })}
      </p>
      <header className="cn-page-head cn-page-pad">
        <p className="cn-kicker mkt-kicker">
          {t('games.kicker', { defaultValue: 'Juegos de campo' })}
        </p>
        <h1 className="cn-page-head__title">
          {t('games.title', { defaultValue: 'Entrena el ojo' })}
        </h1>
        <p className="cn-page-head__lead">
          {t('games.policy', {
            defaultValue:
              'Aprende nombres, hábitats y confusiones. No sustituye a Identificar y no autoriza consumo.',
          })}
        </p>
      </header>

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
