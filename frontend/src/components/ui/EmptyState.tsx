/** Empty state placeholder (PR-00). */
import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({
  icon = '🍄',
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`ui-empty-state ${className}`.trim()} data-testid="empty-state">
      <div className="ui-empty-state__icon" aria-hidden>
        {icon}
      </div>
      <h3 className="ui-empty-state__title">{title}</h3>
      {description ? <p className="ui-empty-state__description">{description}</p> : null}
      {action}
    </div>
  )
}
