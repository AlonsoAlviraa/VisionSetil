/**
 * @deprecated Prefer PhotoSpinViewer — real field photos only.
 * Stub kept so accidental imports compile without Three.js (Wave B).
 */
export interface MushroomScene3DProps {
  height?: number
  autoRotate?: boolean
  label?: string
  riskLabel?: string
  className?: string
  variant?: string
  capStyle?: string
  capColor?: string
  stemColor?: string
}

export function MushroomScene3D({
  height = 280,
  label = 'Fotos reales preferidas',
  className = '',
}: MushroomScene3DProps) {
  return (
    <div
      className={`mushroom-scene-stub ${className}`.trim()}
      style={{ height, display: 'grid', placeItems: 'center' }}
      role="img"
      aria-label={label}
    >
      <p className="muted" style={{ padding: '1rem', textAlign: 'center', fontSize: '0.9rem' }}>
        Vista 3D retirada. Usa el visor de fotos reales de campo.
      </p>
    </div>
  )
}

export default MushroomScene3D
