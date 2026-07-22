/**
 * Identify page: the AI classification flow extracted from the original App.tsx.
 * Reuses UploadZone, CameraCapture, MetadataForm, ResultCard, BatchCompare.
 * PR-10: guided 4-view wizard + view_types to /classify.
 */
import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { useTranslation } from 'react-i18next'
import { classifyImages, submitFeedback, type CanonicalView } from '../api/client'
import type { ClassificationResult, ObservationMetadata } from '../api/types'
import { ResultCard } from '../components/ResultCard'
import { UploadZone } from '../components/UploadZone'
import { CameraCapture } from '../components/CameraCapture'
import { MetadataForm } from '../components/MetadataForm'
import { BatchCompare } from '../components/BatchCompare'
import { featureFlags } from '../lib/featureFlags'

const CANONICAL_VIEWS: CanonicalView[] = ['gills', 'front', 'habitat', 'detail']

interface SelectedImage {
  file: File
  preview: string
  viewType?: CanonicalView
}

interface HistoryEntry {
  id: string
  timestamp: number
  previews: string[]
  result: ClassificationResult
}

const HISTORY_KEY = 'visionsetil_history'
const MAX_HISTORY = 20

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    return JSON.parse(raw) as HistoryEntry[]
  } catch {
    return []
  }
}

function saveHistory(entries: HistoryEntry[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)))
  } catch {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, 5)))
  }
}

export function IdentifyPage() {
  const { t, i18n } = useTranslation()
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([])
  const [result, setResult] = useState<ClassificationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCamera, setShowCamera] = useState(false)
  const [metadata, setMetadata] = useState<ObservationMetadata>({})
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [showCompare, setShowCompare] = useState(false)
  const [wizardStep, setWizardStep] = useState(0)
  const [shareMsg, setShareMsg] = useState<string | null>(null)

  useEffect(() => {
    setHistory(loadHistory())
  }, [])

  const addFiles = useCallback((files: File[], viewType?: CanonicalView) => {
    const newImages = files.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      viewType,
    }))
    setSelectedImages((prev) => [...prev, ...newImages].slice(0, 10))
  }, [])

  const removeImage = useCallback((index: number) => {
    setSelectedImages((prev) => {
      const removed = prev[index]
      if (removed) URL.revokeObjectURL(removed.preview)
      return prev.filter((_, i) => i !== index)
    })
  }, [])

  const handleClassify = useCallback(async () => {
    if (selectedImages.length === 0) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const files = selectedImages.map((img) => img.file)
      const viewTypes = selectedImages
        .map((img) => img.viewType)
        .filter((v): v is CanonicalView => Boolean(v))
      const locale = (i18n.language || 'es').slice(0, 2)
      const data = await classifyImages(files, metadata, {
        locale,
        viewTypes: viewTypes.length === files.length ? viewTypes : viewTypes.length ? (
          // pad/trim to file count using available labels
          files.map((_, i) => viewTypes[i] || CANONICAL_VIEWS[Math.min(i, CANONICAL_VIEWS.length - 1)])
        ) : undefined,
      })
      setResult(data)

      const entry: HistoryEntry = {
        id: data.request_id,
        timestamp: Date.now(),
        previews: selectedImages.map((img) => img.preview),
        result: data,
      }
      setHistory((prev) => {
        const next = [entry, ...prev].slice(0, MAX_HISTORY)
        saveHistory(next)
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [selectedImages, metadata, i18n.language])

  const handleFeedback = useCallback(
    async (isCorrect: boolean, species?: string) => {
      if (!result) return
      try {
        await submitFeedback(result.request_id, isCorrect, species)
      } catch {
        // Feedback is best-effort
      }
    },
    [result],
  )

  const clearHistory = useCallback(() => {
    history.forEach((e) => e.previews.forEach((p) => URL.revokeObjectURL(p)))
    setHistory([])
    localStorage.removeItem(HISTORY_KEY)
  }, [history])

  const reset = useCallback(() => {
    selectedImages.forEach((img) => URL.revokeObjectURL(img.preview))
    setSelectedImages([])
    setResult(null)
    setError(null)
    setMetadata({})
  }, [selectedImages])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) =>
      addFiles(
        files,
        featureFlags.GUIDED_IDENTIFY ? CANONICAL_VIEWS[wizardStep] : undefined,
      ),
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] },
    maxFiles: 10,
    maxSize: 20 * 1024 * 1024,
  })

  const hasImages = selectedImages.length > 0
  const showResult = result !== null && !loading

  const shareResult = useCallback(async () => {
    if (!result?.predictions[0]) return
    const top = result.predictions[0]
    const text = `${t('share.title')}: ${top.species}${top.common_name ? ` (${top.common_name})` : ''} — ${t('share.disclaimer')}`
    try {
      if (navigator.share) {
        await navigator.share({ title: t('share.title'), text })
      } else {
        await navigator.clipboard.writeText(text)
        setShareMsg(t('share.copied'))
        setTimeout(() => setShareMsg(null), 2000)
      }
    } catch {
      /* ignore cancel */
    }
  }, [result, t])

  return (
    <div className="page-identify">
      <div className="page-header">
        <h1 className="page-title">🔍 {t('identify.title')}</h1>
        <p className="page-subtitle">{t('identify.subtitle')}</p>
        <p data-testid="safety-banner" style={{ fontSize: '0.85rem' }}>
          {t('safety.orientationOnly')}
        </p>
      </div>

      {!showResult && !loading && (
        <div className="identify-primary-cta">
          <button
            type="button"
            className="vs-btn vs-btn--primary vs-btn--lg"
            onClick={() => setShowCamera(true)}
          >
            📷 {t('identify.takePhoto', { defaultValue: 'Hacer foto' })}
          </button>
          <button type="button" className="vs-btn vs-btn--secondary vs-btn--lg" {...getRootProps()}>
            📁 {t('identify.uploadPhotos', { defaultValue: 'Subir fotos' })}
          </button>
          <input {...getInputProps()} />
        </div>
      )}

      {/* Capture coach + PR-10 guided 4-view wizard */}
      {!showResult && !loading && (
        <div className="identify-coach" data-testid="identify-coach">
          <h2>{t('identify.coachTitle')}</h2>
          <ul className="identify-coach__tips">
            <li>{t('identify.coachTip1')}</li>
            <li>{t('identify.coachTip2')}</li>
            <li>{t('identify.coachTip3')}</li>
            <li>{t('identify.coachTip4')}</li>
          </ul>
        </div>
      )}
      {featureFlags.GUIDED_IDENTIFY && !showResult && !loading && (
        <div className="identify-wizard" data-testid="identify-wizard">
          <h2>{t('identify.wizardTitle')}</h2>
          <div className="identify-wizard__steps">
            {CANONICAL_VIEWS.map((view, idx) => {
              const has = selectedImages.some((img) => img.viewType === view)
              return (
                <button
                  key={view}
                  type="button"
                  className={`identify-wizard__step ${wizardStep === idx ? 'identify-wizard__step--active' : ''} ${has ? 'identify-wizard__step--done' : ''}`}
                  onClick={() => setWizardStep(idx)}
                >
                  <div className="identify-wizard__icon" aria-hidden>
                    {t(`identify.viewIcon.${view}`, { defaultValue: '🍄' })}
                  </div>
                  <div>{t(`identify.views.${view}`)}</div>
                  <small>{t(`identify.viewHint.${view}`)}</small>
                  {has ? ' ✓' : ''}
                </button>
              )
            })}
          </div>
          <p>
            {t('identify.viewHint.' + CANONICAL_VIEWS[wizardStep])}.{' '}
            {t('actions.next')}: {t(`identify.views.${CANONICAL_VIEWS[wizardStep]}`)}
          </p>
          <div className="analyze-actions">
            <button className="btn-add-more" {...getRootProps()}>
              + {t(`identify.views.${CANONICAL_VIEWS[wizardStep]}`)}
            </button>
            <input
              {...getInputProps({
                onChange: undefined,
              })}
            />
            <button
              type="button"
              className="btn-cancel"
              onClick={() => {
                // capture next files as current view via wrapper
                const input = document.createElement('input')
                input.type = 'file'
                input.accept = 'image/*'
                input.multiple = true
                input.onchange = () => {
                  const files = Array.from(input.files || [])
                  if (files.length) {
                    addFiles(files, CANONICAL_VIEWS[wizardStep])
                    setWizardStep((s) => Math.min(s + 1, CANONICAL_VIEWS.length - 1))
                  }
                }
                input.click()
              }}
            >
              📷 {t(`identify.views.${CANONICAL_VIEWS[wizardStep]}`)}
            </button>
            <button type="button" className="btn-cancel" onClick={() => setWizardStep((s) => Math.min(s + 1, 3))}>
              {t('actions.skip')}
            </button>
          </div>
        </div>
      )}

      {/* Camera capture overlay */}
      {showCamera && (
        <CameraCapture
          onCapture={(file) => {
            addFiles(
              [file],
              featureFlags.GUIDED_IDENTIFY ? CANONICAL_VIEWS[wizardStep] : undefined,
            )
            setShowCamera(false)
          }}
          onClose={() => setShowCamera(false)}
        />
      )}

      {/* Upload zone */}
      {!hasImages && !showResult && !loading && (
        <UploadZone
          getRootProps={getRootProps}
          getInputProps={getInputProps}
          isDragActive={isDragActive}
          fileCount={selectedImages.length}
          onOpenCamera={() => setShowCamera(true)}
        />
      )}

      {/* Selected images preview grid + analyze button */}
      {hasImages && !showResult && (
        <div className="image-review-section">
          <h2>Fotos seleccionadas ({selectedImages.length})</h2>
          <div className="image-grid">
            {selectedImages.map((img, idx) => (
              <div
                key={idx}
                className="image-grid-item"
                onClick={() => setLightbox(img.preview)}
              >
                <img src={img.preview} alt={`Seta ${idx + 1}`} />
                <button
                  className="btn-remove-image"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeImage(idx)
                  }}
                  aria-label="Eliminar imagen"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <MetadataForm metadata={metadata} onChange={setMetadata} />

          <div className="analyze-actions">
            <button
              className="btn-analyze"
              onClick={handleClassify}
              disabled={loading || selectedImages.length === 0}
            >
              {loading ? 'Analizando…' : '🔍 Analizar'}
            </button>
            <button className="btn-add-more" {...getRootProps()}>
              + Añadir más fotos
            </button>
            <input {...getInputProps()} />
            <button className="btn-cancel" onClick={reset}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="loading">
          <div className="spinner" />
          <p>Analizando {selectedImages.length} imagen(es)…</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="error-banner">
          <strong>Error:</strong> {error}
          <button className="btn-retry" onClick={reset}>
            Reintentar
          </button>
        </div>
      )}

      {/* Result display */}
      {showResult && result && (
        <div className="result-layout">
          <div className="result-image-section">
            <div className="result-image-grid">
              {selectedImages.map((img, idx) => (
                <img
                  key={idx}
                  src={img.preview}
                  alt={`Resultado ${idx + 1}`}
                  className="preview-image"
                  onClick={() => setLightbox(img.preview)}
                />
              ))}
            </div>
            <div className="result-actions-bar">
              <button className="btn-new-analysis" onClick={reset}>
                ↻ Nuevo análisis
              </button>
              <button
                className="btn-export"
                onClick={() => {
                  const blob = new Blob([JSON.stringify(result, null, 2)], {
                    type: 'application/json',
                  })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `visionsetil_${result.request_id}.json`
                  a.click()
                  URL.revokeObjectURL(url)
                }}
              >
                ⬇ Exportar JSON
              </button>
            </div>
          </div>
          <div className="share-card" data-testid="share-card">
            <button type="button" className="btn-export" onClick={() => void shareResult()}>
              {t('actions.share')}
            </button>
            {shareMsg ? <span>{shareMsg}</span> : null}
            <p style={{ fontSize: '0.8rem', margin: '0.5rem 0 0' }}>{t('share.disclaimer')}</p>
          </div>
          <ResultCard result={result} onFeedback={handleFeedback} />
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Vista ampliada" />
          <button className="lightbox-close" onClick={() => setLightbox(null)} aria-label="Cerrar">
            ✕
          </button>
        </div>
      )}

      {/* Session history */}
      {history.length > 0 && !loading && !showResult && (
        <div className="history-section">
          <div className="history-header">
            <h2>Historial de sesión ({history.length})</h2>
            <div className="history-actions">
              <button
                className="btn-compare"
                onClick={() => setShowCompare(true)}
                disabled={history.length < 2}
                title={history.length < 2 ? 'Necesitas al menos 2 resultados' : 'Comparar resultados'}
              >
                ⇄ Comparar
              </button>
              <button className="btn-clear-history" onClick={clearHistory}>
                Limpiar
              </button>
            </div>
          </div>
          <div className="history-grid">
            {history.slice(0, 6).map((entry) => (
              <div
                key={entry.id}
                className={`history-item ${entry.result.decision}`}
                onClick={() => {
                  setResult(entry.result)
                  setSelectedImages(
                    entry.previews.map((preview) => ({ file: new File([], ''), preview })),
                  )
                }}
              >
                <img src={entry.previews[0]} alt="Historial" className="history-thumb" />
                <div className="history-meta">
                  <span className="history-time">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="history-decision">{entry.result.decision}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Batch comparison modal */}
      {showCompare && (
        <BatchCompare
          history={history}
          onClose={() => setShowCompare(false)}
          onSelectEntry={(entry) => {
            setResult(entry.result)
            setSelectedImages(
              entry.previews.map((preview) => ({ file: new File([], ''), preview })),
            )
            setShowCompare(false)
          }}
        />
      )}
    </div>
  )
}