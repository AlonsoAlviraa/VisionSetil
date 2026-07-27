/**
 * Flashcard deck — premium photos first, keyboard + swipe study flow.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { SpeciesFlashcard, type FlashcardSpecies } from './SpeciesFlashcard'
import { photoPriorityScore } from '../lib/speciesMediaStack'

type Props = {
  cards: FlashcardSpecies[]
  /** Sort best multi-view packs first */
  premiumFirst?: boolean
  className?: string
  title?: string
}

export function FlashcardDeck({
  cards,
  premiumFirst = true,
  className = '',
  title = 'Flashcards · multi-ángulo',
}: Props) {
  const ordered = useMemo(() => {
    if (!premiumFirst) return cards
    return [...cards].sort(
      (a, b) => photoPriorityScore(b.taxon) - photoPriorityScore(a.taxon),
    )
  }, [cards, premiumFirst])

  const [index, setIndex] = useState(0)
  const current = ordered[index] ?? ordered[0]
  const total = ordered.length

  const go = (dir: -1 | 1) => {
    if (!total) return
    setIndex((i) => (i + dir + total) % total)
  }

  if (!current) return null

  return (
    <section
      className={`flash-deck ${className}`.trim()}
      data-testid="flashcard-deck"
      aria-label={title}
    >
      <header className="flash-deck__head">
        <div>
          <p className="mkt-kicker">Estudio</p>
          <h2 className="flash-deck__title">{title}</h2>
          <p className="flash-deck__sub">
            Primero las mejores fotos; luego más ángulos. Toca la carta para revelar el nombre.
          </p>
        </div>
        <div className="flash-deck__counter" aria-live="polite">
          {index + 1} / {total}
        </div>
      </header>

      <div className="flash-deck__stage">
        <button
          type="button"
          className="flash-deck__arrow"
          onClick={() => go(-1)}
          aria-label="Carta anterior"
        >
          ←
        </button>
        <SpeciesFlashcard key={current.taxon} species={current} />
        <button
          type="button"
          className="flash-deck__arrow"
          onClick={() => go(1)}
          aria-label="Carta siguiente"
        >
          →
        </button>
      </div>

      <div className="flash-deck__rail" role="tablist" aria-label="Elegir seta">
        {ordered.map((c, i) => (
          <button
            key={c.taxon}
            type="button"
            role="tab"
            aria-selected={i === index}
            className={`flash-deck__chip ${i === index ? 'is-active' : ''}`}
            onClick={() => setIndex(i)}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="flash-deck__cta">
        <Link to="/setadle" className="mkt-btn mkt-btn--amber">
          Jugar Setadle
        </Link>
        <Link to="/lookalikes" className="mkt-btn mkt-btn--ghost">
          Lookalikes
        </Link>
        <Link to="/reto" className="mkt-btn mkt-btn--ghost">
          Reto
        </Link>
      </div>
    </section>
  )
}
