/** Documented food-quality chip — only when registry has real data. */
import { getFoodQuality, type FoodClass } from '../lib/foodQuality'

type Props = {
  taxon?: string | null
  foodClass?: FoodClass | null
  label?: string
  className?: string
  compact?: boolean
}

export function FoodQualityChip({ taxon, foodClass, label, className = '', compact }: Props) {
  const rec = foodClass
    ? { food_class: foodClass, label: label || foodClass }
    : taxon
      ? getFoodQuality(taxon)
      : null
  if (!rec) return null
  const cls = 'food_class' in rec && typeof rec.food_class === 'string' ? rec.food_class : foodClass
  const text = label || ('label' in rec ? rec.label : String(cls))
  return (
    <span
      className={`food-q-chip food-q-chip--${cls} ${compact ? 'food-q-chip--compact' : ''} ${className}`.trim()}
      title="Calidad documentada en fuentes curadas — no es permiso de consumo"
    >
      <span className="food-q-chip__dot" aria-hidden="true" />
      {text}
    </span>
  )
}
