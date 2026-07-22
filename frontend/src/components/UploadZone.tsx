/** Upload zone — photography-first, no emoji chrome. */
import type { DropzoneRootProps, DropzoneInputProps } from 'react-dropzone'
import {
  IconCamera,
  IconCap,
  IconGills,
  IconHabitat,
  IconMushroom,
  IconStem,
  IconUpload,
} from './icons'

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
  return (
    <div className="upload-section">
      <div
        {...getRootProps()}
        className={`upload-zone ${isDragActive ? 'active' : ''}`}
        role="button"
        tabIndex={0}
        aria-label="Subir fotografías de setas"
      >
        <input {...getInputProps()} />
        <div className={`upload-icon-wrap ${isDragActive ? 'is-active' : ''}`} aria-hidden="true">
          {isDragActive ? <IconUpload size={36} /> : <IconMushroom size={40} />}
        </div>
        <p className="upload-text">
          {isDragActive
            ? 'Suelta las fotografías aquí'
            : 'Arrastra fotos de setas o haz clic para elegir'}
        </p>
        <p className="upload-hint">
          Hasta 10 imágenes · JPG, PNG, WEBP · máx. 20&nbsp;MB cada una
        </p>
        {fileCount > 0 && (
          <p className="upload-count">
            {fileCount} {fileCount === 1 ? 'imagen lista' : 'imágenes listas'} para analizar
          </p>
        )}
      </div>

      <div className="upload-divider">
        <span>o</span>
      </div>

      <button type="button" className="btn-atelier btn-atelier--primary" onClick={onOpenCamera}>
        <IconCamera size={20} />
        Usar cámara
      </button>

      <div className="upload-tips">
        <p className="tip-title">Mejores resultados con estas vistas</p>
        <ul className="upload-tips-grid">
          <li>
            <IconCap size={18} />
            <span>Sombrero desde arriba</span>
          </li>
          <li>
            <IconGills size={18} />
            <span>Láminas o poros (parte inferior)</span>
          </li>
          <li>
            <IconStem size={18} />
            <span>Pie y base de perfil</span>
          </li>
          <li>
            <IconHabitat size={18} />
            <span>Hábitat y entorno</span>
          </li>
        </ul>
      </div>
    </div>
  )
}
