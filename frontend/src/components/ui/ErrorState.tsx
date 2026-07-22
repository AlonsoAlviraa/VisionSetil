/** Error state surface (PR-00). */
import type { ReactNode } from 'react'

interface ErrorStateProps {
  title?: string
  description?: string
  action?: ReactNode
  className?: string
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  action,
  className = '',
}: ErrorStateProps) {
  return (
    <div
      className={`ui-error-state ${className}`.trim()}
      role="alert"
      data-testid="error-state"
    >
      <div className="ui-error-state__icon" aria-hidden>
        ⚠️
      </div>
      <h3 className="ui-error-state__title">{title}</h3>
      {description ? <p className="ui-error-state__description">{description}</p> : null}
      {action}
    </div>
  )
}
