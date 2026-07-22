/**
 * Mega ML dashboard — live model stack health from /models/status + /readyz.
 * Never hardcodes green; shows mock vs real honestly.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || '/api'
const API_KEY = import.meta.env.VITE_API_KEY || ''

type ComponentStatus = {
  requested?: string
  backend?: string
  loaded?: boolean
  device?: string
  model_path?: string | null
  embedding_dim?: number
  reason?: string
  [key: string]: unknown
}

type ModelsStatus = {
  detector?: ComponentStatus
  visual_embedder?: ComponentStatus
  image_text_embedder?: ComponentStatus
  multi_view_classifier?: ComponentStatus & {
    weights_discovered?: boolean
    labels_loaded?: boolean
    num_classes?: number
    weights_path?: string
    honesty?: string
    load_error?: string | null
    arch?: string | null
    arch_hparams?: Record<string, unknown> | null
    discovery?: {
      resolved?: string | null
      candidates?: string[]
      candidate_count?: number
    }
  }
  weight_discovery?: {
    resolved?: string | null
    configured?: string | null
    configured_exists?: boolean
    candidates?: string[]
    candidate_count?: number
  }
  summary?: {
    any_real_backend?: boolean
    multi_view_loaded?: boolean
    multi_view_backend?: string
    honesty?: string
    weights_discovered?: boolean
    training_map_at_3?: number
    training_num_classes?: number
    training_honesty?: string
  }
  training_metrics?: {
    honesty?: string
    summary_line?: string | null
    primary?: {
      run?: string
      metrics?: {
        test_accuracy?: number
        test_map_at_3?: number
        test_f1_macro?: number
        test_balanced_accuracy?: number
        test_ece?: number
        safety_recall_deadly?: number
        num_classes?: number
        num_train_obs?: number
        num_val_obs?: number
        num_test_obs?: number
        databases_used?: string[]
        version?: string
        best_epoch?: number
      }
      history_tail?: Array<{
        epoch?: number
        train_loss?: number
        val_map3?: number
        val_acc?: number
      }>
    }
    sources_registry?: {
      updated?: string
      ml_ready_public_ids?: string[]
      request_collaboration_ids?: string[]
      gbif_probe_snapshot?: {
        counts?: Record<string, number>
        date?: string
      }
      current_checkpoint?: {
        honest_quality_note?: string
      }
    }
    docs?: string
  }
  config?: Record<string, unknown>
  [key: string]: unknown
}

function pct(n: number | undefined | null, digits = 1): string {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return `${(Number(n) * 100).toFixed(digits)}%`
}

function backendTone(backend?: string, loaded?: boolean): 'real' | 'mock' | 'error' | 'unknown' {
  if (!backend) return 'unknown'
  const b = backend.toLowerCase()
  if (b.includes('error')) return 'error'
  if (loaded || b.startsWith('real_')) return 'real'
  if (b.includes('mock') || b.includes('fallback')) return 'mock'
  return 'unknown'
}

/** Dual-signal quality gate from GET /models/quality-gate (D-B15 / B-09). */
type QualityGatePayload = {
  species_id_allowed: boolean
  metrics_acceptable: boolean
  block_enabled: boolean
  reason: string
  reason_code: string
  test_map_at_3: number | null
  safety_recall_deadly: number | null
  min_map_at_3: number
  min_deadly_recall: number
  metrics_path: string | null
  version: string | null
  verdict: 'ACCEPTABLE' | 'UNACCEPTABLE'
}

function parseQualityGatePayload(v: unknown): QualityGatePayload | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (typeof o.species_id_allowed !== 'boolean') return null
  if (typeof o.metrics_acceptable !== 'boolean') return null
  if (typeof o.block_enabled !== 'boolean') return null
  if (o.verdict !== 'ACCEPTABLE' && o.verdict !== 'UNACCEPTABLE') return null
  // D-B15: verdict tracks metrics only — trust metrics_acceptable if mismatch
  const metrics_acceptable = o.metrics_acceptable
  const verdict: 'ACCEPTABLE' | 'UNACCEPTABLE' = metrics_acceptable
    ? 'ACCEPTABLE'
    : 'UNACCEPTABLE'
  return {
    species_id_allowed: o.species_id_allowed,
    metrics_acceptable,
    block_enabled: o.block_enabled,
    reason: typeof o.reason === 'string' ? o.reason : '',
    reason_code: typeof o.reason_code === 'string' ? o.reason_code : 'unset',
    test_map_at_3: typeof o.test_map_at_3 === 'number' ? o.test_map_at_3 : null,
    safety_recall_deadly:
      typeof o.safety_recall_deadly === 'number' ? o.safety_recall_deadly : null,
    min_map_at_3: typeof o.min_map_at_3 === 'number' ? o.min_map_at_3 : 0.2,
    min_deadly_recall:
      typeof o.min_deadly_recall === 'number' ? o.min_deadly_recall : 0.9,
    metrics_path: typeof o.metrics_path === 'string' ? o.metrics_path : null,
    version: typeof o.version === 'string' ? o.version : null,
    verdict,
  }
}

/** Hero tone: metrics drive color; policy diverge → amber warning. */
function gateHeroTone(gate: QualityGatePayload | null): 'real' | 'mock' | 'error' {
  if (!gate) return 'mock'
  if (gate.metrics_acceptable && gate.species_id_allowed) return 'real'
  // Policy allows ID while metrics fail (gate_disabled) — do not paint green
  if (!gate.metrics_acceptable && gate.species_id_allowed) return 'mock'
  if (!gate.species_id_allowed) return 'error'
  return 'mock'
}

function SignalCard({
  title,
  ok,
  okLabel,
  failLabel,
  detail,
  testId,
}: {
  title: string
  ok: boolean
  okLabel: string
  failLabel: string
  detail: string
  testId: string
}) {
  const tone = ok ? 'real' : 'error'
  return (
    <article className={`ml-dash-card ml-dash-card--${tone}`} data-testid={testId}>
      <header>
        <h3>{title}</h3>
        <span className={`ml-dash-pill ml-dash-pill--${tone}`} data-testid={`${testId}-value`}>
          {ok ? okLabel : failLabel}
        </span>
      </header>
      <p className="muted" style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.45 }}>
        {detail}
      </p>
    </article>
  )
}

function QualityGateTile({
  gate,
  loading,
  weightsHint,
}: {
  gate: QualityGatePayload | null
  loading: boolean
  weightsHint?: string | null
}) {
  const tone = gateHeroTone(gate)
  const diverged =
    gate != null && gate.metrics_acceptable !== gate.species_id_allowed

  return (
    <section
      className={`atelier-panel ml-dash-hero ml-dash-hero--${tone === 'error' ? 'mock' : tone} ml-dash-gate-tile`}
      style={{ marginTop: '0.5rem' }}
      data-testid="ml-quality-gate-tile"
      aria-live="polite"
    >
      <header
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
          marginBottom: '0.5rem',
        }}
      >
        <h2 style={{ margin: 0 }}>Quality gate de producto</h2>
        {gate && (
          <span
            className={`ml-dash-pill ml-dash-pill--${
              gate.metrics_acceptable ? 'real' : tone === 'error' ? 'error' : 'mock'
            }`}
            data-testid="ml-quality-gate-verdict"
          >
            verdict {gate.verdict}
          </span>
        )}
      </header>

      <p>
        Señal dual (D-B15): <strong>metrics_acceptable</strong> es calidad cruda del modelo;
        <strong> species_id_allowed</strong> es política de serve (respeta{' '}
        <code>block_enabled</code>). Umbrales: MAP@3 ≥{' '}
        <strong>{gate?.min_map_at_3 != null ? pct(gate.min_map_at_3, 0) : '20%'}</strong> y
        recall mortales ≥{' '}
        <strong>
          {gate?.min_deadly_recall != null ? pct(gate.min_deadly_recall, 0) : '90%'}
        </strong>
        . <code>verdict</code> sigue solo las métricas — nunca el bypass de disable.
      </p>

      {loading && !gate && <p className="muted">Cargando gate desde /models/quality-gate…</p>}

      {!loading && !gate && (
        <p className="ml-dash-warn" role="status">
          No se pudo leer <code>/models/quality-gate</code>. Sin payload dual no se afirma
          calidad ni permiso de ID.
        </p>
      )}

      {gate && (
        <>
          <div className="ml-dash-grid" style={{ marginTop: '0.75rem' }}>
            <SignalCard
              title="metrics_acceptable"
              ok={gate.metrics_acceptable}
              okLabel="true"
              failLabel="false"
              detail="MAP@3 y safety recall mortales vs umbrales. Nunca se fuerza a true si el gate está deshabilitado."
              testId="ml-gate-metrics-acceptable"
            />
            <SignalCard
              title="species_id_allowed"
              ok={gate.species_id_allowed}
              okLabel="true"
              failLabel="false"
              detail={
                gate.block_enabled
                  ? 'Política: block_enabled=true → coincide con metrics_acceptable. Si metrics fallan, /classify bloquea IDs de especie.'
                  : 'Política: block_enabled=false (dev) → ID permitido aunque métricas fallen. No pintar como ACCEPTABLE.'
              }
              testId="ml-gate-species-id-allowed"
            />
          </div>

          {diverged && (
            <p className="ml-dash-warn" role="status" data-testid="ml-gate-signal-diverge">
              Señales divergentes: métricas <strong>UNACCEPTABLE</strong> pero política permite
              ID (<code>reason_code={gate.reason_code}</code>). Confidence UI debe seguir
              oculto (D-B9).
            </p>
          )}

          <div className="ml-dash-metrics ml-dash-metrics--compact" style={{ marginTop: '0.85rem' }}>
            <div>
              <span>MAP@3 test</span>
              <strong data-testid="ml-gate-map-at-3">
                {gate.test_map_at_3 != null ? pct(gate.test_map_at_3, 2) : '—'}
              </strong>
              <span className="muted" style={{ textTransform: 'none', letterSpacing: 0 }}>
                min {pct(gate.min_map_at_3, 0)}
              </span>
            </div>
            <div>
              <span>Recall mortales</span>
              <strong data-testid="ml-gate-deadly-recall">
                {gate.safety_recall_deadly != null
                  ? pct(gate.safety_recall_deadly, 1)
                  : '—'}
              </strong>
              <span className="muted" style={{ textTransform: 'none', letterSpacing: 0 }}>
                min {pct(gate.min_deadly_recall, 0)}
              </span>
            </div>
            <div>
              <span>block_enabled</span>
              <strong data-testid="ml-gate-block-enabled">
                {gate.block_enabled ? 'true' : 'false'}
              </strong>
            </div>
            <div>
              <span>reason_code</span>
              <strong data-testid="ml-gate-reason-code">
                <code>{gate.reason_code || '—'}</code>
              </strong>
            </div>
          </div>

          <dl className="ml-dash-meta">
            <div>
              <dt>reason</dt>
              <dd>
                <code>{gate.reason}</code>
              </dd>
            </div>
            <div>
              <dt>version</dt>
              <dd>{gate.version || '—'}</dd>
            </div>
            <div>
              <dt>metrics_path</dt>
              <dd className="ml-dash-path" data-testid="ml-gate-metrics-path">
                {gate.metrics_path || '—'}
              </dd>
            </div>
            <div>
              <dt>endpoint</dt>
              <dd>
                <code>GET /models/quality-gate</code>
              </dd>
            </div>
          </dl>

          {!gate.species_id_allowed && (
            <p className="ml-dash-warn" role="status" data-testid="ml-gate-blocked-copy">
              Identificación de especie <strong>BLOQUEADA</strong> en /classify. Solo abstención /
              modo educativo. No se inventan top-k.
            </p>
          )}

          {gate.reason_code === 'no_metrics' && (
            <p className="muted" data-testid="ml-gate-weights-hint">
              Sin metrics sibling del checkpoint en serve. Coloca{' '}
              <code>metrics.json</code> junto a los pesos resueltos
              {weightsHint ? (
                <>
                  {' '}
                  (<code>{weightsHint}</code>)
                </>
              ) : null}{' '}
              o configura <code>MULTI_VIEW_WEIGHTS_PATH</code> y reinicia el backend.
            </p>
          )}
        </>
      )}
    </section>
  )
}

function ComponentCard({
  title,
  status,
}: {
  title: string
  status?: ComponentStatus
}) {
  const tone = backendTone(status?.backend, status?.loaded)
  return (
    <article className={`ml-dash-card ml-dash-card--${tone}`}>
      <header>
        <h3>{title}</h3>
        <span className={`ml-dash-pill ml-dash-pill--${tone}`}>
          {status?.loaded ? 'Cargado' : tone === 'mock' ? 'Mock' : tone === 'error' ? 'Error' : '—'}
        </span>
      </header>
      <dl>
        <div>
          <dt>Solicitado</dt>
          <dd>{status?.requested || '—'}</dd>
        </div>
        <div>
          <dt>Backend</dt>
          <dd>{status?.backend || '—'}</dd>
        </div>
        <div>
          <dt>Device</dt>
          <dd>{status?.device || '—'}</dd>
        </div>
        {status?.model_path != null && (
          <div>
            <dt>Path</dt>
            <dd className="ml-dash-path">{String(status.model_path)}</dd>
          </div>
        )}
        {status?.embedding_dim != null && (
          <div>
            <dt>Dim</dt>
            <dd>{status.embedding_dim}</dd>
          </div>
        )}
        {status?.reason && (
          <div>
            <dt>Nota</dt>
            <dd>{status.reason}</dd>
          </div>
        )}
      </dl>
    </article>
  )
}

export function MlDashboardPage() {
  const [status, setStatus] = useState<ModelsStatus | null>(null)
  const [ready, setReady] = useState<{ ready?: boolean; checks?: Record<string, string> } | null>(
    null,
  )
  const [experiments, setExperiments] = useState<{
    available?: boolean
    executive_summary?: {
      headline?: string
      best_open_set?: Record<string, number>
      best_temperature_by_ece?: { T?: number; ece?: number; map_at_3?: number }
      safety?: Record<string, unknown>
      next_actions?: string[]
    }
    calibrated_thresholds?: Record<string, number | null>
  } | null>(null)
  const [qualityGate, setQualityGate] = useState<QualityGatePayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [ts, setTs] = useState<string>('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const headers = API_KEY ? { 'X-API-Key': API_KEY } : {}
    try {
      const [s, r, exp, qg] = await Promise.all([
        axios.get(`${API_BASE}/models/status`, { headers, timeout: 20000 }),
        axios.get(`${API_BASE}/readyz`, {
          headers,
          timeout: 20000,
          validateStatus: () => true,
        }),
        axios.get(`${API_BASE}/models/experiments`, {
          headers,
          timeout: 15000,
          validateStatus: () => true,
        }),
        axios.get(`${API_BASE}/models/quality-gate`, {
          headers,
          timeout: 15000,
          validateStatus: () => true,
        }),
      ])
      setStatus(s.data as ModelsStatus)
      setReady(r.data)
      setExperiments(exp.status === 200 ? exp.data : null)
      setQualityGate(qg.status === 200 ? parseQualityGatePayload(qg.data) : null)
      setTs(new Date().toLocaleString())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el estado ML')
      setStatus(null)
      setQualityGate(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const summary = status?.summary
  const mv = status?.multi_view_classifier
  const honesty = summary?.honesty || mv?.honesty || 'unknown'
  const anyReal = Boolean(summary?.any_real_backend)
  const train = status?.training_metrics
  const tm = train?.primary?.metrics
  const gbifCounts = train?.sources_registry?.gbif_probe_snapshot?.counts

  return (
    <div className="page-ml-dashboard page-atelier-shell">
      <div className="page-header">
        <p className="atelier-kicker home-kicker">Observabilidad · ML</p>
        <h1 className="page-title">Dashboard ML</h1>
        <p className="page-subtitle">
          Estado real del stack de modelos. Si es mock, se dice mock — sin maquillaje.
        </p>
      </div>

      <div className="ml-dash-toolbar">
        <button
          type="button"
          className="btn-atelier btn-atelier--primary"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {loading ? 'Actualizando…' : 'Actualizar'}
        </button>
        <Link to="/identificar" className="btn-atelier btn-atelier--ghost">
          Ir a Identificar
        </Link>
        <Link to="/revision-experta" className="btn-atelier btn-atelier--ghost">
          Expertos
        </Link>
        {ts && <span className="muted">Última lectura: {ts}</span>}
      </div>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      <section
        className={`atelier-panel ml-dash-hero ${anyReal ? 'ml-dash-hero--real' : 'ml-dash-hero--mock'}`}
      >
        <h2>{anyReal ? 'Hay backends reales cargados' : 'Modo demo / mock activo'}</h2>
        <p>
          Multi-view:{' '}
          <strong>{mv?.backend || '—'}</strong>
          {mv?.arch ? ` · arch ${mv.arch}` : ''}
          {mv?.weights_discovered ? ' · pesos encontrados en disco' : ' · sin checkpoint resuelto'}
          {typeof mv?.num_classes === 'number' && mv.num_classes > 0
            ? ` · ${mv.num_classes} clases`
            : ''}
        </p>
        <p className="muted">
          Honestidad: <code>{honesty}</code>
          {mv?.load_error ? ` · error: ${mv.load_error}` : ''}
        </p>
        {mv?.arch_hparams && (
          <p className="muted">
            Hparams: d_model={String(mv.arch_hparams.d_model ?? '—')} · backbone=
            {String(mv.arch_hparams.backbone_name ?? '—')} · lora_rank=
            {String(mv.arch_hparams.lora_rank ?? '—')}
          </p>
        )}
        {ready && (
          <p className="muted">
            /readyz: {ready.ready ? 'listo' : 'degradado'} · models={ready.checks?.models || '—'}
          </p>
        )}
      </section>

      <div className="ml-dash-grid">
        <ComponentCard title="Detector" status={status?.detector} />
        <ComponentCard title="Visual embedder" status={status?.visual_embedder} />
        <ComponentCard title="Image–text embedder" status={status?.image_text_embedder} />
        <ComponentCard
          title="Multi-view classifier"
          status={
            mv
              ? {
                  requested: 'MultiView v5',
                  backend: mv.backend,
                  loaded: mv.loaded,
                  device: mv.device,
                  model_path: mv.weights_path,
                  reason: mv.load_error || undefined,
                }
              : undefined
          }
        />
      </div>

      <QualityGateTile
        gate={qualityGate}
        loading={loading}
        weightsHint={
          status?.weight_discovery?.resolved ||
          mv?.weights_path ||
          status?.weight_discovery?.configured ||
          null
        }
      />

      {experiments?.available && experiments.executive_summary && (
        <section className="atelier-panel" style={{ marginTop: '1rem' }}>
          <h2>Batería de experimentos (offline)</h2>
          <p>{experiments.executive_summary.headline}</p>
          {experiments.executive_summary.best_open_set && (
            <p className="muted">
              Open-set óptimo (utilidad): conf≥
              {experiments.executive_summary.best_open_set.conf_thr} · margin≥
              {experiments.executive_summary.best_open_set.margin_thr} → accept{' '}
              {pct(experiments.executive_summary.best_open_set.accept_rate, 1)} · acc|accept{' '}
              {pct(experiments.executive_summary.best_open_set.accuracy_when_accept, 1)}
            </p>
          )}
          {experiments.executive_summary.best_temperature_by_ece && (
            <p className="muted">
              Temperatura ECE-min: T=
              {experiments.executive_summary.best_temperature_by_ece.T} · ECE=
              {experiments.executive_summary.best_temperature_by_ece.ece?.toFixed?.(4) ?? '—'}
            </p>
          )}
          {experiments.executive_summary.safety && (
            <p className="ml-dash-warn" role="status">
              Seguridad (test): deadly recall top-k ={' '}
              {String(experiments.executive_summary.safety.any_deadly_in_topk ?? '—')} · n=
              {String(experiments.executive_summary.safety.n_deadly_in_test ?? '—')}. Prioridad
              R7: subir recall de mortales antes de cazar MAP@3.
            </p>
          )}
          {!!experiments.executive_summary.next_actions?.length && (
            <ol className="ml-dash-howto">
              {experiments.executive_summary.next_actions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ol>
          )}
        </section>
      )}

      <section className="atelier-panel" style={{ marginTop: '1rem' }}>
        <h2>Métricas de entrenamiento (disco)</h2>
        <p className="muted">
          Fuente: <code>{train?.primary?.run || '—'}</code> · honestidad{' '}
          <code>{train?.honesty || summary?.training_honesty || '—'}</code>
        </p>
        {train?.sources_registry?.current_checkpoint?.honest_quality_note && (
          <p className="ml-dash-warn" role="status">
            {train.sources_registry.current_checkpoint.honest_quality_note}
          </p>
        )}
        <div className="ml-dash-metrics">
          <div>
            <span>MAP@3 test</span>
            <strong>{pct(tm?.test_map_at_3, 2)}</strong>
          </div>
          <div>
            <span>Accuracy</span>
            <strong>{pct(tm?.test_accuracy, 2)}</strong>
          </div>
          <div>
            <span>F1 macro</span>
            <strong>{pct(tm?.test_f1_macro, 2)}</strong>
          </div>
          <div>
            <span>Balanced acc</span>
            <strong>{pct(tm?.test_balanced_accuracy, 2)}</strong>
          </div>
          <div>
            <span>ECE</span>
            <strong>{tm?.test_ece != null ? Number(tm.test_ece).toFixed(3) : '—'}</strong>
          </div>
          <div>
            <span>Recall mortales</span>
            <strong>{pct(tm?.safety_recall_deadly, 1)}</strong>
          </div>
          <div>
            <span>Clases</span>
            <strong>{tm?.num_classes ?? '—'}</strong>
          </div>
          <div>
            <span>Train / val / test obs</span>
            <strong>
              {tm?.num_train_obs ?? '—'} / {tm?.num_val_obs ?? '—'} / {tm?.num_test_obs ?? '—'}
            </strong>
          </div>
        </div>
        <p className="muted">
          Databases: {(tm?.databases_used || []).join(', ') || '—'} · best epoch{' '}
          {tm?.best_epoch ?? '—'} · version {tm?.version ?? '—'}
        </p>
        {train?.primary?.history_tail && train.primary.history_tail.length > 0 && (
          <ul className="ml-dash-history">
            {train.primary.history_tail.map((h) => (
              <li key={String(h.epoch)}>
                epoch {h.epoch}: loss {h.train_loss?.toFixed?.(3) ?? h.train_loss} · val MAP@3{' '}
                {h.val_map3 != null ? pct(h.val_map3, 2) : '—'}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="atelier-panel" style={{ marginTop: '1rem' }}>
        <h2>Base de datos / fuentes (España · Soria)</h2>
        <p className="muted">
          Registro: <code>data/training_sources_registry.json</code> · guía{' '}
          <code>{train?.docs || 'docs/DATA_SOURCES_SPAIN_SORIA.md'}</code>
        </p>
        <h3 className="ml-dash-subh">Listas para ML (públicas)</h3>
        <ul className="ml-dash-candidates">
          {(train?.sources_registry?.ml_ready_public_ids || []).map((id) => (
            <li key={id}>
              <code>{id}</code>
            </li>
          ))}
          {!(train?.sources_registry?.ml_ready_public_ids || []).length && (
            <li className="muted">Sin registro cargado — reinicia backend con monorepo root.</li>
          )}
        </ul>
        <h3 className="ml-dash-subh">Pedir colaboración (organismos)</h3>
        <ul className="ml-dash-candidates">
          {(train?.sources_registry?.request_collaboration_ids || []).map((id) => (
            <li key={id}>
              <code>{id}</code>
            </li>
          ))}
        </ul>
        <h3 className="ml-dash-subh">Sondeo GBIF (snapshot)</h3>
        <div className="ml-dash-metrics ml-dash-metrics--compact">
          <div>
            <span>ES Fungi + imagen</span>
            <strong>
              {gbifCounts?.ES_fungi_with_still_image?.toLocaleString?.('es-ES') ?? '—'}
            </strong>
          </div>
          <div>
            <span>ES total Fungi</span>
            <strong>{gbifCounts?.ES_fungi_any?.toLocaleString?.('es-ES') ?? '—'}</strong>
          </div>
          <div>
            <span>Bbox Soria + imagen</span>
            <strong>
              {gbifCounts?.soria_bbox_fungi_with_image?.toLocaleString?.('es-ES') ?? '—'}
            </strong>
          </div>
        </div>
        <p className="muted">
          Actualizar sondeo: <code>python scripts/probe_gbif_spain_fungi.py --write</code>
        </p>
        <p className="muted">
          Contactos prioritarios: Micocyl/CESEFOR/Junta CyL, Asociación Montes de Soria, MA-Fungi
          RJB-CSIC. Plantilla de correo en la guía de fuentes.
        </p>
      </section>

      <section className="atelier-panel" style={{ marginTop: '1rem' }}>
        <h2>Descubrimiento de pesos</h2>
        <p className="muted">
          Configurado:{' '}
          <code>
            {status?.weight_discovery?.configured ||
              (status?.config?.multi_view_weights_path != null
                ? String(status.config.multi_view_weights_path)
                : '—')}
          </code>
        </p>
        <p>
          Resuelto:{' '}
          <strong>
            {status?.weight_discovery?.resolved ||
              mv?.discovery?.resolved ||
              mv?.weights_path ||
              'ninguno'}
          </strong>
        </p>
        <p className="muted">
          Candidatos:{' '}
          {status?.weight_discovery?.candidate_count ??
            mv?.discovery?.candidate_count ??
            0}
        </p>
        <ul className="ml-dash-candidates">
          {(
            status?.weight_discovery?.candidates ||
            mv?.discovery?.candidates ||
            []
          ).map((c) => (
            <li key={c}>
              <code>{c}</code>
            </li>
          ))}
        </ul>
      </section>

      <section className="atelier-panel" style={{ marginTop: '1rem' }}>
        <h2>Config y endpoints</h2>
        <dl className="ml-dash-meta">
          <div>
            <dt>Device</dt>
            <dd>{String(status?.config?.model_device ?? '—')}</dd>
          </div>
          <div>
            <dt>Fallback mock</dt>
            <dd>{String(status?.config?.model_fallback_to_mock ?? '—')}</dd>
          </div>
          <div>
            <dt>Open-set thr</dt>
            <dd>{String(status?.config?.open_set_threshold ?? '—')}</dd>
          </div>
          <div>
            <dt>API</dt>
            <dd>
              <code>/models/status</code> · <code>/models/discovery</code> ·{' '}
              <code>/readyz</code>
            </dd>
          </div>
        </dl>
      </section>

      <section className="atelier-panel" style={{ marginTop: '1rem' }}>
        <h2>Cómo usarlo</h2>
        <ol className="ml-dash-howto">
          <li>
            Coloca checkpoints en{' '}
            <code>kaggle/kernel_output_v9/models/best.pt</code> o configura{' '}
            <code>MULTI_VIEW_WEIGHTS_PATH</code>.
          </li>
          <li>
            Reinicia el backend y pulsa <strong>Actualizar</strong> aquí.
          </li>
          <li>
            Identifica una seta: el panel «Cómo decide el modelo» refleja mock vs real.
          </li>
          <li>
            Si ves <code>real_multiview_v8</code>, hay pesos reales cargados (ConvNeXtV2-tiny +
            ArcFace). Sigue siendo solo orientación.
          </li>
        </ol>
        <p className="muted">
          Política: orientación solo. Un modelo real no autoriza consumo.
        </p>
      </section>
    </div>
  )
}

export default MlDashboardPage
