/**
 * Community chat/feed: posts with photos + comments (login required to write).
 */
import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import {
  createComment,
  createPost,
  listPosts,
  type CommunityPost,
} from '../api/community'
import { MEDIA } from '../data/media'
import { EmptyState } from '../components/EmptyState'

export function CommunityPage() {
  const { user, token, isAuthenticated } = useAuth()
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const [posting, setPosting] = useState(false)
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({})

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listPosts(token)
      setPosts(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const onPost = async (e: FormEvent) => {
    e.preventDefault()
    if (!token) return
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
    if (!token) return
    const text = (commentDrafts[postId] || '').trim()
    if (!text) return
    try {
      await createComment(token, postId, text)
      setCommentDrafts((d) => ({ ...d, [postId]: '' }))
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo comentar')
    }
  }

  return (
    <div className="page-community">
      <div className="atelier-banner">
        <div
          className="atelier-banner__media"
          style={{ backgroundImage: `url(${MEDIA.community})` }}
        />
        <div className="atelier-banner__veil" />
        <div className="atelier-banner__copy">
          <h1>Comunidad</h1>
          <p>
            Fotos reales, conversación serena. Opiniones de aficionados — no sustituyen a un
            micólogo.
          </p>
        </div>
      </div>

      <div className="feature-card-neo safety-disclaimer" role="note">
        Opiniones de la comunidad, no certeza. Valida con un micólogo.
      </div>

      {!isAuthenticated ? (
        <div className="atelier-panel" style={{ marginTop: '1rem' }}>
          <p>
            Para publicar y comentar necesitas cuenta.{' '}
            <Link to="/login" state={{ from: '/comunidad' }}>
              Inicia sesión
            </Link>{' '}
            o <Link to="/registro">regístrate</Link>.
          </p>
        </div>
      ) : (
        <form className="atelier-panel community-compose" onSubmit={onPost}>
          <p>
            Publicando como <strong>{user?.display_name || user?.username}</strong>
          </p>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Comparte una observación (sin consejos de consumo)…"
            rows={3}
            required
            maxLength={2000}
          />
          <label className="community-file">
            Adjuntar foto
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setImage(e.target.files?.[0] || null)}
            />
          </label>
          {image && <p className="muted">Archivo: {image.name}</p>}
          <button
            className="btn-atelier btn-atelier--primary"
            type="submit"
            disabled={posting || !body.trim()}
          >
            {posting ? 'Publicando…' : 'Publicar'}
          </button>
        </form>
      )}

      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}

      <div className="community-feed">
        {loading && <p className="muted">Cargando feed…</p>}
        {!loading && posts.length === 0 && (
          <EmptyState
            title="Aún no hay publicaciones"
            description="Sé el primero en compartir una observación de campo — sin consejos de consumo."
            actionLabel={isAuthenticated ? undefined : 'Iniciar sesión'}
            actionTo={isAuthenticated ? undefined : '/login'}
          />
        )}
        {posts.map((p) => (
          <article
            key={p.id}
            className={`community-post community-post--photo ${p.image_url ? 'has-image' : ''}`}
          >
            {p.image_url && (
              <div className="community-post__bleed">
                <img src={p.image_url} alt="Foto de campo de la comunidad" className="community-image" />
              </div>
            )}
            <div className="community-post__body atelier-panel">
              <header className="community-post-head">
                <strong>{p.author.display_name}</strong>
                <span className="muted">@{p.author.username}</span>
                <time className="muted">{new Date(p.created_at).toLocaleString()}</time>
              </header>
              <p className="community-body">{p.body}</p>
              <div className="community-comments">
                <h4>Comentarios ({p.comments.length})</h4>
                <ul>
                  {p.comments.map((c) => (
                    <li key={c.id}>
                      <strong>@{c.author.username}</strong>: {c.body}
                    </li>
                  ))}
                </ul>
                {isAuthenticated && token && (
                  <div className="community-comment-form">
                    <input
                      value={commentDrafts[p.id] || ''}
                      onChange={(e) =>
                        setCommentDrafts((d) => ({ ...d, [p.id]: e.target.value }))
                      }
                      placeholder="Escribe un comentario…"
                      maxLength={2000}
                    />
                    <button
                      type="button"
                      className="btn-atelier btn-atelier--ghost"
                      onClick={() => void onComment(p.id)}
                    >
                      Comentar
                    </button>
                  </div>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
