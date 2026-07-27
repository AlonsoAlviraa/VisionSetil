/**
 * Extra map zones: parques micológicos y acotados regulados emblemáticos.
 * Merged into mushroomZones list for map coverage.
 */
import type { MushroomZone } from './mushroomZones'

/** Iconic regulated parks / acotados not always present as dedicated pins. */
export const mycologicalParksZones: MushroomZone[] = [
  {
    id: 'park-albarracin',
    name: 'Parque micológico Comunidad de Albarracín',
    region: 'Aragón',
    provinces: ['Teruel'],
    lat: 40.4067,
    lng: -1.4439,
    description:
      'Uno de los grandes parques micológicos de Aragón (decenas de miles de ha). Hábitats variados en la sierra de Albarracín. La recolección en zona regulada requiere permiso del parque (MicoAragón).',
    habitat: 'Pinares, sabinares y bosques de montaña',
    season: 'Otoño e invierno',
    abundance: 'alta',
    icon: '🌲',
    species: [
      'Lactarius deliciosus',
      'Boletus edulis',
      'Hygrophorus marzuolus',
      'Tricholoma equestre',
      'Suillus luteus',
    ],
    tips: [
      'Tramita el permiso en MicoAragón / micologiaalbarracin.es',
      'Respeta cupos y especies permitidas del Decreto 179/2014',
      'Educativo: consulta siempre la ordenanza del parque',
    ],
  },
  {
    id: 'park-montes-soria',
    name: 'Parque Micológico Montes de Soria',
    region: 'Castilla y León',
    provinces: ['Soria'],
    lat: 41.85,
    lng: -2.75,
    description:
      'Parque micológico de referencia en pinares sorianos (decenas/centenas de miles de ha según acotados asociados). Permisos recreativos y de temporada vía MicologíaCyL y Asociación Montes de Soria.',
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
      'Permisos: permisos.micologiacyl.es → Montes de Soria',
      'También acotado Montes CyL en Soria (SO-50003)',
      'Pinar Grande y comarca de Pinares: tradición muy fuerte',
    ],
  },
  {
    id: 'park-gredos-acotado',
    name: 'Acotado micológico Gredos (Ávila)',
    region: 'Castilla y León',
    provinces: ['Ávila'],
    lat: 40.35,
    lng: -5.15,
    description:
      'Acotado AV-50003 Gredos del programa MicologíaCyL / MicoCyL. Permisos recreativos y comerciales online. Complementa los Montes de la Comunidad en Ávila.',
    habitat: 'Pinares y robledales de montaña',
    season: 'Otoño y primavera',
    abundance: 'alta',
    icon: '⛰️',
    species: [
      'Boletus edulis',
      'Boletus pinophilus',
      'Lactarius deliciosus',
      'Cantharellus cibarius',
      'Macrolepiota procera',
    ],
    tips: [
      'Permisos: permisos.micologiacyl.es/acotado/gredos',
      'Consulta tarifas recreativo vs comercial en MicoCyL',
      'Hoyos del Espino y entorno: accesos habituales',
    ],
  },
  {
    id: 'park-montes-cyl-avila',
    name: 'Montes CyL en Ávila (acotado)',
    region: 'Castilla y León',
    provinces: ['Ávila'],
    lat: 40.45,
    lng: -4.85,
    description:
      'Acotado de montes de la Comunidad de Castilla y León en Ávila (AV-50006). Expedición telemática de permisos en el portal MicologíaCyL.',
    habitat: 'Montes públicos de Ávila',
    season: 'Otoño',
    abundance: 'media',
    icon: '🌲',
    species: [
      'Boletus edulis',
      'Lactarius deliciosus',
      'Macrolepiota procera',
      'Cantharellus cibarius',
    ],
    tips: [
      'Permisos: montes-comunidad-castilla-y-leon-en-avila',
      'Visor de acotados: micologiacyl.es/visor',
    ],
  },
  {
    id: 'park-montes-cyl-soria',
    name: 'Montes CyL en Soria (acotado)',
    region: 'Castilla y León',
    provinces: ['Soria'],
    lat: 41.75,
    lng: -2.55,
    description:
      'Acotado de montes de la Comunidad en Soria (SO-50003). Permisos online; coexisten con el Parque Micológico Montes de Soria (reconocimiento mutuo en algunos casos — verifica ficha actual).',
    habitat: 'Pinares y montes públicos sorianos',
    season: 'Otoño',
    abundance: 'alta',
    icon: '🌲',
    species: [
      'Lactarius deliciosus',
      'Boletus edulis',
      'Boletus pinophilus',
      'Suillus luteus',
    ],
    tips: [
      'Permisos MicologíaCyL · Montes CyL en Soria',
      'Comprueba ficha del acotado en la campaña en curso',
    ],
  },
  {
    id: 'park-sierras-francia',
    name: 'Sierras de Francia (acotados CyL)',
    region: 'Castilla y León',
    provinces: ['Salamanca'],
    lat: 40.5,
    lng: -6.05,
    description:
      'Comarca de Las Batuecas–Sierra de Francia con acotados en la red MicologíaCyL / MicoCyL. Robledales y castañares con fuerte tradición micológica.',
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
      'Usa el visor MicologíaCyL para el acotado exacto',
      'Expedición de permisos en micologiacyl.es',
    ],
  },
]
