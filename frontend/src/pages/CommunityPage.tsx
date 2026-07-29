/**
 * Community chat/feed: posts with photos + comments (login required to write).
 * Product UX — field feed, safety-first, not an identification service.
 */
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import {
  createComment,
  createPost,
  listPosts,
  type CommunityPost,
} from '../api/community'
import { EmptyState } from '../components/EmptyState'
import {
  authorInitials,
  communityConsensusChip,
  communityTextIsSafe,
  findForbiddenCommunityPhrase,
  relativeTime,
} from '../lib/communitySafety'

const BODY_MAX = 2000

export function CommunityPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage || i18n.language || 'es'
  const { user, token, isAuthenticated } = useAuth()
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [posting, setPosting] = useState(false)
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({})
  const [openComments, setOpenComments] = useState<Record<number, boolean>>({})

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listPosts(token)
      setPosts(data)
    } catch (e) {
      setPosts([])
      setError(
        e instanceof Error
          ? e.message
          : t('community.networkError', { defaultValue: 'Error de red' }),
      )
    } finally {
      setLoading(false)
    }
  }, [token, t])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!image) {
      setImagePreview(null)
      return
    }
    const url = URL.createObjectURL(image)
    setImagePreview(url)
    return () => URL.revokeObjectURL(url)
  }, [image])

  const bodyBlocked = useMemo(() => findForbiddenCommunityPhrase(body), [body])

  const onPost = async (e: FormEvent) => {
    e.preventDefault()
    if (!isAuthenticated) return
    if (bodyBlocked) {
      setError(
        t('community.blockedConsume', {
          defaultValue:
            'No se permiten consejos de consumo («{{phrase}}»). Este feed es solo orientación de campo.',
          phrase: bodyBlocked,
        }),
      )
      return
    }
    if (!communityTextIsSafe(body)) return
    setPosting(true)
    setError(null)
    try {
      await createPost(token, body, image)
      setBody('')
      setImage(null)
      await refresh()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('community.postFail', { defaultValue: 'No se pudo publicar' }),
      )
    } finally {
      setPosting(false)
    }
  }

  const onComment = async (postId: number) => {
    if (!isAuthenticated) return
    const text = (commentDrafts[postId] || '').trim()
    if (!text) return
    const bad = findForbiddenCommunityPhrase(text)
    if (bad) {
      setError(
        t('community.blockedComment', {
          defaultValue:
            'Comentario bloqueado: no se permiten frases de consumo («{{phrase}}»). Solo orientación.',
          phrase: bad,
        }),
      )
      return
    }
    try {
      await createComment(token, postId, text)
      setCommentDrafts((d) => ({ ...d, [postId]: '' }))
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo comentar')
    }
  }

  return (
    <div className="cn-page page-community page-atelier-shell" data-skin="campo-nocturno">
      <header className="mkt-page-head mkt-mesh">
        <p className="mkt-kicker">
          {t('community.kicker', { defaultValue: 'Comunidad' })}
        </p>
        <h1>{t('community.title', { defaultValue: 'Conversación de campo' })}</h1>
        <p>
          {t('community.subtitle', {
            defaultValue:
              'Observaciones y dudas entre aficionados. No sustituye a un micólogo ni identifica setas.',
          })}
        </p>
        <ul
          className="community-hero-chips"
          aria-label={t('community.noticesAria', { defaultValue: 'Avisos' })}
        >
          <li>
            {t('community.chipOrientation', { defaultValue: 'Solo orientación' })}
          </li>
          <li>
            {t('community.chipNoConsume', { defaultValue: 'Sin consejos de consumo' })}
          </li>
          <li>
            {t('community.chipAuth', {
              defaultValue: 'Lee sin cuenta · publica con login',
            })}
          </li>
        </ul>
      </header>

      <div className="feature-card-neo safety-disclaimer community-safety-banner" role="note">
        {t('community.banner', {
          defaultValue:
            'Opiniones de la comunidad, no certeza. Valida con un micólogo humano. Nunca uses este feed como permiso de consumo.',
        })}
      </div>

      <section
        className="atelier-panel community-consensus-strip"
        data-testid="community-consensus-strip"
        aria-label={t('community.consensusAria', {
          defaultValue: 'Consenso humano',
        })}
      >
        <p className="community-consensus-strip__title">
          {t('community.consensusTitle', {
            defaultValue: 'Consenso humano · nunca research-grade del modelo',
          })}
        </p>
        <p className="community-consensus-strip__body">
          {t('community.consensusBody', {
            defaultValue:
              'Este feed es segunda opinión de personas. No convierte una puntuación del modelo en ID verificada ni en permiso de consumo. Ante duda mortal → micólogo o revisión experta.',
          })}
        </p>
        <div className="community-consensus-strip__actions">
          <Link
            to="/revision-experta"
            className="btn-atelier btn-atelier--primary"
            data-testid="community-cta-expert"
          >
            {t('community.ctaExpert', { defaultValue: 'Revisión experta' })}
          </Link>
          <Link
            to="/educacion"
            className="btn-atelier btn-atelier--ghost"
            data-testid="community-cta-edu"
          >
            {t('nav.education', { defaultValue: 'Educación' })}
          </Link>
        </div>
      </section>

      <div
        className="atelier-panel community-multiview-tip"
        role="note"
        data-testid="community-multiview-tip"
      >
        <p style={{ margin: 0 }}>
          {t('community.multiviewTip', {
            defaultValue:
              'Si compartes fotos: prioriza láminas, perfil/pie y base (volva/anillo). Una sola foto de sombrero no basta para confusiones mortales — solo orientación, nunca consumo.',
          })}
        </p>
        <p style={{ margin: '0.45rem 0 0' }}>
          <Link to="/identificar" className="btn-atelier btn-atelier--ghost">
            {t('nav.identify', { defaultValue: 'Identificar multi-vista' })}
          </Link>{' '}
          <Link to="/lookalikes" className="btn-atelier btn-atelier--ghost">
            {t('nav.lookalikes', { defaultValue: 'Lookalikes' })}
          </Link>{' '}
          <Link to="/educacion" className="btn-atelier btn-atelier--ghost">
            {t('nav.education', { defaultValue: 'Educación' })}
          </Link>
        </p>
      </div>

      {!isAuthenticated ? (
        <div className="atelier-panel community-login-cta">
          <p>
            {t('community.loginCtaBefore', { defaultValue: 'Puedes' })}{' '}
            <strong>{t('community.loginCtaRead', { defaultValue: 'leer' })}</strong>{' '}
            {t('community.loginCtaMid', {
              defaultValue: 'el feed sin cuenta. Para publicar y comentar:',
            })}{' '}
            <Link to="/login" state={{ from: '/comunidad' }}>
              {t('community.loginLink', { defaultValue: 'inicia sesión' })}
            </Link>{' '}
            {t('community.loginCtaOr', { defaultValue: 'o' })}{' '}
            <Link to="/registro">
              {t('community.registerLink', { defaultValue: 'regístrate' })}
            </Link>
            .
          </p>
        </div>
      ) : (
        <form className="atelier-panel community-compose" onSubmit={onPost}>
          <p className="community-compose__as">
            {t('community.postingAs', { defaultValue: 'Publicando como' })}{' '}
            <strong>{user?.display_name || user?.username}</strong>
          </p>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
            placeholder={t('community.placeholder', {
              defaultValue:
                'Comparte una observación (hábitat, caracteres, duda)… sin consejos de consumo.',
            })}
            rows={3}
            required
            maxLength={BODY_MAX}
            aria-invalid={Boolean(bodyBlocked)}
          />
          <div className="community-compose__meta">
            <span className={body.length > BODY_MAX - 80 ? 'is-warn' : ''}>
              {body.length}/{BODY_MAX}
            </span>
            {bodyBlocked && (
              <span className="community-compose__block" role="alert">
                {bodyBlocked}
              </span>
            )}
          </div>
          <div className="community-compose__row">
            <label className="community-file">
              {t('community.attach', { defaultValue: 'Adjuntar foto' })}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setImage(e.target.files?.[0] || null)}
              />
            </label>
            {image && (
              <button
                type="button"
                className="btn-atelier btn-atelier--ghost"
                onClick={() => setImage(null)}
              >
                {t('community.removePhoto', { defaultValue: 'Quitar foto' })}
              </button>
            )}
            <button
              className="btn-atelier btn-atelier--primary"
              type="submit"
              disabled={posting || !body.trim() || Boolean(bodyBlocked)}
            >
              {posting
                ? t('community.publishing', { defaultValue: 'Publicando…' })
                : t('community.publish', { defaultValue: 'Publicar' })}
            </button>
          </div>
          {imagePreview && (
            <div className="community-compose__preview">
              <img src={imagePreview} alt="Vista previa de la foto a publicar" />
            </div>
          )}
        </form>
      )}

      {error && (
        <div className="community-error-panel" role="alert">
          <p>{error}</p>
          <button type="button" className="btn-atelier btn-atelier--ghost" onClick={() => void refresh()}>
            {t('actions.retry', { defaultValue: 'Reintentar' })}
          </button>
        </div>
      )}

      <div className="community-feed">
        {loading && (
          <div
            className="community-skeleton"
            aria-busy="true"
            aria-label={t('community.loadingAria', { defaultValue: 'Cargando feed' })}
          >
            <div className="community-skeleton__card" />
            <div className="community-skeleton__card" />
          </div>
        )}

        {!loading && error && posts.length === 0 && (
          <EmptyState
            className="empty-state-atelier"
            title={t('community.loadFail', { defaultValue: 'No se pudo cargar el feed' })}
            description={t('community.loadFailBody', {
              defaultValue:
                'El servidor de comunidad no responde. Puedes reintentar o volver más tarde.',
            })}
            actionLabel={t('actions.retry', { defaultValue: 'Reintentar' })}
            onAction={() => void refresh()}
          />
        )}

        {!loading && !error && posts.length === 0 && (
          <EmptyState
            className="empty-state-atelier"
            title={t('community.emptyTitle', {
              defaultValue: 'Aún no hay publicaciones',
            })}
            description={t('community.emptyBody', {
              defaultValue:
                'Sé el primero en compartir una observación de campo. Solo orientación — nunca uses el chat como permiso de consumo.',
            })}
            actionLabel={
              isAuthenticated
                ? undefined
                : t('nav.login', { defaultValue: 'Iniciar sesión' })
            }
            actionTo={isAuthenticated ? undefined : '/login'}
          />
        )}

        {posts.map((p) => {
          const initials = authorInitials(p.author.display_name || p.author.username)
          const commentsOpen = openComments[p.id] ?? p.comments.length <= 3
          const consensus = communityConsensusChip(p.body, p.comments?.length ?? 0)
          const consensusLabel = locale.toLowerCase().startsWith('en')
            ? consensus.labelEn
            : consensus.labelEs
          const consensusPolicy = locale.toLowerCase().startsWith('en')
            ? consensus.policyEn
            : consensus.policyEs
          return (
            <article
              key={p.id}
              className={`community-post community-post--photo ${p.image_url ? 'has-image' : ''}`}
            >
              {p.image_url && (
                <div className="community-post__bleed">
                  <img
                    src={p.image_url}
                    alt={t('community.photoAlt', {
                      defaultValue: 'Foto de campo de la comunidad',
                    })}
                    className="community-image"
                    loading="lazy"
                  />
                </div>
              )}
              <div className="community-post__body atelier-panel">
                <header className="community-post-head">
                  <span className="community-avatar" aria-hidden>
                    {initials}
                  </span>
                  <div className="community-post-head__text">
                    <strong>{p.author.display_name}</strong>
                    <span className="muted">
                      @{p.author.username} · {relativeTime(p.created_at, locale)}
                    </span>
                  </div>
                </header>
                <p
                  className={`community-consensus-chip community-consensus-chip--${consensus.cue}`}
                  data-testid="community-consensus-chip"
                  data-cue={consensus.cue}
                  title={consensusPolicy}
                >
                  {consensusLabel}
                </p>
                <p className="community-body">{p.body}</p>
                <p className="community-post-safety muted">
                  {p.safety_note ||
                    t('community.defaultSafetyNote', {
                      defaultValue:
                        'Opinión de aficionado · orientación solamente · no es identificación.',
                    })}
                </p>

                <div className="community-comments">
                  <button
                    type="button"
                    className="community-comments__toggle"
                    onClick={() =>
                      setOpenComments((o) => ({ ...o, [p.id]: !commentsOpen }))
                    }
                    aria-expanded={commentsOpen}
                  >
                    {t('community.comments', {
                      defaultValue: 'Comentarios ({{n}})',
                      n: p.comments.length,
                    })}
                    <span aria-hidden>{commentsOpen ? '▾' : '▸'}</span>
                  </button>
                  {commentsOpen && (
                    <>
                      <ul>
                        {p.comments.map((c) => (
                          <li key={c.id}>
                            <strong>@{c.author.username}</strong>
                            <span className="muted">
                              {' '}
                              · {relativeTime(c.created_at, locale)}
                            </span>
                            <p>{c.body}</p>
                          </li>
                        ))}
                      </ul>
                      {isAuthenticated && (
                        <div className="community-comment-form">
                          <input
                            value={commentDrafts[p.id] || ''}
                            onChange={(e) =>
                              setCommentDrafts((d) => ({
                                ...d,
                                [p.id]: e.target.value.slice(0, BODY_MAX),
                              }))
                            }
                            placeholder={t('community.commentPlaceholder', {
                              defaultValue: 'Comentar (sin consejos de consumo)…',
                            })}
                            maxLength={BODY_MAX}
                          />
                          <button
                            type="button"
                            className="btn-atelier btn-atelier--ghost"
                            onClick={() => void onComment(p.id)}
                            disabled={!(commentDrafts[p.id] || '').trim()}
                          >
                            {t('community.comment', { defaultValue: 'Comentar' })}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
