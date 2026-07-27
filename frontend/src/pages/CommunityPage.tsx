/**
 * Community chat/feed: posts with photos + comments (login required to write).
 * Product UX — field feed, safety-first, not an identification service.
 */
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
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
  communityTextIsSafe,
  findForbiddenCommunityPhrase,
  relativeTimeEs,
} from '../lib/communitySafety'

const BODY_MAX = 2000

export function CommunityPage() {
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
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setLoading(false)
    }
  }, [token])

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
        `No se permiten consejos de consumo («${bodyBlocked}»). Este feed es solo orientación de campo.`,
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
      setError(err instanceof Error ? err.message : 'No se pudo publicar')
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
        `Comentario bloqueado: no se permiten frases de consumo («${bad}»). Solo orientación.`,
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
    <div className="page-community page-atelier-shell">
      <header className="mkt-page-head mkt-mesh">
        <p className="mkt-kicker">Comunidad</p>
        <h1>Conversación de campo</h1>
        <p>
          Observaciones y dudas entre aficionados. No sustituye a un micólogo ni identifica setas.
        </p>
        <ul className="community-hero-chips" aria-label="Avisos">
          <li>Solo orientación</li>
          <li>Sin consejos de consumo</li>
          <li>Lee sin cuenta · publica con login</li>
        </ul>
      </header>

      <div className="feature-card-neo safety-disclaimer community-safety-banner" role="note">
        Opiniones de la comunidad, no certeza. Valida con un micólogo humano. Nunca uses este feed
        como permiso de consumo.
      </div>

      {!isAuthenticated ? (
        <div className="atelier-panel community-login-cta">
          <p>
            Puedes <strong>leer</strong> el feed sin cuenta. Para publicar y comentar:{' '}
            <Link to="/login" state={{ from: '/comunidad' }}>
              inicia sesión
            </Link>{' '}
            o <Link to="/registro">regístrate</Link>.
          </p>
        </div>
      ) : (
        <form className="atelier-panel community-compose" onSubmit={onPost}>
          <p className="community-compose__as">
            Publicando como <strong>{user?.display_name || user?.username}</strong>
          </p>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
            placeholder="Comparte una observación (hábitat, caracteres, duda)… sin consejos de consumo."
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
                Frase no permitida: «{bodyBlocked}»
              </span>
            )}
          </div>
          <div className="community-compose__row">
            <label className="community-file">
              Adjuntar foto
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
                Quitar foto
              </button>
            )}
            <button
              className="btn-atelier btn-atelier--primary"
              type="submit"
              disabled={posting || !body.trim() || Boolean(bodyBlocked)}
            >
              {posting ? 'Publicando…' : 'Publicar'}
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
            Reintentar
          </button>
        </div>
      )}

      <div className="community-feed">
        {loading && (
          <div className="community-skeleton" aria-busy="true" aria-label="Cargando feed">
            <div className="community-skeleton__card" />
            <div className="community-skeleton__card" />
          </div>
        )}

        {!loading && error && posts.length === 0 && (
          <EmptyState
            className="empty-state-atelier"
            title="No se pudo cargar el feed"
            description="El servidor de comunidad no responde. Puedes reintentar o volver más tarde. El resto de la app sigue disponible."
            actionLabel="Reintentar"
            onAction={() => void refresh()}
          />
        )}

        {!loading && !error && posts.length === 0 && (
          <EmptyState
            className="empty-state-atelier"
            title="Aún no hay publicaciones"
            description="Sé el primero en compartir una observación de campo. Solo orientación — nunca uses el chat como permiso de consumo."
            actionLabel={isAuthenticated ? undefined : 'Iniciar sesión'}
            actionTo={isAuthenticated ? undefined : '/login'}
          />
        )}

        {posts.map((p) => {
          const initials = authorInitials(p.author.display_name || p.author.username)
          const commentsOpen = openComments[p.id] ?? p.comments.length <= 3
          return (
            <article
              key={p.id}
              className={`community-post community-post--photo ${p.image_url ? 'has-image' : ''}`}
            >
              {p.image_url && (
                <div className="community-post__bleed">
                  <img
                    src={p.image_url}
                    alt="Foto de campo de la comunidad"
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
                      @{p.author.username} · {relativeTimeEs(p.created_at)}
                    </span>
                  </div>
                </header>
                <p className="community-body">{p.body}</p>
                <p className="community-post-safety muted">
                  {p.safety_note ||
                    'Opinión de aficionado · orientación solamente · no es identificación.'}
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
                    Comentarios ({p.comments.length})
                    <span aria-hidden>{commentsOpen ? '▾' : '▸'}</span>
                  </button>
                  {commentsOpen && (
                    <>
                      <ul>
                        {p.comments.map((c) => (
                          <li key={c.id}>
                            <strong>@{c.author.username}</strong>
                            <span className="muted"> · {relativeTimeEs(c.created_at)}</span>
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
                            placeholder="Comentar (sin consejos de consumo)…"
                            maxLength={BODY_MAX}
                          />
                          <button
                            type="button"
                            className="btn-atelier btn-atelier--ghost"
                            onClick={() => void onComment(p.id)}
                            disabled={!(commentDrafts[p.id] || '').trim()}
                          >
                            Comentar
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
