import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..', 'src', 'locales')
const esPath = path.join(root, 'es', 'common.json')
const enPath = path.join(root, 'en', 'common.json')
const es = JSON.parse(fs.readFileSync(esPath, 'utf8'))
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'))

Object.assign(es.result, {
  primaryAria: 'Resultado principal',
  expertReviewCta: 'Revisión experta',
  secondOpinionCta: 'Segunda opinión',
  draftSaved: 'Borrador guardado.',
  layer2Confidence: 'Confianza y confusiones',
  layer2Lookalikes: 'Confusiones de riesgo',
  layer2DeadlyCount: ' · {{n}} mortales',
  layer2HighCount: ' · {{n}} alto riesgo',
  lookalikesHeader: 'Confusiones de riesgo ({{total}})',
  viewSheet: 'Ver ficha',
  layer3More: 'Más detalle',
  imageQuality: 'Calidad de imagen',
  feedbackQuestion: '¿La pista te encaja?',
  feedbackYes: 'Sí',
  feedbackNo: 'No',
  feedbackThanks: 'Gracias — ayuda a mejorar el modelo.',
})

Object.assign(en.result, {
  primaryAria: 'Primary result',
  expertReviewCta: 'Expert review',
  secondOpinionCta: 'Second opinion',
  draftSaved: 'Draft saved.',
  layer2Confidence: 'Confidence and confusions',
  layer2Lookalikes: 'Risky lookalikes',
  layer2DeadlyCount: ' · {{n}} deadly',
  layer2HighCount: ' · {{n}} high risk',
  lookalikesHeader: 'Risky lookalikes ({{total}})',
  viewSheet: 'View sheet',
  layer3More: 'More detail',
  imageQuality: 'Image quality',
  feedbackQuestion: 'Does this cue fit?',
  feedbackYes: 'Yes',
  feedbackNo: 'No',
  feedbackThanks: 'Thanks — helps improve the model.',
})

Object.assign(es.identify, {
  flowAria: 'Flujo de identificación honesta',
})
Object.assign(en.identify, {
  flowAria: 'Honest identification flow',
})

Object.assign(es.expert, {
  loading: 'Cargando…',
  refresh: 'Actualizar',
  serverEmptyTitle: 'Cola vacía o no conectada',
  serverEmptyBody:
    'Cuando el backend esté disponible, verás aquí los casos asignados. Mientras tanto usa handoffs locales.',
  caseLabel: 'Caso {{id}}',
  observation: 'Observación {{id}}',
  recentHandoffs: 'Handoffs recientes',
  open: 'Abrir',
  mlStatus: 'Estado del modelo',
  mlTechDetail: 'Detalle técnico',
  mlReady: 'Listo',
  mlDegraded: 'Degradado',
  mlModels: 'Modelos',
  mlDisclaimer:
    'Si ves “mock” o “degraded”, las pistas de Identificar son demo — nunca permiso de consumo.',
})

Object.assign(en.expert, {
  loading: 'Loading…',
  refresh: 'Refresh',
  serverEmptyTitle: 'Queue empty or offline',
  serverEmptyBody:
    'When the backend is available, assigned cases appear here. Until then use local handoffs.',
  caseLabel: 'Case {{id}}',
  observation: 'Observation {{id}}',
  recentHandoffs: 'Recent handoffs',
  open: 'Open',
  mlStatus: 'Model status',
  mlTechDetail: 'Technical detail',
  mlReady: 'Ready',
  mlDegraded: 'Degraded',
  mlModels: 'Models',
  mlDisclaimer:
    'If you see “mock” or “degraded”, Identify cues are demo — never permission to consume.',
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
console.log('ES', ek.length, 'EN', nk.length, 'missingEN', missing.length)
if (missing.length) console.log(missing)
