/**
 * Education — safety, anatomy, seasons, multi-view diagnostics, emergency.
 * Wave A: no cooking/dosing/consumption-permission language.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  IconAlert,
  IconBan,
  IconBook,
  IconCalendar,
  IconCap,
  IconDetail,
  IconExpert,
  IconGills,
  IconInfo,
  IconLeaf,
  IconMicroscope,
  IconNote,
  IconSearch,
  IconSnowflake,
  IconStem,
  IconSun,
} from '../components/icons'
import {
  deadlyCoach,
  deadlyDiagnosticPairs,
  deadlyPriorityViews,
  diagnosticPolicy,
} from '../lib/diagnosticViews'
import { DichotomousKey } from '../components/DichotomousKey'

interface AccordionItem {
  q: string
  a: string
}

const safetyRules: Array<{ icon: ReactNode; title: string; desc: string }> = [
  {
    icon: <IconBan size={22} />,
    title: 'Sin certeza, no hay decisión de campo',
    desc: 'Ante la mínima duda, déjala. Una sola confusión mortal puede ser irreversible.',
  },
  {
    icon: <IconExpert size={22} />,
    title: 'Aprende con gente que sepa',
    desc: 'Sal con micólogos o grupos locales antes de fiarte de una app o una guía sola.',
  },
  {
    icon: <IconBook size={22} />,
    title: 'Cruza varias pistas',
    desc: 'Fotos multi-vista, caracteres, hábitat, esporada y opinión experta. Una app no basta.',
  },
  {
    icon: <IconAlert size={22} />,
    title: 'Lo no identificado = riesgo',
    desc: 'Si no sabes qué es, trátala como potencialmente peligrosa. No hay atajos.',
  },
  {
    icon: <IconSearch size={22} />,
    title: 'Mira láminas, pie y base',
    desc: 'Muchas confusiones se resuelven (o se agravan) por no mirar la parte de abajo o la volva.',
  },
  {
    icon: <IconMicroscope size={22} />,
    title: 'La app orienta, no certifica',
    desc: 'VisionSetil puede abstenerse. Eso es una feature de seguridad, no un fallo.',
  },
]

const anatomyParts = [
  {
    icon: <IconCap size={22} />,
    name: 'Sombrero (Píleo)',
    desc: 'Forma, color y textura de la parte superior. Primer plano de casi cualquier ficha.',
    features: [
      'Forma: convexo, plano, deprimido, cónico',
      'Superficie: lisa, escamosa, viscosa',
      'Color y cambios de color',
    ],
  },
  {
    icon: <IconGills size={22} />,
    name: 'Himenio',
    desc: 'Parte inferior: láminas, poros, pliegues o aguijones. Crítico para no confundir géneros.',
    features: ['Láminas', 'Poros (tubos)', 'Pliegues', 'Aguijones'],
  },
  {
    icon: <IconStem size={22} />,
    name: 'Pie (Estípite)',
    desc: 'Anillo, grosor y textura del tallo. En Amanita, la base y la volva son decisivas.',
    features: [
      'Anillo: presente o ausente',
      'Volva: saco en la base (clave en Amanita)',
      'Altura y consistencia',
    ],
  },
  {
    icon: <IconDetail size={22} />,
    name: 'Carne y olor',
    desc: 'Color al corte y olor ayudan a separar lookalikes. Nunca “pruebes” una seta dudosa.',
    features: [
      'Cambio de color al corte',
      'Olor (harina, anís, desagradable…)',
      'Contexto: árbol, sustrato, época',
    ],
  },
]

const seasons = [
  {
    icon: <IconLeaf size={22} />,
    name: 'Primavera',
    months: 'Marzo – Mayo',
    species: ['Morchella esculenta', 'Calocybe gambosa', 'Agaricus campestris'],
    note: 'Temporada corta. Ideal para estudiar caracteres, no para improvisar.',
  },
  {
    icon: <IconSun size={22} />,
    name: 'Verano',
    months: 'Junio – Agosto',
    species: ['Cantharellus cibarius', 'Amanita caesarea', 'Amanita phalloides'],
    note: 'Tras tormentas puede haber diversidad… y confusiones graves.',
  },
  {
    icon: <IconLeaf size={22} />,
    name: 'Otoño',
    months: 'Septiembre – Noviembre',
    species: ['Boletus edulis', 'Lactarius deliciosus', 'Amanita phalloides', 'Galerina marginata'],
    note: 'Pico de temporada. Más setas = más lookalikes. Prioriza el riesgo.',
  },
  {
    icon: <IconSnowflake size={22} />,
    name: 'Invierno',
    months: 'Diciembre – Febrero',
    species: ['Tuber melanosporum', 'Pleurotus ostreatus', 'Flammulina velutipes'],
    note: 'Menos especies, pero el mismo criterio: si no sabes, no decidas.',
  },
]

const fieldTips: Array<{ icon: ReactNode; text: string }> = [
  {
    icon: <IconNote size={18} />,
    text: 'Anota fecha, hábitat y árboles cercanos — son pistas tan útiles como la foto.',
  },
  {
    icon: <IconSearch size={18} />,
    text: 'Fotografía láminas, perfil, base y entorno antes de tocar nada.',
  },
  {
    icon: <IconBook size={18} />,
    text: 'No mezcles especies en la misma cesta o bandeja de fotos.',
  },
  {
    icon: <IconExpert size={18} />,
    text: 'Si dudas, guarda una muestra y consulta a un experto o sociedad micológica.',
  },
]

const faqItems: AccordionItem[] = [
  {
    q: '¿Es segura la identificación por IA?',
    a: 'No como decisión final. Es orientación: puede equivocarse o abstenerse. Un micólogo humano debe validar cualquier caso serio.',
  },
  {
    q: '¿Qué hago si sospecho intoxicación?',
    a: 'Llama al 112 o al Instituto Nacional de Toxicología (915 620 420), 24 h. Conserva una muestra de la seta. No te automediques.',
  },
  {
    q: '¿Cuál es la seta más peligrosa aquí?',
    a: 'Amanita phalloides (oronja verde) causa la mayoría de muertes por setas. Las amatoxinas dañan el hígado; los síntomas tardan en aparecer.',
  },
  {
    q: '¿La app me dice si es “buena”?',
    a: 'No. VisionSetil habla de riesgo y orientación, nunca de permiso de consumo ni de “seta buena para la sartén”.',
  },
  {
    q: '¿Cómo ayudo al modelo?',
    a: 'Multi-vista (láminas, perfil, base, hábitat), buena luz y metadatos de campo. Si el modelo se abstiene, hazle caso.',
  },
]

export function EducationPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage || i18n.language || 'es'
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  const priorityViews = useMemo(() => deadlyPriorityViews().slice(0, 3), [])
  const deadlyPairs = useMemo(() => deadlyDiagnosticPairs().slice(0, 8), [])
  const coach = useMemo(() => deadlyCoach(locale), [locale])

  return (
    <div className="cn-page page-education page-atelier-shell" data-skin="campo-nocturno">
      <p className="cn-warn-strip" role="note">
        {t('education.orientation', {
          defaultValue: 'Solo orientación · nunca consumo',
        })}
      </p>
      <div className="page-header">
        <p className="mkt-kicker">
          {t('education.kicker', { defaultValue: 'Aprender · campo' })}
        </p>
        <h1 className="page-title">
          {t('education.title', { defaultValue: 'Seguridad en el Campo' })}
        </h1>
        <p className="page-subtitle">
          {t('education.subtitle', {
            defaultValue:
              'Reglas de campo, anatomía y multi-vista. Orientación — nunca permiso de consumo.',
          })}
        </p>
      </div>

      <div className="safety-disclaimer edu-never-consume" role="note">
        <strong>Nunca consumir</strong>
        <p>Aquí aprendes a observar y a dudar. Ningún texto de esta app autoriza consumo.</p>
      </div>

      <section className="edu-section">
        <h2 className="edu-section-title">
          <IconAlert size={22} />
          Seis reglas de oro
        </h2>
        <div className="rules-grid">
          {safetyRules.map((rule) => (
            <div key={rule.title} className="rule-card">
              <span className="rule-icon">{rule.icon}</span>
              <h3>{rule.title}</h3>
              <p>{rule.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="edu-section">
        <h2 className="edu-section-title">
          <IconMicroscope size={22} />
          Anatomía útil
        </h2>
        <p className="edu-intro">
          Identificar es mirar piezas: sombrero, himenio, pie y base. Cada una desmonta confusiones.
        </p>
        <div className="anatomy-grid">
          {anatomyParts.map((part) => (
            <div key={part.name} className="anatomy-detail-card">
              <div className="anatomy-detail-header">
                <span className="anatomy-detail-icon">{part.icon}</span>
                <h3>{part.name}</h3>
              </div>
              <p>{part.desc}</p>
              <ul>
                {part.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="edu-section">
        <h2 className="edu-section-title">
          <IconCalendar size={22} />
          Calendario (educativo)
        </h2>
        <div className="seasons-grid">
          {seasons.map((s) => (
            <div key={s.name} className="season-card">
              <div className="season-header">
                <span className="season-icon">{s.icon}</span>
                <div>
                  <h3>{s.name}</h3>
                  <span className="season-months">{s.months}</span>
                </div>
              </div>
              <p className="season-note">{s.note}</p>
              <div className="season-species">
                {s.species.map((sp) => (
                  <span key={sp} className="season-species-tag">
                    {sp}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="edu-section">
        <h2 className="edu-section-title">
          <IconNote size={22} />
          En el campo
        </h2>
        <div className="tips-grid">
          {fieldTips.map((tip) => (
            <div key={tip.text} className="tip-item tip-item--icon">
              <span className="tip-item__icon" aria-hidden="true">
                {tip.icon}
              </span>
              <span>{tip.text}</span>
            </div>
          ))}
        </div>
      </section>

      {/* v1.11: educational dichotomous key (MushroomExpert-lite) */}
      <section
        className="edu-section edu-dichotomous"
        data-testid="edu-dichotomous-key"
        aria-label={t('education.dichotomousAria', {
          defaultValue: 'Clave dicotómica educativa',
        })}
      >
        <DichotomousKey />
      </section>

      <section
        className="edu-section edu-multiview-diag"
        data-testid="edu-multiview-diagnostic"
        aria-label={t('education.multiviewDiagAria', {
          defaultValue: 'Multi-vista diagnóstica (educativo)',
        })}
      >
        <h2 className="edu-section-title">
          <IconGills size={22} />
          {t('education.multiviewDiagTitle', {
            defaultValue: 'Multi-vista que sí discrimina',
          })}
        </h2>
        <p className="edu-intro" data-testid="edu-deadly-coach">
          {coach}
        </p>
        <p className="edu-intro muted">
          {t('education.multiviewDiagLead', {
            defaultValue:
              'Más fotos sin láminas, perfil y base no mejoran la seguridad con confusiones mortales. Solo orientación — nunca consumo.',
          })}
        </p>
        <div className="edu-priority-views" data-testid="edu-priority-views">
          <span className="lookalike-item__diag-label">
            {t('education.priorityViews', { defaultValue: 'Prioridad de captura:' })}
          </span>
          {priorityViews.map((view) => (
            <span
              key={view}
              className="lookalike-item__diag-badge lookalike-item__diag-badge--static"
              data-slot={view}
            >
              {t(`identify.views.${view}`, { defaultValue: view })}
            </span>
          ))}
        </div>
        {deadlyPairs.length > 0 && (
          <div className="edu-diag-pairs" data-testid="edu-diag-pairs">
            {deadlyPairs.map((pair) => (
              <article
                key={pair.id}
                className="edu-diag-pair atelier-panel"
                data-pair-id={pair.id}
              >
                <h3 className="edu-diag-pair__taxa">
                  {pair.taxa.slice(0, 2).join(' ↔ ')}
                </h3>
                {pair.why ? <p className="edu-diag-pair__why muted">{pair.why}</p> : null}
                <div className="lookalike-item__diag-views">
                  {(pair.critical_views || []).slice(0, 4).map((view) => (
                    <span
                      key={view}
                      className="lookalike-item__diag-badge lookalike-item__diag-badge--static"
                      data-slot={view}
                    >
                      {t(`identify.views.${view}`, { defaultValue: view })}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
        <p className="lookalike-item__diag-policy muted" data-policy={diagnosticPolicy()}>
          {t('result.pairDiagPolicy', {
            defaultValue:
              'Educativo: multi-foto sin estas vistas no basta — solo orientación, nunca consumo.',
          })}
        </p>
        <div className="edu-cta-cards" style={{ marginTop: '0.75rem' }}>
          <Link to="/identificar" className="edu-cta-card atelier-panel">
            <strong>{t('nav.identify', { defaultValue: 'Identificar' })}</strong>
            <span>
              {t('education.tryMultiview', {
                defaultValue: 'Prueba el asistente multi-vista (open-set puede abstenerse).',
              })}
            </span>
          </Link>
          <Link to="/lookalikes" className="edu-cta-card atelier-panel">
            <strong>Lookalike Studio</strong>
            <span>
              {t('education.openStudio', {
                defaultValue: 'Compara confusiones clásicas con vistas críticas.',
              })}
            </span>
          </Link>
        </div>
      </section>

      <section className="edu-section">
        <h2 className="edu-section-title">
          <IconInfo size={22} />
          Preguntas frecuentes
        </h2>
        <div className="faq-list">
          {faqItems.map((item, i) => (
            <div key={item.q} className={`faq-item ${openFaq === i ? 'faq-item--open' : ''}`}>
              <button
                type="button"
                className="faq-question"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
              >
                {item.q}
                <span className="faq-chevron">{openFaq === i ? '−' : '+'}</span>
              </button>
              {openFaq === i && <p className="faq-answer">{item.a}</p>}
            </div>
          ))}
        </div>
      </section>

      <section
        className="edu-section edu-cta-grid"
        aria-label={t('a11y.keepLearning', { defaultValue: 'Seguir aprendiendo' })}
      >
        <h2 className="edu-section-title">
          <IconBook size={22} />
          Seguir aprendiendo
        </h2>
        <div className="edu-cta-cards">
          <Link to="/lookalikes" className="edu-cta-card atelier-panel">
            <strong>Lookalikes</strong>
            <span>Confusiones clásicas lado a lado, con riesgo visible.</span>
          </Link>
          <Link to="/reto" className="edu-cta-card atelier-panel">
            <strong>Reto</strong>
            <span>Quiz de caracteres y clase educativa — sin permiso de consumo.</span>
          </Link>
          <Link to="/enciclopedia" className="edu-cta-card atelier-panel">
            <strong>Enciclopedia</strong>
            <span>Fichas con fotos, familia, temporada e Iberia.</span>
          </Link>
          <Link to="/revision-experta" className="edu-cta-card atelier-panel">
            <strong>Revisión experta</strong>
            <span>Empaqueta evidencia para un micólogo humano.</span>
          </Link>
        </div>
      </section>

      <section className="edu-section">
        <div className="emergency-box">
          <span className="emergency-icon" aria-hidden="true">
            <IconAlert size={28} />
          </span>
          <div>
            <h3>¿Sospecha de intoxicación?</h3>
            <p>
              <strong>112</strong> o Toxicología <strong>915 620 420</strong> (24 h). Conserva una
              muestra. No te automediques.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
