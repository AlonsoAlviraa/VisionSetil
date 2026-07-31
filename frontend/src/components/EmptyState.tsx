/**
 * Product empty / quiet state — atelier SSOT (Phase D-02).
 * No emoji chrome by default. Prefer this over legacy ui-empty-state.
 */
import type { ReactNode } from 'react'
import { IconMushroom } from './icons'
import { Button } from './ui/Button'
import { LinkButton } from './ui/LinkButton'

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
            <LinkButton to={actionTo} variant="primary" data-testid="empty-state-action">
              {actionLabel}
            </LinkButton>
          ) : null}
          {actionLabel && onAction && !actionTo ? (
            <Button
              type="button"
              variant="primary"
              onClick={onAction}
              data-testid="empty-state-action"
            >
              {actionLabel}
            </Button>
          ) : null}
        </>
      )}
    </div>
  )
}
