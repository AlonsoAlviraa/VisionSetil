import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..', 'src', 'locales')
const esPath = path.join(root, 'es', 'common.json')
const enPath = path.join(root, 'en', 'common.json')
const es = JSON.parse(fs.readFileSync(esPath, 'utf8'))
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'))

Object.assign(es.identify, {
  kicker: 'Campo · multi-vista',
  principlesAria: 'Principios de identificación',
  preflightAria: 'Estado del modelo antes de identificar',
  captureAria: 'Captura multi-vista o libre',
  resultAria: 'Resultado de identificación',
  errorApiDown: 'API no disponible. Conecta el backend para identificar.',
  errorQuota:
    'Límite Free de {{limit}} identificaciones/día alcanzado. Activa Pro demo o vuelve mañana. Orientación de campo — no es permiso de consumo.',
  errorUnknown: 'Error desconocido',
  apiDisabledTitle: 'API no disponible — identificación deshabilitada',
  quotaBlockedTitle: 'Cupo Free diario agotado',
  analyzing: 'Analizando…',
  apiOffline: 'API desconectada',
  quotaExhausted: 'Cupo Free agotado',
  quotaExhaustedSuffix: ' · cupo agotado',
  analyzeViews: 'Analizar ({{n}} vistas)',
  cancel: 'Cancelar',
  addMorePhotos: '+ Añadir más fotos',
  quotaStatus: 'Free: {{used}}/{{limit}} identificaciones hoy',
})

Object.assign(en.identify, {
  kicker: 'Field · multi-view',
  principlesAria: 'Identification principles',
  preflightAria: 'Model status before identifying',
  captureAria: 'Multi-view or free capture',
  resultAria: 'Identification result',
  errorApiDown: 'API unavailable. Connect the backend to identify.',
  errorQuota:
    'Free limit of {{limit}} identifications/day reached. Enable Pro demo or come back tomorrow. Field orientation — not permission to consume.',
  errorUnknown: 'Unknown error',
  apiDisabledTitle: 'API unavailable — identification disabled',
  quotaBlockedTitle: 'Daily Free quota exhausted',
  analyzing: 'Analyzing…',
  apiOffline: 'API offline',
  quotaExhausted: 'Free quota exhausted',
  quotaExhaustedSuffix: ' · quota exhausted',
  analyzeViews: 'Analyze ({{n}} views)',
  cancel: 'Cancel',
  addMorePhotos: '+ Add more photos',
  quotaStatus: 'Free: {{used}}/{{limit}} identifications today',
  bannerLead:
    'Guided multi-view. If unsure, it stays quiet — better than inventing. Field orientation only — never permission to consume.',
})

Object.assign(es.result, {
  tentativeCue: 'Pista tentativa',
  modelConfidence: '{{pct}}% de confianza del modelo',
  modelUnsureMulti: ' · el modelo duda entre varias especies',
  deadlyCalloutTitle: 'Posible confusión mortal',
  deadlyCalloutBody:
    'Mantén distancia de niños y mascotas. No toques ni pruebes. Confirma con un micólogo.',
  highRiskCalloutTitle: 'Posible riesgo alto',
  highRiskCalloutBody: 'Mantén distancia de niños y mascotas.',
  safetyDisclaimerBody:
    'Puede fallar. No comas por lo que diga la app — un micólogo manda.',
})

Object.assign(en.result, {
  tentativeCue: 'Tentative cue',
  modelConfidence: '{{pct}}% model confidence',
  modelUnsureMulti: ' · the model is unsure between several species',
  deadlyCalloutTitle: 'Possible deadly confusion',
  deadlyCalloutBody:
    'Keep away from children and pets. Do not touch or taste. Confirm with a mycologist.',
  highRiskCalloutTitle: 'Possible high risk',
  highRiskCalloutBody: 'Keep away from children and pets.',
  safetyDisclaimerBody:
    'It can be wrong. Do not eat based on this app — a mycologist decides.',
})

es.detail = Object.assign(es.detail || {}, {
  meta: {
    family: 'Familia',
    genus: 'Género',
    risk: 'Riesgo',
    educClass: 'Clase educ.',
    iberia: 'Iberia',
    season: 'Temporada',
  },
  educ: {
    comestible: 'Comestible (doc.)',
    no_comestible: 'No comestible',
    toxica: 'Tóxica',
    mortal: 'Mortal',
    sin_documentar: 'Sin documentar',
  },
  iberian: {
    Icono: 'Icono',
    Frecuente: 'Frecuente',
    Presente: 'Presente',
    Mediterránea: 'Mediterránea',
    Atlántica: 'Atlántica',
    Montaña: 'Montaña',
    Escasa: 'Escasa',
  },
  foodClass: {
    comestible: 'Comestible (doc.)',
    no_comestible: 'No comestible',
    toxica: 'Tóxica',
    mortal: 'Mortal',
  },
})

en.detail = Object.assign(en.detail || {}, {
  meta: {
    family: 'Family',
    genus: 'Genus',
    risk: 'Risk',
    educClass: 'Educ. class',
    iberia: 'Iberia',
    season: 'Season',
  },
  educ: {
    comestible: 'Documented culinary interest',
    no_comestible: 'Not for consumption (doc.)',
    toxica: 'Toxic',
    mortal: 'Deadly',
    sin_documentar: 'Undocumented',
  },
  iberian: {
    Icono: 'Iconic',
    Frecuente: 'Frequent',
    Presente: 'Present',
    Mediterránea: 'Mediterranean',
    Atlántica: 'Atlantic',
    Montaña: 'Mountain',
    Escasa: 'Scarce',
  },
  foodClass: {
    comestible: 'Documented culinary interest',
    no_comestible: 'Not for consumption (doc.)',
    toxica: 'Toxic',
    mortal: 'Deadly',
  },
})

Object.assign(es.community, {
  emptyTitle: 'Aún no hay publicaciones',
  emptyBody:
    'Sé el primero en compartir una observación de campo. Solo orientación — nunca uses el chat como permiso de consumo.',
  photoAlt: 'Foto de campo de la comunidad',
  defaultSafetyNote:
    'Opinión de aficionado · orientación solamente · no es identificación.',
  comments: 'Comentarios ({{n}})',
  commentPlaceholder: 'Comentar (sin consejos de consumo)…',
  comment: 'Comentar',
})

Object.assign(en.community, {
  emptyTitle: 'No posts yet',
  emptyBody:
    'Be the first to share a field observation. Orientation only — never use chat as permission to consume.',
  photoAlt: 'Community field photo',
  defaultSafetyNote:
    'Hobbyist opinion · orientation only · not an identification.',
  comments: 'Comments ({{n}})',
  commentPlaceholder: 'Comment (no consumption advice)…',
  comment: 'Comment',
})

Object.assign(es.expert, {
  safetyBanner:
    'Un micólogo de carne y hueso debe validar en el campo. La app no sustituye criterio humano.',
  draftReady: 'Borrador listo',
  packagedTitle: 'Evidencia empaquetada',
  noTopSpecies: 'Sin especie top',
  decision: 'Decisión',
  mode: 'Modo',
  views: 'Vistas',
  photos: 'Fotos',
  confidence: 'Confianza',
  noLabels: 'Sin etiquetas',
  copySummary: 'Copiar resumen',
  downloadJson: 'Descargar JSON',
  openNotebook: 'Abrir cuaderno',
  newIdentify: 'Nueva identificación',
  textPreview: 'Vista previa del texto',
  emptyDraftTitle: 'Sin borrador activo',
  emptyDraftBody:
    'Identifica una seta dudosa y pulsa «Revisión experta» en el resultado, o empaqueta un caso desde el cuaderno.',
  localQueue: 'Cola local',
  localQueueLead:
    'Casos de este dispositivo con rechazo, riesgo o bandera de revisión.',
  emptyLocalTitle: 'Nada pendiente aquí',
  emptyLocalBody: 'Identifica una seta dudosa y empaqueta la evidencia.',
  package: 'Empaquetar',
  view: 'Ver',
  serverQueue: 'Cola del servidor',
})

Object.assign(en.expert, {
  safetyBanner:
    'A human mycologist must validate in the field. The app does not replace human judgment.',
  draftReady: 'Draft ready',
  packagedTitle: 'Packaged evidence',
  noTopSpecies: 'No top species',
  decision: 'Decision',
  mode: 'Mode',
  views: 'Views',
  photos: 'Photos',
  confidence: 'Confidence',
  noLabels: 'No labels',
  copySummary: 'Copy summary',
  downloadJson: 'Download JSON',
  openNotebook: 'Open notebook',
  newIdentify: 'New identification',
  textPreview: 'Text preview',
  emptyDraftTitle: 'No active draft',
  emptyDraftBody:
    'Identify a doubtful mushroom and tap “Expert review” on the result, or package a case from the notebook.',
  localQueue: 'Local queue',
  localQueueLead:
    'Cases on this device with rejection, risk, or a review flag.',
  emptyLocalTitle: 'Nothing pending here',
  emptyLocalBody: 'Identify a doubtful mushroom and package the evidence.',
  package: 'Package',
  view: 'View',
  serverQueue: 'Server queue',
})

es.setadle = Object.assign(es.setadle || {}, {
  habitatPinar: 'Pinar',
  habitatHayedo: 'Hayedo / robledal',
  habitatPrado: 'Prado / pastizal',
  habitatRibera: 'Ribera / humedal',
  habitatEncinar: 'Encinar / mediterráneo',
  habitatSotobosque: 'Sotobosque / madera',
})

en.setadle = Object.assign(en.setadle || {}, {
  habitatPinar: 'Pine forest',
  habitatHayedo: 'Beech / oak woodland',
  habitatPrado: 'Meadow / grassland',
  habitatRibera: 'Riverside / wetland',
  habitatEncinar: 'Holm oak / Mediterranean',
  habitatSotobosque: 'Understory / wood',
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
if (extra.length) console.log('extra', extra.slice(0, 20))
