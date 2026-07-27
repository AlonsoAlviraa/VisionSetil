/** LoLdle-style color board mock for marketing (static, decorative). */

type Cell = 'correct' | 'partial' | 'wrong' | 'empty'

const DEMO_ROWS: Cell[][] = [
  ['wrong', 'partial', 'wrong', 'wrong', 'partial', 'wrong'],
  ['partial', 'correct', 'partial', 'wrong', 'correct', 'partial'],
  ['correct', 'correct', 'correct', 'correct', 'correct', 'correct'],
]

const LABELS = ['Género', 'Familia', 'Hábitat', 'Temporada', 'Riesgo', 'Zona']

type Props = {
  compact?: boolean
  caption?: string
  className?: string
}

export function SetadleBoardMock({
  compact = false,
  caption = 'Amanita · mortal · resuelto en 3',
  className = '',
}: Props) {
  const rows = compact ? DEMO_ROWS.slice(0, 2) : DEMO_ROWS
  return (
    <div className={`mkt-board ${compact ? 'mkt-board--compact' : ''} ${className}`.trim()}>
      <div className="mkt-board__head">
        <span className="mkt-board__badge">Diario</span>
        <span className="mkt-board__title">Setadle</span>
      </div>
      {!compact && (
        <div className="mkt-board__labels" aria-hidden>
          {LABELS.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      )}
      <div className="mkt-board__rows" aria-hidden>
        {rows.map((row, ri) => (
          <div key={ri} className="mkt-board__row">
            {row.map((tone, ci) => (
              <span
                key={ci}
                className={`mkt-board__cell mkt-board__cell--${tone}`}
                style={{ animationDelay: `${ri * 0.12 + ci * 0.04}s` }}
              />
            ))}
          </div>
        ))}
      </div>
      {caption ? <p className="mkt-board__caption">{caption}</p> : null}
    </div>
  )
}
