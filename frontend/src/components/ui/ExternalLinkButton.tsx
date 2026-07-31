/**
 * External / mailto CTA styled as product Button (atelier SSOT).
 * Use when target=_blank or href is not an in-app route (OSM, permits, mailto).
 */
import type { AnchorHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'ink'
type Size = 'sm' | 'md' | 'lg'

export type ExternalLinkButtonProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  'className' | 'children'
> & {
  href: string
  variant?: Variant
  size?: Size
  block?: boolean
  className?: string
  children: ReactNode
  /** When true (default for http(s)), adds target=_blank + rel */
  newTab?: boolean
}

function atelierVariant(variant: Variant): string {
  switch (variant) {
    case 'secondary':
      return 'btn-atelier--secondary'
    case 'ghost':
      return 'btn-atelier--ghost'
    case 'danger':
      return 'btn-atelier--danger'
    case 'ink':
      return 'btn-atelier--ink'
    case 'primary':
    default:
      return 'btn-atelier--primary'
  }
}

export function ExternalLinkButton({
  href,
  variant = 'primary',
  size = 'md',
  block = false,
  className = '',
  children,
  newTab,
  rel,
  target,
  ...rest
}: ExternalLinkButtonProps) {
  const isHttp = /^https?:/i.test(href)
  const openNew = newTab ?? isHttp
  const classes = [
    'vs-btn',
    `vs-btn--${variant === 'secondary' ? 'secondary' : variant}`,
    `vs-btn--${size}`,
    'btn-atelier',
    atelierVariant(variant),
    size === 'sm' ? 'btn-atelier--sm' : size === 'lg' ? 'btn-atelier--lg' : '',
    block ? 'btn-atelier--block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <a
      href={href}
      className={classes}
      target={openNew ? target ?? '_blank' : target}
      rel={openNew ? rel ?? 'noopener noreferrer' : rel}
      {...rest}
    >
      {children}
    </a>
  )
}
