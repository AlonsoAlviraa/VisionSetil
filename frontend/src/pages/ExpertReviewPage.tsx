/**
 * Expert review product UI — package evidence for a human mycologist.
 * Not an API console. Orientation only; never consumption permission.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, LinkButton, PageShell } from '../components/ui'
import axios from 'axios'
import { entriesNeedingReview, loadHistory } from '../lib/observationHistory'
import { decisionLabel } from '../lib/decisionLabels'
import {
  buildHandoffFromHistory,
  copyHandoffSummary,
  downloadHandoffJson,
  expertReviewPath,
  formatHandoffSummary,
  handoffGateVerdictLabelEs,
  handoffModeLabelEs,
  loadHandoffDraft,
  loadHandoffQueue,
  saveHandoffDraft,
  type ExpertHandoffDraft,
} from '../lib/expertHandoff'
import { isQualityGatePayload } from '../lib/classifyMode'
import { SpeciesNameBlock } from '../components/SpeciesNameBlock'
import { EmptyState } from '../components/EmptyState'
import { RiskChip } from '../components/RiskChip'

const API_BASE = import.meta.env.VITE_API_URL || '/api'
const API_KEY = import.meta.env.VITE_API_KEY || ''

type MlHealth = {
  ready: boolean | null
  health: string
  models: string
  details: string
}

type ReviewRow = {
  id?: number | string
  observation_id?: number
  status?: string
  priority?: string
  notes?: string
  [key: string]: unknown
}

function statusLabelEs(status?: string): string {
  const s = (status || '').toLowerCase()
  if (s === 'pending' || s === 'open') return 'Pendiente'
  if (s === 'assigned' || s === 'in_review') return 'En revisión'
  if (s === 'resolved' || s === 'closed' || s === 'done') return 'Resuelto'
  if (!s) return 'Sin estado'
  return status || 'Sin estado'
}

function priorityLabelEs(priority?: string): string {
  const p = (priority || '').toLowerCase()
  if (p === 'high' || p === 'urgent') return 'Alta'
  if (p === 'medium' || p === 'normal') return 'Media'
  if (p === 'low') return 'Baja'
  return priority || '—'
}

export function ExpertReviewPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage || i18n.language || 'es'
  const [params] = useSearchParams()
  const handoffId = params.get('handoff')
  const [remote, setRemote] = useState<ReviewRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [mlOpen, setMlOpen] = useState(false)
  const [copyStatus, setCopyStatus] = useState<string | null>(null)
  const [ml, setMl] = useState<MlHealth>({
    ready: null,
    health: '…',
    models: '…',
    details: '',
  })

  // Re-read local storage each render path after actions
  const [localTick, setLocalTick] = useState(0)
  const localQueue = useMemo(() => {
    void localTick
    return entriesNeedingReview(loadHistory())
  }, [localTick])
  const drafts = useMemo(() => {
    void localTick
    return loadHandoffQueue()
  }, [localTick])
  const activeDraft: ExpertHandoffDraft | null = useMemo(() => {
    void localTick
    if (handoffId) {
      return drafts.find((d) => d.id === handoffId) || loadHandoffDraft()
    }
    return loadHandoffDraft()
  }, [handoffId, drafts, localTick])

  const loadRemote = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await axios.get(`${API_BASE}/human-reviews`, {
        headers: API_KEY ? { 'X-API-Key': API_KEY } : {},
        timeout: 15000,
      })
      const data = res.data
      setRemote(Array.isArray(data) ? data : data?.results || [])
    } catch {
      setRemote([])
      setError('No pudimos conectar con la cola del servidor. Puedes seguir con handoffs locales.')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMlHealth = useCallback(async () => {
    try {
      const [h, r] = await Promise.all([
        axios.get(`${API_BASE}/health`, { timeout: 8000 }),
        axios.get(`${API_BASE}/readyz`, { timeout: 8000, validateStatus: () => true }),
      ])
      const checks = (r.data?.checks || {}) as Record<string, string>
      setMl({
        ready: Boolean(r.data?.ready),
        health: h.data?.status || 'ok',
        models: String(checks.models || 'unknown'),
        details: String(checks.model_details || ''),
      })
    } catch {
      setMl({
        ready: false,
        health: 'offline',
        models: 'unreachable',
        details: 'No se pudo consultar /health o /readyz',
      })
    }
  }, [])

  useEffect(() => {
    void loadRemote()
    void loadMlHealth()
  }, [loadRemote, loadMlHealth])

  const onCopy = async (draft: ExpertHandoffDraft) => {
    const res = await copyHandoffSummary(draft)
    setCopyStatus(res.ok ? 'Resumen copiado al portapapeles' : res.error || 'No se pudo copiar')
    window.setTimeout(() => setCopyStatus(null), 2800)
  }

  const packageLocal = (entryId: string) => {
    const entry = loadHistory().find((e) => e.id === entryId)
    if (!entry) return
    const draft = buildHandoffFromHistory(entry, entry.notes || '')
    saveHandoffDraft(draft)
    setLocalTick((n) => n + 1)
    window.history.replaceState(null, '', expertReviewPath(draft.id))
  }

  return (
    <PageShell
      className="page-expert-review page-atelier-shell"
      testId="expert-review-page"
      orientationSticky
      orientationText={t('expert.orientation', {
        defaultValue: 'Solo orientación · handoff humano · nunca consumo',
      })}
    >
      <header className="mkt-page-head mkt-mesh">
        <p className="mkt-kicker">
          {t('expert.kicker', { defaultValue: 'Revisión experta' })}
        </p>
        <h1>
          {t('expert.title', {
            defaultValue: 'Empaqueta evidencia para un micólogo',
          })}
        </h1>
        <p>
          {t('expert.subtitle', {
            defaultValue:
              'Handoff local y cola remota. Solo orientación — nunca permiso de consumo.',
          })}
        </p>
      </header>

      <div className="feature-card-neo safety-disclaimer" role="note">
        {t('expert.safetyBanner', {
          defaultValue:
            'Un micólogo de carne y hueso debe validar en el campo. La app no sustituye criterio humano.',
        })}
      </div>

      {/* 1) Active handoff */}
      {activeDraft ? (
        <article className="atelier-panel expert-card expert-card--featured">
          <p className="atelier-kicker" style={{ color: 'var(--ink-mute)' }}>
            {t('expert.draftReady', { defaultValue: 'Borrador listo' })}
          </p>
          <h2>{t('expert.packagedTitle', { defaultValue: 'Evidencia empaquetada' })}</h2>
          {activeDraft.top_species ? (
            <SpeciesNameBlock taxon={activeDraft.top_species} size="md" showFamily={false} />
          ) : (
            <p>{t('expert.noTopSpecies', { defaultValue: 'Sin especie top' })}</p>
          )}
          <ul className="expert-meta-list">
            <li>
              <span>{t('expert.decision', { defaultValue: 'Decisión' })}</span>
              <strong>{decisionLabel(activeDraft.decision, locale)}</strong>
            </li>
            {activeDraft.mode != null && (
              <li>
                <span>{t('expert.mode', { defaultValue: 'Modo' })}</span>
                <strong data-testid="handoff-mode">
                  {locale.startsWith('en')
                    ? activeDraft.mode
                    : handoffModeLabelEs(activeDraft.mode)}
                </strong>
              </li>
            )}
            <li>
              <span>{t('expert.views', { defaultValue: 'Vistas' })}</span>
              <strong>
                {activeDraft.view_types?.length
                  ? activeDraft.view_types.join(', ')
                  : t('expert.noLabels', { defaultValue: 'Sin etiquetas' })}
              </strong>
            </li>
            <li>
              <span>{t('expert.photos', { defaultValue: 'Fotos' })}</span>
              <strong>{activeDraft.preview_count}</strong>
            </li>
            {activeDraft.top_confidence != null && (
              <li>
                <span>{t('expert.confidence', { defaultValue: 'Confianza' })}</span>
                <strong>{(activeDraft.top_confidence * 100).toFixed(1)}%</strong>
              </li>
            )}
          </ul>

          {activeDraft.quality_gate != null && isQualityGatePayload(activeDraft.quality_gate) && (
            <div
              className="expert-dual-gate"
              data-testid="handoff-dual-gate"
              aria-label="Umbral de calidad dual"
            >
              <p className="expert-card__note" style={{ marginBottom: '0.35rem' }}>
                <strong>Umbral de calidad</strong>
                {activeDraft.quality_gate.verdict
                  ? ` · ${handoffGateVerdictLabelEs(activeDraft.quality_gate.verdict)}`
                  : ''}
              </p>
              <ul className="expert-meta-list">
                <li>
                  <span>Métricas OK</span>
                  <strong>
                    {activeDraft.quality_gate.metrics_acceptable ? 'Sí' : 'No'}
                  </strong>
                </li>
                <li>
                  <span>ID de especie</span>
                  <strong>
                    {activeDraft.quality_gate.species_id_allowed ? 'Permitida' : 'Bloqueada'}
                  </strong>
                </li>
                {activeDraft.quality_gate.reason && (
                  <li>
                    <span>Motivo</span>
                    <strong>{activeDraft.quality_gate.reason}</strong>
                  </li>
                )}
              </ul>
            </div>
          )}

          {(activeDraft.dangerous_lookalikes?.length ?? 0) > 0 && (
            <p className="expert-card__note">
              Lookalikes: {activeDraft.dangerous_lookalikes.slice(0, 4).join(', ')}
            </p>
          )}

          {(activeDraft.lookalike_diagnostics?.some((d) => d.critical_views.length > 0) ??
            false) && (
            <div
              className="lookalike-item__diag expert-card__diag"
              data-testid="expert-lookalike-diag"
            >
              <p className="lookalike-item__diag-label">
                {t('expert.pairDiagTitle', {
                  defaultValue: 'Vistas diagnósticas (educativo · no consumo)',
                })}
              </p>
              <ul className="expert-card__diag-list">
                {activeDraft.lookalike_diagnostics!
                  .filter((d) => d.critical_views.length > 0)
                  .slice(0, 4)
                  .map((d) => (
                    <li key={d.mate} data-pair-id={d.pair_id || undefined}>
                      <strong>{d.mate}</strong>
                      {d.why ? <span className="muted"> — {d.why}</span> : null}
                      <div className="lookalike-item__diag-views">
                        {d.critical_views.map((view) => (
                          <span
                            key={view}
                            className="lookalike-item__diag-badge lookalike-item__diag-badge--static"
                            data-slot={view}
                          >
                            {t(`identify.views.${view}`, { defaultValue: view })}
                          </span>
                        ))}
                      </div>
                      {d.missing_critical_views.length > 0 && (
                        <p className="muted expert-card__diag-miss">
                          {t('expert.missingDiagViews', {
                            defaultValue: 'Faltan en el paquete: {{views}}',
                            views: d.missing_critical_views
                              .map((v) => t(`identify.views.${v}`, { defaultValue: v }))
                              .join(', '),
                          })}
                        </p>
                      )}
                    </li>
                  ))}
              </ul>
              <p className="lookalike-item__diag-policy muted">
                {t('result.pairDiagPolicy', {
                  defaultValue:
                    'Educativo: multi-foto sin estas vistas no basta — solo orientación, nunca consumo.',
                })}
              </p>
            </div>
          )}

          {activeDraft.preview_urls?.[0] && (
            <div className="handoff-previews">
              {activeDraft.preview_urls.slice(0, 4).map((src, i) => (
                <img key={i} src={src} alt={`Evidencia ${i + 1}`} className="handoff-preview-img" />
              ))}
            </div>
          )}

          <div className="expert-handoff-actions">
            <Button type="button" variant="primary" onClick={() => void onCopy(activeDraft)}>
              {t('expert.copySummary', { defaultValue: 'Copiar resumen' })}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => downloadHandoffJson(activeDraft)}
            >
              {t('expert.downloadJson', { defaultValue: 'Descargar JSON' })}
            </Button>
            <LinkButton to="/historial" variant="ghost">
              {t('expert.openNotebook', { defaultValue: 'Abrir cuaderno' })}
            </LinkButton>
            <LinkButton to="/identificar" variant="ghost">
              {t('expert.newIdentify', { defaultValue: 'Nueva identificación' })}
            </LinkButton>
          </div>
          {copyStatus && (
            <p className="expert-copy-status" role="status">
              {copyStatus}
            </p>
          )}
          <details className="expert-summary-preview">
            <summary>
              {t('expert.textPreview', { defaultValue: 'Vista previa del texto' })}
            </summary>
            <pre>{formatHandoffSummary(activeDraft)}</pre>
          </details>
        </article>
      ) : (
        <div className="atelier-panel expert-card">
          <EmptyState
            title={t('expert.emptyDraftTitle', { defaultValue: 'Sin borrador activo' })}
            description={t('expert.emptyDraftBody', {
              defaultValue:
                'Identifica una seta dudosa y pulsa «Revisión experta» en el resultado, o empaqueta un caso desde el cuaderno.',
            })}
            actionLabel={t('nav.identify', { defaultValue: 'Identificar' })}
            actionTo="/identificar"
          />
        </div>
      )}

      {/* 2) Local + server queues */}
      <div className="expert-grid">
        <section className="atelier-panel expert-card">
          <h2>{t('expert.localQueue', { defaultValue: 'Cola local' })}</h2>
          <p className="expert-card__lead">
            {t('expert.localQueueLead', {
              defaultValue:
                'Casos de este dispositivo con rechazo, riesgo o bandera de revisión.',
            })}
          </p>
          {localQueue.length === 0 ? (
            <EmptyState
              title={t('expert.emptyLocalTitle', { defaultValue: 'Nada pendiente aquí' })}
              description={t('expert.emptyLocalBody', {
                defaultValue: 'Identifica una seta dudosa y empaqueta la evidencia.',
              })}
              actionLabel={t('nav.identify', { defaultValue: 'Identificar' })}
              actionTo="/identificar"
            />
          ) : (
            <ul className="expert-case-list">
              {localQueue.slice(0, 10).map((e) => (
                <li key={e.id} className="expert-case">
                  <div>
                    <strong>{decisionLabel(e.result.decision, locale)}</strong>
                    <span className="muted">
                      {' '}
                      · {new Date(e.timestamp).toLocaleString(locale.startsWith('en') ? 'en-GB' : 'es-ES')}
                    </span>
                    <p>
                      {e.result.predictions?.[0]?.species ||
                        t('expert.noTopSpecies', { defaultValue: 'Sin especie top' })}
                    </p>
                  </div>
                  <div className="expert-case__actions">
                    <Button type="button" variant="primary" onClick={() => packageLocal(e.id)}>
                      {t('expert.package', { defaultValue: 'Empaquetar' })}
                    </Button>
                    <LinkButton to="/historial" variant="ghost">
                      {t('expert.view', { defaultValue: 'Ver' })}
                    </LinkButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Link to="/historial" className="expert-card__link">
            {t('expert.openNotebook', { defaultValue: 'Abrir cuaderno' })}
          </Link>
        </section>

        <section className="atelier-panel expert-card">
          <div className="expert-card__head">
            <h2>{t('expert.serverQueue', { defaultValue: 'Cola del servidor' })}</h2>
            <Button type="button" variant="ghost" onClick={() => void loadRemote()}>
              {loading
                ? t('expert.loading', { defaultValue: 'Cargando…' })
                : t('expert.refresh', { defaultValue: 'Actualizar' })}
            </Button>
          </div>
          {error && (
            <p className="error-banner" role="status">
              {error}
            </p>
          )}
          {!loading && !error && remote.length === 0 && (
            <EmptyState
              title={t('expert.serverEmptyTitle', {
                defaultValue: 'Cola vacía o no conectada',
              })}
              description={t('expert.serverEmptyBody', {
                defaultValue:
                  'Cuando el backend esté disponible, verás aquí los casos asignados. Mientras tanto usa handoffs locales.',
              })}
            />
          )}
          {remote.length > 0 && (
            <ul className="expert-case-list">
              {remote.map((row, i) => (
                <li key={String(row.id ?? i)} className="expert-case">
                  <div>
                    <RiskChip
                      risk={row.priority === 'high' ? 'deadly' : 'unknown_or_risky'}
                      label={priorityLabelEs(row.priority)}
                    />
                    <p>
                      {t('expert.caseLabel', {
                        defaultValue: 'Caso {{id}}',
                        id: String(row.id ?? i + 1),
                      })}{' '}
                      · {statusLabelEs(row.status)}
                    </p>
                    {row.observation_id != null && (
                      <span className="muted">
                        {t('expert.observation', {
                          defaultValue: 'Observación {{id}}',
                          id: row.observation_id,
                        })}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* 3) Recent handoffs */}
      {drafts.length > 0 && (
        <section className="atelier-panel expert-card" style={{ marginTop: '1rem' }}>
          <h2>{t('expert.recentHandoffs', { defaultValue: 'Handoffs recientes' })}</h2>
          <ul className="expert-case-list">
            {drafts.slice(0, 8).map((d) => (
              <li key={d.id} className="expert-case">
                <div>
                  <strong>{d.top_species || decisionLabel(d.decision, locale)}</strong>
                  <span className="muted">
                    {' '}
                    ·{' '}
                    {new Date(d.created_at).toLocaleString(
                      locale.startsWith('en') ? 'en-GB' : 'es-ES',
                    )}
                  </span>
                </div>
                <LinkButton
                  to={`/revision-experta?handoff=${encodeURIComponent(d.id)}`}
                  variant="ghost"
                >
                  {t('expert.open', { defaultValue: 'Abrir' })}
                </LinkButton>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 4) Model health — secondary */}
      <section className="atelier-panel expert-card ml-health-card expert-ml-collapse">
        <div className="expert-card__head">
          <h2>
            <button
              type="button"
              className="expert-ml-toggle"
              aria-expanded={mlOpen}
              onClick={() => setMlOpen((v) => !v)}
            >
              {t('expert.mlStatus', { defaultValue: 'Estado del modelo' })}{' '}
              {mlOpen ? '▾' : '▸'}
            </button>
          </h2>
          <div className="expert-card__head-actions">
            <Button type="button" variant="ghost" onClick={() => void loadMlHealth()}>
              {t('expert.refresh', { defaultValue: 'Actualizar' })}
            </Button>
            <LinkButton to="/ml" variant="ghost">
              {t('expert.mlTechDetail', { defaultValue: 'Detalle técnico' })}
            </LinkButton>
          </div>
        </div>
        {mlOpen && (
          <>
            <div className="ml-health-grid">
              <div className="ml-health-stat">
                <span>API</span>
                <strong>{ml.health}</strong>
              </div>
              <div className="ml-health-stat">
                <span>Ready</span>
                <strong>
                  {ml.ready === null
                    ? '…'
                    : ml.ready
                      ? t('expert.mlReady', { defaultValue: 'Listo' })
                      : t('expert.mlDegraded', { defaultValue: 'Degradado' })}
                </strong>
              </div>
              <div className="ml-health-stat">
                <span>{t('expert.mlModels', { defaultValue: 'Modelos' })}</span>
                <strong>{ml.models}</strong>
              </div>
            </div>
            {ml.details && <p className="muted ml-health-details">{ml.details}</p>}
            <p className="muted">
              {t('expert.mlDisclaimer', {
                defaultValue:
                  'Si ves “mock” o “degraded”, las pistas de Identificar son demo — nunca permiso de consumo.',
              })}
            </p>
          </>
        )}
      </section>
    </PageShell>
  )
}
