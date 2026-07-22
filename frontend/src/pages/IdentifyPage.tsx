/**
 * Identify page: guided multi-view + classify + history.
 */
import { useState, useCallback, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { classifyImages, submitFeedback } from '../api/client'
import type { ClassificationResult, ObservationMetadata } from '../api/types'
import { ResultCard } from '../components/ResultCard'
import { UploadZone } from '../components/UploadZone'
import { CameraCapture } from '../components/CameraCapture'
import { MetadataForm } from '../components/MetadataForm'
import { BatchCompare } from '../components/BatchCompare'
import { MultiViewWizard } from '../components/MultiViewWizard'
import { IconClose, IconExpert, IconHistory, IconSearch } from '../components/icons'
import { MEDIA } from '../data/media'
import {
  assessMultiViewReadiness,
  buildViewTypesOrder,
  orderedSlotKeys,
  type CanonicalView,
  type SlotAssignment,
} from '../lib/multiViewSlots'
import {
  appendHistory,
  clearHistoryStore,
  loadHistory,
  summarizeHistory,
  type HistoryEntry,
} from '../lib/observationHistory'
import { decisionLabelEs } from '../lib/decisionLabels'

interface SelectedImage {
  file: File
  preview: string
}

export function IdentifyPage() {
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([])
  const [assignments, setAssignments] = useState<SlotAssignment>({})
  const [useWizard, setUseWizard] = useState(true)
  const [result, setResult] = useState<ClassificationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCamera, setShowCamera] = useState(false)
  const [metadata, setMetadata] = useState<ObservationMetadata>({})
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [showCompare, setShowCompare] = useState(false)

  useEffect(() => {
    setHistory(loadHistory())
  }, [])

  const readiness = useMemo(() => assessMultiViewReadiness(assignments), [assignments])
  const historySummary = useMemo(() => summarizeHistory(history), [history])

  const addFiles = useCallback((files: File[]) => {
    const newImages = files.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
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

  const onAssignSlot = useCallback((view: CanonicalView, file: File, previewUrl: string) => {
    setAssignments((prev) => {
      const old = prev[view]
      if (old) URL.revokeObjectURL(old.previewUrl)
      return { ...prev, [view]: { fileName: file.name, previewUrl, file } }
    })
  }, [])

  const onClearSlot = useCallback((view: CanonicalView) => {
    setAssignments((prev) => {
      const next = { ...prev }
      const old = next[view]
      if (old) URL.revokeObjectURL(old.previewUrl)
      delete next[view]
      return next
    })
  }, [])

  const collectWizardFiles = useCallback((): {
    files: File[]
    viewTypes: string[]
    previews: string[]
  } => {
    const keys = orderedSlotKeys(assignments)
    const files: File[] = []
    const previews: string[] = []
    for (const k of keys) {
      const slot = assignments[k]
      if (slot?.file) {
        files.push(slot.file)
        previews.push(slot.previewUrl)
      }
    }
    return { files, viewTypes: buildViewTypesOrder(assignments), previews }
  }, [assignments])

  const handleClassify = useCallback(async () => {
    let files: File[]
    let viewTypes: string[] | undefined
    let previews: string[]

    if (useWizard) {
      const pack = collectWizardFiles()
      files = pack.files
      viewTypes = pack.viewTypes
      previews = pack.previews
      if (files.length === 0) return
    } else {
      if (selectedImages.length === 0) return
      files = selectedImages.map((img) => img.file)
      previews = selectedImages.map((img) => img.preview)
      viewTypes = undefined
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const data = await classifyImages(files, metadata, viewTypes)
      setResult(data)

      const entry: HistoryEntry = {
        id: data.request_id,
        timestamp: Date.now(),
        previews,
        result: data,
        view_types: viewTypes,
      }
      setHistory(appendHistory(entry))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [useWizard, collectWizardFiles, selectedImages, metadata])

  const handleFeedback = useCallback(
    async (isCorrect: boolean, species?: string) => {
      if (!result) return
      try {
        await submitFeedback(result.request_id, isCorrect, species)
      } catch {
        // best-effort
      }
    },
    [result],
  )

  const clearHistory = useCallback(() => {
    clearHistoryStore()
    setHistory([])
  }, [])

  const reset = useCallback(() => {
    selectedImages.forEach((img) => URL.revokeObjectURL(img.preview))
    orderedSlotKeys(assignments).forEach((k) => {
      const p = assignments[k]?.previewUrl
      if (p) URL.revokeObjectURL(p)
    })
    setSelectedImages([])
    setAssignments({})
    setResult(null)
    setError(null)
    setMetadata({})
  }, [selectedImages, assignments])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: addFiles,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] },
    maxFiles: 10,
    maxSize: 20 * 1024 * 1024,
  })

  const hasImages = useWizard ? readiness.filled > 0 : selectedImages.length > 0
  const showResult = result !== null && !loading

  return (
    <div className="page-identify">
      <div className="atelier-banner">
        <div
          className="atelier-banner__media"
          style={{ backgroundImage: `url(${MEDIA.mushroomsClose})` }}
        />
        <div className="atelier-banner__veil" />
        <div className="atelier-banner__copy">
          <h1>Identificar</h1>
          <p>Multi-vista guiada. Si no está seguro, se calla. Mejor eso que inventar.</p>
        </div>
      </div>

      <div className="page-header">
        <div className="identify-mode-toggle">
          <button
            type="button"
            className={useWizard ? 'btn-atelier btn-atelier--primary' : 'btn-atelier btn-atelier--ghost'}
            onClick={() => setUseWizard(true)}
          >
            Modo guiado
          </button>
          <button
            type="button"
            className={!useWizard ? 'btn-atelier btn-atelier--primary' : 'btn-atelier btn-atelier--ghost'}
            onClick={() => setUseWizard(false)}
          >
            Modo libre
          </button>
          <Link to="/historial" className="btn-atelier btn-atelier--ghost">
            Historial ({historySummary.total})
          </Link>
        </div>
      </div>

      {showCamera && (
        <CameraCapture
          onCapture={(file) => {
            addFiles([file])
            setShowCamera(false)
          }}
          onClose={() => setShowCamera(false)}
        />
      )}

      {!showResult && !loading && useWizard && (
        <>
          <MultiViewWizard
            assignments={assignments}
            onAssign={onAssignSlot}
            onClear={onClearSlot}
            onOpenCamera={() => setShowCamera(true)}
          />
          {hasImages && (
            <div className="image-review-section">
              <MetadataForm metadata={metadata} onChange={setMetadata} />
              <div className="analyze-actions">
                <button
                  type="button"
                  className="btn-atelier btn-atelier--primary"
                  onClick={handleClassify}
                  disabled={loading || !readiness.canSubmit}
                >
                  {loading ? (
                    'Analizando…'
                  ) : (
                    <>
                      <IconSearch size={18} />
                      Analizar ({readiness.filled} vistas)
                    </>
                  )}
                </button>
                <button type="button" className="btn-atelier btn-atelier--ghost" onClick={reset}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {!showResult && !loading && !useWizard && !hasImages && (
        <UploadZone
          getRootProps={getRootProps}
          getInputProps={getInputProps}
          isDragActive={isDragActive}
          fileCount={selectedImages.length}
          onOpenCamera={() => setShowCamera(true)}
        />
      )}

      {!showResult && !loading && !useWizard && hasImages && (
        <div className="image-review-section">
          <h2>Fotos seleccionadas ({selectedImages.length})</h2>
          <div className="image-grid">
            {selectedImages.map((img, idx) => (
              <div key={idx} className="image-grid-item" onClick={() => setLightbox(img.preview)}>
                <img src={img.preview} alt={`Seta ${idx + 1}`} />
                <button
                  className="btn-remove-image"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeImage(idx)
                  }}
                  aria-label="Eliminar imagen"
                >
                  <IconClose size={14} />
                </button>
              </div>
            ))}
          </div>
          <MetadataForm metadata={metadata} onChange={setMetadata} />
          <div className="analyze-actions">
            <button
              type="button"
              className="btn-atelier btn-atelier--primary"
              onClick={handleClassify}
              disabled={loading}
            >
              {loading ? (
                'Analizando…'
              ) : (
                <>
                  <IconSearch size={18} />
                  Analizar
                </>
              )}
            </button>
            <button type="button" className="btn-atelier btn-atelier--ghost" {...getRootProps()}>
              + Añadir más fotos
            </button>
            <input {...getInputProps()} />
            <button type="button" className="btn-atelier btn-atelier--ghost" onClick={reset}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="loading">
          <div className="spinner" />
          <p>Analizando con multi-vista…</p>
        </div>
      )}

      {error && (
        <div className="error-banner">
          <strong>Error:</strong> {error}
          <button className="btn-retry" onClick={reset}>
            Reintentar
          </button>
        </div>
      )}

      {showResult && result && (
        <div className="result-layout" data-testid="identify-result">
          <div className="result-image-section">
            <div className="result-image-grid">
              {(useWizard
                ? orderedSlotKeys(assignments).map((k) => assignments[k]!.previewUrl)
                : selectedImages.map((i) => i.preview)
              ).map((src, idx) => (
                <img
                  key={idx}
                  src={src}
                  alt={`Resultado ${idx + 1}`}
                  className="preview-image"
                  onClick={() => setLightbox(src)}
                />
              ))}
            </div>
            <div className="result-actions-bar">
              <button type="button" className="btn-atelier btn-atelier--primary" onClick={reset}>
                Nuevo análisis
              </button>
              <Link to="/historial" className="btn-atelier btn-atelier--ghost">
                <IconHistory size={16} />
                Cuaderno
              </Link>
              <Link to="/revision-experta" className="btn-atelier btn-atelier--ghost">
                <IconExpert size={16} />
                Expertos
              </Link>
            </div>
          </div>
          <ResultCard
            result={result}
            onFeedback={handleFeedback}
            viewTypes={
              useWizard
                ? orderedSlotKeys(assignments)
                : selectedImages.map((_, i) => `free_${i + 1}`)
            }
            previews={
              useWizard
                ? orderedSlotKeys(assignments).map((k) => assignments[k]!.previewUrl)
                : selectedImages.map((i) => i.preview)
            }
          />
        </div>
      )}

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Vista ampliada" />
          <button className="lightbox-close" onClick={() => setLightbox(null)} aria-label="Cerrar">
            <IconClose size={18} />
          </button>
        </div>
      )}

      {history.length > 0 && !loading && !showResult && (
        <div className="history-section">
          <div className="history-header">
            <h2>Historial reciente ({historySummary.total})</h2>
            <div className="history-actions">
              <Link to="/historial">Ver todo</Link>
              <button
                className="btn-compare"
                onClick={() => setShowCompare(true)}
                disabled={history.length < 2}
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
                  setResult(entry.result as ClassificationResult)
                }}
              >
                {entry.previews[0] && (
                  <img src={entry.previews[0]} alt="Historial" className="history-thumb" />
                )}
                <div className="history-meta">
                  <span className="history-time">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="history-decision">
                    {decisionLabelEs(entry.result.decision)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showCompare && (
        <BatchCompare
          history={history as never}
          onClose={() => setShowCompare(false)}
          onSelectEntry={(entry) => {
            setResult(entry.result as ClassificationResult)
            setShowCompare(false)
          }}
        />
      )}
    </div>
  )
}
