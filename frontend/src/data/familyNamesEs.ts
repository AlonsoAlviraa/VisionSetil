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

/** All known Latin families that have Spanish labels. */
export function knownFamilyLatins(): string[] {
  return Object.keys(FAMILY_NAMES_ES).sort()
}
