/** Upload zone — photography-first, no emoji chrome. */
import type { DropzoneRootProps, DropzoneInputProps } from 'react-dropzone'
import { useTranslation } from 'react-i18next'
import {
  IconCamera,
  IconCap,
  IconGills,
  IconHabitat,
  IconMushroom,
  IconStem,
  IconUpload,
} from './icons'
import { Button } from './ui/Button'

interface UploadZoneProps {
  getRootProps: <T extends DropzoneRootProps>(props?: T) => T & { refKey?: string }
  getInputProps: <T extends DropzoneInputProps>(props?: T) => T
  isDragActive: boolean
  fileCount: number
  onOpenCamera: () => void
}

export function UploadZone({
  getRootProps,
  getInputProps,
  isDragActive,
  fileCount,
  onOpenCamera,
}: UploadZoneProps) {
  const { t } = useTranslation()

  return (
    <div className="upload-section" data-testid="upload-section">
      <div
        {...getRootProps()}
        className={`upload-zone ${isDragActive ? 'active' : ''}`}
        role="button"
        tabIndex={0}
        data-testid="upload-dropzone"
        aria-label={t('identify.uploadAria', {
          defaultValue: 'Subir fotografías de setas',
        })}
      >
        <input {...getInputProps()} />
        <div className={`upload-icon-wrap ${isDragActive ? 'is-active' : ''}`} aria-hidden="true">
          {isDragActive ? <IconUpload size={36} /> : <IconMushroom size={40} />}
        </div>
        <p className="upload-text">
          {isDragActive
            ? t('identify.uploadDrop', { defaultValue: 'Suelta las fotografías aquí' })
            : t('identify.uploadPrompt', {
                defaultValue: 'Arrastra fotos o pulsa para elegir',
              })}
        </p>
        <p className="upload-hint">
          {t('identify.uploadHint', {
            defaultValue: 'Hasta 10 imágenes · JPG, PNG, WEBP · máx. 20 MB',
          })}
        </p>
        {fileCount > 0 && (
          <p className="upload-count">
            {t('identify.uploadReady', {
              defaultValue:
                fileCount === 1
                  ? '{{n}} imagen lista'
                  : '{{n}} imágenes listas',
              n: fileCount,
              count: fileCount,
            })}
          </p>
        )}
      </div>

      <div className="upload-divider">
        <span>{t('identify.uploadOr', { defaultValue: 'o' })}</span>
      </div>

      <Button
        type="button"
        variant="primary"
        onClick={onOpenCamera}
        data-testid="upload-open-camera"
      >
        <IconCamera size={20} />
        {t('identify.useCamera', { defaultValue: 'Usar cámara' })}
      </Button>

      <div className="upload-tips" data-testid="upload-tips">
        <p className="tip-title">
          {t('identify.uploadTipsTitle', {
            defaultValue: 'Mejores resultados con estas vistas',
          })}
        </p>
        <ul className="upload-tips-grid" aria-label={t('identify.uploadTipsTitle', { defaultValue: 'Mejores resultados con estas vistas' })}>
          <li>
            <IconCap size={18} />
            <span>{t('identify.views.front', { defaultValue: 'Sombrero / perfil' })}</span>
          </li>
          <li>
            <IconGills size={18} />
            <span>{t('identify.views.gills', { defaultValue: 'Láminas o poros' })}</span>
          </li>
          <li>
            <IconStem size={18} />
            <span>{t('identify.views.detail', { defaultValue: 'Pie y base' })}</span>
          </li>
          <li>
            <IconHabitat size={18} />
            <span>{t('identify.views.habitat', { defaultValue: 'Hábitat' })}</span>
          </li>
        </ul>
        <p className="upload-tips__policy muted" role="note" data-testid="upload-tips-policy">
          {t('identify.uploadTipsPolicy', {
            defaultValue:
              'Multi-vista mejora la orientación; no desbloquea consumo. Si falta evidencia, la app se abstiene.',
          })}
        </p>
      </div>
    </div>
  )
}
