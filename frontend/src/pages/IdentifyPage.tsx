/**
 * Identify page: honesty flow layout (B-24) + preflight (B-11) + result modes (B-08)
 * + honest loading stages (B-28, no fake ML %).
 *
 * Visual order (capture): preflight → wizard → (history)
 * Visual order (loading): stages upload → analyze → apply policy + skeleton
 * Visual order (result):  result mode chrome → card / images
 * Preflight is always advisory; only offline disables submit.
 */
import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { useTranslation } from 'react-i18next'
import {
  classifyImages,
  submitFeedback,
  type ClassifyClientStage,
} from '../api/client'
import type { ClassificationResult, ObservationMetadata } from '../api/types'
import { ResultCard } from '../components/ResultCard'
import { Button, LinkButton, PageShell } from '../components/ui'
import { PreflightBanner } from '../components/PreflightBanner'
import { UploadZone } from '../components/UploadZone'
import { CameraCapture } from '../components/CameraCapture'
import { MetadataForm } from '../components/MetadataForm'
import { BatchCompare } from '../components/BatchCompare'
import { MultiViewWizard } from '../components/MultiViewWizard'
import { IdentifyResultSkeleton } from '../components/ui/Skeleton'
import { IconClose, IconExpert, IconHistory, IconSearch } from '../components/icons'
import { featureFlags } from '../lib/featureFlags'
import {
  assessMultiViewReadiness,
  buildViewTypesOrder,
  capturePacketDensity,
  formatViewTypesShort,
  freeModeCaptureCoachLine,
  freeModeViewTypesHeuristic,
  nextCameraSlot,
  orderedSlotKeys,
  preSubmitFreeModeCoach,
  preSubmitMultiViewCoach,
  VIEW_SLOTS,
  type CanonicalView,
  type PreSubmitCoach,
  type SlotAssignment,
} from '../lib/multiViewSlots'
import {
  appendHistory,
  buildHistoryEntry,
  persistHistoryPreviews,
  clearHistoryStore,
  loadHistory,
  summarizeHistory,
  type HistoryEntry,
} from '../lib/observationHistory'
import {
  requestBrowserNotebookPin,
  type NotebookPin,
} from '../lib/notebookGeo'
import { decisionLabel } from '../lib/decisionLabels'
import { resolveDisplayMode } from '../lib/classifyMode'
import {
  canSubmitPreflight,
  fetchPreflight,
  initialPreflightState,
  PREFLIGHT_POLL_MS,
  type PreflightState,
} from '../lib/preflight'
import {
  canIdentify,
  recordIdentifyUse,
  reserveIdentifyUse,
  rollbackIdentifyUse,
  sliceHistoryForPlan,
  usePlanActions,
  type IdentifyGateResult,
} from '../lib/entitlements'
import { orientationChips, orientationStickyLine } from '../lib/safetyCopy'
import { fieldHoldoutCoachLines } from '../lib/fieldHoldoutHonesty'
import {
  eceConfidenceStickyLine,
  E20_ECE_SNAPSHOT,
  fetchEceBandForIdentify,
  type EceBand,
} from '../lib/eceHonesty'

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

type TranslateFn = (key: string, opts?: Record<string, unknown>) => string

function SoftConfirmPanel({
  coach,
  locale,
  t,
  onAdd,
  onProceed,
}: {
  coach: PreSubmitCoach
  locale: string
  t: TranslateFn
  onAdd: () => void
  onProceed: () => void
}) {
  const en = locale.toLowerCase().startsWith('en')
  return (
    <div
      className={`identify-soft-confirm identify-soft-confirm--${coach.severity}`}
      data-testid="identify-soft-confirm"
      data-severity={coach.severity}
      data-code={coach.code}
      role="alertdialog"
      aria-labelledby="identify-soft-confirm-title"
      aria-describedby="identify-soft-confirm-body"
    >
      <p id="identify-soft-confirm-title" className="identify-soft-confirm__title">
        {t(`identify.softConfirm.title.${coach.code}`, {
          defaultValue: en ? coach.confirmTitleEn : coach.confirmTitleEs,
        })}
      </p>
      <p id="identify-soft-confirm-body" className="identify-soft-confirm__body">
        {t(`identify.softConfirm.body.${coach.code}`, {
          defaultValue: en ? coach.confirmBodyEn : coach.confirmBodyEs,
        })}
      </p>
      <div className="identify-soft-confirm__actions">
        <Button
          type="button"
          variant="primary"
          data-testid="identify-soft-confirm-add"
          onClick={onAdd}
        >
          {t(`identify.softConfirm.add.${coach.code}`, {
            defaultValue: en ? coach.addViewCtaEn : coach.addViewCtaEs,
          })}
        </Button>
        <Button
          type="button"
          variant="ghost"
          data-testid="identify-soft-confirm-proceed"
          onClick={onProceed}
        >
          {t(`identify.softConfirm.proceed.${coach.code}`, {
            defaultValue: en ? coach.proceedCtaEn : coach.proceedCtaEs,
          })}
        </Button>
      </div>
    </div>
  )
}

function IdentifyGpsPinToggle({
  checked,
  onChange,
  t,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  t: TranslateFn
}) {
  return (
    <label className="identify-gps-pin-toggle" data-testid="identify-gps-pin-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        data-testid="identify-gps-pin-checkbox"
      />
      <span className="identify-gps-pin-toggle__copy">
        <span className="identify-gps-pin-toggle__title">
          {t('identify.gpsPinLabel', {
            defaultValue: 'Guardar ubicación en el cuaderno',
          })}
        </span>
        <span className="identify-gps-pin-toggle__hint muted">
          {t('identify.gpsPinHint', {
            defaultValue: 'Solo lat/lng · sin EXIF · privado (no mapa público)',
          })}
        </span>
      </span>
    </label>
  )
}

export function IdentifyPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage || i18n.language || 'es'
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([])
  const [assignments, setAssignments] = useState<SlotAssignment>({})
  // v1.12: free mode (1 photo) is the default — industry consensus (Seek/Lens/Picture Mushroom).
  // Guided multi-view is an opt-in toggle for users who want max precision.
  const [useWizard, setUseWizard] = useState(false)
  const [result, setResult] = useState<ClassificationResult | null>(null)
  const [loading, setLoading] = useState(false)
  /** Honest client pipeline stage while loading (B-28). */
  const [loadingStage, setLoadingStage] = useState<ClassifyClientStage>('upload')
  const [error, setError] = useState<string | null>(null)
  const [showCamera, setShowCamera] = useState(false)
  const [metadata, setMetadata] = useState<ObservationMetadata>({})
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [lightbox, setLightbox] = useState<string | null>(null)
  const lightboxCloseRef = useRef<HTMLButtonElement | null>(null)
  const [showCompare, setShowCompare] = useState(false)
  const [showResultPhotos, setShowResultPhotos] = useState(false)
  /** Soft pre-submit coach (v1.7/v1.8): weak packet confirm — never hard-block default */
  const [softConfirmOpen, setSoftConfirmOpen] = useState(false)
  /** Opt-in local GPS pin stamped on history after classify (EXIF never stored) */
  const [attachGpsPin, setAttachGpsPin] = useState(false)
  /** When camera opens from wizard, fill this slot (or next empty via nextCameraSlot) */
  const [cameraTargetSlot, setCameraTargetSlot] = useState<CanonicalView | null>(null)
  const [preflight, setPreflight] = useState<PreflightState>(() =>
    initialPreflightState(),
  )
  /** Live ECE residual band for confidence chrome (fail-soft → E20 snapshot high). */
  const [eceBand, setEceBand] = useState<EceBand>(E20_ECE_SNAPSHOT.band)
  const [eceSource, setEceSource] = useState<'live' | 'snapshot'>('snapshot')

  const preflightEnabled = featureFlags.IDENTIFY_PREFLIGHT
  /** HARD: only offline/API-down disables submit — never quality-gate blocked. */
  const submitAllowed = !preflightEnabled || canSubmitPreflight(preflight)
  const { plan, unlock } = usePlanActions()
  const [identifyQuota, setIdentifyQuota] = useState<IdentifyGateResult>(() => canIdentify())
  const quotaBlocked = !identifyQuota.allowed
  const canClickSubmit = submitAllowed && !quotaBlocked
  /** Ignore stale classify responses when user re-submits (audit Q11). */
  const classifyGenRef = useRef(0)
  /** Sync lock: prevents double-submit races before loading state re-renders. */
  const submitLockRef = useRef(false)

  useEffect(() => {
    setHistory(sliceHistoryForPlan(loadHistory(), plan))
    setIdentifyQuota(canIdentify())
  }, [plan])

  useEffect(() => {
    if (!lightbox) return
    const prev = document.activeElement as HTMLElement | null
    lightboxCloseRef.current?.focus()
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.preventDefault()
        setLightbox(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [lightbox])

  useEffect(() => {
    if (!preflightEnabled) return
    let cancelled = false

    async function run() {
      // Skip background polls when tab is hidden (audit P10)
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return
      }
      try {
        const state = await fetchPreflight()
        if (!cancelled) setPreflight(state)
      } catch {
        if (!cancelled) {
          setPreflight({
            ...initialPreflightState(),
            mode: 'offline',
            ready: false,
            metrics_warning: false,
            submit_enabled: false,
            loading: false,
            fetched_at: Date.now(),
            error: 'preflight_throw',
          })
        }
      }
    }

    void run()
    const id = window.setInterval(() => {
      void run()
    }, PREFLIGHT_POLL_MS)
    const onVis = () => {
      if (document.visibilityState === 'visible') void run()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [preflightEnabled])

  const readiness = useMemo(() => assessMultiViewReadiness(assignments), [assignments])
  const wizardPreSubmit = useMemo(
    () => preSubmitMultiViewCoach(assignments),
    [assignments],
  )
  const freePreSubmit = useMemo(
    () => preSubmitFreeModeCoach(selectedImages.length),
    [selectedImages.length],
  )
  /** Active soft coach for current capture mode (wizard or free). */
  const preSubmitCoach: PreSubmitCoach = useWizard ? wizardPreSubmit : freePreSubmit
  /** P14 free-mode educational view labels + density strip. */
  const freeCaptureCoach = useMemo(
    () => freeModeCaptureCoachLine(selectedImages.length, locale),
    [selectedImages.length, locale],
  )
  const freeHeuristicViews = useMemo(
    () => freeModeViewTypesHeuristic(selectedImages.length),
    [selectedImages.length],
  )
  const wizardPacketDensity = useMemo(
    () => capturePacketDensity(buildViewTypesOrder(assignments), readiness.filled),
    [assignments, readiness.filled],
  )
  const historySummary = useMemo(() => summarizeHistory(history), [history])
  const fieldHoldoutCopy = useMemo(() => fieldHoldoutCoachLines(locale), [locale])
  const eceSticky = useMemo(
    () => eceConfidenceStickyLine(eceBand, locale),
    [locale, eceBand],
  )

  // Live ECE residual from /models/status (v1.9.7) — fail-soft to E20 snapshot
  useEffect(() => {
    const ac = new AbortController()
    void fetchEceBandForIdentify(ac.signal).then((r) => {
      setEceBand(r.band)
      setEceSource(r.source)
    })
    return () => ac.abort()
  }, [])

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
    // Defense-in-depth: never POST while offline (HARD B-11).
    if (preflightEnabled && !canSubmitPreflight(preflight)) {
      setError(
        t('identify.errorApiDown', {
          defaultValue: 'API no disponible. Conecta el backend para identificar.',
        }),
      )
      return
    }

    // Sync lock + atomic Free reserve (client best-effort; server must enforce in prod)
    if (submitLockRef.current || loading) return
    submitLockRef.current = true

    const reserved = reserveIdentifyUse()
    setIdentifyQuota(canIdentify())
    if (!reserved.allowed && !reserved.reserved) {
      submitLockRef.current = false
      setError(
        t('identify.errorQuota', {
          defaultValue:
            'Límite Free de {{limit}} identificaciones/día alcanzado. Activa Pro demo o vuelve mañana. Orientación de campo — no es permiso de consumo.',
          limit: reserved.limit,
        }),
      )
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
      if (files.length === 0) {
        if (reserved.reserved) rollbackIdentifyUse()
        submitLockRef.current = false
        setIdentifyQuota(canIdentify())
        return
      }
    } else {
      if (selectedImages.length === 0) {
        if (reserved.reserved) rollbackIdentifyUse()
        submitLockRef.current = false
        setIdentifyQuota(canIdentify())
        return
      }
      files = selectedImages.map((img) => img.file)
      previews = selectedImages.map((img) => img.preview)
      // Educational heuristic: map free uploads to gills→front→habitat→detail order
      viewTypes = freeModeViewTypesHeuristic(files.length)
    }

    const myGen = ++classifyGenRef.current
    setLoading(true)
    setShowResultPhotos(false)
    setLoadingStage('upload')
    setError(null)
    setResult(null)

    try {
      const data = await classifyImages(files, metadata, viewTypes, {
        onStage: (stage) => {
          if (classifyGenRef.current === myGen) setLoadingStage(stage)
        },
      })
      if (classifyGenRef.current !== myGen) return
      setLoadingStage('apply_policy')
      setResult(data)
      // Free already reserved; Pro tracks success for honesty UI
      if (!reserved.reserved) {
        recordIdentifyUse()
      }
      setIdentifyQuota(canIdentify())

      let pin: NotebookPin | null | undefined
      if (attachGpsPin) {
        pin = await requestBrowserNotebookPin()
      }
      // Persist durable data-URL thumbs (blob: dies after reload)
      const durablePreviews = await persistHistoryPreviews(previews)
      const entry = buildHistoryEntry({
        result: data,
        previews: durablePreviews,
        view_types: viewTypes,
        pin: pin ?? undefined,
      })
      setHistory(sliceHistoryForPlan(appendHistory(entry), plan))
    } catch (err) {
      if (reserved.reserved) rollbackIdentifyUse()
      setIdentifyQuota(canIdentify())
      if (classifyGenRef.current !== myGen) return
      setError(
        err instanceof Error
          ? err.message
          : t('identify.errorUnknown', { defaultValue: 'Error desconocido' }),
      )
    } finally {
      submitLockRef.current = false
      if (classifyGenRef.current === myGen) {
        setLoading(false)
        setLoadingStage('upload')
      }
    }
  }, [
    useWizard,
    collectWizardFiles,
    selectedImages,
    metadata,
    preflight,
    preflightEnabled,
    loading,
    plan,
    attachGpsPin,
  ])

  /**
   * Soft gate before classify (wizard + free mode v1.8).
   * Weak packet → confirm panel. Soft path only — user can still proceed.
   */
  const requestClassify = useCallback(() => {
    if (preSubmitCoach.needsSoftConfirm) {
      setSoftConfirmOpen(true)
      return
    }
    setSoftConfirmOpen(false)
    void handleClassify()
  }, [preSubmitCoach.needsSoftConfirm, handleClassify])

  const confirmClassifySoft = useCallback(() => {
    setSoftConfirmOpen(false)
    void handleClassify()
  }, [handleClassify])

  /** Retry: re-run classify with existing photos (audit fix — was calling reset()
   * which destroyed the user's uploaded photos on every network blip). */
  const retryClassify = useCallback(() => {
    setError(null)
    void handleClassify()
  }, [handleClassify])

  /** Soft-confirm primary: leave panel and open next critical empty slot (camera). */
  const dismissSoftConfirm = useCallback(() => {
    setSoftConfirmOpen(false)
    if (useWizard) {
      const next = nextCameraSlot(assignments)
      if (next) {
        setCameraTargetSlot(next)
        setShowCamera(true)
        return
      }
    }
    // Free mode: open camera to add another photo
    setCameraTargetSlot(null)
    setShowCamera(true)
  }, [useWizard, assignments])

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
    setShowResultPhotos(false)
  }, [selectedImages, assignments])

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
    <PageShell
      className="page-identify page-identify--v184 page-identify--cn"
      testId="identify-page"
      orientationSticky
      orientationText={t('identify.orientationSticky', {
        defaultValue: 'Solo orientación · nunca consumo',
      })}
      data-phase={phase}
      data-preflight-mode={preflightEnabled ? preflight.mode : undefined}
      data-result-mode={resultMode ?? undefined}
      data-capture-mode={useWizard ? 'wizard' : 'free'}
    >
      <header className="mkt-page-head mkt-mesh identify-cn-head identify-cn-head--clean">
        <p className="mkt-kicker">
          {t('identify.kicker', { defaultValue: 'Campo · multi-vista' })}
        </p>
        <h1>
          {t('identify.titleCn', {
            defaultValue: 'Identificar',
          })}
        </h1>
        <p className="identify-cn-head__lead">
          {t('identify.bannerLeadShort', {
            defaultValue:
              'Varias fotos (láminas + perfil). Si duda, se calla. Solo orientación — nunca consumo.',
          })}
        </p>
        <ul
          className="mkt-page-head__chips identify-cn-head__chips"
          aria-label={t('identify.principlesAria', {
            defaultValue: 'Principios de identificación',
          })}
        >
          {orientationChips(locale).slice(0, 3).map((chip) => (
            <li key={chip}>{chip}</li>
          ))}
        </ul>
        <p className="identify-pro-check" data-testid="identify-pro-check" role="note">
          {t('identify.proCheckShort', {
            defaultValue:
              'Ninguna app autoriza comer setas. Confirma con un micólogo si hay duda.',
          })}
        </p>
      </header>

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
          aria-label={t('identify.flowAria', {
            defaultValue: 'Flujo de identificación honesta',
          })}
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
              <span className="identify-flow-steps__label">
                {t('identify.flow.preflight', { defaultValue: 'Estado' })}
              </span>
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
              <span className="identify-flow-steps__label">
                {t('identify.flow.capture', { defaultValue: 'Fotos' })}
              </span>
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
              <span className="identify-flow-steps__label">
                {t('identify.flow.result', { defaultValue: 'Pista' })}
              </span>
            </li>
          </ol>
        </nav>

        {/* ── 1. Preflight (honesty of system before/during capture) ── */}
        {preflightEnabled && phase !== 'result' && (
          <section
            className="identify-region identify-region--preflight"
            data-testid="identify-region-preflight"
            aria-label={t('identify.preflightAria', {
              defaultValue: 'Estado del modelo antes de identificar',
            })}
          >
            <PreflightBanner state={preflight} />
          </section>
        )}

        {showCamera && (
          <CameraCapture
            slotLabel={
              cameraTargetSlot
                ? VIEW_SLOTS.find((s) => s.view === cameraTargetSlot)?.labelEs
                : undefined
            }
            onCapture={(file) => {
              const target = cameraTargetSlot ?? (useWizard ? nextCameraSlot(assignments) : null)
              if (useWizard && target) {
                const previewUrl = URL.createObjectURL(file)
                onAssignSlot(target, file, previewUrl)
              } else {
                addFiles([file])
              }
              setCameraTargetSlot(null)
              setShowCamera(false)
            }}
            onClose={() => {
              setCameraTargetSlot(null)
              setShowCamera(false)
            }}
          />
        )}

        {/* ── 2. Wizard / free capture ── */}
        {phase === 'capture' && (
          <section
            className="identify-region identify-region--wizard"
            data-testid="identify-region-wizard"
            aria-label={t('identify.captureAria', {
              defaultValue: 'Captura multi-vista o libre',
            })}
          >
            <div className="page-header identify-wizard-header identify-wizard-header--clean">
              <div
                className="identify-mode-toggle capture-mode-toggle"
                role="group"
                aria-label={t('identify.modeToggleAria', {
                  defaultValue: 'Modo de captura',
                })}
              >
                <Button
                  type="button"
                  variant={useWizard ? 'primary' : 'ghost'}
                  aria-pressed={useWizard}
                  onClick={() => setUseWizard(true)}
                  data-testid="identify-mode-guided"
                >
                  {t('identify.modeGuided', { defaultValue: 'Guiado' })}
                </Button>
                <Button
                  type="button"
                  variant={!useWizard ? 'primary' : 'ghost'}
                  aria-pressed={!useWizard}
                  onClick={() => setUseWizard(false)}
                  data-testid="identify-mode-free"
                >
                  {t('identify.modeFree', { defaultValue: 'Libre' })}
                </Button>
                <Link
                  to="/historial"
                  className="identify-mode-toggle__utility"
                  data-testid="identify-open-history"
                >
                  {t('nav.history', {
                    defaultValue: 'Cuaderno',
                  })}
                  {historySummary.total > 0 ? ` (${historySummary.total})` : ''}
                </Link>
              </div>
              {identifyQuota.plan === 'free' && identifyQuota.limit != null && (
                <p className="identify-quota-chip muted" data-testid="identify-quota" role="status">
                  {t('identify.quotaStatus', {
                    defaultValue: 'Free: {{used}}/{{limit}} identificaciones hoy',
                    used: identifyQuota.used,
                    limit: identifyQuota.limit,
                  })}
                  {quotaBlocked
                    ? t('identify.quotaExhaustedSuffix', {
                        defaultValue: ' · cupo agotado',
                      })
                    : ''}
                  {quotaBlocked && (
                    <>
                      {' · '}
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          unlock()
                          setIdentifyQuota(canIdentify())
                          setError(null)
                        }}
                        data-testid="identify-unlock-pro"
                      >
                        {t('identify.unlockProDemo', {
                          defaultValue: 'Pro (prueba en este dispositivo)',
                        })}
                      </Button>
                    </>
                  )}
                </p>
              )}
            </div>

            {useWizard && (
              <>
                <MultiViewWizard
                  assignments={assignments}
                  onAssign={onAssignSlot}
                  onClear={onClearSlot}
                  onOpenCamera={(view) => {
                    setCameraTargetSlot(view)
                    setShowCamera(true)
                  }}
                />
                {hasImages && (
                  <div className="image-review-section image-review-section--wizard-clean">
                    <div
                      className={`identify-capture-density identify-capture-density--compact identify-capture-density--${wizardPacketDensity.density}`}
                      data-testid="identify-capture-density"
                      data-mode="wizard"
                      data-density={wizardPacketDensity.density}
                      role="status"
                    >
                      <span className="identify-capture-density__chip">
                        {t('identify.captureDensity.chip', {
                          defaultValue: '{{n}} vistas · {{views}}',
                          n: readiness.filled,
                          views:
                            formatViewTypesShort(wizardPacketDensity.views, locale) ||
                            t('identify.captureDensity.viewsPending', {
                              defaultValue: 'slots',
                            }),
                        })}
                      </span>
                      <span className="identify-capture-density__critical">
                        {t('identify.captureDensity.critical', {
                          defaultValue: 'clave {{done}}/{{total}}',
                          done: wizardPacketDensity.criticalDone,
                          total: wizardPacketDensity.criticalTotal,
                        })}
                      </span>
                      <p className="identify-capture-density__policy visually-hidden">
                        {t('identify.captureDensity.policy', {
                          defaultValue:
                            'Densidad de captura · solo orientación · nunca permiso de consumo',
                        })}
                      </p>
                      <p
                        className="identify-field-holdout-note visually-hidden"
                        data-testid="identify-field-holdout-note"
                        role="note"
                      >
                        <strong>{fieldHoldoutCopy.title}.</strong> {fieldHoldoutCopy.deadlyNote}{' '}
                        {fieldHoldoutCopy.policy}
                      </p>
                      <p
                        className="identify-ece-note visually-hidden"
                        data-testid="identify-ece-note"
                        data-band={eceBand}
                        data-ece-source={eceSource}
                        role="note"
                      >
                        {eceSticky}
                      </p>
                    </div>

                    {readiness.filled === 1 && (
                      <p
                        className="identify-multiview-nudge identify-multiview-nudge--compact"
                        data-testid="identify-multiview-nudge"
                        role="status"
                      >
                        {t('identify.multiviewNudge.singleShort', {
                          defaultValue:
                            'Con 1 foto se abstiene más. Añade láminas + perfil si puedes.',
                        })}
                      </p>
                    )}
                    {readiness.filled >= 2 && readiness.filled < 4 && (
                      <p
                        className="identify-multiview-nudge identify-multiview-nudge--ok identify-multiview-nudge--compact"
                        data-testid="identify-multiview-nudge"
                        role="status"
                      >
                        {t('identify.multiviewNudge.pairShort', {
                          defaultValue: 'Buen paquete. Hábitat y detalle ayudan a bajar confusiones.',
                        })}
                      </p>
                    )}

                    <details className="identify-advanced-details">
                      <summary>
                        {t('identify.advancedOptions', {
                          defaultValue: 'Opciones (GPS, notas)',
                        })}
                      </summary>
                      <MetadataForm metadata={metadata} onChange={setMetadata} />
                      <IdentifyGpsPinToggle
                        checked={attachGpsPin}
                        onChange={setAttachGpsPin}
                        t={t}
                      />
                    </details>

                    {softConfirmOpen && preSubmitCoach.needsSoftConfirm && (
                      <SoftConfirmPanel
                        coach={preSubmitCoach}
                        locale={locale}
                        t={t}
                        onAdd={dismissSoftConfirm}
                        onProceed={confirmClassifySoft}
                      />
                    )}

                    <div className="analyze-actions analyze-actions--wizard sticky-analyze">
                      <Button
                        type="button"
                        variant="primary"
                        block
                        onClick={requestClassify}
                        disabled={loading || !readiness.canSubmit || !canClickSubmit}
                        data-testid="identify-submit"
                        data-soft-coach={preSubmitCoach.needsSoftConfirm ? '1' : '0'}
                        data-mode="wizard"
                        className="identify-submit-btn"
                        title={
                          !submitAllowed
                            ? t('identify.apiDisabledTitle', {
                                defaultValue:
                                  'API no disponible — identificación deshabilitada',
                              })
                            : quotaBlocked
                              ? t('identify.quotaBlockedTitle', {
                                  defaultValue: 'Cupo Free diario agotado',
                                })
                              : undefined
                        }
                      >
                        {loading ? (
                          t('identify.analyzing', { defaultValue: 'Analizando…' })
                        ) : !submitAllowed ? (
                          t('identify.apiOffline', { defaultValue: 'API desconectada' })
                        ) : quotaBlocked ? (
                          t('identify.quotaExhausted', { defaultValue: 'Cupo Free agotado' })
                        ) : (
                          <>
                            <IconSearch size={18} />
                            {t('identify.analyzeViews', {
                              defaultValue: 'Identificar ({{n}})',
                              n: readiness.filled,
                            })}
                          </>
                        )}
                      </Button>
                      <Button type="button" variant="ghost" onClick={reset}>
                        {t('identify.cancel', { defaultValue: 'Empezar de nuevo' })}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}

            {!useWizard && !hasImages && (
              <div className="identify-free-empty" data-testid="identify-free-empty">
                <p className="identify-free-empty__tip" role="note">
                  {t('identify.freeEmptyTip', {
                    defaultValue:
                      'Libre: sube 1–4 fotos (láminas + perfil ayudan). Solo orientación · nunca consumo.',
                  })}
                </p>
                <UploadZone
                  getRootProps={getRootProps}
                  getInputProps={getInputProps}
                  isDragActive={isDragActive}
                  fileCount={selectedImages.length}
                  onOpenCamera={() => setShowCamera(true)}
                />
              </div>
            )}

            {!useWizard && hasImages && (
              <div
                className="image-review-section identify-free-capture image-review-section--wizard-clean"
                data-testid="identify-free-capture"
              >
                <h2 className="identify-free-capture__title">
                  {t('identify.freeSelectedTitle', {
                    defaultValue: 'Fotos ({{n}})',
                    n: selectedImages.length,
                  })}
                </h2>
                <div
                  className={`identify-capture-density identify-capture-density--compact identify-capture-density--${freeCaptureCoach.density.density}`}
                  data-testid="identify-capture-density"
                  data-mode="free"
                  data-density={freeCaptureCoach.density.density}
                  role="status"
                >
                  <span className="identify-capture-density__chip">
                    {t('identify.captureDensity.chip', {
                      defaultValue: '{{n}} fotos',
                      n: selectedImages.length,
                      views:
                        formatViewTypesShort(freeHeuristicViews, locale) ||
                        t('identify.captureDensity.viewsPending', {
                          defaultValue: 'slots',
                        }),
                    })}
                  </span>
                  <span className="identify-capture-density__critical visually-hidden">
                    {t('identify.captureDensity.critical', {
                      defaultValue: 'vistas clave {{done}}/{{total}}',
                      done: freeCaptureCoach.density.criticalDone,
                      total: freeCaptureCoach.density.criticalTotal,
                    })}
                  </span>
                  <p
                    className="identify-capture-density__line identify-free-coach-line"
                    data-testid="identify-free-capture-coach"
                  >
                    {locale.toLowerCase().startsWith('en')
                      ? freeCaptureCoach.lineEn
                      : freeCaptureCoach.lineEs}
                  </p>
                  <p className="identify-capture-density__policy visually-hidden">
                    {t('identify.captureDensity.policy', {
                      defaultValue:
                        'Densidad de captura · solo orientación · nunca permiso de consumo',
                    })}
                  </p>
                </div>
                <div className="image-grid image-grid--free-clean">
                  {selectedImages.map((img, idx) => {
                    const viewLabel = freeHeuristicViews[idx]
                    return (
                      <div
                        key={idx}
                        className="image-grid-item"
                        data-view={viewLabel || undefined}
                        role="button"
                        tabIndex={0}
                        onClick={() => setLightbox(img.preview)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setLightbox(img.preview)
                          }
                        }}
                      >
                        <img
                          src={img.preview}
                          alt={t('identify.freePhotoAlt', {
                            defaultValue: 'Seta {{n}}',
                            n: idx + 1,
                          })}
                          loading="lazy"
                          decoding="async"
                          onError={(e) => {
                            e.currentTarget.style.opacity = '0.3'
                          }}
                        />
                        {viewLabel ? (
                          <span
                            className="identify-free-view-badge"
                            data-testid="identify-free-view-badge"
                          >
                            {t(`identify.views.${viewLabel}`, {
                              defaultValue: viewLabel,
                            })}
                          </span>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="btn-remove-image"
                          onClick={(e) => {
                            e.stopPropagation()
                            removeImage(idx)
                          }}
                          aria-label={t('identify.removePhoto', {
                            defaultValue: 'Eliminar imagen',
                          })}
                        >
                          <IconClose size={14} />
                        </Button>
                      </div>
                    )
                  })}
                </div>
                {selectedImages.length === 1 && (
                  <p
                    className="identify-multiview-nudge identify-multiview-nudge--compact"
                    data-testid="identify-multiview-nudge"
                    role="status"
                  >
                    {t('identify.multiviewNudge.singleShort', {
                      defaultValue:
                        'Con 1 foto se abstiene más. Añade láminas + perfil si puedes.',
                    })}
                  </p>
                )}
                {selectedImages.length >= 2 && selectedImages.length < 4 && (
                  <p
                    className="identify-multiview-nudge identify-multiview-nudge--ok identify-multiview-nudge--compact"
                    data-testid="identify-multiview-nudge"
                    role="status"
                  >
                    {t('identify.multiviewNudge.pairShort', {
                      defaultValue: 'Buen paquete. Más fotos bajan confusiones.',
                    })}
                  </p>
                )}
                <details className="identify-advanced-details">
                  <summary>
                    {t('identify.advancedOptions', {
                      defaultValue: 'Opciones (GPS, notas)',
                    })}
                  </summary>
                  <MetadataForm metadata={metadata} onChange={setMetadata} />
                  <IdentifyGpsPinToggle
                    checked={attachGpsPin}
                    onChange={setAttachGpsPin}
                    t={t}
                  />
                </details>
                {softConfirmOpen && preSubmitCoach.needsSoftConfirm && (
                  <SoftConfirmPanel
                    coach={preSubmitCoach}
                    locale={locale}
                    t={t}
                    onAdd={dismissSoftConfirm}
                    onProceed={confirmClassifySoft}
                  />
                )}
                <div className="analyze-actions analyze-actions--wizard sticky-analyze">
                  <Button
                    type="button"
                    variant="primary"
                    block
                    onClick={requestClassify}
                    disabled={loading || !canClickSubmit}
                    data-testid="identify-submit"
                    data-soft-coach={preSubmitCoach.needsSoftConfirm ? '1' : '0'}
                    data-mode="free"
                    className="identify-submit-btn"
                    title={
                      !submitAllowed
                        ? t('identify.apiDisabledTitle', {
                            defaultValue:
                              'API no disponible — identificación deshabilitada',
                          })
                        : quotaBlocked
                          ? t('identify.quotaBlockedTitle', {
                              defaultValue: 'Cupo Free diario agotado',
                            })
                          : undefined
                    }
                  >
                    {loading ? (
                      t('identify.analyzing', { defaultValue: 'Analizando…' })
                    ) : !submitAllowed ? (
                      t('identify.apiOffline', { defaultValue: 'API desconectada' })
                    ) : quotaBlocked ? (
                      t('identify.quotaExhausted', { defaultValue: 'Cupo Free agotado' })
                    ) : (
                      <>
                        <IconSearch size={18} />
                        {t('identify.analyzeViews', {
                          defaultValue: 'Identificar ({{n}})',
                          n: selectedImages.length,
                        })}
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setCameraTargetSlot(null)
                      setShowCamera(true)
                    }}
                    data-testid="identify-free-camera"
                  >
                    {t('identify.camera', { defaultValue: 'Cámara' })}
                  </Button>
                  <Button type="button" variant="ghost" {...getRootProps()}>
                    {t('identify.addMorePhotos', { defaultValue: '+ Añadir más fotos' })}
                  </Button>
                  <input {...getInputProps()} />
                  <Button type="button" variant="ghost" onClick={reset}>
                    {t('identify.cancel', { defaultValue: 'Empezar de nuevo' })}
                  </Button>
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
              <p className="identify-loading__orient muted" role="note" data-testid="identify-loading-orient">
                {t('identify.loadingOrient', {
                  defaultValue: 'Solo orientación · puede abstenerse · nunca consumo',
                })}
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
            <strong>{t('error.defaultTitle', { defaultValue: 'Error' })}:</strong> {error}
            <Button type="button" variant="secondary" className="btn-retry" onClick={retryClassify}>
              {t('actions.retry', { defaultValue: 'Reintentar' })}
            </Button>
          </div>
        )}

        {/* ── 3. Result modes (honesty chrome first via ResultCard banner) ── */}
        {phase === 'result' && result && (
          <section
            className={`identify-region identify-region--result identify-region--mode-${resultMode}`}
            data-testid="identify-region-result"
            data-mode={resultMode ?? undefined}
            aria-label={t('identify.resultAria', {
              defaultValue: 'Resultado de identificación',
            })}
          >
            <div className="result-layout identify-result-layout" data-testid="identify-result">
              {/* ResultCard first so ResultModeBanner leads the honesty chrome */}
              <ResultCard
                key={result.request_id}
                result={result}
                onFeedback={handleFeedback}
                eceBand={eceBand}
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
                onFocusWizardSlot={(view) => {
                  setUseWizard(true)
                  setResult(null)
                  setError(null)
                  setSoftConfirmOpen(false)
                  setCameraTargetSlot(view)
                  setShowCamera(true)
                }}
              />
              <div className="result-image-section result-image-section--deferred">
                <Button
                  type="button"
                  variant="ghost"
                  className="result-photos-toggle"
                  data-testid="result-photos-toggle"
                  aria-expanded={showResultPhotos}
                  onClick={() => setShowResultPhotos((v) => !v)}
                >
                  {showResultPhotos
                    ? t('identify.hidePhotos', { defaultValue: 'Ocultar fotos enviadas' })
                    : t('identify.showPhotos', { defaultValue: 'Ver fotos enviadas' })}
                </Button>
                {showResultPhotos && (
                  <div className="result-image-grid">
                    {(useWizard
                      ? orderedSlotKeys(assignments).map((k) => assignments[k]!.previewUrl)
                      : selectedImages.map((i) => i.preview)
                    ).map((src, idx) => (
                      <img
                        key={idx}
                        src={src}
                        alt={t('identify.resultPhotoAlt', { defaultValue: 'Resultado {{n}}', n: idx + 1 })}
                        className="preview-image"
                        loading="lazy"
                        decoding="async"
                        role="button"
                        tabIndex={0}
                        onClick={() => setLightbox(src)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setLightbox(src)
                          }
                        }}
                        onError={(e) => {
                          e.currentTarget.style.visibility = 'hidden'
                        }}
                      />
                    ))}
                  </div>
                )}
                {/* Secondary links only — primary lives in sticky bar to avoid dual primaries */}
                <div className="result-actions-bar result-actions-bar--secondary">
                  <LinkButton to="/historial" variant="ghost" data-testid="identify-result-notebook">
                    <IconHistory size={16} />
                    {t('nav.notebook', { defaultValue: 'Cuaderno' })}
                  </LinkButton>
                  <LinkButton to="/lookalikes" variant="ghost" data-testid="identify-result-lookalikes">
                    {t('nav.lookalikes', { defaultValue: 'Confusiones' })}
                  </LinkButton>
                  <LinkButton to="/educacion" variant="ghost" data-testid="identify-result-edu">
                    {t('nav.education', { defaultValue: 'Educación' })}
                  </LinkButton>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Sticky orientation strip on result (mobile-first; CSS: identify-sticky-cta) */}
      {phase === 'result' && result && (
        <div
          className="identify-sticky-cta identify-sticky-cta--result"
          data-testid="identify-orientation-sticky"
          role="status"
        >
          <p className="identify-sticky-cta__copy">{orientationStickyLine(locale)}</p>
          <div className="identify-sticky-cta__actions">
            <Button
              type="button"
              variant="primary"
              className="identify-submit-btn"
              onClick={reset}
              data-testid="identify-sticky-new"
            >
              {t('identify.newAnalysis', { defaultValue: 'Nuevo análisis' })}
            </Button>
            <LinkButton
              to="/revision-experta"
              variant="ghost"
              data-testid="identify-sticky-expert"
            >
              <IconExpert size={16} />
              {t('nav.experts', { defaultValue: 'Revisión experta' })}
            </LinkButton>
          </div>
        </div>
      )}

      {lightbox && (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={t('identify.lightboxAlt', { defaultValue: 'Vista ampliada' })}
          data-testid="identify-lightbox"
          onClick={() => setLightbox(null)}
          onKeyDown={(ev) => {
            if (ev.key === 'Escape') setLightbox(null)
          }}
        >
          <img
            src={lightbox}
            alt={t('identify.lightboxAlt', { defaultValue: 'Vista ampliada' })}
            decoding="async"
            onClick={(ev) => ev.stopPropagation()}
            onError={(e) => {
              e.currentTarget.style.opacity = '0.3'
            }}
          />
          <Button
            ref={lightboxCloseRef}
            type="button"
            variant="ghost"
            size="sm"
            className="lightbox-close"
            data-testid="identify-lightbox-close"
            onClick={(ev) => {
              ev.stopPropagation()
              setLightbox(null)
            }}
            aria-label={t('actions.back', { defaultValue: 'Cerrar' })}
          >
            <IconClose size={18} />
          </Button>
        </div>
      )}

      {history.length > 0 && phase === 'capture' && (
        <div className="history-section" data-testid="identify-history">
          <div className="history-header">
            <h2>
              {t('identify.recentHistory', {
                defaultValue: 'Historial reciente ({{n}})',
                n: historySummary.total,
              })}
            </h2>
            <div className="history-actions">
              <Link to="/historial">
                {t('identify.viewAllHistory', { defaultValue: 'Ver todo' })}
              </Link>
              <Button
                type="button"
                variant="ghost"
                className="btn-compare"
                onClick={() => setShowCompare(true)}
                disabled={history.length < 2}
              >
                {t('identify.compare', { defaultValue: 'Comparar' })}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="btn-clear-history"
                onClick={clearHistory}
              >
                {t('actions.clear', { defaultValue: 'Limpiar' })}
              </Button>
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
                  <img
                    src={entry.previews[0]}
                    alt={t('identify.historyThumbAlt', { defaultValue: 'Vista previa del historial' })}
                    className="history-thumb"
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      e.currentTarget.style.visibility = 'hidden'
                    }}
                  />
                )}
                <div className="history-meta">
                  <span className="history-time">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="history-decision">
                    {decisionLabel(entry.result.decision, locale)}
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
    </PageShell>
  )
}
