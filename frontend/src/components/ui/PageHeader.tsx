import type { ReactNode } from 'react'

export function PageHeader({
  title,
  subtitle,
  children,
  testId,
}: {
  title: string
  subtitle?: string
  children?: ReactNode
  testId?: string
}) {
  return (
    <header className="vs-page-header" data-testid={testId}>
      <h1 className="vs-page-header__title">{title}</h1>
      {subtitle ? <p className="vs-page-header__subtitle">{subtitle}</p> : null}
      {children}
    </header>
  )
}
