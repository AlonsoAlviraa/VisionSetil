/** CSS-only tilt card (Wave B — no framer-motion). */
import type { ReactNode, CSSProperties } from 'react'

interface TiltCard3DProps {
  children: ReactNode
  className?: string
  maxTilt?: number
  hoverScale?: number
  glare?: boolean
  style?: CSSProperties
}

export function TiltCard3D({ children, className = '', style }: TiltCard3DProps) {
  return (
    <div className={`tilt-card-css ${className}`.trim()} style={style}>
      {children}
    </div>
  )
}

export default TiltCard3D
