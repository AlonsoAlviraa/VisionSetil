/** Education page: guides on safety, anatomy, foraging rules, and seasons. */
import { useState } from 'react'

interface AccordionItem {
  q: string
  a: string
}

const safetyRules = [
  {
    icon: '🚫',
    title: 'Nunca comas una seta que no identifies con 100% de seguridad',
    desc: 'Es la regla de oro. Ante la mínima duda, no la consumas. Una sola seta mortal puede ser letal.',
  },
  {
    icon: '📚',
    title: 'Aprende de un experto',
    desc: 'Antes de salir solo, sal con micólogos experimentados o asiste a jornadas micológicas locales.',
  },
  {
    icon: '📖',
    title: 'Usa varias fuentes para identificar',
    desc: 'Una app no es suficiente. Combina observación visual, guías, esporadas y opinión experta.',
  },
  {
    icon: '🗑️',
    title: 'Rechaza las setas viejas o en mal estado',
    desc: 'Las setas pasadas pueden acumular toxinas o causar problemas digestivos incluso siendo comestibles.',
  },
  {
    icon: '🔥',
    title: 'Cocina siempre bien las setas',
    desc: 'Muchas setas comestibles son tóxicas en crudo. La cocción destruye toxinas termolábiles.',
  },
  {
    icon: '⚠️',
    title: 'Consume poca cantidad la primera vez',
    desc: 'Incluso las setas comestibles pueden causar alergias o intolerancias individuales.',
  },
]

const anatomyParts = [
  {
    icon: '🎩',
    name: 'Sombrero (Píleo)',
    desc: 'La parte superior, con formas, colores y texturas muy variables. Clave para la identificación.',
    features: ['Forma: convexo, plano, deprimido, cónico', 'Superficie: lisa, escamosa, viscosa', 'Color y cambios de color'],
  },
  {
    icon: '🔻',
    name: 'Himenio',
    desc: 'La parte fértil bajo el sombrero donde se producen las esporas. Fundamental para clasificar.',
    features: ['Láminas', 'Poros (tubos)', 'Pliegues', 'Aguijones'],
  },
  {
    icon: '🦵',
    name: 'Pie (Estípite)',
    desc: 'El soporte del sombrero. Su forma, anillo y volva son caracteres diagnósticos esenciales.',
    features: ['Anillo: presente o ausente', 'Volva: saco en la base (¡cuidado con Amanita!)', 'Consistencia y altura'],
  },
  {
    icon: '✂️',
    name: 'Carne',
    desc: 'El interior de la seta. Su color, olor, sabor y cambios al corte son pistas valiosas.',
    features: ['Cambio de color al corte', 'Olor (harina, anís, frutas)', 'Sabor (probar y escupir)'],
  },
]

const seasons = [
  {
    icon: '🌸',
    name: 'Primavera',
    months: 'Marzo - Mayo',
    species: ['Morchella esculenta', 'Agaricus campestris', 'Calocybe gambosa'],
    note: 'Temporada corta pero con especies muy cotizadas como las colmenas (Morchella).',
  },
  {
    icon: '☀️',
    name: 'Verano',
    months: 'Junio - Agosto',
    species: ['Cantharellus cibarius', 'Amanita caesarea', 'Russula virescens'],
    note: 'Requiere lluvias de verano. Buen momento para chantarelas y oronjas en zonas cálidas.',
  },
  {
    icon: '🍂',
    name: 'Otoño',
    months: 'Septiembre - Noviembre',
    species: ['Boletus edulis', 'Lactarius deliciosus', 'Amanita phalloides', 'Hydnum repandum'],
    note: 'LA temporada micológica por excelencia. Mayor diversidad y abundancia de especies.',
  },
  {
    icon: '❄️',
    name: 'Invierno',
    months: 'Diciembre - Febrero',
    species: ['Tuber melanosporum', 'Pleurotus ostreatus', 'Flammulina velutipes'],
    note: 'Pocas especies pero muy valiosas: la trufa negra y la seta de ostra.',
  },
]

const faqItems: AccordionItem[] = [
  {
    q: '¿Es segura la identificación por IA?',
    a: 'La IA es una herramienta orientativa, NO definitiva. VisionSetil indica un nivel de confianza y puede rechazar una identificación si no está seguro. Siempre debes confirmar con un experto antes de consumir.',
  },
  {
    q: '¿Qué hago si creo que he comido una seta tóxica?',
    a: 'Llama inmediatamente al 112 o al Instituto Nacional de Toxicología (915 620 420). Conserva una muestra de la seta y de los restos de comida. No provoques el vómito salvo indicación médica.',
  },
  {
    q: '¿Cuál es la seta más peligrosa?',
    a: 'Amanita phalloides (oronja verde) es responsable del 90% de muertes por setas en el mundo. Sus toxinas (amatoxinas) destruyen el hígado y los síntomas aparecen cuando ya es tarde.',
  },
  {
    q: '¿Puedo fiarme de las setas que venden en mercados?',
    a: 'Sí, las setas de comercios autorizados pasan controles sanitarios. El riesgo está en el consumo de setas recolectadas personalmente sin conocimiento suficiente.',
  },
  {
    q: '¿Es legal recolectar setas silvestres?',
    a: 'Depende de la normativa de cada comunidad autónoma. Generalmente se requiere permiso y hay límites de cantidad. Infórmate siempre en tu región antes de salir al campo.',
  },
  {
    q: '¿Cómo hago una esporada?',
    a: 'Corta el sombrero maduro, colócalo boca abajo sobre papel blanco y oscuro, cubre con un vaso y espera 12-24h. El color de las esporas (blanco, rosa, marrón, negro) es clave para la identificación.',
  },
]

const foragingTips = [
  '🧺 Usa cestas de mimbre, nunca bolsas de plástico (las setas se pudren)',
  '✂️ Corta con navaja, no arranques (conserva la micelio)',
  '📝 Anota la fecha, hábitat y árboles cercanos',
  '🧹 Limpia las setas en el campo con un cepillo pequeño',
  '🔍 Identifica en el campo; no mezcles especies en la cesta',
  '🚗 Transporta las setas refrigeradas y consúmelas pronto',
]

export function EducationPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  return (
    <div className="page-education">
      <div className="page-header">
        <h1 className="page-title">🎓 Aprende micología</h1>
        <p className="page-subtitle">
          Guías esenciales para disfrutar del mundo de las setas con seguridad y conocimiento
        </p>
      </div>

      {/* Golden rules */}
      <section className="edu-section">
        <h2 className="edu-section-title">⚠️ Las 6 reglas de oro de la seguridad</h2>
        <div className="rules-grid">
          {safetyRules.map((rule, i) => (
            <div key={i} className="rule-card">
              <span className="rule-icon">{rule.icon}</span>
              <h3>{rule.title}</h3>
              <p>{rule.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Anatomy */}
      <section className="edu-section">
        <h2 className="edu-section-title">🔬 Anatomía de una seta</h2>
        <p className="edu-intro">
          Conocer las partes de una seta es esencial para identificarla correctamente. Cada parte
          aporta pistas fundamentales.
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

      {/* Seasons */}
      <section className="edu-section">
        <h2 className="edu-section-title">📅 El calendario de las setas</h2>
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

      {/* Foraging tips */}
      <section className="edu-section">
        <h2 className="edu-section-title">🧺 Consejos de recolección</h2>
        <div className="tips-grid">
          {foragingTips.map((tip, i) => (
            <div key={i} className="tip-item">
              {tip}
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="edu-section">
        <h2 className="edu-section-title">❓ Preguntas frecuentes</h2>
        <div className="faq-list">
          {faqItems.map((item, i) => (
            <div key={i} className={`faq-item ${openFaq === i ? 'faq-item--open' : ''}`}>
              <button className="faq-question" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                {item.q}
                <span className="faq-chevron">{openFaq === i ? '−' : '+'}</span>
              </button>
              {openFaq === i && <p className="faq-answer">{item.a}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* Emergency */}
      <section className="edu-section">
        <div className="emergency-box">
          <span className="emergency-icon">🚨</span>
          <div>
            <h3>¿Sospecha de intoxicación?</h3>
            <p>
              <strong>Llama al 112</strong> o al Instituto Nacional de Toxicología:{' '}
              <strong>915 620 420</strong> (24h). Conserva una muestra de la seta y no te
              automediques.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}