/**
 * Open educational links (Wikipedia + iNaturalist) for a scientific name.
 * Pattern borrowed from iNat / Wiki encyclopedias — no copyright scrape.
 * Never consumption permission.
 */

export type OpenStudyLink = {
  id: 'wikipedia' | 'inaturalist' | 'gbif'
  labelEs: string
  labelEn: string
  href: string
}

export function wikipediaSpeciesUrl(taxon: string, lang: 'es' | 'en' = 'es'): string {
  const title = taxon.trim().replace(/\s+/g, '_')
  const host = lang === 'es' ? 'es.wikipedia.org' : 'en.wikipedia.org'
  return `https://${host}/wiki/${encodeURIComponent(title)}`
}

export function inaturalistTaxonSearchUrl(taxon: string): string {
  const q = encodeURIComponent(taxon.trim())
  return `https://www.inaturalist.org/taxa/search?q=${q}`
}

export function gbifSpeciesSearchUrl(taxon: string): string {
  const q = encodeURIComponent(taxon.trim())
  return `https://www.gbif.org/species/search?q=${q}`
}

export function openStudyLinksForTaxon(
  taxon: string,
  locale = 'es',
): OpenStudyLink[] {
  const name = (taxon || '').trim()
  if (!name) return []
  const wikiLang = locale.toLowerCase().startsWith('en') ? 'en' : 'es'
  return [
    {
      id: 'wikipedia',
      labelEs: 'Wikipedia',
      labelEn: 'Wikipedia',
      href: wikipediaSpeciesUrl(name, wikiLang),
    },
    {
      id: 'inaturalist',
      labelEs: 'iNaturalist (observaciones)',
      labelEn: 'iNaturalist (observations)',
      href: inaturalistTaxonSearchUrl(name),
    },
    {
      id: 'gbif',
      labelEs: 'GBIF (distribución)',
      labelEn: 'GBIF (distribution)',
      href: gbifSpeciesSearchUrl(name),
    },
  ]
}

/** Curated global resources (top educational sites) — Más hub. */
export const WORLD_MUSHROOM_RESOURCES: ReadonlyArray<{
  id: string
  name: string
  href: string
  blurbEs: string
  blurbEn: string
}> = [
  {
    id: 'inat',
    name: 'iNaturalist',
    href: 'https://www.inaturalist.org/',
    blurbEs: 'Comunidad y observaciones con fotos reales',
    blurbEn: 'Community observations with real photos',
  },
  {
    id: 'first-nature',
    name: 'First Nature',
    href: 'https://www.first-nature.com/fungi/',
    blurbEs: 'Guía europea por familias e índice ordenable',
    blurbEn: 'European family guide and sortable index',
  },
  {
    id: 'mushroomexpert',
    name: 'MushroomExpert',
    href: 'https://www.mushroomexpert.com/',
    blurbEs: 'Claves y fichas de campo (Norteamérica)',
    blurbEn: 'Keys and field notes (North America)',
  },
  {
    id: 'wiki',
    name: 'Wikipedia · Fungi',
    href: 'https://es.wikipedia.org/wiki/Fungi',
    blurbEs: 'Enciclopedia abierta y enlaces a Commons',
    blurbEn: 'Open encyclopedia and Commons links',
  },
  {
    id: 'commons',
    name: 'Wikimedia Commons',
    href: 'https://commons.wikimedia.org/wiki/Category:Fungi',
    blurbEs: 'Fotos reutilizables con licencia abierta',
    blurbEn: 'Reusable photos under open licenses',
  },
  {
    id: 'gbif',
    name: 'GBIF',
    href: 'https://www.gbif.org/',
    blurbEs: 'Datos abiertos de presencia (no forraje)',
    blurbEn: 'Open occurrence data (not foraging)',
  },
  {
    id: 'index-fungorum',
    name: 'Index Fungorum',
    href: 'https://www.indexfungorum.org/',
    blurbEs: 'Nomenclatura de referencia (solo nombres)',
    blurbEn: 'Reference nomenclature (names only)',
  },
  {
    id: 'mycobank',
    name: 'MycoBank',
    href: 'https://www.mycobank.org/',
    blurbEs: 'Base taxonómica micológica',
    blurbEn: 'Mycological taxonomic database',
  },
  {
    id: 'mushroom-observer',
    name: 'Mushroom Observer',
    href: 'https://mushroomobserver.org/',
    blurbEs: 'Observaciones fotográficas de aficionados',
    blurbEn: 'Community photographic observations',
  },
  {
    id: 'seek',
    name: 'Seek by iNaturalist',
    href: 'https://www.inaturalist.org/pages/seek_app',
    blurbEs: 'App educativa (no es permiso de consumo)',
    blurbEn: 'Educational app (not consumption permission)',
  },
]
