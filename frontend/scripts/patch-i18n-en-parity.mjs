/**
 * One-shot: merge EN/ES i18n keys for full English UI + name labels.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..', 'src', 'locales')
const esPath = path.join(root, 'es', 'common.json')
const enPath = path.join(root, 'en', 'common.json')
const es = JSON.parse(fs.readFileSync(esPath, 'utf8'))
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'))

Object.assign(es.home, {
  kicker: 'VisionSetil · España · Soria · CyL',
  heroTitleLine1: 'Setas con',
  heroTitleEm: 'criterio.',
  heroLead:
    'Identificación con honestidad de modelo, enciclopedia y mapa de cotos. Orientación de campo — nunca permiso de consumo.',
  ctaIdentifyShort: 'Identificar',
  ctaOffline: 'Pack offline Pro',
  ctaMap: 'Cotos y mapa',
  statTaxa: 'Taxones',
  statFreeId: 'ID Free/día',
  statOffline: 'Offline campo',
  ariaHero: 'Presentación',
  ariaTrust: 'Confianza y seguridad',
  ariaIconic: 'Setas icónicas',
  ariaFreemium: 'Free y Pro',
  ariaWaitlist: 'Waitlist temporada',
  ariaGallery: 'Galería',
  ariaSetadle: 'Setadle',
  ariaDeadly: 'Mortales',
  ariaOffline: 'Offline Pro',
  trustOpenSetTitle: 'Open-set',
  trustOpenSetBody: 'Rechaza lo desconocido en vez de inventar',
  trustDeadlyTitle: 'Mortales visibles',
  trustDeadlyBody: 'Banderas de riesgo en fichas y resultados',
  trustZonesTitle: 'Cotos oficiales',
  trustZonesBody: 'Enlaces a MicologíaCyL / MicoAragón',
  trustNoConsumeTitle: 'Sin permiso de consumo',
  trustNoConsumeBody: 'Solo orientación; micólogo humano ante la duda',
  setadleTitle: 'Setadle',
  setadleLead: 'Juego diario Free. Modos extra e ilimitado en Pro.',
  play: 'Jugar',
  boardCaptionDaily: 'Diario · colores',
  boardCaptionClassic: 'Exacto · cerca · no',
  deadlyBadge: 'Mortal',
  offlineKicker: 'Pro · Campo sin red',
  offlineTitle: 'Offline Pack',
  offlineLead:
    'Fichas y fotos de estudio para temporada y prioritarias T0/T1. No identifica offline ni autoriza consumo.',
  ctaOfflinePack: 'Ver pack Pro',
  ctaEducation: 'Educación de seguridad',
  safetyLine: 'Orientación de campo · no consumo · ante la duda, micólogo humano',
  nameDeathCap: 'Oronja verde',
  nameDestroyingAngel: 'Ángel destructor',
  nameGalerina: 'Galerina',
  nameWebcap: 'Cortinario',
  nameLepiota: 'Lepiota',
  nameFlyAgaric: 'Mosca',
  namePorcini: 'Hongo',
  nameChanterelle: 'Rebozuelo',
  nameMilkcap: 'Níscalo',
  nameParasol: 'Parasol',
  nameCaesar: 'Oronja',
})

Object.assign(en.home, {
  kicker: 'VisionSetil · Spain · Soria · CyL',
  heroTitleLine1: 'Mushrooms with',
  heroTitleEm: 'judgment.',
  heroLead:
    'Identification with model honesty, encyclopedia and regulated-zone map. Field orientation — never permission to consume.',
  ctaIdentifyShort: 'Identify',
  ctaOffline: 'Offline Pack Pro',
  ctaMap: 'Zones & map',
  statTaxa: 'Taxa',
  statFreeId: 'Free IDs/day',
  statOffline: 'Field offline',
  ariaHero: 'Introduction',
  ariaTrust: 'Trust and safety',
  ariaIconic: 'Iconic mushrooms',
  ariaFreemium: 'Free and Pro',
  ariaWaitlist: 'Season waitlist',
  ariaGallery: 'Gallery',
  ariaSetadle: 'Setadle',
  ariaDeadly: 'Deadly species',
  ariaOffline: 'Offline Pro',
  trustOpenSetTitle: 'Open-set',
  trustOpenSetBody: 'Rejects unknowns instead of inventing',
  trustDeadlyTitle: 'Deadly visible',
  trustDeadlyBody: 'Risk flags on sheets and results',
  trustZonesTitle: 'Official zones',
  trustZonesBody: 'Links to MicologíaCyL / MicoAragón',
  trustNoConsumeTitle: 'No consumption permission',
  trustNoConsumeBody: 'Orientation only; human mycologist when in doubt',
  setadleTitle: 'Setadle',
  setadleLead: 'Daily Free game. Extra modes and unlimited in Pro.',
  play: 'Play',
  boardCaptionDaily: 'Daily · colors',
  boardCaptionClassic: 'Exact · close · no',
  deadlyBadge: 'Deadly',
  offlineKicker: 'Pro · Field without network',
  offlineTitle: 'Offline Pack',
  offlineLead:
    'Study sheets and photos for season and priority T0/T1. Does not identify offline or authorize consumption.',
  ctaOfflinePack: 'View Pro pack',
  ctaEducation: 'Safety education',
  safetyLine: 'Field orientation · no consumption · when in doubt, human mycologist',
  nameDeathCap: 'Death cap',
  nameDestroyingAngel: 'Destroying angel',
  nameGalerina: 'Funeral bell',
  nameWebcap: 'Deadly webcap',
  nameLepiota: 'Deadly dapperling',
  nameFlyAgaric: 'Fly agaric',
  namePorcini: 'Porcini',
  nameChanterelle: 'Chanterelle',
  nameMilkcap: 'Saffron milkcap',
  nameParasol: 'Parasol',
  nameCaesar: "Caesar's mushroom",
})

Object.assign(es.encyclopedia, {
  kicker: 'Catálogo · riesgo claro',
  titlePage: 'Enciclopedia de setas',
  loading: 'Cargando catálogo…',
  taxaCount: '{{count}} taxones',
  documentedSuffix: '· {{n}} con calidad documentada. Solo orientación de campo.',
  loadingAria: 'Cargando especies',
  featured: 'Destacada: {{name}}',
  studioDefault: 'Vista 360 de destacada',
  realPhotosOf: 'Fotos reales de {{taxon}}',
  realPhotosDefault: 'Fotos reales de seta',
  tryOther: 'Prueba otra búsqueda o familia.',
  searchPlaceholderShort: 'Níscalo, oronja, Amanita…',
  searchAria: 'Buscar especies',
  familyLabel: 'Familia',
  familyAll: 'Todas las familias',
  riskLabel: 'Riesgo',
  foodLabel: 'Ficha documental',
  foodAria: 'Filtrar por ficha documental (orientación, no consumo)',
  riskAll: 'Todos',
  riskDeadly: 'Mortal',
  riskToxic: 'Tóxica',
  riskUnknown: 'Sin ficha de riesgo',
  riskCaution: 'Precaución',
  foodAny: 'Cualquier ficha',
  foodDocumented: 'Solo documentadas',
  foodEdibleDoc: 'Documentadas (orientación)',
  foodNotSuitable: 'No aptas (ficha)',
  foodToxic: 'Tóxica',
  foodDeadly: 'Mortal',
  familyAllChip: 'Todas',
  moreFamilies: 'Más familias',
  fewerFamilies: 'Menos',
  speciesOne: 'especie',
  speciesMany: 'especies',
  showingN: 'mostrando {{n}}',
  loadMoreRest: 'Cargar más ({{n}} restantes)',
  emptyTitle: 'Sin coincidencias',
  emptyBody: 'Prueba otra familia, nombre científico o nombre común.',
  clearFilters: 'Limpiar filtros',
  noLocalCommon: 'Sin nombre común local',
})

Object.assign(en.encyclopedia, {
  kicker: 'Catalog · clear risk',
  titlePage: 'Mushroom encyclopedia',
  loading: 'Loading catalog…',
  taxaCount: '{{count}} taxa',
  documentedSuffix: '· {{n}} with documented quality. Field orientation only.',
  loadingAria: 'Loading species',
  featured: 'Featured: {{name}}',
  studioDefault: 'Featured 360° view',
  realPhotosOf: 'Real photos of {{taxon}}',
  realPhotosDefault: 'Real mushroom photos',
  tryOther: 'Try another search or family.',
  searchPlaceholderShort: 'Milkcap, death cap, Amanita…',
  searchAria: 'Search species',
  familyLabel: 'Family',
  familyAll: 'All families',
  riskLabel: 'Risk',
  foodLabel: 'Documentary sheet',
  foodAria: 'Filter by documentary sheet (orientation, not consumption)',
  riskAll: 'All',
  riskDeadly: 'Deadly',
  riskToxic: 'Toxic',
  riskUnknown: 'No risk sheet',
  riskCaution: 'Caution',
  foodAny: 'Any sheet',
  foodDocumented: 'Documented only',
  foodEdibleDoc: 'Documented (orientation)',
  foodNotSuitable: 'Not suitable (sheet)',
  foodToxic: 'Toxic',
  foodDeadly: 'Deadly',
  familyAllChip: 'All',
  moreFamilies: 'More families',
  fewerFamilies: 'Fewer',
  speciesOne: 'species',
  speciesMany: 'species',
  showingN: 'showing {{n}}',
  loadMoreRest: 'Load more ({{n}} left)',
  emptyTitle: 'No matches',
  emptyBody: 'Try another family, scientific name or common name.',
  clearFilters: 'Clear filters',
  noLocalCommon: 'No local common name',
})

es.names = { noLocalCommon: 'Sin nombre común local', scientific: 'Nombre científico' }
en.names = { noLocalCommon: 'No local common name', scientific: 'Scientific name' }

es.safety.sticky =
  'Solo orientación de campo — nunca permiso de consumo. Valida con un experto.'
es.safety.chipOrientation = 'Orientación, no consumo'
es.safety.chipAbstain = 'IA con abstención'
es.safety.chipPreflight = 'Preflight visible'
es.safety.foodFilterNote =
  'Filtros de ficha documental — no son permiso de consumo ni de recolección.'
es.safety.mlLabDisclaimer =
  'Métricas de laboratorio (MAP@3, deadly@k) no desbloquean Identificar ni autorizan consumo. Solo diagnostican el stack de entrenamiento. Orientation only.'

en.safety.sticky =
  'Field orientation only — never permission to consume. Validate with an expert.'
en.safety.chipOrientation = 'Orientation, not consumption'
en.safety.chipAbstain = 'AI that can abstain'
en.safety.chipPreflight = 'Visible preflight'
en.safety.foodFilterNote =
  'Documentary sheet filters — not permission to consume or forage.'
en.safety.mlLabDisclaimer =
  'Lab metrics (MAP@3, deadly@k) do not unlock Identify or authorize consumption. They only diagnose the training stack. Orientation only.'

es.risk.orientation = 'Orientación'
es.risk.not_for_consumption = 'No apta'
es.risk.cautionShort = 'Precaución'
en.risk.orientation = 'Orientation'
en.risk.not_for_consumption = 'Not suitable'
en.risk.cautionShort = 'Caution'
en.risk.poisonous = 'Poisonous'
en.risk.toxic = 'Toxic'
en.risk.deadly = 'Deadly'
en.risk.dangerous_or_unknown = 'Caution'

es.setadle = {
  kicker: 'Daily · al estilo LoLdle · {{plan}}',
  title: 'Setadle',
  subtitle:
    'Free: clásico diario. Pro: cinco modos e ilimitado. Colores que enseñan. Solo educación — nunca consumo.',
  today: 'Hoy · {{day}}',
  chipModesPro: '5 modos',
  chipModesFree: '1 modo Free',
  chipDailyPro: 'Diario + ilimitado',
  chipDailyFree: 'Diario Free',
  chipRisk: 'Riesgo visible',
  boardCaption: 'Exacto · cerca · no',
  proMode: 'Modo Pro',
  proUnlockBody:
    '«{{mode}}» es Pro. Free mantiene el clásico diario. Confirma para activar demo local en este dispositivo.',
  activatePro: 'Activar Pro demo',
  stayFree: 'Seguir en Free',
  playCta: 'Jugar →',
  seePro: 'Ver Pro →',
  attempts: '✓ {{n}} intentos',
  howToRead: 'Cómo leer el clásico',
  exact: 'Exacto',
  close: 'Cerca',
  no: 'No',
  disclaimer: 'No es guía de forrajeo ni de consumo. Ante la duda, micólogo humano.',
  backModes: '← Modos',
  freeOnlyClassic:
    'Free incluye el clásico diario. Confirma para activar Pro demo (modos extra e ilimitado).',
  loading: 'Cargando pool de especies…',
  poolError: 'No hay especies disponibles para jugar.',
  goEncyclopedia: 'Ir a Enciclopedia',
  notFound: 'Especie no encontrada en el pool. Prueba otro nombre.',
  alreadyTried: 'Ya has probado esa especie.',
  poolEmpty: 'No hay especies en el pool de juego.',
  poolLoadFail: 'No se pudo cargar el catálogo para Setadle.',
  modeClassic: 'Clásico',
  modeClassicBlurb: 'Pistas en cada intento: familia, género, riesgo…',
  modeClue: 'Pista',
  modeClueBlurb: 'Una frase de la ficha. Adivina la especie.',
  modeTrait: 'Rasgo',
  modeTraitBlurb: 'Un carácter morfológico o clave de campo.',
  modeHabitat: 'Hábitat',
  modeHabitatBlurb: 'Arrastra cada seta: ¿vive aquí o no?',
  modePhoto: 'Foto',
  modePhotoBlurb: 'Recorte de foto; se aleja con cada fallo.',
  searchPlaceholder: 'Nombre común o científico…',
  featuresAria: 'Características',
}

en.setadle = {
  kicker: 'Daily · LoLdle-style · {{plan}}',
  title: 'Setadle',
  subtitle:
    'Free: classic daily. Pro: five modes and unlimited. Colors that teach. Education only — never consumption.',
  today: 'Today · {{day}}',
  chipModesPro: '5 modes',
  chipModesFree: '1 Free mode',
  chipDailyPro: 'Daily + unlimited',
  chipDailyFree: 'Free daily',
  chipRisk: 'Visible risk',
  boardCaption: 'Exact · close · no',
  proMode: 'Pro mode',
  proUnlockBody:
    '“{{mode}}” is Pro. Free keeps classic daily. Confirm to enable a local demo on this device.',
  activatePro: 'Enable Pro demo',
  stayFree: 'Stay on Free',
  playCta: 'Play →',
  seePro: 'See Pro →',
  attempts: '✓ {{n}} tries',
  howToRead: 'How to read classic',
  exact: 'Exact',
  close: 'Close',
  no: 'No',
  disclaimer: 'Not a foraging or consumption guide. When in doubt, human mycologist.',
  backModes: '← Modes',
  freeOnlyClassic:
    'Free includes classic daily. Confirm to enable Pro demo (extra modes and unlimited).',
  loading: 'Loading species pool…',
  poolError: 'No species available to play.',
  goEncyclopedia: 'Go to Encyclopedia',
  notFound: 'Species not found in the pool. Try another name.',
  alreadyTried: 'You already tried that species.',
  poolEmpty: 'No species in the game pool.',
  poolLoadFail: 'Could not load the catalog for Setadle.',
  modeClassic: 'Classic',
  modeClassicBlurb: 'Hints each try: family, genus, risk…',
  modeClue: 'Clue',
  modeClueBlurb: 'One line from the sheet. Guess the species.',
  modeTrait: 'Trait',
  modeTraitBlurb: 'A morphological or field key character.',
  modeHabitat: 'Habitat',
  modeHabitatBlurb: 'Drag each mushroom: does it live here?',
  modePhoto: 'Photo',
  modePhotoBlurb: 'Cropped photo; zooms out with each miss.',
  searchPlaceholder: 'Common or scientific name…',
  featuresAria: 'Features',
}

es.community = {
  kicker: 'Comunidad',
  title: 'Conversación de campo',
  subtitle:
    'Observaciones y dudas entre aficionados. No sustituye a un micólogo ni identifica setas.',
  chipOrientation: 'Solo orientación',
  chipNoConsume: 'Sin consejos de consumo',
  chipAuth: 'Lee sin cuenta · publica con login',
  banner:
    'Opiniones de la comunidad, no certeza. Valida con un micólogo humano. Nunca uses este feed como permiso de consumo.',
  loginCtaBefore: 'Puedes',
  loginCtaRead: 'leer',
  loginCtaMid: 'el feed sin cuenta. Para publicar y comentar:',
  loginLink: 'inicia sesión',
  loginCtaOr: 'o',
  registerLink: 'regístrate',
  postingAs: 'Publicando como',
  placeholder:
    'Comparte una observación (hábitat, caracteres, duda)… sin consejos de consumo.',
  attach: 'Adjuntar foto',
  removePhoto: 'Quitar foto',
  publish: 'Publicar',
  publishing: 'Publicando…',
  loadFail: 'No se pudo cargar el feed',
  loadFailBody:
    'El servidor de comunidad no responde. Puedes reintentar o volver más tarde.',
  blockedConsume:
    'No se permiten consejos de consumo («{{phrase}}»). Este feed es solo orientación de campo.',
  blockedComment:
    'Comentario bloqueado: no se permiten frases de consumo («{{phrase}}»). Solo orientación.',
  networkError: 'Error de red',
  postFail: 'No se pudo publicar',
  commentFail: 'No se pudo comentar',
  loadingAria: 'Cargando feed',
  noticesAria: 'Avisos',
}

en.community = {
  kicker: 'Community',
  title: 'Field conversation',
  subtitle:
    'Observations and questions among enthusiasts. Does not replace a mycologist or identify mushrooms.',
  chipOrientation: 'Orientation only',
  chipNoConsume: 'No consumption advice',
  chipAuth: 'Read without account · post when logged in',
  banner:
    'Community opinions, not certainty. Validate with a human mycologist. Never use this feed as permission to consume.',
  loginCtaBefore: 'You can',
  loginCtaRead: 'read',
  loginCtaMid: 'the feed without an account. To post and comment:',
  loginLink: 'sign in',
  loginCtaOr: 'or',
  registerLink: 'register',
  postingAs: 'Posting as',
  placeholder:
    'Share an observation (habitat, characters, question)… no consumption advice.',
  attach: 'Attach photo',
  removePhoto: 'Remove photo',
  publish: 'Publish',
  publishing: 'Publishing…',
  loadFail: 'Could not load the feed',
  loadFailBody: 'The community server is not responding. Retry or come back later.',
  blockedConsume:
    'Consumption advice is not allowed («{{phrase}}»). This feed is field orientation only.',
  blockedComment:
    'Comment blocked: consumption phrases are not allowed («{{phrase}}»). Orientation only.',
  networkError: 'Network error',
  postFail: 'Could not publish',
  commentFail: 'Could not comment',
  loadingAria: 'Loading feed',
  noticesAria: 'Notices',
}

es.expert = {
  kicker: 'Revisión experta',
  title: 'Empaqueta evidencia para un micólogo',
  subtitle: 'Handoff local y cola remota. Solo orientación — nunca permiso de consumo.',
}
en.expert = {
  kicker: 'Expert review',
  title: 'Package evidence for a mycologist',
  subtitle: 'Local handoff and remote queue. Orientation only — never permission to consume.',
}

es.education = Object.assign(es.education || {}, {
  title: 'Educación de seguridad',
  subtitle: 'Reglas de campo, anatomía y calendario. Orientación — nunca permiso de consumo.',
  kicker: 'Aprende · campo',
})
en.education = Object.assign(en.education || {}, {
  title: 'Safety education',
  subtitle: 'Field rules, anatomy and calendar. Orientation — never permission to consume.',
  kicker: 'Learn · field',
})

es.nav.blurb = {
  education: 'Reglas de campo y anatomía',
  lookalikes: 'Confusiones clásicas lado a lado',
  quiz: 'Quiz de riesgo y caracteres',
  notebook: 'Tus observaciones en el dispositivo',
  offline: 'Pack de fotos para estudiar sin red',
  community: 'Opiniones de campo · no certeza',
  experts: 'Empaqueta evidencia para un micólogo',
  ml: 'Métricas y stack del modelo',
}
en.nav.blurb = {
  education: 'Field rules and anatomy',
  lookalikes: 'Classic confusions side by side',
  quiz: 'Risk and character quiz',
  notebook: 'Your observations on this device',
  offline: 'Photo pack to study offline',
  community: 'Field opinions · not certainty',
  experts: 'Package evidence for a mycologist',
  ml: 'Model metrics and stack',
}

es.nav.login = 'Iniciar sesión'
es.nav.logout = 'Cerrar sesión'
es.nav.openMenu = 'Abrir menú'
es.nav.closeMenu = 'Cerrar menú'
es.nav.primaryAria = 'Principal'
en.nav.login = 'Sign in'
en.nav.logout = 'Sign out'
en.nav.openMenu = 'Open menu'
en.nav.closeMenu = 'Close menu'
en.nav.primaryAria = 'Primary'

es.result = Object.assign(es.result || {}, {
  confLow: 'Baja confianza',
  confLowBody: 'Pista floja. Mejor no te fíes solo de esto.',
  confMid: 'Confianza moderada',
  confMidBody: 'Hay una idea razonable, con margen de error.',
  confHigh: 'Alta confianza',
  confHighBody: 'El modelo se atreve… y aun así conviene un humano.',
  safetyOrientation: 'Solo orientación',
  safetyUnsafe: 'No apta para consumo',
  safetyCaution: 'Precaución',
  safetyWarning: 'Advertencia',
  safetyDanger: 'Peligro',
  safetyCritical: 'Crítico',
})
en.result = Object.assign(en.result || {}, {
  confLow: 'Low confidence',
  confLowBody: 'Weak cue. Do not rely on this alone.',
  confMid: 'Moderate confidence',
  confMidBody: 'A reasonable idea, with room for error.',
  confHigh: 'High confidence',
  confHighBody: 'The model is bold… still involve a human.',
  safetyOrientation: 'Orientation only',
  safetyUnsafe: 'Not for consumption',
  safetyCaution: 'Caution',
  safetyWarning: 'Warning',
  safetyDanger: 'Danger',
  safetyCritical: 'Critical',
})

fs.writeFileSync(esPath, JSON.stringify(es, null, 2) + '\n')
fs.writeFileSync(enPath, JSON.stringify(en, null, 2) + '\n')

function keys(o, p = '') {
  let k = []
  for (const [a, b] of Object.entries(o)) {
    const n = p ? p + '.' + a : a
    if (b && typeof b === 'object' && !Array.isArray(b)) k = k.concat(keys(b, n))
    else k.push(n)
  }
  return k
}
const ek = keys(es)
const nk = keys(en)
const missing = ek.filter((k) => !nk.includes(k))
const extra = nk.filter((k) => !ek.includes(k))
console.log('ES', ek.length, 'EN', nk.length, 'missingEN', missing.length, 'extraEN', extra.length)
if (missing.length) console.log('missing', missing)
if (extra.length) console.log('extra', extra)
