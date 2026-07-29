/**
 * Seek-inspired educational badges strip (games/study only).
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  badgeBlurb,
  badgeTitle,
  getStudyBadges,
  liveStreak,
  readStudyStreak,
} from '../lib/studyBadges'

type Props = {
  className?: string
  compact?: boolean
}

export function StudyBadgesPanel({ className = '', compact = false }: Props) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage || i18n.language || 'es'
  // Re-read on mount; parent pages re-mount after games finish
  const badges = useMemo(() => getStudyBadges(localStorage, locale), [locale])
  const streak = useMemo(() => liveStreak(readStudyStreak()), [])
  const earned = badges.filter((b) => b.earned)
  const show = compact ? earned.slice(0, 4) : badges

  return (
    <section
      className={`study-badges ${compact ? 'study-badges--compact' : ''} ${className}`.trim()}
      aria-label={t('study.badgesAria', {
        defaultValue: 'Insignias de estudio',
      })}
      data-testid="study-badges-panel"
    >
      <header className="study-badges__head">
        <h3 className="study-badges__title">
          {t('study.badgesTitle', { defaultValue: 'Insignias de estudio' })}
        </h3>
        <span className="study-badges__streak" data-testid="study-streak">
          {t('study.streak', {
            defaultValue: 'Racha: {{n}} días',
            n: streak,
          })}
        </span>
      </header>
      <p className="study-badges__lead">
        {t('study.badgesLead', {
          defaultValue:
            'Como Seek: recompensas por aprender, nunca por “comestible”. Solo estudio local en este dispositivo.',
        })}
      </p>
      <ul className="study-badges__list">
        {show.map((b) => (
          <li
            key={b.id}
            className={`study-badges__item ${b.earned ? 'is-earned' : 'is-locked'}`}
            data-badge={b.id}
            title={badgeBlurb(b, locale)}
          >
            <span className="study-badges__emoji" aria-hidden="true">
              {b.earned ? b.emoji : '·'}
            </span>
            <span className="study-badges__name">{badgeTitle(b, locale)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
