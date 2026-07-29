/**
 * @deprecated Removed — VisionSetil product UI is real 2D field photos only.
 * No 360 spin / product-turntable chrome (looked like a 3D model studio).
 * Accidental imports render nothing.
 */
export type PhotoSpinViewerProps = {
  taxon?: string
  height?: number
  autoPlay?: boolean
  className?: string
  label?: string
  riskLabel?: string
  maxFrames?: number
  preferSameOrigin?: boolean
  [key: string]: unknown
}

export function PhotoSpinViewer(_props: PhotoSpinViewerProps) {
  return null
}

export default PhotoSpinViewer
