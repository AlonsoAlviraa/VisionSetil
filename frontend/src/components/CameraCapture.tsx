/**
 * Camera capture component using getUserMedia with guided multi-view mode.
 *
 * Allows the user to take photos directly from their device camera (especially
 * useful on mobile). Supports switching between front/back cameras on phones.
 *
 * Sprint N+2 (FE-1): Enhanced with guided multi-view capture that prompts
 * the user for cap, gills, stem, and base photos — improving model accuracy.
 */
import { useState, useRef, useCallback, useEffect } from 'react'

/** Preset views for guided multi-view capture. */
const VIEW_STEPS = [
  { id: 'cap', label: 'Sombrero', icon: '🍄', hint: 'Fotografía la parte superior (sombrero) desde arriba.' },
  { id: 'gills', label: 'Láminas/Poros', icon: '🔬', hint: 'Da la vuelta y fotografía la parte inferior (láminas o poros).' },
  { id: 'stem', label: 'Pie', icon: '📏', hint: 'Fotografía el pie (tallo) de lado, incluyendo cualquier anillo o volva.' },
  { id: 'base', label: 'Base', icon: '🌱', hint: 'Excava ligeramente y fotografía la base del pie (bulbo, rizomorfos).' },
] as const

interface CapturedView {
  viewId: string
  file: File
}

interface CameraCaptureProps {
  onCapture: (file: File) => void
  onClose: () => void
  /** When true, enables guided multi-view capture mode. */
  multiView?: boolean
  /** Called when all guided views are captured (multi-view mode). */
  onMultiViewCapture?: (views: CapturedView[]) => void
}

export function CameraCapture({ onCapture, onClose, multiView = false, onMultiViewCapture }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [isReady, setIsReady] = useState(false)

  // Multi-view state
  const [guidedMode, setGuidedMode] = useState(multiView)
  const [currentStep, setCurrentStep] = useState(0)
  const [capturedViews, setCapturedViews] = useState<CapturedView[]>([])

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  const startCamera = useCallback(
    async (mode: 'environment' | 'user') => {
      stopStream()
      setError(null)
      setIsReady(false)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: mode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        })
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.onloadedmetadata = () => setIsReady(true)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'No se pudo acceder a la cámara'
        setError(msg)
      }
    },
    [stopStream],
  )

  useEffect(() => {
    startCamera(facingMode)
    return stopStream
  }, [facingMode, startCamera, stopStream])

  const capture = useCallback(() => {
    if (!videoRef.current || !isReady) return
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Mirror if front camera
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(video, 0, 0)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' })

        if (guidedMode) {
          const step = VIEW_STEPS[currentStep]
          const view: CapturedView = { viewId: step.id, file }
          const updated = [...capturedViews, view]
          setCapturedViews(updated)

          if (currentStep < VIEW_STEPS.length - 1) {
            // Advance to next view.
            setCurrentStep((s) => s + 1)
          } else {
            // All views captured — send batch.
            onMultiViewCapture?.(updated)
            onClose()
          }
        } else {
          onCapture(file)
        }
      },
      'image/jpeg',
      0.92,
    )
  }, [isReady, facingMode, onCapture, guidedMode, currentStep, capturedViews, onMultiViewCapture, onClose])

  const skipStep = useCallback(() => {
    if (currentStep < VIEW_STEPS.length - 1) {
      setCurrentStep((s) => s + 1)
    } else {
      // Finished — send whatever we have.
      if (capturedViews.length > 0) {
        onMultiViewCapture?.(capturedViews)
      }
      onClose()
    }
  }, [currentStep, capturedViews, onMultiViewCapture, onClose])

  const finishEarly = useCallback(() => {
    if (capturedViews.length > 0) {
      onMultiViewCapture?.(capturedViews)
    }
    onClose()
  }, [capturedViews, onMultiViewCapture, onClose])

  return (
    <div className="camera-overlay">
      <div className="camera-container">
        <div className="camera-header">
          <h3>📸 {guidedMode ? `Vista ${currentStep + 1}/${VIEW_STEPS.length}: ${VIEW_STEPS[currentStep].label}` : 'Capturar con cámara'}</h3>
          <button className="btn-camera-close" onClick={onClose} aria-label="Cerrar cámara">
            ✕
          </button>
        </div>

        {/* Multi-view progress indicator */}
        {guidedMode && (
          <div className="multiview-progress">
            {VIEW_STEPS.map((step, idx) => (
              <div
                key={step.id}
                className={`progress-dot ${idx < currentStep ? 'done' : idx === currentStep ? 'active' : ''}`}
                title={step.label}
              >
                <span>{idx < currentStep ? '✓' : step.icon}</span>
              </div>
            ))}
          </div>
        )}

        {error ? (
          <div className="camera-error">
            <p>⚠️ {error}</p>
            <p className="hint">
              Asegúrate de dar permiso de cámara. También puedes subir fotos desde tus archivos.
            </p>
          </div>
        ) : (
          <div className="camera-viewfinder">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={facingMode === 'user' ? 'mirrored' : ''}
            />
            {!isReady && <div className="camera-loading">Iniciando cámara…</div>}
            <div className="camera-grid-overlay">
              <div className="grid-line-h top" />
              <div className="grid-line-h bottom" />
              <div className="grid-line-v left" />
              <div className="grid-line-v right" />
            </div>
          </div>
        )}

        {/* Guided mode hint */}
        {guidedMode && !error && (
          <div className="view-hint">
            <span className="view-icon">{VIEW_STEPS[currentStep].icon}</span>
            <p>{VIEW_STEPS[currentStep].hint}</p>
          </div>
        )}

        <div className="camera-controls">
          <button
            className="btn-switch-camera"
            onClick={() => setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))}
            disabled={!!error}
          >
            🔄 Cambiar cámara
          </button>
          <button
            className="btn-capture"
            onClick={capture}
            disabled={!isReady || !!error}
            aria-label={guidedMode ? `Capturar ${VIEW_STEPS[currentStep].label}` : 'Capturar foto'}
          >
            <span className="capture-ring" />
          </button>
          {guidedMode ? (
            <button className="btn-skip" onClick={skipStep} disabled={!!error}>
              ⏭️ Saltar
            </button>
          ) : (
            <div className="spacer" />
          )}
        </div>

        {/* Mode toggle and early finish */}
        <div className="camera-footer">
          <button className="btn-mode-toggle" onClick={() => { setGuidedMode(!guidedMode); setCapturedViews([]); setCurrentStep(0) }}>
            {guidedMode ? '📷 Modo simple' : '🔍 Modo guiado multi-vista'}
          </button>
          {guidedMode && capturedViews.length > 0 && (
            <button className="btn-finish-early" onClick={finishEarly}>
              ✓ Finalizar ({capturedViews.length} capturadas)
            </button>
          )}
        </div>

        <p className="camera-tip">
          💡 {guidedMode
            ? 'Captura las 4 vistas anatómicas para máxima precisión. Puedes saltar las que no apliquen.'
            : 'Toma fotos de: sombrero (arriba), láminas/poros (abajo), pie y base para mejor precisión'}
        </p>
      </div>
    </div>
  )
}