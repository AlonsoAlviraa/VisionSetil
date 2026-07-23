/** Loading skeleton (PR-00) + Identify loading layout helpers (B-28). */

interface SkeletonProps {
  width?: string | number
  height?: string | number
  className?: string
  borderRadius?: string
  /** block = full-width bar; card = taller result-card placeholder */
  variant?: 'line' | 'block' | 'card' | 'title'
  'aria-label'?: string
  'aria-hidden'?: boolean
}

export function Skeleton({
  width = '100%',
  height,
  className = '',
  borderRadius,
  variant = 'line',
  'aria-label': ariaLabel = 'Loading',
  'aria-hidden': ariaHidden,
}: SkeletonProps) {
  const resolvedHeight =
    height ??
    (variant === 'card'
      ? '5.5rem'
      : variant === 'title'
        ? '1.25rem'
        : variant === 'block'
          ? '2.5rem'
          : '1rem')

  return (
    <span
      className={`ui-skeleton ui-skeleton--${variant} ${className}`.trim()}
      style={{
        width,
        height: resolvedHeight,
        borderRadius:
          borderRadius ?? (variant === 'card' ? '12px' : undefined),
        display: 'block',
      }}
      role={ariaHidden ? undefined : 'status'}
      aria-label={ariaHidden ? undefined : ariaLabel}
      aria-busy={ariaHidden ? undefined : true}
      aria-hidden={ariaHidden || undefined}
    />
  )
}

/**
 * Result-shaped skeleton used while Identify classify is in flight (B-28).
 * Decorative only — stage labels carry the honest status copy.
 */
export function IdentifyResultSkeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`identify-loading-skeleton ${className}`.trim()}
      data-testid="identify-loading-skeleton"
      aria-hidden="true"
    >
      <Skeleton variant="title" width="42%" />
      <Skeleton variant="line" width="68%" height="0.75rem" />
      <Skeleton variant="card" width="100%" />
      <Skeleton variant="line" width="92%" height="0.7rem" />
      <Skeleton variant="line" width="78%" height="0.7rem" />
      <Skeleton variant="line" width="54%" height="0.7rem" />
    </div>
  )
}
