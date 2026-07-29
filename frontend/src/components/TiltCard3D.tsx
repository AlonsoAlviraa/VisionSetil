/**
 * @deprecated Flat passthrough — 3D tilt chrome removed from product UI.
 * Keeps import sites compiling without perspective/tilt wrappers.
 */
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
    <div className={className.trim() || undefined} style={style}>
      {children}
    </div>
  )
}

export default TiltCard3D
