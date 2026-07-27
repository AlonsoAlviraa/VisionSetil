/**
 * Mycology-only media — verified species photos / placeholders.
 */
import { mycologyHeroUrls } from '../lib/speciesImageService'
import { getCatalogPhotoUrl } from '../lib/speciesImageService'
import { mycologyPlaceholderDataUri } from './mycologyPlaceholder'

const heroes = mycologyHeroUrls(8)

function photo(taxon: string): string {
  return getCatalogPhotoUrl(taxon) || mycologyPlaceholderDataUri(taxon)
}

export const MEDIA = {
  heroForest: heroes[0] || photo('Amanita muscaria'),
  mistCanopy: heroes[1] || photo('Amanita phalloides'),
  mossFloor: heroes[2] || photo('Boletus edulis'),
  mushroomsClose: photo('Amanita muscaria'),
  redMushroom: photo('Amanita muscaria'),
  autumnPath: heroes[3] || photo('Macrolepiota procera'),
  dewLeaves: heroes[4] || photo('Cantharellus cibarius'),
  identify: photo('Boletus edulis'),
  community: photo('Cantharellus cibarius'),
  encyclopedia: photo('Macrolepiota procera'),
  risk: photo('Amanita phalloides'),
  setadle: photo('Amanita muscaria'),
  map: photo('Macrolepiota procera'),
} as const

export type FeatureCardMedia = {
  title: string
  description: string
  to: string
  image: string
  cta: string
  badge?: string
}

/** Home product pillars — sell the loop. */
export const HOME_FEATURES: FeatureCardMedia[] = [
  {
    title: 'Identificar',
    description: 'Multi-vista con IA honesta. Si el modelo duda, se abstiene — mejor que inventar.',
    to: '/identificar',
    image: MEDIA.identify,
    cta: 'Empezar identificación →',
    badge: 'Campo',
  },
  {
    title: 'Enciclopedia',
    description: '520 taxones, fotos reales y riesgo claro. Fichas listas para estudiar.',
    to: '/enciclopedia',
    image: MEDIA.encyclopedia,
    cta: 'Explorar catálogo →',
    badge: 'Catálogo',
  },
  {
    title: 'Setadle',
    description: 'Adivina la seta del día al estilo LoLdle. Cinco modos que enganchan.',
    to: '/setadle',
    image: MEDIA.setadle,
    cta: 'Jugar al diario →',
    badge: 'Nuevo',
  },
  {
    title: 'Lookalikes',
    description: 'Confusiones clásicas: oronja vs mortal, níscalo vs riesgos. Compara lado a lado.',
    to: '/lookalikes',
    image: MEDIA.risk,
    cta: 'Comparar confusiones →',
    badge: 'Estudio',
  },
]
