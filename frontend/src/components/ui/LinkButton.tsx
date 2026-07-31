/**
 * Link styled as product CTA — architecture migration M2.
 * Emits btn-atelier (+ optional cn-btn / mkt-btn for gradual page migration).
 */
import { Link, type LinkProps } from 'react-router-dom'

export type LinkButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'hero'
export type LinkButtonSize = 'sm' | 'md' | 'lg'
export type LinkButtonSkin = 'atelier' | 'cn' | 'mkt'

export type LinkButtonProps = Omit<LinkProps, 'className'> & {
  variant?: LinkButtonVariant
  size?: LinkButtonSize
  /** Visual dialect while pages migrate (default atelier = product SSOT) */
  skin?: LinkButtonSkin
  block?: boolean
  className?: string
  children: React.ReactNode
}

function atelierClasses(variant: LinkButtonVariant, size: LinkButtonSize, block: boolean): string {
  const v =
    variant === 'hero'
      ? 'btn-atelier--primary'
      : variant === 'secondary'
        ? 'btn-atelier--secondary'
        : `btn-atelier--${variant}`
  const s = size === 'md' ? '' : size === 'sm' ? 'btn-atelier--sm' : 'btn-atelier--lg'
  return ['btn-atelier', v, s, block ? 'btn-atelier--block' : ''].filter(Boolean).join(' ')
}

function cnClasses(variant: LinkButtonVariant, size: LinkButtonSize, block: boolean): string {
  const v =
    variant === 'ghost' || variant === 'secondary'
      ? 'cn-btn--ghost'
      : variant === 'hero'
        ? 'cn-btn--lg'
        : 'cn-btn--primary'
  const s = size === 'sm' ? 'cn-btn--sm' : size === 'lg' || variant === 'hero' ? 'cn-btn--lg' : ''
  return ['cn-btn', v, s, block ? 'cn-btn--block' : ''].filter(Boolean).join(' ')
}

function mktClasses(variant: LinkButtonVariant, size: LinkButtonSize): string {
  const v =
    variant === 'ghost' || variant === 'secondary'
      ? 'mkt-btn--ghost'
      : 'mkt-btn--primary'
  const s = size === 'sm' ? 'mkt-btn--sm' : ''
  return ['mkt-btn', v, s].filter(Boolean).join(' ')
}

export function LinkButton({
  variant = 'primary',
  size = 'md',
  skin = 'atelier',
  block = false,
  className = '',
  children,
  ...rest
}: LinkButtonProps) {
  const base =
    skin === 'cn'
      ? cnClasses(variant, size, block)
      : skin === 'mkt'
        ? mktClasses(variant, size)
        : atelierClasses(variant, size, block)

  return (
    <Link className={[base, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </Link>
  )
}
