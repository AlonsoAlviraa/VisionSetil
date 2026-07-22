/** Loading skeleton (PR-00). */

interface SkeletonProps {
  width?: string | number
  height?: string | number
  className?: string
  borderRadius?: string
  'aria-label'?: string
}

export function Skeleton({
  width = '100%',
  height = '1rem',
  className = '',
  borderRadius,
  'aria-label': ariaLabel = 'Loading',
}: SkeletonProps) {
  return (
    <span
      className={`ui-skeleton ${className}`.trim()}
      style={{
        width,
        height,
        borderRadius,
        display: 'inline-block',
      }}
      role="status"
      aria-label={ariaLabel}
      aria-busy="true"
    />
  )
}
