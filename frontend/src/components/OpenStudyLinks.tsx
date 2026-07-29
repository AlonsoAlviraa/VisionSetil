/** Educational outbound links (Wikipedia, iNat, GBIF) — competitive pattern. */
import { useTranslation } from 'react-i18next'
import { openStudyLinksForTaxon } from '../lib/openStudyLinks'

export function OpenStudyLinks({ taxon }: { taxon: string }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage || i18n.language || 'es'
  const links = openStudyLinksForTaxon(taxon, locale)
  if (links.length === 0) return null

  return (
    <section
      className="open-study-links atelier-card"
      data-testid="open-study-links"
      aria-label={t('detail.openStudyAria', {
        defaultValue: 'Estudiar en fuentes abiertas',
      })}
    >
      <h2 className="open-study-links__title">
        {t('detail.openStudyTitle', {
          defaultValue: 'Estudiar en la web',
        })}
      </h2>
      <p className="open-study-links__lead">
        {t('detail.openStudyLead', {
          defaultValue:
            'Como en iNaturalist y las enciclopedias abiertas: compara fotos y nombres. Nunca es permiso de consumo.',
        })}
      </p>
      <ul className="open-study-links__list">
        {links.map((l) => (
          <li key={l.id}>
            <a
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="open-study-links__a"
              data-testid={`open-study-${l.id}`}
            >
              {locale.toLowerCase().startsWith('en') ? l.labelEn : l.labelEs}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default OpenStudyLinks
