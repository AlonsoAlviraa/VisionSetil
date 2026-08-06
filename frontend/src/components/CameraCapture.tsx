/**
 * Camera capture with guided multi-view mode.
 * Professional field UX — SVG icons, no emoji chrome.
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  IconAlert,
  IconCheck,
  IconClose,
  IconFlip,
  IconLightbulb,
  IconSkip,
  ViewIcon,
} from './icons'
import {
  IDENTIFY_JPEG_MAX_EDGE,
  IDENTIFY_JPEG_QUALITY,
} from '../lib/prepareIdentifyImage'
import { Button } from './ui'

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
  const { t } = useTranslation()
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
          video: {
            facingMode: { ideal: mode },
            // Cap capture resolution for field phones (upload + decode budget)
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.onloadedmetadata = () => setIsReady(true)
        }
      } catch (err) {
        const name = err instanceof DOMException ? err.name : ''
        const raw = err instanceof Error ? err.message : String(err ?? '')
        // iOS Safari / Android WebView: NotAllowedError when user denied or insecure origin
        let msg: string
        if (name === 'NotAllowedError' || /permission|notallowed|denied/i.test(raw)) {
          msg = t('identify.cameraPermissionDenied', {
            defaultValue:
              'Permiso de cámara denegado. En Ajustes del teléfono permite la cámara para este sitio, o usa Galería. Solo orientación — nunca consumo.',
          })
        } else if (name === 'NotFoundError' || /not found|no device/i.test(raw)) {
          msg = t('identify.cameraNotFound', {
            defaultValue:
              'No hay cámara disponible. Usa Galería para subir una foto de la librería.',
          })
        } else if (
          typeof window !== 'undefined' &&
          !window.isSecureContext &&
          location.hostname !== 'localhost' &&
          location.hostname !== '127.0.0.1'
        ) {
          msg = t('identify.cameraNeedsHttps', {
            defaultValue:
              'La cámara requiere HTTPS (o localhost). Abre la app en un origen seguro o usa Galería.',
          })
        } else {
          msg =
            raw ||
            t('identify.cameraGenericError', {
              defaultValue: 'No se pudo acceder a la cámara. Prueba Galería.',
            })
        }
        setError(msg)
      }
    },
    [stopStream, t],
  )

  useEffect(() => {
    startCamera(facingMode)
    return stopStream
  }, [facingMode, startCamera, stopStream])

  const capture = useCallback(() => {
    if (!videoRef.current || !isReady) return
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    // Shared JPEG long-edge budget (prepareIdentifyImage SSOT) — memory + upload
    const maxEdge = IDENTIFY_JPEG_MAX_EDGE
    const vw = video.videoWidth || 1280
    const vh = video.videoHeight || 720
    const scale = Math.min(1, maxEdge / Math.max(vw, vh))
    canvas.width = Math.round(vw * scale)
    canvas.height = Math.round(vh * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
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
            // If parent didn't wire multi-view, still deliver last frame via onCapture
            if (onMultiViewCapture) {
              onMultiViewCapture(updated)
            } else {
              onCapture(file)
            }
            onClose()
          }
        } else {
          onCapture(file)
        }
      },
      'image/jpeg',
      IDENTIFY_JPEG_QUALITY,
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

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="camera-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="camera-capture-title"
      data-testid="camera-capture-dialog"
    >
      <div className="camera-container">
        <div className="camera-header">
          <h3 id="camera-capture-title">
            {guidedMode
              ? `Vista ${currentStep + 1}/${VIEW_STEPS.length}: ${step.label}`
              : slotLabel
                ? `Capturar: ${slotLabel}`
                : 'Capturar con cámara'}
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="btn-camera-close"
            onClick={onClose}
            aria-label={t('a11y.closeCamera', { defaultValue: 'Cerrar cámara' })}
          >
            <IconClose size={18} />
          </Button>
        </div>

        {guidedMode && (
          <div
            className="multiview-progress"
            role="list"
            aria-label={t('a11y.viewProgress', { defaultValue: 'Progreso de vistas' })}
          >
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
          <Button
            type="button"
            variant="ghost"
            className="btn-switch-camera"
            onClick={() => setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))}
            disabled={!!error}
            aria-label={t('identify.switchCamera', { defaultValue: 'Cambiar cámara' })}
          >
            <IconFlip size={16} />
            {t('identify.switchCameraShort', { defaultValue: 'Cambiar' })}
          </Button>
          <Button
            type="button"
            variant="primary"
            className="btn-capture"
            onClick={capture}
            disabled={!isReady || !!error}
            aria-label={
              guidedMode
                ? t('identify.captureView', {
                    defaultValue: 'Capturar {{view}}',
                    view: step.label,
                  })
                : t('identify.capturePhoto', { defaultValue: 'Capturar foto' })
            }
          >
            <span className="capture-ring" />
          </Button>
          {guidedMode ? (
            <Button
              type="button"
              variant="ghost"
              className="btn-skip"
              onClick={skipStep}
              disabled={!!error}
              aria-label={t('identify.skipView', { defaultValue: 'Saltar vista' })}
            >
              <IconSkip size={16} />
              {t('identify.skip', { defaultValue: 'Saltar' })}
            </Button>
          ) : (
            <div className="spacer" />
          )}
        </div>

        <div className="camera-footer">
          {/* In-camera multi-step is secondary; parent wizard owns real multi-view slots */}
          <Button
            type="button"
            variant="ghost"
            className="btn-mode-toggle"
            onClick={() => {
              setGuidedMode(!guidedMode)
              setCapturedViews([])
              setCurrentStep(0)
            }}
          >
            {guidedMode
              ? t('identify.cameraModeSimple', { defaultValue: 'Foto única' })
              : t('identify.cameraModeGuided', { defaultValue: 'Guía en cámara' })}
          </Button>
          {guidedMode && capturedViews.length > 0 && (
            <Button type="button" variant="primary" className="btn-finish-early" onClick={finishEarly}>
              <IconCheck size={14} />
              {t('identify.finishEarly', {
                defaultValue: 'Listo ({{n}})',
                n: capturedViews.length,
              })}
            </Button>
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
