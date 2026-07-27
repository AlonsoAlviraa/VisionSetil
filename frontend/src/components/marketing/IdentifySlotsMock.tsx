/** Multi-view identify slots mock — sells the capture product without photos. */

const SLOTS = [
  { id: 'cap', label: 'Sombrero', filled: true },
  { id: 'gills', label: 'Láminas', filled: true },
  { id: 'stem', label: 'Pie', filled: false },
  { id: 'habitat', label: 'Hábitat', filled: false },
] as const

type Props = {
  className?: string
}

export function IdentifySlotsMock({ className = '' }: Props) {
  return (
    <div className={`mkt-slots ${className}`.trim()} aria-hidden>
      <div className="mkt-slots__head">
        <span className="mkt-slots__kicker">Multi-vista</span>
        <strong>2 / 4 evidencias</strong>
      </div>
      <div className="mkt-slots__grid">
        {SLOTS.map((s) => (
          <div
            key={s.id}
            className={`mkt-slots__card ${s.filled ? 'is-filled' : ''}`}
          >
            <span className="mkt-slots__icon" data-slot={s.id} />
            <span className="mkt-slots__label">{s.label}</span>
            <span className="mkt-slots__state">{s.filled ? 'Lista' : 'Falta'}</span>
          </div>
        ))}
      </div>
      <div className="mkt-slots__bar">
        <div className="mkt-slots__bar-fill" style={{ width: '50%' }} />
      </div>
      <p className="mkt-slots__hint">Si duda, se abstiene</p>
    </div>
  )
}
