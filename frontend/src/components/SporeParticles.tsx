import { useMemo } from 'react'
import { motion } from 'framer-motion'

interface SporeParticlesProps {
  /** Number of particles */
  count?: number
  /** Color of spores */
  color?: string
}

interface Spore {
  id: number
  x: number
  y: number
  size: number
  duration: number
  delay: number
  drift: number
}

/**
 * 🍄 SporeParticles — Floating mushroom spores drifting in the air.
 * Creates an atmospheric forest feel with lightweight CSS animations.
 */
export function SporeParticles({
  count = 15,
  color = 'rgba(168, 198, 150, 0.4)',
}: SporeParticlesProps) {
  const spores = useMemo<Spore[]>(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 2 + Math.random() * 6,
      duration: 8 + Math.random() * 12,
      delay: Math.random() * 5,
      drift: (Math.random() - 0.5) * 40,
    }))
  }, [count])

  return (
    <div className="spore-particles-bg" aria-hidden="true">
      {spores.map((spore) => (
        <motion.div
          key={spore.id}
          className="spore-dot"
          style={{
            left: `${spore.x}%`,
            top: `${spore.y}%`,
            width: spore.size,
            height: spore.size,
            background: color,
          }}
          animate={{
            y: [0, -100, -200],
            x: [0, spore.drift, 0],
            opacity: [0, 0.6, 0],
            scale: [0.8, 1, 0.6],
          }}
          transition={{
            duration: spore.duration,
            delay: spore.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  )
}