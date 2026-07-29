/** Toggle App (store) vs Web (browser) layout shells. */
import { useTranslation } from 'react-i18next'
import type { LayoutMode } from '../lib/layoutMode'
import { layoutModeHintEs } from '../lib/layoutMode'

type Props = {
  mode: LayoutMode
  onChange: (mode: LayoutMode) => void
  compact?: boolean
}

export function LayoutModeToggle({ mode, onChange, compact = true }: Props) {
  const { t } = useTranslation()

  return (
    <div
      className="layout-mode-toggle"
      data-testid="layout-mode-toggle"
      role="group"
      aria-label={t('layout.modeAria', {
        defaultValue: 'Formato de visualización',
      })}
      title={layoutModeHintEs(mode)}
    >
      <button
        type="button"
        className={`layout-mode-toggle__btn${mode === 'app' ? ' is-active' : ''}`}
        data-testid="layout-mode-app"
        aria-pressed={mode === 'app'}
        onClick={() => onChange('app')}
      >
        {compact
          ? t('layout.appShort', { defaultValue: 'App' })
          : t('layout.app', { defaultValue: 'Modo app' })}
      </button>
      <button
        type="button"
        className={`layout-mode-toggle__btn${mode === 'web' ? ' is-active' : ''}`}
        data-testid="layout-mode-web"
        aria-pressed={mode === 'web'}
        onClick={() => onChange('web')}
      >
        {compact
          ? t('layout.webShort', { defaultValue: 'Web' })
          : t('layout.web', { defaultValue: 'Modo web' })}
      </button>
    </div>
  )
}

export default LayoutModeToggle
