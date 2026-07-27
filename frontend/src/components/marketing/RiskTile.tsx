/** Premium risk tile for deadly strip — silhouette + label, no random photos. */
import { Link } from 'react-router-dom'

type Props = {
  slug: string
  name: string
  taxon: string
  risk?: 'deadly' | 'poisonous' | 'caution'
}

export function RiskTile({ slug, name, taxon, risk = 'deadly' }: Props) {
  return (
    <Link
      to={`/enciclopedia/${slug}`}
      className={`mkt-risk-tile mkt-risk-tile--${risk}`}
      title={`${name} — ${taxon}`}
    >
      <span className="mkt-risk-tile__sil" aria-hidden />
      <span className="mkt-risk-tile__badge">{risk === 'deadly' ? 'Mortal' : 'Riesgo'}</span>
      <span className="mkt-risk-tile__name">{name}</span>
      <em className="mkt-risk-tile__taxon">{taxon}</em>
    </Link>
  )
}
