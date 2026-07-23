/**
 * Unified Card surface (Phase D-02).
 * Prefer this over ad-hoc div wrappers for new polish work.
 */
import type { HTMLAttributes, ReactNode } from 'react'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  /** Apply default padding */
  padded?: boolean
  /** Hover lift for clickable cards */
  interactive?: boolean
  /** Also apply atelier-card class for magazine grids */
  atelier?: boolean
}

export function Card({
  children,
  padded = false,
  interactive = false,
  atelier = false,
  className = '',
  ...rest
}: CardProps) {
  const classes = [
    'vs-card',
    padded ? 'vs-card--padded' : '',
    interactive ? 'vs-card--interactive' : '',
    atelier ? 'atelier-card' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes} data-testid="vs-card" {...rest}>
      {children}
    </div>
  )
}
