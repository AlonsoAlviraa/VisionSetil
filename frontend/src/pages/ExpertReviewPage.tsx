/**
 * Expert review product UI — package evidence for a human mycologist.
 * Not an API console. Orientation only; never consumption permission.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { entriesNeedingReview, loadHistory } from '../lib/observationHistory'
import { decisionLabelEs } from '../lib/decisionLabels'
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
    <div className="page-expert-review page-atelier-shell">
      <header className="mkt-page-head mkt-mesh">
        <p className="mkt-kicker">Revisión experta</p>
        <h1>Segunda opinión humana</h1>
        <p>
          Empaqueta evidencia multi-vista y compártela con un micólogo. Orientación solamente — no
          certifica ni autoriza consumo.
        </p>
      </header>

      <div className="feature-card-neo safety-disclaimer" role="note">
        Un micólogo de carne y hueso debe validar en el campo. La app no sustituye criterio humano.
      </div>

      {/* 1) Active handoff */}
      {activeDraft ? (
        <article className="atelier-panel expert-card expert-card--featured">
          <p className="atelier-kicker" style={{ color: 'var(--ink-mute)' }}>
            Borrador listo
          </p>
          <h2>Evidencia empaquetada</h2>
          {activeDraft.top_species ? (
            <SpeciesNameBlock taxon={activeDraft.top_species} size="md" showFamily={false} />
          ) : (
            <p>Sin especie top</p>
          )}
          <ul className="expert-meta-list">
            <li>
              <span>Decisión</span>
              <strong>{decisionLabelEs(activeDraft.decision)}</strong>
            </li>
            {activeDraft.mode != null && (
              <li>
                <span>Modo</span>
                <strong data-testid="handoff-mode">{handoffModeLabelEs(activeDraft.mode)}</strong>
              </li>
            )}
            <li>
              <span>Vistas</span>
              <strong>
                {activeDraft.view_types?.length
                  ? activeDraft.view_types.join(', ')
                  : 'Sin etiquetas'}
              </strong>
            </li>
            <li>
              <span>Fotos</span>
              <strong>{activeDraft.preview_count}</strong>
            </li>
            {activeDraft.top_confidence != null && (
              <li>
                <span>Confianza</span>
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

          {activeDraft.preview_urls?.[0] && (
            <div className="handoff-previews">
              {activeDraft.preview_urls.slice(0, 4).map((src, i) => (
                <img key={i} src={src} alt={`Evidencia ${i + 1}`} className="handoff-preview-img" />
              ))}
            </div>
          )}

          <div className="expert-handoff-actions">
            <button
              type="button"
              className="btn-atelier btn-atelier--primary"
              onClick={() => void onCopy(activeDraft)}
            >
              Copiar resumen
            </button>
            <button
              type="button"
              className="btn-atelier btn-atelier--ghost"
              onClick={() => downloadHandoffJson(activeDraft)}
            >
              Descargar JSON
            </button>
            <Link to="/historial" className="btn-atelier btn-atelier--ghost">
              Abrir cuaderno
            </Link>
            <Link to="/identificar" className="btn-atelier btn-atelier--ghost">
              Nueva identificación
            </Link>
          </div>
          {copyStatus && (
            <p className="expert-copy-status" role="status">
              {copyStatus}
            </p>
          )}
          <details className="expert-summary-preview">
            <summary>Vista previa del texto</summary>
            <pre>{formatHandoffSummary(activeDraft)}</pre>
          </details>
        </article>
      ) : (
        <div className="atelier-panel expert-card">
          <EmptyState
            title="Sin borrador activo"
            description="Identifica una seta dudosa y pulsa «Revisión experta» en el resultado, o empaqueta un caso desde el cuaderno."
            actionLabel="Identificar"
            actionTo="/identificar"
          />
        </div>
      )}

      {/* 2) Local + server queues */}
      <div className="expert-grid">
        <section className="atelier-panel expert-card">
          <h2>Cola local</h2>
          <p className="expert-card__lead">
            Casos de este dispositivo con rechazo, riesgo o bandera de revisión.
          </p>
          {localQueue.length === 0 ? (
            <EmptyState
              title="Nada pendiente aquí"
              description="Identifica una seta dudosa y empaqueta la evidencia."
              actionLabel="Identificar"
              actionTo="/identificar"
            />
          ) : (
            <ul className="expert-case-list">
              {localQueue.slice(0, 10).map((e) => (
                <li key={e.id} className="expert-case">
                  <div>
                    <strong>{decisionLabelEs(e.result.decision)}</strong>
                    <span className="muted"> · {new Date(e.timestamp).toLocaleString()}</span>
                    <p>{e.result.predictions?.[0]?.species || 'Sin especie top'}</p>
                  </div>
                  <div className="expert-case__actions">
                    <button
                      type="button"
                      className="btn-atelier btn-atelier--primary"
                      onClick={() => packageLocal(e.id)}
                    >
                      Empaquetar
                    </button>
                    <Link to="/historial" className="btn-atelier btn-atelier--ghost">
                      Ver
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Link to="/historial" className="expert-card__link">
            Abrir cuaderno
          </Link>
        </section>

        <section className="atelier-panel expert-card">
          <div className="expert-card__head">
            <h2>Cola del servidor</h2>
            <button
              type="button"
              className="btn-atelier btn-atelier--ghost"
              onClick={() => void loadRemote()}
            >
              {loading ? 'Cargando…' : 'Actualizar'}
            </button>
          </div>
          {error && (
            <p className="error-banner" role="status">
              {error}
            </p>
          )}
          {!loading && !error && remote.length === 0 && (
            <EmptyState
              title="Cola vacía o no conectada"
              description="Cuando el backend esté disponible, verás aquí los casos asignados. Mientras tanto usa handoffs locales."
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
                      Caso {String(row.id ?? i + 1)} · {statusLabelEs(row.status)}
                    </p>
                    {row.observation_id != null && (
                      <span className="muted">Observación {row.observation_id}</span>
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
          <h2>Handoffs recientes</h2>
          <ul className="expert-case-list">
            {drafts.slice(0, 8).map((d) => (
              <li key={d.id} className="expert-case">
                <div>
                  <strong>{d.top_species || decisionLabelEs(d.decision)}</strong>
                  <span className="muted"> · {new Date(d.created_at).toLocaleString()}</span>
                </div>
                <Link
                  to={`/revision-experta?handoff=${encodeURIComponent(d.id)}`}
                  className="btn-atelier btn-atelier--ghost"
                >
                  Abrir
                </Link>
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
              Estado del modelo {mlOpen ? '▾' : '▸'}
            </button>
          </h2>
          <div className="expert-card__head-actions">
            <button
              type="button"
              className="btn-atelier btn-atelier--ghost"
              onClick={() => void loadMlHealth()}
            >
              Actualizar
            </button>
            <Link to="/ml" className="btn-atelier btn-atelier--ghost">
              Detalle técnico
            </Link>
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
                  {ml.ready === null ? '…' : ml.ready ? 'Listo' : 'Degradado'}
                </strong>
              </div>
              <div className="ml-health-stat">
                <span>Modelos</span>
                <strong>{ml.models}</strong>
              </div>
            </div>
            {ml.details && <p className="muted ml-health-details">{ml.details}</p>}
            <p className="muted">
              Si ves “mock” o “degraded”, las pistas de Identificar son demo — nunca permiso de
              consumo.
            </p>
          </>
        )}
      </section>
    </div>
  )
}
