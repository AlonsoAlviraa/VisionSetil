import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const localesDir = path.join(__dirname, '../src/locales')

const patches = {
  es: {
    nav: {
      wordle: 'Wordle setas',
      blurb: { wordle: 'Nombres comunes · cambia con el idioma' },
    },
    wordle: {
      loading: 'Cargando pool…',
      emptyPool: 'No hay especies en el pool.',
      backSetadle: 'Volver a Setadle',
      kicker: 'Wordle de setas · educativo · ronda {{n}}',
      title: 'Wordle de setas',
      lead: 'Adivina el nombre común (sin espacios) en {{max}} intentos. Verde = bien, ámbar = otra posición. Al acertar o fallar, pasa solo al siguiente. El nombre depende del idioma de la app.',
      streak: 'Racha',
      day: 'Hoy',
      daily: 'Diario',
      streakMode: 'Racha infinita',
      toSetadle: 'Otros modos Setadle',
      letters: '{{n}} letras',
      hintFamily: 'Pista: nombre común en tu idioma',
      boardAria: 'Tablero',
      errLength: 'La palabra tiene {{n}} letras (sin espacios).',
      errDup: 'Ya probaste esa palabra.',
      won: '¡Acertaste!',
      lost: 'Se acabaron los intentos',
      nextIn: 'Siguiente en {{s}} s…',
      nextNow: 'Cargando siguiente…',
      nextNowBtn: 'Siguiente ya',
      openFiche: 'Ver ficha',
      safety: 'Solo juego educativo. No autoriza recolección ni consumo.',
      kbAria: 'Teclado',
      enter: 'Enviar',
    },
  },
  en: {
    nav: {
      wordle: 'Mushroom Wordle',
      blurb: { wordle: 'Common names · follows app language' },
    },
    wordle: {
      loading: 'Loading pool…',
      emptyPool: 'No species in the pool.',
      backSetadle: 'Back to Setadle',
      kicker: 'Mushroom Wordle · educational · round {{n}}',
      title: 'Mushroom Wordle',
      lead: 'Guess the common name (no spaces) in {{max}} tries. Green = right, amber = wrong spot. After win or lose, the next puzzle starts. Names follow the app language.',
      streak: 'Streak',
      day: 'Today',
      daily: 'Daily',
      streakMode: 'Endless streak',
      toSetadle: 'Other Setadle modes',
      letters: '{{n}} letters',
      hintFamily: 'Hint: common name in your language',
      boardAria: 'Board',
      errLength: 'The word has {{n}} letters (no spaces).',
      errDup: 'You already tried that word.',
      won: 'You got it!',
      lost: 'Out of tries',
      nextIn: 'Next in {{s}} s…',
      nextNow: 'Loading next…',
      nextNowBtn: 'Next now',
      openFiche: 'Open species card',
      safety: 'Educational game only. Not permission to forage or eat.',
      kbAria: 'Keyboard',
      enter: 'Enter',
    },
  },
  ca: {
    nav: {
      wordle: 'Wordle de bolets',
      blurb: { wordle: "Noms comuns · segueix l'idioma" },
    },
    wordle: {
      loading: 'Carregant pool…',
      emptyPool: 'No hi ha espècies al pool.',
      backSetadle: 'Tornar a Setadle',
      kicker: 'Wordle de bolets · educatiu · ronda {{n}}',
      title: 'Wordle de bolets',
      lead: "Endevina el nom comú (sense espais) en {{max}} intents. Verd = bé, ambre = altra posició. En encertar o fallar, passa al següent. El nom depèn de l'idioma de l'app.",
      streak: 'Ratxa',
      day: 'Avui',
      daily: 'Diari',
      streakMode: 'Ratxa infinita',
      toSetadle: 'Altres modes Setadle',
      letters: '{{n}} lletres',
      hintFamily: 'Pista: nom comú en el teu idioma',
      boardAria: 'Taulell',
      errLength: 'La paraula té {{n}} lletres (sense espais).',
      errDup: 'Ja has provat aquesta paraula.',
      won: 'Correcte!',
      lost: "S'han acabat els intents",
      nextIn: 'Següent en {{s}} s…',
      nextNow: 'Carregant següent…',
      nextNowBtn: 'Següent ara',
      openFiche: 'Veure fitxa',
      safety: 'Només joc educatiu. No autoritza recol·lecció ni consum.',
      kbAria: 'Teclat',
      enter: 'Enviar',
    },
  },
  eu: {
    nav: {
      wordle: 'Perretxiko Wordle',
      blurb: { wordle: 'Izen arruntak · hizkuntzaren arabera' },
    },
    wordle: {
      loading: 'Pool-a kargatzen…',
      emptyPool: 'Ez dago espeziearik pool-ean.',
      backSetadle: 'Itzuli Setadle-ra',
      kicker: 'Perretxiko Wordle · hezigarria · {{n}}. erronda',
      title: 'Perretxiko Wordle',
      lead: 'Asmatu izen arrunta (espaziorik gabe) {{max}} saiotan. Berdea = ondo, anbarra = beste tokian. Asmatu edo huts egin ondoren, hurrengoa automatikoki. Izena aplikazioaren hizkuntzaren araberakoa da.',
      streak: 'Bolada',
      day: 'Gaur',
      daily: 'Egunerokoa',
      streakMode: 'Bolada amaigabea',
      toSetadle: 'Beste Setadle moduak',
      letters: '{{n}} letra',
      hintFamily: 'Pista: izen arrunta zure hizkuntzan',
      boardAria: 'Taula',
      errLength: 'Hitzak {{n}} letra ditu (espaziorik gabe).',
      errDup: 'Hitz hori jada saiatu zara.',
      won: 'Asmatu duzu!',
      lost: 'Saiakerak amaitu dira',
      nextIn: 'Hurrengoa {{s}} s-an…',
      nextNow: 'Hurrengoa kargatzen…',
      nextNowBtn: 'Hurrengoa orain',
      openFiche: 'Ireki fitxa',
      safety: 'Joko hezigarria soilik. Ez du biltzeko edo jateko baimenik ematen.',
      kbAria: 'Teklatua',
      enter: 'Bidali',
    },
  },
}

function deepMerge(a, b) {
  for (const k of Object.keys(b)) {
    if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) {
      a[k] = a[k] && typeof a[k] === 'object' ? a[k] : {}
      deepMerge(a[k], b[k])
    } else {
      a[k] = b[k]
    }
  }
  return a
}

for (const loc of Object.keys(patches)) {
  const p = path.join(localesDir, loc, 'common.json')
  const j = JSON.parse(fs.readFileSync(p, 'utf8'))
  deepMerge(j, patches[loc])
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n')
  console.log('patched', p)
}
