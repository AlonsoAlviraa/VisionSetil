/**
 * Camera capture with guided multi-view mode.
 * Professional field UX — SVG icons, no emoji chrome.
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import {
  IconAlert,
  IconCheck,
  IconClose,
  IconFlip,
  IconLightbulb,
  IconSkip,
  ViewIcon,
} from './icons'

const VIEW_STEPS = [
  {
    id: 'cap',
    label: 'Sombrero',
    hint: 'Fotografía la parte superior (sombrero) desde arriba, con buena luz natural.',
  },
  {
    id: 'gills',
    label: 'Láminas / poros',
    hint: 'Da la vuelta y fotografía el himenio (láminas o poros) de cerca.',
  },
  {
    id: 'stem',
    label: 'Pie',
    hint: 'Fotografía el pie de lado, incluyendo anillo o volva si existen.',
  },
  {
    id: 'base',
    label: 'Base',
    hint: 'Incluye la base del pie (bulbo, rizomorfos) con un poco de sustrato.',
  },
] as const

interface CapturedView {
  viewId: string
  file: File
}

interface CameraCaptureProps {
  onCapture: (file: File) => void
  onClose: () => void
  multiView?: boolean
  onMultiViewCapture?: (views: CapturedView[]) => void
  /**
   * B-27: optional label of the wizard slot this capture will fill
   * (e.g. "Láminas / himenio"). Shown in simple-mode header only.
   */
  slotLabel?: string
}

export function CameraCapture({
  onCapture,
  onClose,
  multiView = false,
  onMultiViewCapture,
  slotLabel,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [isReady, setIsReady] = useState(false)
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
            setCurrentStep((s) => s + 1)
          } else {
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
  }, [
    isReady,
    facingMode,
    onCapture,
    guidedMode,
    currentStep,
    capturedViews,
    onMultiViewCapture,
    onClose,
  ])

  const skipStep = useCallback(() => {
    if (currentStep < VIEW_STEPS.length - 1) {
      setCurrentStep((s) => s + 1)
    } else {
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

  const step = VIEW_STEPS[currentStep]

  return (
    <div className="camera-overlay">
      <div className="camera-container">
        <div className="camera-header">
          <h3>
            {guidedMode
              ? `Vista ${currentStep + 1}/${VIEW_STEPS.length}: ${step.label}`
              : slotLabel
                ? `Capturar: ${slotLabel}`
                : 'Capturar con cámara'}
          </h3>
          <button className="btn-camera-close" onClick={onClose} aria-label="Cerrar cámara">
            <IconClose size={18} />
          </button>
        </div>

        {guidedMode && (
          <div className="multiview-progress" role="list" aria-label="Progreso de vistas">
            {VIEW_STEPS.map((s, idx) => (
              <div
                key={s.id}
                role="listitem"
                className={`progress-dot ${idx < currentStep ? 'done' : idx === currentStep ? 'active' : ''}`}
                title={s.label}
              >
                {idx < currentStep ? (
                  <IconCheck size={14} />
                ) : (
                  <ViewIcon view={s.id} size={14} />
                )}
              </div>
            ))}
          </div>
        )}

        {error ? (
          <div className="camera-error">
            <p className="camera-error__row">
              <IconAlert size={18} />
              <span>{error}</span>
            </p>
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
            <div className="camera-grid-overlay" aria-hidden="true">
              <div className="grid-line-h top" />
              <div className="grid-line-h bottom" />
              <div className="grid-line-v left" />
              <div className="grid-line-v right" />
            </div>
            {/* Live framing assist — silhouette only; never continuous species green-light */}
            <div
              className={`camera-frame-assist camera-frame-assist--${guidedMode ? step.id : 'single'}`}
              data-testid="camera-frame-assist"
              aria-hidden="true"
            >
              <svg viewBox="0 0 200 260" className="camera-frame-assist__svg">
                <rect
                  x="18"
                  y="18"
                  width="164"
                  height="224"
                  rx="16"
                  fill="none"
                  stroke="rgba(247,244,237,0.55)"
                  strokeWidth="2"
                  strokeDasharray="6 5"
                />
                {(guidedMode ? step.id : 'gills') === 'gills' && (
                  <>
                    <ellipse
                      cx="100"
                      cy="120"
                      rx="62"
                      ry="40"
                      fill="none"
                      stroke="rgba(157,206,166,0.75)"
                      strokeWidth="2"
                    />
                    <path
                      d="M45 120 Q75 145 100 120 Q125 95 155 120"
                      fill="none"
                      stroke="rgba(157,206,166,0.45)"
                      strokeWidth="1.5"
                    />
                  </>
                )}
                {(guidedMode ? step.id : '') === 'stem' && (
                  <>
                    <ellipse
                      cx="100"
                      cy="70"
                      rx="48"
                      ry="22"
                      fill="none"
                      stroke="rgba(157,206,166,0.7)"
                      strokeWidth="2"
                    />
                    <path
                      d="M100 90 v90"
                      stroke="rgba(157,206,166,0.7)"
                      strokeWidth="2.2"
                    />
                    <ellipse
                      cx="100"
                      cy="185"
                      rx="16"
                      ry="8"
                      fill="none"
                      stroke="rgba(157,206,166,0.55)"
                      strokeWidth="1.6"
                    />
                  </>
                )}
                {(guidedMode ? step.id : '') === 'base' && (
                  <>
                    <path
                      d="M100 50 v95"
                      stroke="rgba(157,206,166,0.55)"
                      strokeWidth="1.8"
                    />
                    <ellipse
                      cx="100"
                      cy="160"
                      rx="42"
                      ry="28"
                      fill="none"
                      stroke="rgba(232,200,114,0.75)"
                      strokeWidth="2"
                    />
                  </>
                )}
                {(guidedMode ? step.id : '') === 'cap' && (
                  <ellipse
                    cx="100"
                    cy="110"
                    rx="70"
                    ry="36"
                    fill="none"
                    stroke="rgba(157,206,166,0.7)"
                    strokeWidth="2"
                  />
                )}
                {!guidedMode && (
                  <ellipse
                    cx="100"
                    cy="115"
                    rx="58"
                    ry="48"
                    fill="none"
                    stroke="rgba(157,206,166,0.65)"
                    strokeWidth="2"
                  />
                )}
              </svg>
              <span className="camera-frame-assist__label">
                Encuadre · no identifica
              </span>
            </div>
          </div>
        )}

        {guidedMode && !error && (
          <div className="view-hint">
            <span className="view-icon">
              <ViewIcon view={step.id} size={22} />
            </span>
            <p>{step.hint}</p>
          </div>
        )}
        {!guidedMode && !error && (
          <p className="camera-frame-policy" data-testid="camera-frame-policy" role="note">
            Guía de encuadre en vivo — nunca semáforo de especie ni permiso de consumo.
          </p>
        )}

        <div className="camera-controls">
          <button
            type="button"
            className="btn-switch-camera"
            onClick={() => setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))}
            disabled={!!error}
          >
            <IconFlip size={16} />
            Cambiar
          </button>
          <button
            type="button"
            className="btn-capture"
            onClick={capture}
            disabled={!isReady || !!error}
            aria-label={guidedMode ? `Capturar ${step.label}` : 'Capturar foto'}
          >
            <span className="capture-ring" />
          </button>
          {guidedMode ? (
            <button type="button" className="btn-skip" onClick={skipStep} disabled={!!error}>
              <IconSkip size={16} />
              Saltar
            </button>
          ) : (
            <div className="spacer" />
          )}
        </div>

        <div className="camera-footer">
          <button
            type="button"
            className="btn-mode-toggle"
            onClick={() => {
              setGuidedMode(!guidedMode)
              setCapturedViews([])
              setCurrentStep(0)
            }}
          >
            {guidedMode ? 'Modo simple' : 'Modo guiado multi-vista'}
          </button>
          {guidedMode && capturedViews.length > 0 && (
            <button type="button" className="btn-finish-early" onClick={finishEarly}>
              <IconCheck size={14} />
              Finalizar ({capturedViews.length})
            </button>
          )}
        </div>

        <p className="camera-tip">
          <IconLightbulb size={15} />
          <span>
            {guidedMode
              ? 'Las cuatro vistas anatómicas mejoran la precisión. Puedes saltar las que no apliquen.'
              : 'Incluye sombrero, láminas, pie y base para una identificación más fiable.'}
          </span>
        </p>
      </div>
    </div>
  )
}
