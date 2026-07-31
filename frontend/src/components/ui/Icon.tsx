/**
 * Material Symbols Outlined icon — Stitch design system icon parity (v1.11).
 *
 * Replaces ad-hoc inline SVGs with the Material Symbols font so the product
 * matches screens-b-v2 exactly. Usage:
 *   <Icon name="center_focus_strong" />
 *   <Icon name="home" filled size="lg" />
 *
 * Name = the Material Symbols ligature glyph name (see fonts.google.com/icons).
 */
import type { CSSProperties } from 'react'

export type IconSize = 'sm' | 'md' | 'lg' | 'xl' | number

export interface IconProps {
  /** Material Symbols glyph name, e.g. "center_focus_strong", "menu_book". */
  name: string
  /** Fill the glyph (FILL 1). */
  filled?: boolean
  /** Preset size or a numeric px override. */
  size?: IconSize
  className?: string
  style?: CSSProperties
  /** Visually-hidden label for screen readers; defaults to decorative. */
  'aria-label'?: string
  title?: string
}

const SIZE_PX: Record<Exclude<IconSize, number>, number> = {
  sm: 18,
  md: 24,
  lg: 32,
  xl: 48,
}

export function Icon({
  name,
  filled = false,
  size = 'md',
  className,
  style,
  'aria-label': ariaLabel,
  title,
}: IconProps) {
  const px = typeof size === 'number' ? size : SIZE_PX[size]
  const classes = ['cn-icon']
  if (filled) classes.push('cn-icon--filled')
  if (className) classes.push(className)
  const isDecorative = !ariaLabel && !title
  return (
    <span
      className={classes.join(' ')}
      style={{ fontSize: px, ...style }}
      role={isDecorative ? undefined : 'img'}
      aria-label={ariaLabel}
      aria-hidden={isDecorative ? true : undefined}
      title={title}
    >
      {name}
    </span>
  )
}

export default Icon
