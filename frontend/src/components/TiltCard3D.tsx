import { useRef, useState, type ReactNode } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'

interface TiltCard3DProps {
  children: ReactNode
  className?: string
  /** Max tilt angle in degrees */
  maxTilt?: number
  /** Scale on hover */
  hoverScale?: number
  /** Glare effect */
  glare?: boolean
}

/**
 * 🍄 TiltCard3D — Professional 3D tilt card that follows the cursor.
 * Uses framer-motion springs for butter-smooth rotation.
 * Includes optional glare/light reflection effect.
 */
export function TiltCard3D({
  children,
  className = '',
  maxTilt = 8,
  hoverScale = 1.02,
  glare = true,
}: TiltCard3DProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [isHovering, setIsHovering] = useState(false)

  // Motion values for smooth spring physics
  const x = useMotionValue(0)
  const y = useMotionValue(0)

  const mouseXSpring = useSpring(x, { stiffness: 300, damping: 30 })
  const mouseYSpring = useSpring(y, { stiffness: 300, damping: 30 })

  // Transform mouse position to rotation angles
  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], [maxTilt, -maxTilt])
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], [-maxTilt, maxTilt])

  // Glare position
  const glareX = useTransform(mouseXSpring, [-0.5, 0.5], ['0%', '100%'])
  const glareY = useTransform(mouseYSpring, [-0.5, 0.5], ['0%', '100%'])

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const xVal = (e.clientX - rect.left) / rect.width - 0.5
    const yVal = (e.clientY - rect.top) / rect.height - 0.5
    x.set(xVal)
    y.set(yVal)
  }

  function handleMouseLeave() {
    x.set(0)
    y.set(0)
    setIsHovering(false)
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateX,
        rotateY,
        transformStyle: 'preserve-3d',
        transformPerspective: 1000,
      }}
      whileHover={{ scale: hoverScale }}
      className={`tilt-card-3d ${className}`}
    >
      {/* Inner content with translateZ for depth */}
      <div style={{ transform: 'translateZ(50px)', transformStyle: 'preserve-3d' }}>
        {children}
      </div>

      {/* Glare overlay */}
      {glare && isHovering && (
        <motion.div
          className="tilt-card-glare"
          style={{
            background: useTransform(
              [glareX, glareY],
              ([gx, gy]) =>
                `radial-gradient(circle at ${gx} ${gy}, rgba(255,255,255,0.15) 0%, transparent 50%)`,
            ),
          }}
        />
      )}
    </motion.div>
  )
}