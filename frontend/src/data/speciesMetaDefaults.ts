/**
 * Educational meta defaults for encyclopedia / Setadle.
 * Season + Iberia presence are safe to default by genus/species.
 * Food/edibility: only explicit curated overrides or food_class from SSOT —
 * never invent "comestible" for unknown taxa.
 */

export type EducClass =
  | 'comestible'
  | 'no_comestible'
  | 'toxica'
  | 'mortal'
  | 'sin_documentar'

export type IberiaPresence =
  | 'Icono'
  | 'Frecuente'
  | 'Presente'
  | 'Mediterránea'
  | 'Atlántica'
  | 'Montaña'
  | 'Escasa'

/** Short fruiting season labels (Spain / Iberia educational). */
export const GENUS_SEASON: Record<string, string> = {
  Lactarius: 'Otoño',
  Lactifluus: 'Verano–otoño',
  Russula: 'Verano–otoño',
  Amanita: 'Verano–otoño',
  Boletus: 'Verano–otoño',
  Neoboletus: 'Verano–otoño',
  Rubroboletus: 'Verano–otoño',
  Suillellus: 'Verano–otoño',
  Caloboletus: 'Verano–otoño',
  Butyriboletus: 'Verano–otoño',
  Imleria: 'Verano–otoño',
  Leccinum: 'Verano–otoño',
  Xerocomellus: 'Verano–otoño',
  Xerocomus: 'Verano–otoño',
  Hortiboletus: 'Verano–otoño',
  Buchwaldoboletus: 'Verano–otoño',
  Pseudoboletus: 'Verano–otoño',
  Suillus: 'Verano–otoño',
  Cortinarius: 'Otoño',
  Tricholoma: 'Otoño–invierno',
  Hygrophorus: 'Otoño–invierno',
  Hygrocybe: 'Otoño',
  Cuphophyllus: 'Otoño',
  Agaricus: 'Primavera–otoño',
  Macrolepiota: 'Verano–otoño',
  Lepiota: 'Verano–otoño',
  Leucoagaricus: 'Verano–otoño',
  Chlorophyllum: 'Verano–otoño',
  Cystolepiota: 'Verano–otoño',
  Cantharellus: 'Verano–otoño',
  Craterellus: 'Otoño',
  Hydnum: 'Verano–otoño',
  Hydnellum: 'Otoño',
  Sarcodon: 'Otoño',
  Bankera: 'Otoño',
  Inocybe: 'Verano–otoño',
  Hebeloma: 'Otoño',
  Entoloma: 'Verano–otoño',
  Clitocybe: 'Otoño',
  Infundibulicybe: 'Otoño',
  Lepista: 'Otoño–invierno',
  Melanoleuca: 'Primavera–otoño',
  Calocybe: 'Primavera',
  Lyophyllum: 'Otoño',
  Morchella: 'Primavera',
  Verpa: 'Primavera',
  Gyromitra: 'Primavera',
  Helvella: 'Verano–otoño',
  Tuber: 'Invierno',
  Terfezia: 'Primavera',
  Pleurotus: 'Otoño–primavera',
  Armillaria: 'Otoño',
  Flammulina: 'Invierno',
  Hypholoma: 'Otoño',
  Pholiota: 'Otoño',
  Galerina: 'Todo el año',
  Gymnopilus: 'Otoño',
  Coprinus: 'Primavera–otoño',
  Coprinopsis: 'Primavera–otoño',
  Coprinellus: 'Primavera–otoño',
  Psathyrella: 'Primavera–otoño',
  Lacrymaria: 'Verano–otoño',
  Agrocybe: 'Primavera–otoño',
  Marasmius: 'Verano–otoño',
  Mycena: 'Otoño',
  Pluteus: 'Verano–otoño',
  Volvariella: 'Verano–otoño',
  Omphalotus: 'Otoño',
  Paxillus: 'Verano–otoño',
  Scleroderma: 'Verano–otoño',
  Lycoperdon: 'Verano–otoño',
  Bovista: 'Verano–otoño',
  Geastrum: 'Otoño',
  Astraeus: 'Todo el año',
  Sparassis: 'Verano–otoño',
  Hericium: 'Otoño',
  Ganoderma: 'Todo el año',
  Trametes: 'Todo el año',
  Fistulina: 'Verano–otoño',
  Laetiporus: 'Verano–otoño',
  Ramaria: 'Verano–otoño',
  Clavulina: 'Otoño',
  Auricularia: 'Invierno–primavera',
  Sarcoscypha: 'Invierno–primavera',
  Rhizopogon: 'Otoño',
  Chroogomphus: 'Otoño',
  Gomphidius: 'Otoño',
  Pisolithus: 'Otoño',
  Phallus: 'Verano–otoño',
  Clathrus: 'Verano–otoño',
  Schizophyllum: 'Todo el año',
  Stereum: 'Todo el año',
  Thelephora: 'Otoño',
  Crepidotus: 'Todo el año',
  Panellus: 'Otoño–invierno',
  Kuehneromyces: 'Otoño',
  Stropharia: 'Verano–otoño',
  Panaeolus: 'Primavera–otoño',
  Psilocybe: 'Otoño',
  Aleuria: 'Otoño',
  Peziza: 'Todo el año',
  Limacella: 'Verano–otoño',
  Oudemansiella: 'Otoño',
  Hymenopellis: 'Otoño',
  Xerula: 'Otoño',
  Gymnopus: 'Otoño',
  Rhodocollybia: 'Otoño',
  Megacollybia: 'Otoño',
  Collybia: 'Otoño',
  Lentinula: 'Otoño',
  Lentinus: 'Todo el año',
  Neolentinus: 'Todo el año',
  Polyporus: 'Primavera–otoño',
  Fomes: 'Todo el año',
  Piptoporus: 'Todo el año',
  Daedalea: 'Todo el año',
  Calvatia: 'Verano–otoño',
  Langermannia: 'Verano–otoño',
  Mutinus: 'Verano–otoño',
  Tremella: 'Invierno',
  Calocera: 'Todo el año',
  Dacrymyces: 'Todo el año',
  Tapinella: 'Otoño',
  Chalciporus: 'Verano–otoño',
  Gyroporus: 'Verano–otoño',
  Aureoboletus: 'Verano–otoño',
  Cyanoboletus: 'Verano–otoño',
  Rheubarbariboletus: 'Verano–otoño',
  Porphyrellus: 'Verano–otoño',
  Strobilomyces: 'Verano–otoño',
  Hemileccinum: 'Verano–otoño',
  Tylopilus: 'Verano–otoño',
  Phellodon: 'Otoño',
  Clavariadelphus: 'Otoño',
  Clavaria: 'Otoño',
  Cystoderma: 'Otoño',
  Cyclocybe: 'Otoño',
  Panus: 'Todo el año',
}

/** Extra genera → family (complements genusFamilyMap). */
export const EXTRA_GENUS_FAMILY: Record<string, string> = {
  melanoleuca: 'Tricholomataceae',
  hydnellum: 'Bankeraceae',
  leucoagaricus: 'Agaricaceae',
  lyophyllum: 'Lyophyllaceae',
  buchwaldoboletus: 'Boletaceae',
  calocybe: 'Lyophyllaceae',
  cuphophyllus: 'Hygrophoraceae',
  cystolepiota: 'Agaricaceae',
  pseudoboletus: 'Boletaceae',
  terfezia: 'Pezizaceae',
}

/**
 * Per-species overrides (educational). Only when confidently documented
 * in Iberian field guides / our curated DB. Do not mark unknown as comestible.
 */
export type SpeciesMetaOverride = {
  season?: string
  iberian?: IberiaPresence
  /** Only set when documented — never invent comestible */
  educ?: EducClass
  common_es?: string
}

export const SPECIES_META_OVERRIDES: Record<string, SpeciesMetaOverride> = {
  // ── Lactarius (Iberia) ──
  'lactarius deliciosus': {
    season: 'Otoño',
    iberian: 'Icono',
    educ: 'comestible',
    common_es: 'Nízcalo',
  },
  'lactarius sanguifluus': {
    season: 'Otoño',
    iberian: 'Icono',
    educ: 'comestible',
    common_es: 'Nízcalo de sangre',
  },
  'lactarius semisanguifluus': {
    season: 'Otoño',
    iberian: 'Frecuente',
    educ: 'comestible',
  },
  'lactarius quieticolor': {
    season: 'Otoño',
    iberian: 'Presente',
    educ: 'comestible',
  },
  'lactarius vinosus': {
    season: 'Otoño',
    iberian: 'Mediterránea',
    educ: 'comestible',
  },
  'lactarius salmonicolor': {
    season: 'Otoño',
    iberian: 'Montaña',
    educ: 'comestible',
  },
  'lactarius deterrimus': {
    season: 'Otoño',
    iberian: 'Montaña',
    educ: 'comestible',
  },
  'lactarius quietus': {
    season: 'Otoño',
    iberian: 'Presente',
    educ: 'no_comestible',
  },
  'lactarius chrysorrheus': {
    season: 'Otoño',
    iberian: 'Frecuente',
    educ: 'no_comestible',
    common_es: 'Lactario de látex amarillo',
  },
  'lactarius torminosus': {
    season: 'Otoño',
    iberian: 'Presente',
    educ: 'toxica',
    common_es: 'Níscalo de abedul',
  },
  'lactarius piperatus': {
    season: 'Verano–otoño',
    iberian: 'Presente',
    educ: 'no_comestible',
  },
  'lactarius vellereus': {
    season: 'Otoño',
    iberian: 'Presente',
    educ: 'no_comestible',
  },
  'lactarius blennius': {
    season: 'Otoño',
    iberian: 'Presente',
    educ: 'no_comestible',
  },
  'lactarius rufus': {
    season: 'Otoño',
    iberian: 'Presente',
    educ: 'no_comestible',
  },
  'lactarius controversus': {
    season: 'Otoño',
    iberian: 'Presente',
    educ: 'no_comestible',
  },
  'lactarius acerrimus': {
    season: 'Otoño',
    iberian: 'Mediterránea',
    educ: 'no_comestible',
  },
  'lactarius atlanticus': {
    season: 'Otoño',
    iberian: 'Atlántica',
    educ: 'no_comestible',
  },
  'lactarius decipiens': {
    season: 'Otoño',
    iberian: 'Presente',
    educ: 'no_comestible',
  },
  'lactarius zonarius': {
    season: 'Otoño',
    iberian: 'Mediterránea',
    educ: 'no_comestible',
  },
  'lactarius subumbonatus': {
    season: 'Otoño',
    iberian: 'Presente',
    educ: 'no_comestible',
  },
  'lactarius uvidus': {
    season: 'Otoño',
    iberian: 'Presente',
    educ: 'no_comestible',
  },
  'lactarius volemus': {
    season: 'Verano–otoño',
    iberian: 'Presente',
    educ: 'comestible',
  },
  'lactarius pyrogalus': {
    season: 'Otoño',
    iberian: 'Presente',
    educ: 'no_comestible',
  },
  'lactarius fuliginosus': {
    season: 'Otoño',
    iberian: 'Presente',
    educ: 'no_comestible',
  },
  'lactarius lignyotus': {
    season: 'Otoño',
    iberian: 'Montaña',
    educ: 'no_comestible',
  },
  'lactarius trivialis': {
    season: 'Otoño',
    iberian: 'Presente',
    educ: 'no_comestible',
  },
  'lactarius flexuosus': {
    season: 'Otoño',
    iberian: 'Presente',
    educ: 'no_comestible',
  },
  'lactarius hepaticus': {
    season: 'Otoño',
    iberian: 'Presente',
    educ: 'no_comestible',
  },
  'lactarius lacunarum': {
    season: 'Otoño',
    iberian: 'Presente',
    educ: 'no_comestible',
  },
  'lactarius mairei': {
    season: 'Otoño',
    iberian: 'Mediterránea',
    educ: 'no_comestible',
  },
  'lactarius cistophilus': {
    season: 'Otoño',
    iberian: 'Mediterránea',
    educ: 'no_comestible',
  },
  'lactarius rugatus': {
    season: 'Otoño',
    iberian: 'Mediterránea',
    educ: 'comestible',
  },
  'lactarius sanguifluus var. vinosus': {
    season: 'Otoño',
    iberian: 'Mediterránea',
    educ: 'comestible',
  },
  'lactarius fluens': {
    season: 'Otoño',
    iberian: 'Presente',
    educ: 'no_comestible',
  },
  'lactarius ilicis': {
    season: 'Otoño',
    iberian: 'Mediterránea',
    educ: 'no_comestible',
  },
  'lactarius ligyotus': {
    season: 'Otoño',
    iberian: 'Montaña',
    educ: 'no_comestible',
  },
  'lactarius pergamenus': {
    season: 'Otoño',
    iberian: 'Presente',
    educ: 'no_comestible',
  },
  'lactarius pterosporus': {
    season: 'Otoño',
    iberian: 'Presente',
    educ: 'no_comestible',
  },
  'lactarius rubrocinctus': {
    season: 'Otoño',
    iberian: 'Presente',
    educ: 'no_comestible',
  },
  'lactarius subdulcis': {
    season: 'Otoño',
    iberian: 'Frecuente',
    educ: 'no_comestible',
  },
  'lactarius tabidus': {
    season: 'Otoño',
    iberian: 'Presente',
    educ: 'no_comestible',
  },

  // ── Iconic Iberia ──
  'amanita caesarea': { season: 'Verano–otoño', iberian: 'Icono', educ: 'comestible' },
  'amanita phalloides': { season: 'Verano–otoño', iberian: 'Frecuente', educ: 'mortal' },
  'amanita muscaria': { season: 'Verano–otoño', iberian: 'Frecuente', educ: 'toxica' },
  'amanita pantherina': { season: 'Verano–otoño', iberian: 'Presente', educ: 'toxica' },
  'amanita ponderosa': { season: 'Primavera', iberian: 'Icono', educ: 'comestible' },
  'amanita proxima': { season: 'Otoño', iberian: 'Mediterránea', educ: 'mortal' },
  'boletus edulis': { season: 'Verano–otoño', iberian: 'Icono', educ: 'comestible' },
  'boletus aereus': { season: 'Verano–otoño', iberian: 'Icono', educ: 'comestible' },
  'boletus reticulatus': { season: 'Primavera–otoño', iberian: 'Frecuente', educ: 'comestible' },
  'cantharellus cibarius': { season: 'Verano–otoño', iberian: 'Icono', educ: 'comestible' },
  'craterellus cornucopioides': { season: 'Otoño', iberian: 'Frecuente', educ: 'comestible' },
  'hydnum repandum': { season: 'Verano–otoño', iberian: 'Frecuente', educ: 'comestible' },
  'morchella esculenta': { season: 'Primavera', iberian: 'Frecuente', educ: 'comestible' },
  'tuber melanosporum': { season: 'Invierno', iberian: 'Icono', educ: 'comestible' },
  'pleurotus ostreatus': { season: 'Otoño–primavera', iberian: 'Frecuente', educ: 'comestible' },
  'macrolepiota procera': { season: 'Verano–otoño', iberian: 'Frecuente', educ: 'comestible' },
  'agaricus campestris': { season: 'Primavera–otoño', iberian: 'Frecuente', educ: 'comestible' },
  'tricholoma portentosum': { season: 'Otoño–invierno', iberian: 'Icono', educ: 'comestible' },
  'tricholoma equestre': { season: 'Otoño–invierno', iberian: 'Presente', educ: 'toxica' },
  'galerina marginata': { season: 'Todo el año', iberian: 'Presente', educ: 'mortal' },
  'cortinarius orellanus': { season: 'Otoño', iberian: 'Presente', educ: 'mortal' },
  'cortinarius rubellus': { season: 'Otoño', iberian: 'Presente', educ: 'mortal' },
  'gyromitra esculenta': { season: 'Primavera', iberian: 'Presente', educ: 'mortal' },
  'omphalotus olearius': { season: 'Otoño', iberian: 'Mediterránea', educ: 'toxica' },
  'paxillus involutus': { season: 'Verano–otoño', iberian: 'Presente', educ: 'toxica' },
  'entoloma sinuatum': { season: 'Verano–otoño', iberian: 'Presente', educ: 'toxica' },
  'russula emetica': { season: 'Verano–otoño', iberian: 'Presente', educ: 'toxica' },
  'russula cyanoxantha': { season: 'Verano–otoño', iberian: 'Frecuente', educ: 'comestible' },
  'russula virescens': { season: 'Verano–otoño', iberian: 'Frecuente', educ: 'comestible' },
  'russula vesca': { season: 'Verano–otoño', iberian: 'Frecuente', educ: 'comestible' },
  'suillus luteus': { season: 'Otoño', iberian: 'Frecuente', educ: 'comestible' },
  'suillus granulatus': { season: 'Verano–otoño', iberian: 'Frecuente', educ: 'comestible' },
  'leccinum scabrum': { season: 'Verano–otoño', iberian: 'Presente', educ: 'comestible' },
  'imleria badia': { season: 'Verano–otoño', iberian: 'Frecuente', educ: 'comestible' },
  'lepista nuda': { season: 'Otoño–invierno', iberian: 'Frecuente', educ: 'comestible' },
  'calocybe gambosa': { season: 'Primavera', iberian: 'Frecuente', educ: 'comestible' },
  'marasmius oreades': { season: 'Primavera–otoño', iberian: 'Frecuente', educ: 'comestible' },
  'flammulina velutipes': { season: 'Invierno', iberian: 'Presente', educ: 'comestible' },
  'armillaria mellea': { season: 'Otoño', iberian: 'Frecuente', educ: 'comestible' },
  'fistulina hepatica': { season: 'Verano–otoño', iberian: 'Presente', educ: 'comestible' },
  'sparassis crispa': { season: 'Verano–otoño', iberian: 'Presente', educ: 'comestible' },
  'hericium erinaceus': { season: 'Otoño', iberian: 'Escasa', educ: 'comestible' },
  'terfezia arenaria': { season: 'Primavera', iberian: 'Mediterránea', educ: 'comestible' },
  'terfezia claveryi': { season: 'Primavera', iberian: 'Mediterránea', educ: 'comestible' },
}

/** Human labels for educational class (Setadle / UI). */
export const EDUC_CLASS_LABEL: Record<EducClass, string> = {
  comestible: 'Comestible (doc.)',
  no_comestible: 'No comestible',
  toxica: 'Tóxica',
  mortal: 'Mortal',
  sin_documentar: 'Sin documentar',
}

export function genusOf(taxon: string): string {
  return taxon.trim().split(/\s+/)[0] || ''
}

export function normTaxon(taxon: string): string {
  return taxon.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function seasonForGenus(genus: string): string {
  if (!genus) return 'Otoño'
  return GENUS_SEASON[genus] || GENUS_SEASON[genus.charAt(0).toUpperCase() + genus.slice(1)] || 'Otoño'
}

export function parseSeasonFromDescription(description: string | undefined | null): string | null {
  if (!description) return null
  const m = description.match(/Temporada:\s*([^.·;]+)/i)
  if (!m) return null
  const raw = m[1].trim()
  if (!raw || raw.length > 48) return null
  return raw.replace(/\s+/g, ' ')
}

/**
 * Iberia presence heuristic for catalog taxa (all are Iberia-layer entries).
 * Spanish vernacular ≠ scientific name → more likely "Frecuente"/"Icono".
 */
export function iberianHeuristic(
  taxon: string,
  commonNames: string[] | undefined,
  override?: IberiaPresence,
): IberiaPresence {
  if (override) return override
  const vern = (commonNames || []).filter(
    (n) => n && n.trim().toLowerCase() !== taxon.trim().toLowerCase(),
  )
  if (vern.length >= 4) return 'Icono'
  if (vern.length >= 1) return 'Frecuente'
  return 'Presente'
}

export function foodClassToEduc(
  food: string | null | undefined,
): EducClass | null {
  if (!food) return null
  const k = food.toLowerCase().trim()
  if (k === 'comestible' || k === 'excelente' || k === 'buen_comestible') return 'comestible'
  if (k === 'no_comestible' || k === 'no_recomendado' || k === 'comestible_con_cautela') {
    return 'no_comestible'
  }
  if (k === 'toxica' || k === 'toxico' || k === 'toxic') return 'toxica'
  if (k === 'mortal' || k === 'mortifero' || k === 'deadly') return 'mortal'
  if (k === 'desconocido' || k === 'unknown') return null
  return null
}
