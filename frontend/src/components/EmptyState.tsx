/**
 * Product empty / quiet state — atelier SSOT (Phase D-02).
 * No emoji chrome by default. Prefer this over legacy ui-empty-state.
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { IconMushroom } from './icons'

export type EmptyStateProps = {
  title: string
  description?: string
  actionLabel?: string
  actionTo?: string
  onAction?: () => void
  /** Custom icon node; defaults to quiet mushroom glyph */
  icon?: ReactNode
  /** Optional free-form action slot (overrides actionLabel/to when set) */
  action?: ReactNode
  className?: string
}

export function EmptyState({
  title,
  description,
  actionLabel,
  actionTo,
  onAction,
  icon,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`empty-state-atelier ${className}`.trim()}
      role="status"
      data-testid="empty-state"
    >
      <div className="empty-state-atelier__icon" aria-hidden="true">
        {icon ?? <IconMushroom size={32} />}
      </div>
      <h3 className="empty-state-atelier__title">{title}</h3>
      {description ? <p className="empty-state-atelier__desc">{description}</p> : null}
      {action ? (
        action
      ) : (
        <>
          {actionLabel && actionTo ? (
            <Link to={actionTo} className="btn-atelier btn-atelier--primary">
              {actionLabel}
            </Link>
          ) : null}
          {actionLabel && onAction && !actionTo ? (
            <button type="button" className="btn-atelier btn-atelier--primary" onClick={onAction}>
              {actionLabel}
            </button>
          ) : null}
        </>
      )}
    </div>
  )
}
