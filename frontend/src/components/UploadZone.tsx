/** Upload zone drag-and-drop component with multi-image + camera support. */
import type { DropzoneRootProps, DropzoneInputProps } from 'react-dropzone'

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
      <div {...getRootProps()} className={`upload-zone ${isDragActive ? 'active' : ''}`}>
        <input {...getInputProps()} />
        <div className="upload-icon">{isDragActive ? '📥' : '🍄'}</div>
        <p className="upload-text">
          {isDragActive
            ? '¡Suelta las imágenes aquí!'
            : 'Arrastra fotos o haz clic para seleccionar'}
        </p>
        <p className="upload-hint">
          Múltiples fotos (máx. 10) · JPG, PNG, WEBP · hasta 20MB c/u
        </p>
        {fileCount > 0 && (
          <p className="upload-count">
            ✅ {fileCount} {fileCount === 1 ? 'imagen lista' : 'imágenes listas'} para analizar
          </p>
        )}
      </div>

      <div className="upload-divider">
        <span>o</span>
      </div>

      <button className="btn-camera-open" onClick={onOpenCamera}>
        📸 Usar cámara
      </button>

      <div className="upload-tips">
        <p className="tip-title">💡 Mejores resultados con:</p>
        <ul>
          <li>Foto del sombrero (vista desde arriba)</li>
          <li>Foto de láminas/poros (parte inferior)</li>
          <li>Foto del pie y base (voltear con cuidado)</li>
          <li>Foto del entorno/hábitat</li>
        </ul>
      </div>
    </div>
  )
}