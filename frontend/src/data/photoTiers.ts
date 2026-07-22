/**
 * Photo load tiers for VisionSetil encyclopedia / image pipeline (Week 1).
 * T0 = hero / iconic · T1 = known Spain + high-risk · T2 = rest (placeholder on grid).
 * Pure data + pure functions — unit-tested without React or network.
 */

export type PhotoTier = 'T0' | 'T1' | 'T2'

/** Where the image is shown — gates async wiki/iNat upgrades. */
export type ImageLoadContext = 'grid' | 'detail' | 'eager'

/**
 * T0 — hero shots (Iberian icons + classic education taxa).
 * Keep short: home banners, first-paint favorites.
 */
export const PHOTO_TIER_T0: readonly string[] = [
  'Amanita muscaria',
  'Amanita phalloides',
  'Amanita caesarea',
  'Boletus edulis',
  'Cantharellus cibarius',
  'Macrolepiota procera',
  'Morchella esculenta',
  'Coprinus comatus',
  'Pleurotus ostreatus',
  'Lactarius deliciosus',
  'Hypholoma fasciculare',
  'Agaricus campestris',
  'Amanita pantherina',
  'Galerina marginata',
  'Gyromitra esculenta',
  'Russula emetica',
  'Boletus aereus',
  'Craterellus cornucopioides',
  'Hydnum repandum',
  'Leccinum scabrum',
]

/**
 * T1 — known in Spain / popular field taxa + remaining high-risk.
 * (Deadly/poisonous not already in T0 are force-promoted in getPhotoTier.)
 */
export const PHOTO_TIER_T1: readonly string[] = [
  'Agaricus bisporus',
  'Agaricus xanthodermus',
  'Amanita citrina',
  'Amanita gemmata',
  'Amanita ovoidea',
  'Amanita rubescens',
  'Amanita vaginata',
  'Armillaria mellea',
  'Calocybe gambosa',
  'Cantharellus pallens',
  'Chlorophyllum molybdites',
  'Clitocybe nebularis',
  'Clitocybe rivulosa',
  'Coprinopsis atramentaria',
  'Cortinarius orellanus',
  'Cortinarius rubellus',
  'Cortinarius speciosissimus',
  'Cyclocybe aegerita',
  'Entoloma sinuatum',
  'Fistulina hepatica',
  'Flammulina velutipes',
  'Gomphus clavatus',
  'Grifola frondosa',
  'Gymnopilus junonius',
  'Gyromitra infula',
  'Hericium erinaceus',
  'Hygrophorus marzuolus',
  'Imleria badia',
  'Inocybe erubescens',
  'Kuehneromyces mutabilis',
  'Lactarius sanguifluus',
  'Lactarius semisanguifluus',
  'Lepiota cristata',
  'Lepiota helveola',
  'Lepista nuda',
  'Lycoperdon perlatum',
  'Macrolepiota rhacodes',
  'Marasmius oreades',
  'Morchella elata',
  'Omphalotus olearius',
  'Paxillus involutus',
  'Pholiota squarrosa',
  'Pleurotus eryngii',
  'Pluteus cervinus',
  'Psathyrella candolleana',
  'Ramaria flava',
  'Russula cyanoxantha',
  'Russula virescens',
  'Scleroderma citrinum',
  'Sparassis crispa',
  'Suillus luteus',
  'Tricholoma equestre',
  'Tricholoma portentosum',
  'Tricholoma terreum',
  'Tuber melanosporum',
  'Volvariella gloiocephala',
  'Xerocomellus chrysenteron',
  // Additional Iberian / market-known
  'Agaricus arvensis',
  'Agaricus sylvaticus',
  'Amanita fulva',
  'Amanita junquillea',
  'Boletus reticulatus',
  'Cantharellus friesii',
  'Craterellus lutescens',
  'Hydnum rufescens',
  'Lactarius quietus',
  'Leccinum aurantiacum',
  'Macrolepiota mastoidea',
  'Phallus impudicus',
  'Piptoporus betulinus',
  'Sarcoscypha coccinea',
  'Suillus granulatus',
  'Tricholoma sulphureum',
  'Amanita virosa',
  'Amanita verna',
  'Amanita porphyria',
  'Galerina autumnalis',
  'Hebeloma crustuliniforme',
  'Inocybe geophylla',
  'Mycena pura',
  'Psilocybe semilanceata',
]

const T0_SET = new Set(PHOTO_TIER_T0.map((t) => t.toLowerCase()))
const T1_SET = new Set(PHOTO_TIER_T1.map((t) => t.toLowerCase()))

/** High-risk labels always at least T1 (education + safety visibility). */
const HIGH_RISK = new Set(['deadly', 'poisonous', 'toxic', 'critical'])

export function normalizeTaxonKey(taxon: string): string {
  return taxon.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Assign photo tier for a taxon.
 * Priority: explicit T0 → explicit T1 → high-risk → T2.
 */
export function getPhotoTier(
  taxon: string,
  riskLabel?: string | null,
): PhotoTier {
  const key = normalizeTaxonKey(taxon || '')
  if (!key || key === 'fungi') return 'T2'
  if (T0_SET.has(key)) return 'T0'
  if (T1_SET.has(key)) return 'T1'
  const risk = (riskLabel || '').toLowerCase().trim()
  if (HIGH_RISK.has(risk)) return 'T1'
  return 'T2'
}

/**
 * Whether the image pipeline may call remote resolvers (Wikipedia / iNaturalist).
 * Grid never upgrades over the network; detail/eager may.
 * Catalog (sync) URLs are separate — see `shouldUseCatalogUrlOnGrid`.
 */
export function shouldAllowRemotePhotoResolve(
  _tier: PhotoTier,
  context: ImageLoadContext,
): boolean {
  // All tiers: grid never upgrades over the network (catalog URLs gated separately).
  void _tier
  if (context === 'grid') return false
  if (context === 'detail' || context === 'eager') return true
  return false
}

/**
 * On encyclopedia grid: only T0/T1 may show verified catalog photo URLs.
 * T2 always uses local SVG placeholder until detail/eager.
 */
export function shouldUseCatalogUrlOnGrid(tier: PhotoTier): boolean {
  return tier === 'T0' || tier === 'T1'
}

/** Bound for concurrent remote upgrades / catalog img loads on first encyclopedia paint. */
export const ENCYCLOPEDIA_FIRST_PAGE_SIZE = 16

export function photoTierStats(taxons: Array<{ taxon: string; risk_label?: string }>) {
  let t0 = 0
  let t1 = 0
  let t2 = 0
  for (const s of taxons) {
    const t = getPhotoTier(s.taxon, s.risk_label)
    if (t === 'T0') t0 += 1
    else if (t === 'T1') t1 += 1
    else t2 += 1
  }
  return { t0, t1, t2, total: taxons.length }
}
