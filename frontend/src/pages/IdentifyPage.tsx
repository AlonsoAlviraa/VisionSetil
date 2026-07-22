/**
 * Identify page: honesty flow layout (B-24) + preflight (B-11) + result modes (B-08).
 * Mobile-first polish (B-31): sticky CTA, ≥44px touch targets, banners below submit z-index.
 *
 * Visual order (capture): preflight → wizard → (history)
 * Visual order (loading): stages upload → analyze → apply policy + skeleton
 * Visual order (result):  result mode chrome → card / images
 * Preflight is always advisory; only offline disables submit.
 */
import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { classifyImagesMaybeAsync, submitFeedback } from '../api/client'
import type { ClassificationResult, ObservationMetadata } from '../api/types'
import i18n from '../i18n'
import { ResultCard } from '../components/ResultCard'
import { PreflightBanner } from '../components/PreflightBanner'
import { UploadZone } from '../components/UploadZone'
import { CameraCapture } from '../components/CameraCapture'
import { MetadataForm } from '../components/MetadataForm'
import { BatchCompare } from '../components/BatchCompare'
import { MultiViewWizard } from '../components/MultiViewWizard'
import { IdentifyResultSkeleton } from '../components/ui/Skeleton'
import { IconClose, IconExpert, IconHistory, IconSearch } from '../components/icons'
import { MEDIA } from '../data/media'
import i18n from '../i18n'
import { featureFlags } from '../lib/featureFlags'
import {
  assessMultiViewReadiness,
  buildViewTypesOrder,
  orderedSlotKeys,
  resolveCameraTargetSlot,
  VIEW_SLOTS,
  type CanonicalView,
  type SlotAssignment,
} from '../lib/multiViewSlots'
import {
  appendHistory,
  buildHistoryEntry,
  clearHistoryStore,
  loadHistory,
  summarizeHistory,
  type HistoryEntry,
} from '../lib/observationHistory'
import { decisionLabelEs } from '../lib/decisionLabels'
import { resolveDisplayMode } from '../lib/classifyMode'
import {
  canSubmitPreflight,
  fetchPreflight,
  initialPreflightState,
  PREFLIGHT_POLL_MS,
  type PreflightState,
} from '../lib/preflight'

interface SelectedImage {
  file: File
  preview: string
}

/** Honesty-flow phase for layout chrome (B-24). */
type IdentifyPhase = 'capture' | 'loading' | 'result'

/** Ordered honest pipeline stages (B-28). Never mapped to a fake ML %. */
const LOADING_STAGES: readonly ClassifyClientStage[] = [
  'upload',
  'analyze',
  'apply_policy',
] as const

function stageIndex(stage: ClassifyClientStage): number {
  return LOADING_STAGES.indexOf(stage)
}

export function IdentifyPage() {
  const { t } = useTranslation()
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([])
  const [assignments, setAssignments] = useState<SlotAssignment>({})
  const [useWizard, setUseWizard] = useState(true)
  const [result, setResult] = useState<ClassificationResult | null>(null)
  const [loading, setLoading] = useState(false)
  /** Honest client pipeline stage while loading (B-28). */
  const [loadingStage, setLoadingStage] = useState<ClassifyClientStage>('upload')
  const [error, setError] = useState<string | null>(null)
  const [showCamera, setShowCamera] = useState(false)
  /** Slot the user opened camera from (wizard); B-27 still prefers missing required. */
  const [cameraTargetSlot, setCameraTargetSlot] = useState<CanonicalView | null>(null)
  const [metadata, setMetadata] = useState<ObservationMetadata>({})
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [showCompare, setShowCompare] = useState(false)
  const [preflight, setPreflight] = useState<PreflightState>(() =>
    initialPreflightState(),
  )

  const preflightEnabled = featureFlags.IDENTIFY_PREFLIGHT
  /** HARD: only offline/API-down disables submit — never gate blocked. */
  const submitAllowed = !preflightEnabled || canSubmitPreflight(preflight)

  useEffect(() => {
    setHistory(loadHistory())
  }, [])

  const applyOfflinePreflight = useCallback((error: string) => {
    setPreflight({
      ...initialPreflightState(),
      mode: 'offline',
      ready: false,
      metrics_warning: false,
      submit_enabled: false,
      loading: false,
      fetched_at: Date.now(),
      error,
    })
  }, [])

  const runPreflight = useCallback(
    async (opts?: { cancelled?: () => boolean }) => {
      if (!preflightEnabled) return
      try {
        const state = await fetchPreflight()
        if (opts?.cancelled?.()) return
        setPreflight(state)
      } catch {
        if (opts?.cancelled?.()) return
        applyOfflinePreflight('preflight_throw')
      }
    },
    [preflightEnabled, applyOfflinePreflight],
  )

  /** B-15: manual retry from offline banner (hard disable unchanged). */
  const handlePreflightRetry = useCallback(() => {
    if (!preflightEnabled) return
    setPreflight((prev) => ({
      ...prev,
      loading: true,
      // Keep offline + submit disabled until fetch settles (no flash of enabled).
      mode: 'offline',
      submit_enabled: false,
    }))
    void runPreflight()
  }, [preflightEnabled, runPreflight])

  useEffect(() => {
    if (!preflightEnabled) return
    let cancelled = false
    const isCancelled = () => cancelled

    void runPreflight({ cancelled: isCancelled })
    const id = window.setInterval(() => {
      void runPreflight({ cancelled: isCancelled })
    }, PREFLIGHT_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [preflightEnabled, runPreflight])

  const readiness = useMemo(
    () =>
      assessMultiViewReadiness(assignments, {
        hardMinViews: featureFlags.HARD_VIEW_MIN,
      }),
    [assignments],
  )
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

  /** Open camera; in wizard mode remember which slot button was used (B-27). */
  const openCamera = useCallback((view?: CanonicalView) => {
    setCameraTargetSlot(view ?? null)
    setShowCamera(true)
  }, [])

  /**
   * B-27: camera capture assigns into the active wizard slot —
   * missing required first, then optional; free mode still appends to gallery.
   * Slot resolution runs against latest assignments (functional update).
   */
  const handleCameraCapture = useCallback(
    (file: File) => {
      if (useWizard) {
        setAssignments((prev) => {
          const slot = resolveCameraTargetSlot(prev, cameraTargetSlot)
          if (!slot) return prev
          const old = prev[slot]
          if (old) URL.revokeObjectURL(old.previewUrl)
          const previewUrl = URL.createObjectURL(file)
          return {
            ...prev,
            [slot]: { fileName: file.name, previewUrl, file },
          }
        })
      } else {
        addFiles([file])
      }
      setCameraTargetSlot(null)
      setShowCamera(false)
    },
    [useWizard, cameraTargetSlot, addFiles],
  )

  const closeCamera = useCallback(() => {
    setCameraTargetSlot(null)
    setShowCamera(false)
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
    // Defense-in-depth: never POST while offline (HARD B-11).
    if (preflightEnabled && !canSubmitPreflight(preflight)) {
      setError('API no disponible. Conecta el backend para identificar.')
      return
    }

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
    setLoadingStage('upload')
    setError(null)
    setResult(null)
    setFocusWizardSlot(null)

    try {
      // Current UI language (es|ca|eu|en); backend defaults to es if omitted.
      const locale = (i18n.language || 'es').slice(0, 2)
      // B-46: optional async path behind VITE_FEATURE_ASYNC_CLASSIFY (default off).
      // Async returns envelope.simple — same ClassificationResult → same banners.
      const data = await classifyImagesMaybeAsync(
        files,
        metadata,
        viewTypes,
        locale,
        featureFlags.ASYNC_CLASSIFY,
      )
      setResult(data)

      // B-38: stamp mode / gate_summary / locale on history entry
      const entry = buildHistoryEntry({
        result: data,
        previews,
        view_types: viewTypes,
      })
      setHistory(appendHistory(entry))
    } catch (err) {
      // B-29: network / timeout / view_types 400 / 4xx / 5xx taxonomy
      setError(classifyApiError(err))
    } finally {
      setLoading(false)
      setLoadingStage('upload')
    }
  }, [useWizard, collectWizardFiles, selectedImages, metadata, preflight, preflightEnabled])

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
    setFocusWizardSlot(null)
  }, [selectedImages, assignments])

  /**
   * B-36 deep-link: leave result view, keep current captures, open wizard on target slot.
   * Does not wipe assignments — user can fill the missing view and re-analyze.
   */
  const handleFocusWizardSlot = useCallback((view: CanonicalView) => {
    setResult(null)
    setError(null)
    setUseWizard(true)
    setFocusWizardSlot(view)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: addFiles,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] },
    maxFiles: 10,
    maxSize: 20 * 1024 * 1024,
  })

  const hasImages = useWizard ? readiness.filled > 0 : selectedImages.length > 0
  const showResult = result !== null && !loading
  const phase: IdentifyPhase = loading ? 'loading' : showResult ? 'result' : 'capture'
  const resultMode = result ? resolveDisplayMode(result) : null
  const preflightSettled = !preflight.loading || preflight.fetched_at > 0

  return (
    <div
      className="page-identify"
      data-testid="identify-page"
      data-phase={phase}
      data-preflight-mode={preflightEnabled ? preflight.mode : undefined}
      data-result-mode={resultMode ?? undefined}
    >
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

      {/*
        B-24 honesty flow shell — visual order:
        1) preflight  2) wizard/capture  3) result modes
      */}
      <div
        className="identify-honesty-flow"
        data-testid="identify-honesty-flow"
        data-phase={phase}
      >
        <nav
          className="identify-flow-steps"
          aria-label="Flujo de identificación honesta"
          data-testid="identify-flow-steps"
        >
          <ol className="identify-flow-steps__list">
            <li
              className={[
                'identify-flow-steps__item',
                phase === 'capture' && !preflightSettled ? 'is-active' : 'is-done',
              ].join(' ')}
              data-step="preflight"
              data-testid="identify-flow-step-preflight"
              aria-current={phase === 'capture' && !preflightSettled ? 'step' : undefined}
            >
              <span className="identify-flow-steps__index" aria-hidden="true">
                1
              </span>
              <span className="identify-flow-steps__label">Preflight</span>
            </li>
            <li
              className={[
                'identify-flow-steps__item',
                phase === 'capture' ? 'is-active' : phase === 'loading' || phase === 'result' ? 'is-done' : '',
              ].join(' ')}
              data-step="wizard"
              data-testid="identify-flow-step-wizard"
              aria-current={phase === 'capture' ? 'step' : undefined}
            >
              <span className="identify-flow-steps__index" aria-hidden="true">
                2
              </span>
              <span className="identify-flow-steps__label">Captura</span>
            </li>
            <li
              className={[
                'identify-flow-steps__item',
                phase === 'loading' ? 'is-active' : phase === 'result' ? 'is-active is-done' : '',
              ].join(' ')}
              data-step="result"
              data-testid="identify-flow-step-result"
              aria-current={phase === 'loading' || phase === 'result' ? 'step' : undefined}
            >
              <span className="identify-flow-steps__index" aria-hidden="true">
                3
              </span>
              <span className="identify-flow-steps__label">Resultado</span>
            </li>
          </ol>
        </nav>

        {/* ── 1. Preflight (honesty of system before/during capture) ── */}
        {preflightEnabled && phase !== 'result' && (
          <section
            className="identify-region identify-region--preflight"
            data-testid="identify-region-preflight"
            aria-label="Estado del modelo antes de identificar"
          >
            <PreflightBanner state={preflight} />
          </section>
        )}

        {showCamera && (
          <CameraCapture
            onCapture={handleCameraCapture}
            onClose={closeCamera}
            slotLabel={
              useWizard
                ? (() => {
                    const slot = resolveCameraTargetSlot(assignments, cameraTargetSlot)
                    if (!slot) return undefined
                    return VIEW_SLOTS.find((s) => s.view === slot)?.labelEs
                  })()
                : undefined
            }
          />
        )}

        {/* ── 2. Wizard / free capture ── */}
        {phase === 'capture' && (
          <section
            className="identify-region identify-region--wizard"
            data-testid="identify-region-wizard"
            aria-label="Captura multi-vista o libre"
          >
            <div className="page-header identify-wizard-header">
              <div className="identify-mode-toggle">
                <button
                  type="button"
                  className={
                    useWizard
                      ? 'btn-atelier btn-atelier--primary'
                      : 'btn-atelier btn-atelier--ghost'
                  }
                  onClick={() => setUseWizard(true)}
                >
                  Modo guiado
                </button>
                <button
                  type="button"
                  className={
                    !useWizard
                      ? 'btn-atelier btn-atelier--primary'
                      : 'btn-atelier btn-atelier--ghost'
                  }
                  onClick={() => setUseWizard(false)}
                >
                  Modo libre
                </button>
                <Link to="/historial" className="btn-atelier btn-atelier--ghost">
                  Historial ({historySummary.total})
                </Link>
              </div>
            </div>

      {loading && (
        <div className="loading" data-testid="identify-loading">
          <div className="spinner" />
          <p>
            {featureFlags.ASYNC_CLASSIFY
              ? 'Clasificando en segundo plano…'
              : 'Analizando con multi-vista…'}
          </p>
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
                {hasImages && (
                  <div className="image-review-section">
                    <MetadataForm metadata={metadata} onChange={setMetadata} />
                    <div
                      className="analyze-actions identify-sticky-cta"
                      data-testid="identify-sticky-cta"
                    >
                      <button
                        type="button"
                        className="btn-atelier btn-atelier--primary identify-submit-btn"
                        onClick={handleClassify}
                        disabled={loading || !readiness.canSubmit || !submitAllowed}
                        data-testid="identify-submit"
                        title={
                          !submitAllowed
                            ? 'API no disponible — identificación deshabilitada'
                            : undefined
                        }
                      >
                        {loading ? (
                          'Analizando…'
                        ) : !submitAllowed ? (
                          'API desconectada'
                        ) : (
                          <>
                            <IconSearch size={18} />
                            Analizar ({readiness.filled} vistas)
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        className="btn-atelier btn-atelier--ghost"
                        onClick={reset}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {!useWizard && !hasImages && (
              <UploadZone
                getRootProps={getRootProps}
                getInputProps={getInputProps}
                isDragActive={isDragActive}
                fileCount={selectedImages.length}
                onOpenCamera={() => openCamera()}
              />
            )}

            {!useWizard && hasImages && (
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
                        <IconClose size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <MetadataForm metadata={metadata} onChange={setMetadata} />
                <div
                  className="analyze-actions identify-sticky-cta"
                  data-testid="identify-sticky-cta"
                >
                  <button
                    type="button"
                    className="btn-atelier btn-atelier--primary identify-submit-btn"
                    onClick={handleClassify}
                    disabled={loading || !submitAllowed}
                    data-testid="identify-submit"
                    title={
                      !submitAllowed
                        ? 'API no disponible — identificación deshabilitada'
                        : undefined
                    }
                  >
                    {loading ? (
                      'Analizando…'
                    ) : !submitAllowed ? (
                      'API desconectada'
                    ) : (
                      <>
                        <IconSearch size={18} />
                        Analizar
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    className="btn-atelier btn-atelier--ghost"
                    {...getRootProps()}
                  >
                    + Añadir más fotos
                  </button>
                  <input {...getInputProps()} />
                  <button
                    type="button"
                    className="btn-atelier btn-atelier--ghost"
                    onClick={reset}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── Loading (B-28): honest stages + skeleton, no fake ML % ── */}
        {phase === 'loading' && (
          <section
            className="identify-region identify-region--loading"
            data-testid="identify-region-loading"
            data-loading-stage={loadingStage}
            aria-busy="true"
            aria-live="polite"
            aria-label={t('honesty.loading.aria_label')}
          >
            <div
              className="identify-loading"
              data-testid="identify-loading"
              data-stage={loadingStage}
            >
              <p className="identify-loading__title" data-testid="identify-loading-title">
                {t(`honesty.loading.${loadingStage}`)}
              </p>
              <p className="identify-loading__hint muted">
                {t('honesty.loading.hint')}
              </p>

              <ol
                className="identify-loading-stages"
                data-testid="identify-loading-stages"
                aria-label={t('honesty.loading.stages_label')}
              >
                {LOADING_STAGES.map((stage) => {
                  const idx = stageIndex(stage)
                  const current = stageIndex(loadingStage)
                  const status =
                    idx < current ? 'done' : idx === current ? 'active' : 'pending'
                  return (
                    <li
                      key={stage}
                      className={`identify-loading-stages__item is-${status}`}
                      data-stage={stage}
                      data-status={status}
                      data-testid={`identify-loading-stage-${stage}`}
                      aria-current={status === 'active' ? 'step' : undefined}
                    >
                      <span
                        className="identify-loading-stages__marker"
                        aria-hidden="true"
                      />
                      <span className="identify-loading-stages__label">
                        {t(`honesty.loading.${stage}`)}
                      </span>
                    </li>
                  )
                })}
              </ol>

              {/* No percent bar / no fake model confidence — skeleton only */}
              <IdentifyResultSkeleton />
            </div>
          </section>
        )}

        {error && (
          <div className="error-banner" data-testid="identify-error" role="alert">
            <strong>Error:</strong> {error}
            <button className="btn-retry" onClick={reset}>
              Reintentar
            </button>
          </div>
        )}

        {/* ── 3. Result modes (honesty chrome first via ResultCard banner) ── */}
        {phase === 'result' && result && (
          <section
            className={`identify-region identify-region--result identify-region--mode-${resultMode}`}
            data-testid="identify-region-result"
            data-mode={resultMode ?? undefined}
            aria-label="Resultado de identificación"
          >
            <div className="result-layout identify-result-layout" data-testid="identify-result">
              {/* ResultCard first so ResultModeBanner leads the honesty chrome */}
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
                <div
                  className="result-actions-bar identify-sticky-cta identify-sticky-cta--result"
                  data-testid="identify-result-cta"
                >
                  <button
                    type="button"
                    className="btn-atelier btn-atelier--primary identify-submit-btn"
                    onClick={reset}
                  >
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
            </div>
          </section>
        )}
      </div>

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Vista ampliada" />
          <button className="lightbox-close" onClick={() => setLightbox(null)} aria-label="Cerrar">
            <IconClose size={18} />
          </button>
        </div>
      )}

      {history.length > 0 && phase === 'capture' && (
        <div className="history-section" data-testid="identify-history">
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
