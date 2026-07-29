/**
 * Acotados y parques micológicos de Castilla y León (provincia a provincia).
 * Fuentes: MicologíaCyL (permisos.micologiacyl.es), MicoCyL, Junta CyL (2026).
 * Educativo: enlaces a gestores oficiales — no es permiso de VisionSetil.
 */
import type { MushroomZone } from './mushroomZones'

const spp = {
  niscalo: ['Lactarius deliciosus', 'Lactarius sanguifluus', 'Suillus luteus'],
  boletus: ['Boletus edulis', 'Boletus pinophilus', 'Boletus aereus'],
  mix: [
    'Boletus edulis',
    'Lactarius deliciosus',
    'Cantharellus cibarius',
    'Macrolepiota procera',
    'Hydnum repandum',
  ],
}

/** Cotos / parques regulados CyL — uno o más pins por provincia. */
export const cylCotosZones: MushroomZone[] = [
  // ─── ÁVILA ───────────────────────────────────────────────────────────────
  {
    id: 'cyl-av-gredos',
    name: 'Acotado Gredos (AV-50003)',
    region: 'Castilla y León',
    provinces: ['Ávila'],
    lat: 40.348,
    lng: -5.142,
    description:
      'Acotado micológico oficial de Gredos (Ávila) en la red MicologíaCyL. Permisos recreativos y comerciales online. Hábitats de pinar y robledal de montaña.',
    habitat: 'Pinares y robledales de montaña',
    season: 'Otoño y primavera',
    abundance: 'alta',
    icon: '⛰️',
    species: [...spp.boletus, 'Lactarius deliciosus', 'Cantharellus cibarius'],
    tips: [
      'Permisos: permisos.micologiacyl.es/acotado/gredos',
      'Hoyos del Espino y entorno: accesos habituales',
      'Consulta cupos recreativo vs comercial en la ficha del acotado',
    ],
  },
  {
    id: 'cyl-av-montes-junta',
    name: 'Montes CyL en Ávila (AV-50006)',
    region: 'Castilla y León',
    provinces: ['Ávila'],
    lat: 40.52,
    lng: -4.9,
    description:
      'Acotado de montes de la Comunidad de Castilla y León en Ávila. Expedición telemática de permisos en MicologíaCyL.',
    habitat: 'Montes públicos de Ávila',
    season: 'Otoño',
    abundance: 'media',
    icon: '🌲',
    species: spp.mix,
    tips: [
      'Permisos: montes-comunidad-castilla-y-leon-en-avila',
      'Visor de acotados: micologiacyl.es/visor',
    ],
  },

  // ─── BURGOS ──────────────────────────────────────────────────────────────
  {
    id: 'cyl-bu-fresneda-tiron',
    name: 'Acotado Fresneda de la Sierra Tirón (BU-50073)',
    region: 'Castilla y León',
    provinces: ['Burgos'],
    lat: 42.31,
    lng: -3.13,
    description:
      'Acotado micológico en la Sierra de la Demanda / Tirón (Burgos). Permisos online vía MicologíaCyL.',
    habitat: 'Pinares y hayedos de montaña',
    season: 'Otoño',
    abundance: 'media',
    icon: '🌲',
    species: [...spp.boletus, 'Lactarius deliciosus', 'Hydnum repandum'],
    tips: [
      'Permisos: permisos.micologiacyl.es/acotado/fresneda-de-la-sierra-tiron',
      'Comprueba municipios incluidos en la ficha del acotado',
    ],
  },
  {
    id: 'cyl-bu-montes-oca',
    name: 'Acotado Montes de Oca (BU-50015)',
    region: 'Castilla y León',
    provinces: ['Burgos'],
    lat: 42.38,
    lng: -3.2,
    description:
      'Acotado Montes de Oca (Burgos) en la red de permisos MicologíaCyL. Bosques del corredor de Oca.',
    habitat: 'Robledales y pinares',
    season: 'Otoño',
    abundance: 'media',
    icon: '🌳',
    species: spp.mix,
    tips: [
      'Permisos: permisos.micologiacyl.es/acotado/montes-de-oca',
      'Verifica condiciones específicas del acotado en la campaña actual',
    ],
  },
  {
    id: 'cyl-bu-merindades',
    name: 'Merindades – acotados Burgos norte',
    region: 'Castilla y León',
    provinces: ['Burgos'],
    lat: 42.95,
    lng: -3.48,
    description:
      'Comarca de Las Merindades con varios montes y posibles acotados locales. Consulta el visor MicologíaCyL para el código exacto del coto.',
    habitat: 'Hayedos, robledales y pinares atlánticos',
    season: 'Otoño',
    abundance: 'alta',
    icon: '🍃',
    species: [
      'Boletus edulis',
      'Cantharellus cibarius',
      'Hydnum repandum',
      'Lactarius deliciosus',
      'Amanita caesarea',
    ],
    tips: [
      'Visor: micologiacyl.es/visor',
      'Expedición: micologiacyl.es/expedicion-de-permisos-micologicos',
    ],
  },
  {
    id: 'cyl-bu-demanda-san-millan',
    name: 'Acotado Demanda – San Millán (BU-50017)',
    region: 'Castilla y León',
    provinces: ['Burgos'],
    lat: 42.137,
    lng: -3.346,
    description:
      'Acotado micológico Sierra de la Demanda / San Millán de Lara (Burgos) en la red MicologíaCyL. Modalidades recreativas y comerciales con cupos por especie según ficha oficial. Orientación educativa: no autoriza recolección por sí sola.',
    habitat: 'Pinares y hayedos de la Demanda',
    season: 'Otoño',
    abundance: 'alta',
    icon: '🌲',
    species: [...spp.boletus, 'Lactarius deliciosus', 'Hydnum repandum'],
    tips: [
      'Permisos: permisos.micologiacyl.es/acotado/demanda-san-millan',
      'Consulta cupos y especies en la ficha del acotado',
      'Verifica municipios incluidos antes de planificar la salida',
    ],
  },
  {
    id: 'cyl-bu-valle-mena',
    name: 'Acotado Valle de Mena (BU-50019)',
    region: 'Castilla y León',
    provinces: ['Burgos'],
    lat: 43.102,
    lng: -3.282,
    description:
      'Acotado micológico del Valle de Mena (Burgos norte) en MicologíaCyL. Bosques atlánticos; permisos online. Solo orientación: el permiso lo emite el gestor oficial.',
    habitat: 'Bosques atlánticos y hayedos',
    season: 'Otoño',
    abundance: 'media',
    icon: '🌳',
    species: spp.mix,
    tips: [
      'Permisos: permisos.micologiacyl.es/acotado/valle-de-mena',
      'Centro de referencia aproximado: Villasana de Mena',
    ],
  },
  {
    id: 'cyl-bu-san-zadornil',
    name: 'Acotado San Zadornil (BU-50003)',
    region: 'Castilla y León',
    provinces: ['Burgos'],
    lat: 42.842,
    lng: -3.157,
    description:
      'Acotado municipal de San Zadornil (Burgos) con expedición online en MicologíaCyL. Montes del entorno de las Merindades. Educativo: enlaza al gestor; no es autorización de VisionSetil.',
    habitat: 'Montes y robledales de montaña',
    season: 'Otoño',
    abundance: 'media',
    icon: '🌲',
    species: spp.mix,
    tips: [
      'Permisos: permisos.micologiacyl.es/acotado/san-zadornil',
      'Listado de acotados: permisos.micologiacyl.es/acotados',
    ],
  },

  // ─── LEÓN ────────────────────────────────────────────────────────────────
  {
    id: 'cyl-le-rio-cea',
    name: 'Acotado Río Cea (LE-50003)',
    region: 'Castilla y León',
    provinces: ['León'],
    lat: 42.45,
    lng: -5.05,
    description:
      'Acotado Río Cea (León) con expedición de permisos en MicologíaCyL. Paisaje de riberas y montes leoneses.',
    habitat: 'Riberas, pinares y robledales',
    season: 'Otoño',
    abundance: 'media',
    icon: '🌿',
    species: spp.mix,
    tips: [
      'Permisos: permisos.micologiacyl.es/acotado/rio-cea',
      'Consulta municipios del acotado en la ficha oficial',
    ],
  },
  {
    id: 'cyl-le-laciana',
    name: 'Laciana – Alto Sil (León)',
    region: 'Castilla y León',
    provinces: ['León'],
    lat: 42.92,
    lng: -6.3,
    description:
      'Valle de Laciana y Alto Sil: hayedos y robledales atlánticos. Consulta acotados CyL y ENP en el visor oficial.',
    habitat: 'Hayedos y robledales atlánticos',
    season: 'Otoño',
    abundance: 'alta',
    icon: '🌳',
    species: [
      'Boletus edulis',
      'Cantharellus cibarius',
      'Hydnum repandum',
      'Russula virescens',
    ],
    tips: [
      'Portal MicologíaCyL + visor de acotados',
      'Respeta ENP y montes de utilidad pública',
    ],
  },
  {
    id: 'cyl-le-bierzo',
    name: 'El Bierzo – Ancares leoneses',
    region: 'Castilla y León',
    provinces: ['León'],
    lat: 42.55,
    lng: -6.6,
    description:
      'Bierzo y Ancares leoneses: castañares, robledales y pinares. Posibles acotados y montes con regulación; verifica en MicologíaCyL.',
    habitat: 'Castañares, robledales y pinares',
    season: 'Otoño',
    abundance: 'alta',
    icon: '🌰',
    species: [
      'Boletus edulis',
      'Cantharellus cibarius',
      'Amanita caesarea',
      'Macrolepiota procera',
    ],
    tips: [
      'micologiacyl.es · expedición y visor',
      'Ancares: también normativa gallega en la linde',
    ],
  },

  // ─── PALENCIA ────────────────────────────────────────────────────────────
  {
    id: 'cyl-pa-velilla',
    name: 'Parque micológico Velilla del Río Carrión (PMPA-50001)',
    region: 'Castilla y León',
    provinces: ['Palencia'],
    lat: 42.82,
    lng: -4.84,
    description:
      'Parque micológico de Velilla del Río Carrión (Palencia). Permisos online en MicologíaCyL. Montaña palentina y pinares de altura.',
    habitat: 'Pinares y robledales de montaña',
    season: 'Otoño',
    abundance: 'alta',
    icon: '🏔️',
    species: [...spp.boletus, 'Lactarius deliciosus', 'Hydnum repandum'],
    tips: [
      'Permisos: parque-micologico-velilla-del-rio-carrion',
      'Montaña Palentina: consulta también ENP Fuentes Carrionas',
    ],
  },
  {
    id: 'cyl-pa-fuentes-carrionas',
    name: 'Fuentes Carrionas – Cervera (Palencia)',
    region: 'Castilla y León',
    provinces: ['Palencia'],
    lat: 42.88,
    lng: -4.55,
    description:
      'Entorno del Parque Natural Fuentes Carrionas–Fuente Cobre. Hayedos y pinares; posibles acotados CyL colindantes.',
    habitat: 'Hayedos y pinares de montaña',
    season: 'Otoño',
    abundance: 'alta',
    icon: '🍃',
    species: [
      'Boletus edulis',
      'Cantharellus cibarius',
      'Hydnum repandum',
      'Lactarius deliciosus',
    ],
    tips: [
      'ENP: respeta usos del parque natural',
      'Permisos de acotados: MicologíaCyL',
    ],
  },
  {
    id: 'cyl-pa-triollo',
    name: 'Acotado Junta Vecinal de Triollo (PA-50033)',
    region: 'Castilla y León',
    provinces: ['Palencia'],
    lat: 42.924,
    lng: -4.681,
    description:
      'Acotado de la Junta Vecinal de Triollo (Montaña Palentina). Permisos vía MicologíaCyL. Zona de montaña; consulta ficha y ENP colindantes. Orientación educativa únicamente.',
    habitat: 'Montes de montaña palentina',
    season: 'Otoño',
    abundance: 'media',
    icon: '🏔️',
    species: [...spp.boletus, 'Lactarius deliciosus', 'Hydnum repandum'],
    tips: [
      'Permisos: permisos.micologiacyl.es/acotado/junta-vecinal-triollo',
      'Montaña Palentina: respeta ENP Fuentes Carrionas',
    ],
  },

  // ─── SALAMANCA ───────────────────────────────────────────────────────────
  {
    id: 'cyl-sa-francia-bejar',
    name: 'Parque micológico Sierras de Francia, Béjar, Quilamas y El Rebollar (PMSA-50001)',
    region: 'Castilla y León',
    provinces: ['Salamanca'],
    lat: 40.48,
    lng: -6.08,
    description:
      'Gran parque micológico de Salamanca (Sierras de Francia, Béjar, Quilamas y El Rebollar). Robledales y castañares con fuerte tradición. Permisos MicologíaCyL.',
    habitat: 'Robledales, castañares y pinares',
    season: 'Otoño',
    abundance: 'alta',
    icon: '🍂',
    species: [
      'Boletus edulis',
      'Cantharellus cibarius',
      'Amanita caesarea',
      'Macrolepiota procera',
      'Hydnum repandum',
    ],
    tips: [
      'Permisos: parque-micologico-sierras-de-francia-bejar-quilamas-y-el-rebollar',
      'Consulta municipios del parque en la ficha oficial',
    ],
  },
  {
    id: 'cyl-sa-ribera-canedo',
    name: 'Acotado Ribera de Cañedo (SA-50005)',
    region: 'Castilla y León',
    provinces: ['Salamanca'],
    lat: 41.206,
    lng: -5.896,
    description:
      'Acotado Ribera de Cañedo (~10.040 ha) en el programa MicoCyL / MicologíaCyL. Montes de Palacios del Arzobispo, Santiz, Valdelosa, Zamayón y otros (linde Salamanca/Zamora). Orientación educativa.',
    habitat: 'Riberas y montes mediterráneos',
    season: 'Otoño',
    abundance: 'media',
    icon: '🌾',
    species: spp.mix,
    tips: [
      'Permisos: permisos.micologiacyl.es/acotado/ribera-de-canedo',
      'Ficha: micocyl.es/areas/ribera-de-canedo',
      'Verifica campaña y tarifas en el portal de permisos',
    ],
  },

  // ─── SEGOVIA ─────────────────────────────────────────────────────────────
  {
    id: 'cyl-sg-montes-segovia',
    name: 'Acotado Montes de Segovia (SG-50002)',
    region: 'Castilla y León',
    provinces: ['Segovia'],
    lat: 41.274,
    lng: -3.477,
    description:
      'Gran acotado Montes de Segovia (~40.500 ha). Reconocimiento mutuo con Montes de la Comunidad en Segovia (SG-50005) en algunos permisos — confirma en la ficha actual de MicologíaCyL. Centro de referencia: sector Riaza / Ayllón.',
    habitat: 'Pinares y montes de Segovia',
    season: 'Otoño',
    abundance: 'alta',
    icon: '🌲',
    species: [...spp.niscalo, ...spp.boletus],
    tips: [
      'Permisos: permisos.micologiacyl.es/acotado/montes-de-segovia',
      'Valsaín y sierra: consulta también ENP Guadarrama',
    ],
  },
  {
    id: 'cyl-sg-montes-junta',
    name: 'Montes CyL en Segovia (SG-50005)',
    region: 'Castilla y León',
    provinces: ['Segovia'],
    lat: 40.943,
    lng: -4.109,
    description:
      'Montes de la Junta de Castilla y León en Segovia (SG-50005). Permisos y reconocimiento mutuo con Montes de Segovia (SG-50002) según campaña. Orientación educativa.',
    habitat: 'Pinares de la sierra y piedemonte',
    season: 'Otoño',
    abundance: 'alta',
    icon: '🌲',
    species: [...spp.boletus, 'Lactarius deliciosus', 'Suillus luteus'],
    tips: [
      'Permisos: montes-comunidad-castilla-y-leon-en-segovia',
      'Visor de acotados para límites exactos',
    ],
  },

  // ─── SORIA ───────────────────────────────────────────────────────────────
  {
    id: 'cyl-so-montes-soria',
    name: 'Parque Micológico Montes de Soria (PMSO-50001)',
    region: 'Castilla y León',
    provinces: ['Soria'],
    lat: 41.86,
    lng: -2.78,
    description:
      'Parque micológico de referencia en pinares sorianos. Decenas/centenas de miles de ha según acotados asociados. Permisos recreativos (p. ej. 5 kg/día según ficha) vía MicologíaCyL y Asociación Montes de Soria.',
    habitat: 'Pinares albares extensos',
    season: 'Otoño',
    abundance: 'alta',
    icon: '🍄',
    species: [
      'Lactarius deliciosus',
      'Boletus edulis',
      'Boletus pinophilus',
      'Tricholoma equestre',
      'Suillus luteus',
      'Hydnum repandum',
    ],
    tips: [
      'Permisos: permisos.micologiacyl.es/acotado/montes-de-soria',
      'Asociación: asociacionmontesdesoria.com',
      'Pinar Grande / Vinuesa / Covaleda: comarca clásica',
    ],
  },
  {
    id: 'cyl-so-montes-junta',
    name: 'Montes CyL en Soria (SO-50003)',
    region: 'Castilla y León',
    provinces: ['Soria'],
    lat: 41.72,
    lng: -2.52,
    description:
      'Acotado de montes de la Comunidad de Castilla y León en Soria. Permisos online; puede coexistir con el Parque Micológico Montes de Soria (ver reconocimiento mutuo en ficha).',
    habitat: 'Pinares y montes públicos sorianos',
    season: 'Otoño',
    abundance: 'alta',
    icon: '🌲',
    species: [...spp.niscalo, 'Boletus edulis', 'Boletus pinophilus'],
    tips: [
      'Permisos: montes-comunidad-y-castilla-leon-en-soria',
      'Junta CyL · aprovechamiento micológico',
    ],
  },
  {
    id: 'cyl-so-pinar-grande',
    name: 'Pinar Grande – comarca de Pinares (Soria)',
    region: 'Castilla y León',
    provinces: ['Soria'],
    lat: 41.9,
    lng: -2.85,
    description:
      'Pinar Grande y comarca de Pinares: corazón del micoturismo soriano. Integrado en la lógica del Parque Micológico Montes de Soria / acotados CyL.',
    habitat: 'Pinar de pino silvestre',
    season: 'Otoño (pico octubre)',
    abundance: 'alta',
    icon: '🌲',
    species: [
      'Lactarius deliciosus',
      'Boletus pinophilus',
      'Boletus edulis',
      'Tricholoma equestre',
    ],
    tips: [
      'Permiso del acotado/parque vigente obligatorio en zona regulada',
      'MicologíaCyL + Montes de Soria',
    ],
  },

  // ─── VALLADOLID ──────────────────────────────────────────────────────────
  {
    id: 'cyl-va-torozos',
    name: 'Acotado Torozos, Mayorga y Pinares de Valladolid (VA-50001)',
    region: 'Castilla y León',
    provinces: ['Valladolid'],
    lat: 41.774,
    lng: -5.041,
    description:
      'Acotado VA-50001 (~26.570 ha): Montes Torozos, Mayorga y pinares (Portillo, Olmedo…). Permisos para empadronados y generales según ficha MicologíaCyL. Centro de referencia: Castromonte (Torozos).',
    habitat: 'Pinares y páramos de Tierra de Campos / Torozos',
    season: 'Otoño',
    abundance: 'media',
    icon: '🌲',
    species: [...spp.niscalo, 'Macrolepiota procera', 'Boletus edulis'],
    tips: [
      'Permisos: torozos-mayorga-y-pinares-de-valladolid',
      'Modalidades: general / empadronado — lee la ficha',
    ],
  },

  // ─── ZAMORA ──────────────────────────────────────────────────────────────
  {
    id: 'cyl-za-noroeste',
    name: 'Parque micológico Montes del Noroeste Zamorano (PMZA-50001)',
    region: 'Castilla y León',
    provinces: ['Zamora'],
    lat: 42.05,
    lng: -6.4,
    description:
      'Parque micológico de los Montes del Noroeste Zamorano. Permisos online MicologíaCyL; modalidades para empadronados y visitantes.',
    habitat: 'Montes y pinares del noroeste de Zamora',
    season: 'Otoño',
    abundance: 'alta',
    icon: '🍄',
    species: spp.mix,
    tips: [
      'Permisos: parque-micologico-montes-del-noroeste-zamorano',
      'Consulta municipios del parque en la ficha',
    ],
  },
  {
    id: 'cyl-za-camarzana',
    name: 'Acotado Camarzana, Rabanales y otros (ZA-50024)',
    region: 'Castilla y León',
    provinces: ['Zamora'],
    lat: 41.98,
    lng: -6.03,
    description:
      'Acotado municipal Camarzana de Tera, Rabanales y otros (Zamora). Permisos vía MicologíaCyL; puede autorizar modalidades recreativa y comercial.',
    habitat: 'Montes y pinares de Sanabria–Carballeda / Tera',
    season: 'Otoño',
    abundance: 'media',
    icon: '🌲',
    species: [...spp.niscalo, 'Boletus edulis', 'Macrolepiota procera'],
    tips: [
      'Permisos: camarzana-de-tera-y-otros',
      'Lee condiciones de comercialización si aplica',
    ],
  },
  {
    id: 'cyl-za-sanabria',
    name: 'Sanabria – Lago y sierra (Zamora)',
    region: 'Castilla y León',
    provinces: ['Zamora'],
    lat: 42.12,
    lng: -6.72,
    description:
      'Entorno del Lago de Sanabria y sierras: hayedos y pinares. Combina Parque Natural con posibles acotados CyL del noroeste zamorano.',
    habitat: 'Hayedos, pinares y robledales de montaña',
    season: 'Otoño',
    abundance: 'alta',
    icon: '🏞️',
    species: [
      'Boletus edulis',
      'Cantharellus cibarius',
      'Hydnum repandum',
      'Lactarius deliciosus',
    ],
    tips: [
      'ENP Sanabria: respeta usos del parque',
      'Acotados: MicologíaCyL + Montes del Noroeste Zamorano',
    ],
  },
]
