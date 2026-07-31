/**
 * Unified Button (Phase D-02).
 * Emits both `vs-btn` (size/API) and `btn-atelier` (product visual SSOT).
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'ink'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  children: ReactNode
  /** Stretch to container width */
  block?: boolean
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

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    className = '',
    children,
    type = 'button',
    block = false,
    ...rest
  },
  ref,
) {
  const classes = [
    'vs-btn',
    `vs-btn--${variant === 'secondary' ? 'secondary' : variant}`,
    `vs-btn--${size}`,
    'btn-atelier',
    atelierVariant(variant),
    block ? 'btn-atelier--block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button ref={ref} type={type} className={classes} {...rest}>
      {children}
    </button>
  )
})
