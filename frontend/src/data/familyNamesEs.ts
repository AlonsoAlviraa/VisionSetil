/**
 * Latin mushroom family → Spanish common/educational name.
 * Display only; taxonomy remains Latin in `family` field.
 */
export const FAMILY_NAMES_ES: Record<string, string> = {
  Agaricaceae: 'Agáricos y champiñones',
  Amanitaceae: 'Amanitas',
  Auriculariaceae: 'Orejas de Judas y afines',
  Bankeraceae: 'Hidnos y sarcodones',
  Bolbitiaceae: 'Bolbitiáceas',
  Boletaceae: 'Boletos',
  Cantharellaceae: 'Rebozuelos y trompetas',
  Clavariaceae: 'Clavarias (corales simples)',
  Clavariadelphaceae: 'Clavariadelfos',
  Clavulinaceae: 'Clavulinas',
  Cordycipitaceae: 'Cordyceps y afines',
  Cortinariaceae: 'Cortinarios',
  Crepidotaceae: 'Crepidotos',
  Dacrymycetaceae: 'Dacrimicetos (gelatinosos)',
  Diplocystaceae: 'Astraeus y afines',
  Discinaceae: 'Giromitras y discinas',
  Entolomataceae: 'Entolomas',
  Fistulinaceae: 'Lenguas de roble',
  Fomitopsidaceae: 'Políporos fomitopsidáceos',
  Ganodermataceae: 'Ganodermas',
  Geastraceae: 'Estrellas de tierra',
  Gloeophyllaceae: 'Gloeophylláceas',
  Gomphaceae: 'Ramarias y gónfidos afines',
  Gomphidiaceae: 'Gónfidos',
  Gyroporaceae: 'Giróporos',
  Helvellaceae: 'Helvellas',
  Hericiaceae: 'Hericium (melenas de león)',
  Hydnaceae: 'Lenguas de vaca (Hydnum)',
  Hydnangiaceae: 'Hidnangiáceas',
  Hygrophoropsidaceae: 'Higrofóropsis',
  Hymenochaetaceae: 'Himenocetáceas',
  Hymenogastraceae: 'Galerinas, hebelomas y afines',
  Inocybaceae: 'Inocybes',
  Lyophyllaceae: 'Liofiláceas',
  Marasmiaceae: 'Marasmius y afines',
  Meripilaceae: 'Meripiláceas',
  Meruliaceae: 'Meruliáceas',
  Morchellaceae: 'Colmenillas y verpas',
  Mycenaceae: 'Micenas',
  Omphalotaceae: 'Omfalotáceas',
  Paxillaceae: 'Paxilos',
  Pezizaceae: 'Pezizas',
  Phallaceae: 'Faláceas (cuernos fétidos)',
  Physalacriaceae: 'Armilarias y flammulinas',
  Pleurotaceae: 'Setas de ostra',
  Pluteaceae: 'Pluteos y volvarias',
  Polyporaceae: 'Políporos',
  Psathyrellaceae: 'Psathirelas y coprinos',
  Pyronemataceae: 'Pironematáceas',
  Rhizopogonaceae: 'Rizopógones',
  Russulaceae: 'Rúsulas y lactarios',
  Sarcoscyphaceae: 'Sarcoscifas',
  Schizophyllaceae: 'Esquizófilos',
  Sclerodermataceae: 'Esclerodermas (falsas trufas)',
  Sparassidaceae: 'Sparassis (coliflores)',
  Stereaceae: 'Estéreos',
  Strophariaceae: 'Estrofariáceas',
  Suillaceae: 'Suillus (babosos)',
  Tapinellaceae: 'Tapinellas',
  Terfeziaceae: 'Terfezias (trufas del desierto)',
  Thelephoraceae: 'Teleforáceas',
  Tremellaceae: 'Tremellas (gelatinosas)',
  Tricholomataceae: 'Tricolomas y afines',
  Tubariaceae: 'Tubariáceas',
  Tuberaceae: 'Trufas verdaderas',
}

/** Spanish display name for a Latin family; falls back to Latin if unknown. */
export function familyNameEs(latinFamily: string | null | undefined): string {
  if (!latinFamily || !latinFamily.trim()) return 'Sin familia'
  const key = latinFamily.trim()
  return FAMILY_NAMES_ES[key] || key
}

/**
 * Genus → family when catalog rows left `family` empty (common for Lactarius / Boletus).
 * Educational mapping only — not a taxonomic authority.
 */
export const GENUS_TO_FAMILY: Record<string, string> = {
  Amanita: 'Amanitaceae',
  Agaricus: 'Agaricaceae',
  Boletus: 'Boletaceae',
  Butyriboletus: 'Boletaceae',
  Caloboletus: 'Boletaceae',
  Hemileccinum: 'Boletaceae',
  Imleria: 'Boletaceae',
  Leccinum: 'Boletaceae',
  Neoboletus: 'Boletaceae',
  Rubroboletus: 'Boletaceae',
  Suillellus: 'Boletaceae',
  Xerocomellus: 'Boletaceae',
  Xerocomus: 'Boletaceae',
  Suillus: 'Suillaceae',
  Lactarius: 'Russulaceae',
  Lactifluus: 'Russulaceae',
  Russula: 'Russulaceae',
  Cantharellus: 'Cantharellaceae',
  Craterellus: 'Cantharellaceae',
  Hydnum: 'Hydnaceae',
  Macrolepiota: 'Agaricaceae',
  Chlorophyllum: 'Agaricaceae',
  Morchella: 'Morchellaceae',
  Gyromitra: 'Discinaceae',
  Cortinarius: 'Cortinariaceae',
  Galerina: 'Hymenogastraceae',
  Hypholoma: 'Strophariaceae',
  Pleurotus: 'Pleurotaceae',
  Tricholoma: 'Tricholomataceae',
  Armillaria: 'Physalacriaceae',
  Coprinus: 'Agaricaceae',
  Coprinopsis: 'Psathyrellaceae',
  Marasmius: 'Marasmiaceae',
  Mycena: 'Mycenaceae',
}

/** Effective Latin family for a taxon (catalog field or genus inference). */
export function effectiveFamilyLatin(
  family: string | null | undefined,
  scientificName: string | null | undefined,
): string {
  const fromCatalog = (family || '').trim()
  if (fromCatalog) return fromCatalog
  const genus = (scientificName || '').trim().split(/\s+/)[0] || ''
  return GENUS_TO_FAMILY[genus] || ''
}

/**
 * Expand user queries like "boletos", "lactarios", "amanitas" into family/genus tokens
 * for encyclopedia search ranking.
 */
export function encyclopediaQueryAliases(rawQuery: string): string[] {
  const q = (rawQuery || '').trim().toLowerCase()
  if (!q) return []
  const out: string[] = [q]
  const map: Array<[RegExp, string[]]> = [
    [/^bolet[oa]s?$/, ['boletaceae', 'boletus', 'boleto']],
    [/^boleto$/, ['boletaceae', 'boletus']],
    [/^níscal|niscal|rovellón|rovellon|lactar/, ['lactarius', 'russulaceae', 'níscalo']],
    [/^rúsul|rusul/, ['russula', 'russulaceae']],
    [/^amanit/, ['amanita', 'amanitaceae']],
    [/^rebozuelo|chanterelle|cantharell/, ['cantharellus', 'cantharellaceae']],
    [/^colmenilla|morchell/, ['morchella', 'morchellaceae']],
  ]
  for (const [re, aliases] of map) {
    if (re.test(q)) out.push(...aliases)
  }
  return [...new Set(out)]
}

/** All known Latin families that have Spanish labels. */
export function knownFamilyLatins(): string[] {
  return Object.keys(FAMILY_NAMES_ES).sort()
}
