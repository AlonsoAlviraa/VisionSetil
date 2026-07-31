/**
 * DichotomousKey — educational morphology key (MushroomExpert-lite, v1.11).
 *
 * Narrows the catalog via hymenium-type questions. Results are study hints
 * linking to species sheets — NEVER confirms consumption or safe ID.
 * Policy: orientation only · open-set by design.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSpeciesCatalog } from '../hooks/useSpeciesCatalog'
import { Button, Icon } from './ui'
import { SpeciesThumb } from './SpeciesThumb'
import { RiskChip } from './RiskChip'
import {
  DICHOTOMOUS_QUESTIONS,
  DICHOTOMOUS_POLICY_ES,
  applyDichotomousKey,
  type DichotomousAnswers,
} from '../lib/dichotomousKey'

export function DichotomousKey() {
  const { t } = useTranslation()
  const { catalog } = useSpeciesCatalog()
  const [answers, setAnswers] = useState<DichotomousAnswers>({})

  const result = useMemo(
    () => applyDichotomousKey(catalog, answers),
    [catalog, answers],
  )

  const reset = () => setAnswers({})

  return (
    <section className="dichotomous-key cn-glass" data-testid="dichotomous-key">
      <header className="dichotomous-key__head">
        <Icon name="account_tree" size="lg" aria-hidden="true" />
        <div>
          <h2 className="dichotomous-key__title cn-text-cream">
            {t('dichotomous.title', { defaultValue: 'Clave dicotómica' })}
          </h2>
          <p className="dichotomous-key__subtitle">
            {t('dichotomous.subtitle', {
              defaultValue: 'Estrecha el catálogo por caracteres morfológicos',
            })}
          </p>
        </div>
      </header>

      <p className="dichotomous-key__policy" role="note">
        <Icon name="do_not_disturb_on" size="sm" aria-hidden="true" />
        {t('dichotomous.policy', { defaultValue: DICHOTOMOUS_POLICY_ES })}
      </p>

      <div className="dichotomous-key__questions">
        {DICHOTOMOUS_QUESTIONS.map((q) => (
          <div key={q.id} className="dichotomous-key__question">
            <h3 className="dichotomous-key__question-title">
              {t(q.titleKey, { defaultValue: q.titleFallback })}
            </h3>
            <p className="dichotomous-key__question-hint">
              {t(q.hintKey, { defaultValue: q.hintFallback })}
            </p>
            <div className="dichotomous-key__options" role="radiogroup">
              {q.options.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={answers[q.id] === opt.id}
                  className={`dichotomous-key__option ${answers[q.id] === opt.id ? 'dichotomous-key__option--active' : ''}`}
                  onClick={() => setAnswers((a) => ({ ...a, [q.id]: opt.id }))}
                >
                  {t(opt.labelKey, { defaultValue: opt.labelFallback })}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {result.answeredCount > 0 && (
        <div className="dichotomous-key__results">
          <div className="dichotomous-key__results-head">
            <h3 className="dichotomous-key__results-title">
              {t('dichotomous.results', {
                defaultValue: 'Candidatos de estudio ({{n}})',
                n: result.matches.length,
              })}
            </h3>
            <Button
              type="button"
              variant="ghost"
              className="dichotomous-key__reset"
              onClick={reset}
            >
              <Icon name="restart_alt" size="sm" aria-hidden="true" />
              {t('dichotomous.reset', { defaultValue: 'Reiniciar' })}
            </Button>
          </div>
          {result.matches.length === 0 ? (
            <p className="dichotomous-key__empty">
              {t('dichotomous.empty', {
                defaultValue: 'Sin candidatos con ese carácter. Prueba otra opción.',
              })}
            </p>
          ) : (
            <ul className="dichotomous-key__list">
              {result.matches.map((s) => (
                <li key={s.slug} className="dichotomous-key__item">
                  <SpeciesThumb taxon={s.taxon} riskLabel={s.risk_label} size={48} />
                  <div className="dichotomous-key__item-info">
                    <span className="dichotomous-key__item-name">
                      <em>{s.taxon}</em>
                    </span>
                    <RiskChip risk={s.risk_label} />
                  </div>
                  {s.slug && (
                    <Link
                      to={`/enciclopedia/${s.slug}`}
                      className="dichotomous-key__item-link"
                    >
                      <Icon name="menu_book" size="sm" aria-hidden="true" />
                      {t('dichotomous.viewSheet', { defaultValue: 'Ficha' })}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="dichotomous-key__results-note">
            {t('dichotomous.resultsNote', {
              defaultValue:
                'Estos son puntos de partida de estudio, no identificaciones. Confirma siempre con un micólogo.',
            })}
          </p>
        </div>
      )}
    </section>
  )
}

export default DichotomousKey
