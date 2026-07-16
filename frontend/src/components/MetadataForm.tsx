/**
 * Optional observation metadata form.
 *
 * Collects contextual information (habitat, substrate, etc.) that improves
 * classification accuracy through multi-modal fusion in the backend pipeline.
 * All fields are optional — the form collapses by default to keep the UX clean.
 */
import { useState } from 'react'
import type { ObservationMetadata } from '../api/types'

interface MetadataFormProps {
  metadata: ObservationMetadata
  onChange: (metadata: ObservationMetadata) => void
}

const HABITAT_OPTIONS = [
  'Bosque de coníferas',
  'Bosque de frondosas',
  'Bosque mixto',
  'Pradera / pastizal',
  'Suelo desnudo',
  'Madera muerta',
  'Jardín / parque',
  'Ceremonial / cultivo',
  'Otro',
]

const SUBSTRATE_OPTIONS = [
  'Suelo (tierra)',
  'Madera / tronco',
  'Hojarasca',
  'Musgo',
  'Hierba',
  'Arena',
  'Entre piedras',
  'Sobre otro hongo',
  'Otro',
]

export function MetadataForm({ metadata, onChange }: MetadataFormProps) {
  const [expanded, setExpanded] = useState(false)

  const update = (field: keyof ObservationMetadata, value: string) => {
    onChange({ ...metadata, [field]: value || undefined })
  }

  return (
    <div className="metadata-form">
      <button
        className="metadata-toggle"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span>🗺️ Información del entorno (opcional)</span>
        <span className={`chevron ${expanded ? 'open' : ''}`}>▸</span>
      </button>

      {expanded && (
        <div className="metadata-fields">
          <p className="metadata-hint">
            Ayuda al modelo aportando contexto sobre dónde encontraste la seta
          </p>

          <div className="field-row">
            <label htmlFor="habitat">Hábitat</label>
            <select
              id="habitat"
              value={metadata.habitat || ''}
              onChange={(e) => update('habitat', e.target.value)}
            >
              <option value="">— Selecciona —</option>
              {HABITAT_OPTIONS.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          <div className="field-row">
            <label htmlFor="substrate">Sustrato</label>
            <select
              id="substrate"
              value={metadata.substrate || ''}
              onChange={(e) => update('substrate', e.target.value)}
            >
              <option value="">— Selecciona —</option>
              {SUBSTRATE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="field-row">
            <label htmlFor="region">Región / País</label>
            <input
              id="region"
              type="text"
              placeholder="Ej. Madrid, España"
              value={metadata.region || ''}
              onChange={(e) => update('region', e.target.value)}
            />
          </div>

          <div className="field-row">
            <label htmlFor="smell">Olor</label>
            <input
              id="smell"
              type="text"
              placeholder="Ej. harina, anís, nulas..."
              value={metadata.smell || ''}
              onChange={(e) => update('smell', e.target.value)}
            />
          </div>

          <div className="field-row">
            <label htmlFor="notes">Notas</label>
            <textarea
              id="notes"
              placeholder="Observaciones adicionales: coloración al corte, cambios..."
              value={metadata.notes || ''}
              onChange={(e) => update('notes', e.target.value)}
              rows={2}
            />
          </div>
        </div>
      )}
    </div>
  )
}