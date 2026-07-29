/**
 * Habitat sort mini-game — drag mushrooms into Sí / No for a field habitat.
 * Click-to-place fallback for touch / a11y.
 */
import { useCallback, useMemo, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { SpeciesImage } from '../SpeciesImage'
import {
  habitatTitle,
  scoreHabitatSort,
  type HabitatRound,
} from '../../lib/setadle'

type Zone = 'tray' | 'yes' | 'no'

type Props = {
  round: HabitatRound
  disabled?: boolean
  onWin: (guesses: number) => void
}

export function HabitatSortGame({ round, disabled, onWin }: Props) {
  const { i18n } = useTranslation()
  const locale = i18n.resolvedLanguage || i18n.language || 'es'
  const [placement, setPlacement] = useState<Record<string, Zone>>(() => {
    const init: Record<string, Zone> = {}
    for (const c of round.cards) init[c.taxon] = 'tray'
    return init
  })
  const [selected, setSelected] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)
  const [result, setResult] = useState<ReturnType<typeof scoreHabitatSort> | null>(null)
  const [attempts, setAttempts] = useState(0)
  const [dragTaxon, setDragTaxon] = useState<string | null>(null)

  const byZone = useMemo(() => {
    const tray: typeof round.cards = []
    const yes: typeof round.cards = []
    const no: typeof round.cards = []
    for (const c of round.cards) {
      const z = placement[c.taxon] || 'tray'
      if (z === 'yes') yes.push(c)
      else if (z === 'no') no.push(c)
      else tray.push(c)
    }
    return { tray, yes, no }
  }, [round.cards, placement])

  const allPlaced = byZone.tray.length === 0

  const moveTo = useCallback(
    (taxon: string, zone: Zone) => {
      if (disabled || checked && result?.won) return
      setPlacement((prev) => ({ ...prev, [taxon]: zone }))
      setSelected(null)
      setChecked(false)
      setResult(null)
    },
    [disabled, checked, result?.won],
  )

  const onCheck = () => {
    if (!allPlaced || disabled) return
    const nextAttempts = attempts + 1
    setAttempts(nextAttempts)
    const scored = scoreHabitatSort(round, placement)
    setResult(scored)
    setChecked(true)
    if (scored.won) onWin(nextAttempts)
  }

  const onReset = () => {
    const init: Record<string, Zone> = {}
    for (const c of round.cards) init[c.taxon] = 'tray'
    setPlacement(init)
    setSelected(null)
    setChecked(false)
    setResult(null)
  }

  const renderCard = (taxon: string, common: string, risk: string, zone: Zone) => {
    const isWrong =
      checked &&
      result &&
      !result.won &&
      result.mistakes.includes(taxon)
    const isRight =
      checked &&
      result &&
      !result.mistakes.includes(taxon) &&
      zone !== 'tray'

    return (
      <button
        key={taxon}
        type="button"
        draggable={!disabled && !(checked && result?.won)}
        className={[
          'hab-card',
          selected === taxon ? 'is-selected' : '',
          isWrong ? 'is-wrong' : '',
          isRight ? 'is-right' : '',
          dragTaxon === taxon ? 'is-dragging' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => {
          if (disabled || (checked && result?.won)) return
          if (selected === taxon) setSelected(null)
          else setSelected(taxon)
        }}
        onDragStart={(e) => {
          setDragTaxon(taxon)
          e.dataTransfer.setData('text/plain', taxon)
          e.dataTransfer.effectAllowed = 'move'
        }}
        onDragEnd={() => setDragTaxon(null)}
        aria-pressed={selected === taxon}
        aria-label={`${common} (${taxon})`}
      >
        <span className="hab-card__photo">
          <SpeciesImage
            scientificName={taxon}
            variant="thumb"
            riskLevel={risk === 'deadly' ? 'deadly' : 'default'}
            alt=""
            preferCatalog={false}
            aspectRatio="1"
            showMediaBadge={false}
          />
        </span>
        <span className="hab-card__name">{common}</span>
      </button>
    )
  }

  const zoneProps = (zone: Zone) => ({
    onDragOver: (e: DragEvent) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      const taxon = e.dataTransfer.getData('text/plain')
      if (taxon) moveTo(taxon, zone)
      setDragTaxon(null)
    },
  })

  return (
    <div className="hab-game" data-testid="habitat-sort-game">
      <div className={`hab-scene ${round.habitat.sceneClass}`} aria-hidden>
        <span className="hab-scene__icon">{round.habitat.icon}</span>
        <div className="hab-scene__layers" />
      </div>

      <div className="hab-game__head">
        <h2 className="hab-game__title">
          {round.habitat.icon} {habitatTitle(round.habitat.id, locale)}
        </h2>
        <p className="hab-game__blurb">{round.habitat.blurb}</p>
        <p className="hab-game__hint">
          Arrastra cada seta a <strong>Sí, vive aquí</strong> o <strong>No</strong>. También
          puedes tocar la seta y luego la zona.
        </p>
      </div>

      {selected && (
        <div className="hab-quick-place" role="toolbar" aria-label="Colocar seta seleccionada">
          <span>Colocar:</span>
          <button type="button" className="btn-atelier btn-atelier--primary" onClick={() => moveTo(selected, 'yes')}>
            → Sí
          </button>
          <button type="button" className="btn-atelier btn-atelier--ghost" onClick={() => moveTo(selected, 'no')}>
            → No
          </button>
          <button type="button" className="btn-atelier btn-atelier--ghost" onClick={() => moveTo(selected, 'tray')}>
            Bandeja
          </button>
        </div>
      )}

      <div className="hab-zones">
        <div className="hab-zone hab-zone--yes" {...zoneProps('yes')}>
          <header>
            <strong>Sí, vive aquí</strong>
            <span>{byZone.yes.length}</span>
          </header>
          <div className="hab-zone__cards">
            {byZone.yes.map((c) => renderCard(c.taxon, c.common, c.risk_raw, 'yes'))}
            {byZone.yes.length === 0 && <p className="hab-zone__empty">Suelta aquí las que sí</p>}
          </div>
        </div>
        <div className="hab-zone hab-zone--no" {...zoneProps('no')}>
          <header>
            <strong>No pertenece</strong>
            <span>{byZone.no.length}</span>
          </header>
          <div className="hab-zone__cards">
            {byZone.no.map((c) => renderCard(c.taxon, c.common, c.risk_raw, 'no'))}
            {byZone.no.length === 0 && <p className="hab-zone__empty">Suelta aquí las que no</p>}
          </div>
        </div>
      </div>

      <div className="hab-tray" {...zoneProps('tray')}>
        <header>
          <strong>Bandeja</strong>
          <span>{byZone.tray.length} por colocar</span>
        </header>
        <div className="hab-zone__cards">
          {byZone.tray.map((c) => renderCard(c.taxon, c.common, c.risk_raw, 'tray'))}
        </div>
      </div>

      <div className="hab-actions">
        <button
          type="button"
          className="btn-atelier btn-atelier--primary"
          disabled={!allPlaced || disabled || Boolean(result?.won)}
          onClick={onCheck}
        >
          Comprobar
        </button>
        <button type="button" className="btn-atelier btn-atelier--ghost" onClick={onReset} disabled={disabled}>
          Reiniciar
        </button>
      </div>

      {result && (
        <div
          className={`hab-result ${result.won ? 'is-win' : 'is-miss'}`}
          role="status"
        >
          {result.won ? (
            <p>
              ¡Perfecto! {result.correct}/{result.total} en {attempts} intento
              {attempts === 1 ? '' : 's'}.
            </p>
          ) : (
            <p>
              {result.correct}/{result.total} bien. Las marcadas en rojo están mal — muévelas y
              vuelve a comprobar.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
