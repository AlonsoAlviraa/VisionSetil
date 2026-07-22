/**
 * Expert review + ML health — product UI, not an API console.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { entriesNeedingReview, loadHistory } from '../lib/observationHistory'
import { decisionLabelEs } from '../lib/decisionLabels'
import {
  loadHandoffDraft,
  loadHandoffQueue,
  type ExpertHandoffDraft,
} from '../lib/expertHandoff'
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
  const [ml, setMl] = useState<MlHealth>({
    ready: null,
    health: '…',
    models: '…',
    details: '',
  })
  const localQueue = entriesNeedingReview(loadHistory())
  const drafts = useMemo(() => loadHandoffQueue(), [])
  const activeDraft: ExpertHandoffDraft | null = useMemo(() => {
    if (handoffId) {
      return drafts.find((d) => d.id === handoffId) || loadHandoffDraft()
    }
    return loadHandoffDraft()
  }, [handoffId, drafts])

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

  return (
    <div className="page-expert-review page-atelier-shell">
      <div className="page-header">
        <h1 className="page-title">Revisión experta y ML</h1>
        <p className="page-subtitle">
          Segunda opinión humana + estado del modelo. Empaqueta evidencia y revisa si el stack es
          demo o real.
        </p>
      </div>

      <section className="atelier-panel expert-card ml-health-card">
        <div className="expert-card__head">
          <h2>Estado del modelo</h2>
          <button type="button" className="btn-atelier btn-atelier--ghost" onClick={() => void loadMlHealth()}>
            Actualizar
          </button>
        </div>
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
        {ml.details && (
          <p className="muted ml-health-details">{ml.details}</p>
        )}
        <p className="muted">
          Si ves “mock” o “degraded”, las pistas de Identificar son demo — nunca permiso de consumo.
        </p>
      </section>

      {activeDraft && (
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
            <li>
              <span>Vistas</span>
              <strong>
                {activeDraft.view_types.length
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
          {activeDraft.dangerous_lookalikes.length > 0 && (
            <p className="expert-card__note">
              Lookalikes: {activeDraft.dangerous_lookalikes.slice(0, 4).join(', ')}
            </p>
          )}
          {activeDraft.preview_urls[0] && (
            <div className="handoff-previews">
              {activeDraft.preview_urls.slice(0, 4).map((src, i) => (
                <img key={i} src={src} alt={`Evidencia ${i + 1}`} className="handoff-preview-img" />
              ))}
            </div>
          )}
        </article>
      )}

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
              {localQueue.slice(0, 8).map((e) => (
                <li key={e.id} className="expert-case">
                  <div>
                    <strong>{decisionLabelEs(e.result.decision)}</strong>
                    <span className="muted">
                      {' '}
                      · {new Date(e.timestamp).toLocaleString()}
                    </span>
                    <p>
                      {e.result.predictions?.[0]?.species || 'Sin especie top'}
                    </p>
                  </div>
                  <Link to="/historial" className="btn-atelier btn-atelier--ghost">
                    Ver
                  </Link>
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
              description="Cuando el backend esté disponible, verás aquí los casos asignados."
            />
          )}
          {remote.length > 0 && (
            <ul className="expert-case-list">
              {remote.map((row, i) => (
                <li key={String(row.id ?? i)} className="expert-case">
                  <div>
                    <RiskChip risk={row.priority === 'high' ? 'deadly' : 'unknown_or_risky'} label={priorityLabelEs(row.priority)} />
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

      {drafts.length > 1 && (
        <section className="atelier-panel expert-card" style={{ marginTop: '1rem' }}>
          <h2>Handoffs recientes</h2>
          <ul className="expert-case-list">
            {drafts.slice(0, 6).map((d) => (
              <li key={d.id} className="expert-case">
                <div>
                  <strong>{d.top_species || decisionLabelEs(d.decision)}</strong>
                  <span className="muted">
                    {' '}
                    · {new Date(d.created_at).toLocaleString()}
                  </span>
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
    </div>
  )
}
