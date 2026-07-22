/** Human empty / quiet state — atelier, no emoji. */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { IconMushroom } from './icons'

type Props = {
  title: string
  description?: string
  actionLabel?: string
  actionTo?: string
  onAction?: () => void
  icon?: ReactNode
  className?: string
}

export function EmptyState({
  title,
  description,
  actionLabel,
  actionTo,
  onAction,
  icon,
  className = '',
}: Props) {
  return (
    <div className={`empty-state-atelier ${className}`.trim()} role="status">
      <div className="empty-state-atelier__icon" aria-hidden="true">
        {icon ?? <IconMushroom size={32} />}
      </div>
      <h3 className="empty-state-atelier__title">{title}</h3>
      {description ? <p className="empty-state-atelier__desc">{description}</p> : null}
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
    </div>
  )
}
