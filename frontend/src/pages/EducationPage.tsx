/**
 * Education — safety, anatomy, seasons, emergency.
 * Wave A: no cooking/dosing/consumption-permission language.
 */
import { useState, type ReactNode } from 'react'
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
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  return (
    <div className="page-education page-atelier-shell">
      <div className="page-header">
        <h1 className="page-title">Aprende micología</h1>
        <p className="page-subtitle">
          Caracteres, riesgo y cabeza fría. Educación de campo — no recetario.
        </p>
      </div>

      <div className="safety-disclaimer" role="note">
        <strong>Solo orientación</strong>
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
