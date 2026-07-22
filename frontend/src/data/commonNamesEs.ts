/**
 * Spanish common names for catalog taxa missing local names.
 * Educational only — never consumption guidance.
 * Bulk S3 expansions (synonyms + missing taxa) merge over base keys.
 */
import { COMMON_NAMES_ES_BULK } from './commonNamesEsBulk'

const COMMON_NAMES_ES_BASE: Record<string, string[]> = {
  'agaricus augustus': ['Champiñón de los príncipes'],
  'agaricus bitorquis': ['Champiñón de los caminos'],
  'agaricus langei': ['Champiñón de Lange'],
  'agaricus moelleri': ['Champiñón de Möller'],
  'agaricus sylvaticus': ['Champiñón silvícola'],
  'agaricus sylvicola': ['Champiñón de bosque'],
  'agaricus xanthodermus': ['Champiñón amarilleante'],
  'agrocybe pediades': ['Agrocibe de prado'],
  'agrocybe praecox': ['Agrocibe precoz'],
  'amanita citrina': ['Amanita citrina', 'Oronja citrina'],
  'amanita crocea': ['Amanita azafranada'],
  'amanita echinocephala': ['Amanita equinocéfala'],
  'amanita excelsa': ['Amanita excelsa'],
  'amanita franchetii': ['Amanita de Franchet'],
  'amanita fulva': ['Amanita fulva', 'Trompeta de los muertos anaranjada'],
  'amanita gemmata': ['Amanita gemmata'],
  'amanita junquillea': ['Amanita junquillea'],
  'amanita ovoidea': ['Oronja ovoidea'],
  'amanita porphyria': ['Amanita porfiria'],
  'amanita spissa': ['Amanita spissa'],
  'amanita strobiliformis': ['Amanita strobiliforme'],
  'amanita vaginata': ['Amanita envainada', 'Griseta'],
  'boletus appendiculatus': ['Boleto apendiculado'],
  'boletus calopus': ['Boleto de pie hermoso'],
  'boletus erythropus': ['Boleto de pie rojo'],
  'boletus impolitus': ['Boleto impolítico'],
  'boletus legaliae': ['Boleto de Legal'],
  'boletus luridiformis': ['Boleto luridiforme'],
  'boletus reticulatus': ['Boleto reticulado'],
  'boletus rhodoxanthus': ['Boleto rojizo'],
  'boletus subtomentosus': ['Boleto subtomentoso'],
  'cantharellus amethysteus': ['Rebozuelo amatista'],
  'cantharellus friesii': ['Rebozuelo de Fries'],
  'cantharellus pallens': ['Rebozuelo pálido'],
  'chlorophyllum brunneum': ['Parasol de escamas marrones'],
  'chlorophyllum molybdites': ['Parasol de esporas verdes'],
  'clitocybe geotropa': ['Clitocibe geotropo'],
  'clitocybe nebularis': ['Clitocibe nebular'],
  'clitocybe odora': ['Clitocibe oloroso'],
  'clitocybe rivulosa': ['Clitocibe surcado'],
  'coprinellus disseminatus': ['Coprino diseminado'],
  'coprinellus micaceus': ['Coprino micáceo'],
  'coprinopsis atramentaria': ['Coprino tinta', 'Matacandil'],
  'cortinarius armillatus': ['Cortinario armillado'],
  'cortinarius caerulescens': ['Cortinario azulado'],
  'cortinarius caperatus': ['Cortinario arrugado'],
  'cortinarius cinnamomeus': ['Cortinario canela'],
  'cortinarius collinitus': ['Cortinario viscoso'],
  'cortinarius elegantior': ['Cortinario elegante'],
  'cortinarius glaucopus': ['Cortinario de pie glauco'],
  'cortinarius largus': ['Cortinario largo'],
  'cortinarius mucosus': ['Cortinario mucoso'],
  'cortinarius purpurascens': ['Cortinario purpuráceo'],
  'cortinarius semisanguineus': ['Cortinario semisanguíneo'],
  'cortinarius speciosissimus': ['Cortinario preciosísimo'],
  'cortinarius traganus': ['Cortinario trágico'],
  'cortinarius triumphans': ['Cortinario triunfante'],
  'cortinarius violaceus': ['Cortinario violáceo'],
  'craterellus lutescens': ['Trompeta amarillenta'],
  'cyclocybe aegerita': ['Seta de chopo'],
  'cyclocybe cylindracea': ['Seta de chopo cilíndrica'],
  'entoloma clypeatum': ['Entoloma clypeado'],
  'entoloma rhodopolium': ['Entoloma rojizo'],
  'entoloma sericeum': ['Entoloma sedoso'],
  'galerina hypnorum': ['Galerina de musgos'],
  'galerina unicolor': ['Galerina unicolor'],
  'gymnopilus junonius': ['Gymnopilus juno'],
  'gymnopilus penetrans': ['Gymnopilus penetrante'],
  'hebeloma crustuliniforme': ['Hebeloma crosta'],
  'hebeloma sinapizans': ['Hebeloma mostaza'],
  'hydnum albidum': ['Lengua de vaca blanca'],
  'hydnum rufescens': ['Lengua de vaca rojiza'],
  'hypholoma capnoides': ['Hypholoma capnoide'],
  'hypholoma lateritium': ['Hypholoma ladrillo'],
  'imleria badia': ['Boleto bayo'],
  'inocybe asterospora': ['Inocybe de esporas estrelladas'],
  'inocybe dulcamara': ['Inocybe dulcamara'],
  'inocybe geophylla': ['Inocybe geofila'],
  'inocybe lacera': ['Inocybe lacerada'],
  'inocybe rimosa': ['Inocybe rimosa'],
  'kuehneromyces mutabilis': ['Falsa galerina', 'Seta cambiante'],
  'lactarius blennius': ['Níscalo viscoso'],
  'lactarius chrysorrheus': ['Lactario crisórreo'],
  'lactarius controversus': ['Lactario controvertido'],
  'lactarius piperatus': ['Lactario picante'],
  'lactarius quietus': ['Lactario quieto'],
  'lactarius rufus': ['Lactario rojo'],
  'lactarius sanguifluus': ['Níscalo sanguíneo'],
  'lactarius semisanguifluus': ['Níscalo semisanguíneo'],
  'lactarius torminosus': ['Lactario torminoso'],
  'lactarius vellereus': ['Lactario velloso'],
  'lactarius volemus': ['Lactario volemo'],
  'leccinum aurantiacum': ['Boleto anaranjado'],
  'leccinum quercinum': ['Boleto de roble'],
  'leccinum versipelle': ['Boleto de piel variable'],
  'lepiota aspera': ['Lepiota áspera'],
  'lepiota clypeolaria': ['Lepiota clypeolaria'],
  'lepiota cristata': ['Lepiota crestada'],
  'lepiota helveola': ['Lepiota helveola'],
  'lepiota josserandii': ['Lepiota de Josserand'],
  'lepiota subincarnata': ['Lepiota subincarnata'],
  'lepista inversa': ['Pie azul inverso'],
  'lepista personata': ['Pie violeta'],
  'lepista saeva': ['Pie azul'],
  'macrolepiota excoriata': ['Parasol excoriado'],
  'macrolepiota mastoidea': ['Parasol mastoideo'],
  'marasmius rotula': ['Marasmius ruedecilla'],
  'marasmius wynnei': ['Marasmius de Wynne'],
  'morchella conica': ['Colmenilla cónica'],
  'morchella elata': ['Colmenilla alta'],
  'morchella vulgaris': ['Colmenilla vulgar'],
  'mycena galericulata': ['Micena galericulada'],
  'mycena haematopus': ['Micena de pie sangrante'],
  'mycena inclinata': ['Micena inclinada'],
  'mycena polygramma': ['Micena poligrama'],
  'mycena rosea': ['Micena rosa'],
  'pholiota adiposa': ['Pholiota adiposa'],
  'pholiota squarrosa': ['Pholiota escamosa'],
  'pleurotus cornucopiae': ['Seta de ostra cornucopia'],
  'pleurotus pulmonarius': ['Seta de ostra pulmonar'],
  'pluteus salicinus': ['Pluteus de sauce'],
  'psathyrella candolleana': ['Psathyrella de Candolle'],
  'psathyrella multipedata': ['Psathyrella multipedata'],
  'russula aeruginea': ['Rúsula aerugínea'],
  'russula atropurpurea': ['Rúsula atropurpúrea'],
  'russula caerulea': ['Rúsula azulada'],
  'russula delica': ['Rúsula delica'],
  'russula fragilis': ['Rúsula frágil'],
  'russula integra': ['Rúsula íntegra'],
  'russula mairei': ['Rúsula de Maire'],
  'russula nigricans': ['Rúsula negruzca'],
  'russula ochroleuca': ['Rúsula ocrácea'],
  'russula sardonia': ['Rúsula sardonia'],
  'russula vesca': ['Rúsula comestible (nombre tradicional; sin permiso de consumo)'],
  'russula xerampelina': ['Rúsula de olor a marisco'],
  'scleroderma citrinum': ['Bejín citrino', 'Falso trufa'],
  'scleroderma verrucosum': ['Bejín verrugoso'],
  'suillus bovinus': ['Boleto bovino'],
  'suillus granulatus': ['Boleto granuloso'],
  'suillus grevillei': ['Boleto de Greville'],
  'suillus variegatus': ['Boleto abigarrado'],
  'tricholoma columbetta': ['Tricoloma columbetta'],
  'tricholoma focale': ['Tricoloma focal'],
  'tricholoma matsutake': ['Matsutake'],
  'tricholoma populinum': ['Tricoloma de chopo'],
  'tricholoma saponaceum': ['Tricoloma saponáceo'],
  'tricholoma scalpturatum': ['Tricoloma esculpido'],
  'tricholoma sejunctum': ['Tricoloma separado'],
  'tricholoma sulphureum': ['Tricoloma sulfúreo'],
  'tricholoma terreum': ['Tricoloma terrestre', 'Negrilla'],
  'volvariella gloiocephala': ['Volvaria gloiocefala'],
  'volvariella volvacea': ['Volvaria volvácea'],
  'xerocomellus chrysenteron': ['Boleto de carne amarilla'],
  'xerocomus subtomentosus': ['Boleto subtomentoso'],
}

/** Merged map: bulk synonyms override/extend base entries. */
export const COMMON_NAMES_ES: Record<string, string[]> = { ...COMMON_NAMES_ES_BASE }
for (const [key, names] of Object.entries(COMMON_NAMES_ES_BULK)) {
  const prev = COMMON_NAMES_ES[key] || []
  const seen = new Set(prev.map((n) => n.toLowerCase()))
  const merged = [...prev]
  for (const n of names) {
    const k = n.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    merged.push(n)
  }
  COMMON_NAMES_ES[key] = merged
}

const ENGLISH_NOISE = new Set([
  'death cap',
  'destroying angel',
  'funeral bell',
  'false morel',
  'deadly webcap',
])

export function enrichCommonNames(taxon: string, existing: string[] = []): string[] {
  const key = taxon.trim().toLowerCase()
  const extra = COMMON_NAMES_ES[key] || []
  const merged: string[] = []
  const seen = new Set<string>()
  // Prefer curated Spanish (extra) before raw catalog English names
  for (const n of [...extra, ...existing]) {
    const t = n.trim()
    if (!t) continue
    const k = t.toLowerCase()
    if (seen.has(k)) continue
    if (ENGLISH_NOISE.has(k) && extra.length > 0) continue
    seen.add(k)
    merged.push(t)
  }
  return merged
}

/** Accent-insensitive fold for search (níscalo ≈ niscalo). */
export function foldEs(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
}
