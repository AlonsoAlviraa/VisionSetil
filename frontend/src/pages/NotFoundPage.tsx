/** 404 — friendly atelier empty. */
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { IconMushroom } from '../components/icons'

export function NotFoundPage() {
  return (
    <div className="page-404 page-atelier-shell">
      <EmptyState
        title="Página no encontrada"
        description="Esa ruta no existe en VisionSetil. Vuelve al inicio o identifica una seta."
        icon={<IconMushroom size={32} />}
        actionLabel="Ir al inicio"
        actionTo="/"
      />
      <div className="page-404__links">
        <Link to="/identificar" className="btn-atelier btn-atelier--primary">
          Identificar
        </Link>
        <Link to="/enciclopedia" className="btn-atelier btn-atelier--ghost">
          Enciclopedia
        </Link>
        <Link to="/reto" className="btn-atelier btn-atelier--ghost">
          Reto
        </Link>
      </div>
    </div>
  )
}

export default NotFoundPage
