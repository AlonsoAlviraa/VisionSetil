/**
 * Mycology-only media — every URL comes from verified species photos
 * (Wikipedia / iNaturalist catalog), never generic landscape stock.
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
} as const

export type FeatureCardMedia = {
  title: string
  description: string
  to: string
  image: string
  cta: string
}

/** Home shows three primary paths. */
export const HOME_FEATURES: FeatureCardMedia[] = [
  {
    title: 'Identificar',
    description: 'Multi-vista y orientación de riesgo. Si duda, se calla.',
    to: '/identificar',
    image: MEDIA.identify,
    cta: 'Empezar',
  },
  {
    title: 'Enciclopedia',
    description: 'Fichas con fotos reales, nombres ES y calidad documentada.',
    to: '/enciclopedia',
    image: MEDIA.encyclopedia,
    cta: 'Explorar',
  },
  {
    title: 'Reto',
    description: 'Preguntados micológico: comestible, tóxica o mortal.',
    to: '/reto',
    image: MEDIA.risk,
    cta: 'Jugar',
  },
]
