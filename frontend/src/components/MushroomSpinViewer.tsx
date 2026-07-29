/**
 * @deprecated Unmounted — product uses SpeciesGallery / SpeciesPhotoCard (2D only).
 * Renders nothing so legacy imports cannot revive spin/studio chrome.
 */
export type MushroomSpinViewerProps = {
  taxon?: string
  scientificName?: string
  height?: number
  riskLabel?: string
  label?: string
  autoPlay?: boolean
  className?: string
  [key: string]: unknown
}

export function MushroomSpinViewer(_props: MushroomSpinViewerProps) {
  return null
}

export default MushroomSpinViewer
