/** Premium phone frame for product marketing — no external images. */
import type { ReactNode } from 'react'

type Props = {
  children: ReactNode
  className?: string
  label?: string
}

export function DeviceFrame({ children, className = '', label }: Props) {
  return (
    <div className={`mkt-device ${className}`.trim()} aria-hidden={label ? undefined : true}>
      <div className="mkt-device__bezel">
        <div className="mkt-device__notch" />
        <div className="mkt-device__screen">{children}</div>
        <div className="mkt-device__home" />
      </div>
      {label ? <p className="mkt-device__label">{label}</p> : null}
    </div>
  )
}
