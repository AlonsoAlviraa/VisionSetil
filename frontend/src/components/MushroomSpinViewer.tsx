/**
 * @deprecated Prefer PhotoSpinViewer — real field photos only.
 * Thin wrapper kept so old imports keep working without procedural 3D.
 */
import { PhotoSpinViewer, type PhotoSpinViewerProps } from './PhotoSpinViewer'

export type MushroomSpinViewerProps = {
  height?: number
  autoRotate?: boolean
  label?: string
  riskLabel?: string
  className?: string
  /** Scientific name for real photo fetch */
  taxon?: string
  showChrome?: boolean
  capStyle?: string
  capColor?: string
  stemColor?: string
}

export function MushroomSpinViewer({
  height = 400,
  autoRotate = true,
  label,
  riskLabel,
  className,
  taxon = 'Amanita phalloides',
}: MushroomSpinViewerProps) {
  const props: PhotoSpinViewerProps = {
    taxon,
    height,
    autoPlay: autoRotate,
    label: label || `Fotos reales de ${taxon}`,
    riskLabel,
    className,
  }
  return <PhotoSpinViewer {...props} />
}

export default MushroomSpinViewer
