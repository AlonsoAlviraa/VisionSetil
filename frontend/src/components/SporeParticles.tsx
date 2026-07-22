/** Decorative spores — pure CSS (Wave B, no framer-motion). */
interface SporeParticlesProps {
  count?: number
  className?: string
}

export function SporeParticles({ count = 12, className = '' }: SporeParticlesProps) {
  const n = Math.min(24, Math.max(0, count))
  return (
    <div className={`spore-particles-css ${className}`.trim()} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="spore-particles-css__dot" style={{ '--i': i } as never} />
      ))}
    </div>
  )
}

export default SporeParticles
