/**
 * Page shell for Campo nocturno product routes — architecture migration M2.
 * Provides cn-page + optional orientation sticky + data-skin contract.
 */
import type { HTMLAttributes, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export type PageShellProps = {
  children: ReactNode
  /** Extra classes (page-identify, page-encyclopedia, …) */
  className?: string
  /** data-testid for the page root */
  testId?: string
  /** Show short orientation sticky under chrome */
  orientationSticky?: boolean
  /** Override sticky copy */
  orientationText?: string
  /**
   * Skip default `cn-page` (map immersive chrome, auth shells that own layout).
   * Still sets data-skin=campo-nocturno for design contract.
   */
  bare?: boolean
} & Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'>

export function PageShell({
  children,
  className = '',
  testId,
  orientationSticky = false,
  orientationText,
  bare = false,
  ...rest
}: PageShellProps) {
  const { t } = useTranslation()
  const sticky =
    orientationText ??
    t('home.orientationSticky', { defaultValue: 'Solo orientación · nunca consumo' })

  return (
    <div
      className={[bare ? '' : 'cn-page', className].filter(Boolean).join(' ')}
      data-skin="campo-nocturno"
      data-testid={testId}
      {...rest}
    >
      {orientationSticky ? (
        <p className="cn-warn-strip" role="note">
          {sticky}
        </p>
      ) : null}
      {children}
    </div>
  )
}
