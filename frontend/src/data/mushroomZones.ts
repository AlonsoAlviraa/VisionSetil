/**
 * Mushroom foraging zones of Spain.
 * Each zone has coordinates (lat/lng) for the map marker,
 * a description, best season, dominant habitat type,
 * and the list of scientific names that can be found there.
 * Scientific names are matched against mushroomDatabase.ts.
 */

export interface MushroomZone {
  id: string
  name: string
  region: string
  /** Province(s) */
  provinces: string[]
  /** Lat/lng for the map marker */
  lat: number
  lng: number
  /** Short description of the zone */
  description: string
  /** Dominant habitat / tree type */
  habitat: string
  /** Best foraging season */
  season: string
  /** Difficulty / abundance: 'alta' | 'media' | 'baja' */
  abundance: 'alta' | 'media' | 'baja'
  /** Icon emoji for the marker */
  icon: string
  /** Scientific names of species found here */
  species: string[]
  /** Tips for foragers */
  tips: string[]
}

import { additionalZones } from './additionalZones'
import { moreZones } from './moreZones'

export const mushroomZones: MushroomZone[] = [...additionalZones, ...moreZones,
  // ─── NORTE / CORDILLERA CANTÁBRICA ───
  {
    id: 'asturias-oriental',
    name: 'Asturias Oriental & Picos de Europa',
    region: 'Asturias',
    provinces: ['Asturias'],
    lat: 43.2796,
    lng: -5.1266,
    description:
      'Bosques atlánticos frondosos de hayas y robles. Una de las zonas más ricas en biodiversidad fúngica de España, con más de 2.500 especies catalogadas.',
    habitat: 'Hayedos y robledales atlánticos',
    season: 'Otoño (septiembre a diciembre)',
    abundance: 'alta',
    icon: '🌳',
    species: [
      'Boletus edulis',
      'Boletus aereus',
      'Cantharellus cibarius',
      'Hydnum repandum',
      'Russula virescens',
      'Lactarius deliciosus',
      'Amanita caesarea',
      'Macrolepiota procera',
    ],
    tips: [
      'Los hayedos de alto están en plena producción en octubre-noviembre',
      'Permiso de recolección necesario en el Parque Nacional',
      'Llevar cesta de mimbre (nunca bolsas de plástico)',
    ],
  },
  {
    id: 'cantabria-saja',
    name: 'Cordillera Cantábrica - Saja & Nansa',
    region: 'Cantabria',
    provinces: ['Cantabria'],
    lat: 43.1906,
    lng: -4.4211,
    description:
      'Valles del Saja y Nansa con robledales y hayedos bien conservados. Zona de gran tradición micóloga, con ferias importantes en autumn.',
    habitat: 'Robledales y hayedos',
    season: 'Otoño',
    abundance: 'alta',
    icon: '🌲',
    species: [
      'Boletus edulis',
      'Boletus pinophilus',
      'Cantharellus cibarius',
      'Hydnum repandum',
      'Russula cyanoxantha',
      'Lactarius deliciosus',
      'Coprinus comatus',
    ],
    tips: [
      'La zona de Carmona y Cabuérniga es muy productiva tras lluvias',
      'Respetar los límites de recolección en reservas',
      'Mejor en octubre tras primera lluvia importante',
    ],
  },
  {
    id: 'pais-vaso-izki',
    name: 'Parque Natural de Izki (Álava)',
    region: 'País Vasco',
    provinces: ['Álava'],
    lat: 42.7250,
    lng: -2.4333,
    description:
      'El hayedo más extenso del País Vasco. Parque Natural con gran producción de setas de otoño. Zona muy frecuentada por socios de sociedades micológicas.',
    habitat: 'Hayedos y robledales',
    season: 'Otoño',
    abundance: 'alta',
    icon: '🍂',
    species: [
      'Boletus edulis',
      'Boletus reticulatus',
      'Cantharellus cibarius',
      'Hydnum repandum',
      'Russula virescens',
      'Tricholoma equestre',
      'Marasmius oreades',
    ],
    tips: [
      'Requiere permiso de recogida del Parque Natural',
      'Zona de Corso y Okñana muy productiva',
      'Ferias micológicas en otoño en municipios cercanos',
    ],
  },
  {
    id: 'galicia-ancares',
    name: 'Serra dos Ancares (Galicia-León)',
    region: 'Galicia / Castilla y León',
    provinces: ['Lugo', 'León'],
    lat: 42.8333,
    lng: -6.9167,
    description:
      'Reserva de la Biosfera con uno de los mejores hayedos de la Península. Zona remota con enorme producción otoñal. Hayedos de altitud muy productivos.',
    habitat: 'Hayedos de montaña y robledales',
    season: 'Otoño',
    abundance: 'alta',
    icon: '🏔️',
    species: [
      'Boletus edulis',
      'Boletus aereus',
      'Cantharellus cibarius',
      'Hydnum repandum',
      'Russula virescens',
      'Amanita caesarea',
      'Morchella esculenta',
    ],
    tips: [
      'Acceso difícil, zona de montaña remota',
      'Mejor con vehículo todo terreno',
      'Octubre-noviembre es la temporada estrella',
    ],
  },

  // ─── PIRINEOS ───
  {
    id: 'pirineo-navarro',
    name: 'Pirineo Navarro - Selva de Irati',
    region: 'Navarra',
    provinces: ['Navarra'],
    lat: 42.9833,
    lng: -1.0833,
    description:
      'El segundo hayedo más grande de Europa. Uno de los paraísos micológicos de España. Producción espectacular en otoño, con enorme diversidad de especies.',
    habitat: 'Hayedos y abetales de montaña',
    season: 'Otoño (septiembre a noviembre)',
    abundance: 'alta',
    icon: '🌲',
    species: [
      'Boletus edulis',
      'Boletus pinophilus',
      'Cantharellus cibarius',
      'Hydnum repandum',
      'Russula virescens',
      'Lactarius deliciosus',
      'Morchella esculenta',
      'Calvatia gigantea',
    ],
    tips: [
      'Zona regulada, consultarpermisos en Valle de Aezkoa',
      'Ir temprano: se llena mucho en otoño',
      'Respetar áreas de reserva integral',
    ],
  },
  {
    id: 'pirineo-aragones',
    name: 'Pirineo Aragonés - Ordesa y Hecho',
    region: 'Aragón',
    provinces: ['Huesca'],
    lat: 42.6500,
    lng: 0.0167,
    description:
      'Valles glaciares con bosques mixtos de hayas, abetos y pinos. Parque Nacional de Ordesa y Monte Perdido. Altísima diversidad fúngica.',
    habitat: 'Bosques mixtos de montaña',
    season: 'Otoño',
    abundance: 'alta',
    icon: '⛰️',
    species: [
      'Boletus edulis',
      'Boletus pinophilus',
      'Cantharellus cibarius',
      'Hydnum repandum',
      'Lactarius deliciosus',
      'Russula virescens',
      'Suillus luteus',
    ],
    tips: [
      'Acceso regulado al Parque Nacional',
      'Valle de Hecho y Ansó muy productivos',
      'Consultar restricciones de aparcamiento',
    ],
  },
  {
    id: 'pirineo-catalan',
    name: 'Pirineo Catalán - Cerdanya y Alt Urgell',
    region: 'Cataluña',
    provinces: ['Girona', 'Lleida'],
    lat: 42.4000,
    lng: 1.8667,
    description:
      'Bosques mixtos alpinos con gran producción. Tradición micológica muy arraigada en Cataluña, con muchas jornadas micológicas en otoño.',
    habitat: 'Bosques mixtos y pinares alpinos',
    season: 'Otoño y primavera (morchellas)',
    abundance: 'alta',
    icon: '🍂',
    species: [
      'Boletus edulis',
      'Cantharellus cibarius',
      'Lactarius deliciosus',
      'Hydnum repandum',
      'Morchella esculenta',
      'Morchella elata',
      'Tuber melanosporum',
    ],
    tips: [
      'Zona de trufa cultivada (truferas de Guémoz)',
      'Spring para Morchella en zonas quemadas',
      'Ferias micológicas en octubre',
    ],
  },

  // ─── SISTEMA CENTRAL ───
  {
    id: 'sierra-guadarrama',
    name: 'Sierra de Guadarrama (Madrid-Segovia)',
    region: 'Madrid / Castilla y León',
    provinces: ['Madrid', 'Segovia'],
    lat: 40.7833,
    lng: -3.9500,
    description:
      'Parque Nacional cercano a Madrid. Pinares de Valsaín y robledales de alta montaña. Gran variedad de setas, muy frecuentado.',
    habitat: 'Pinares albares y robledales',
    season: 'Otoño y primavera',
    abundance: 'media',
    icon: '🌳',
    species: [
      'Boletus edulis',
      'Boletus pinophilus',
      'Lactarius deliciosus',
      'Lactarius sanguifluus',
      'Suillus luteus',
      'Tricholoma equestre',
      'Hydnum repandum',
    ],
    tips: [
      'Permiso obligatorio (Cerro de Hierro, Cotos)',
      'Aparcar solo en zonas autorizadas',
      'Mejor tras lluvias de septiembre',
    ],
  },
  {
    id: 'sierra-gredos',
    name: 'Sierra de Gredos (Ávila)',
    region: 'Castilla y León',
    provinces: ['Ávila'],
    lat: 40.2500,
    lng: -5.2667,
    description:
      'Pinares de montaña y robledales en un entorno de gran belleza. Producción muy variable según lluvias. Zona con poca presión recolectora.',
    habitat: 'Pinares y robledales de montaña',
    season: 'Otoño',
    abundance: 'media',
    icon: '🏔️',
    species: [
      'Boletus edulis',
      'Boletus pinophilus',
      'Lactarius deliciosus',
      'Suillus luteus',
      'Tricholoma equestre',
      'Cantharellus cibarius',
    ],
    tips: [
      'Zona poco explorrada, gran potencial',
      'Acceso por Hoyos del Espino',
      'Llevar mapa, cobertura móvil limitada',
    ],
  },

  // ─── LEVANTE / MEDITERRÁNEO ───
  {
    id: 'maestrazgo-castellon',
    name: 'Maestrazgo - Morella (Castellón)',
    region: 'Comunidad Valenciana',
    provinces: ['Castellón'],
    lat: 40.6333,
    lng: -0.1000,
    description:
      'Pinares mediterráneos de interior, zona estrella para el nízcalo (Lactarius deliciosus) o esclata-sang. Tradición micóloga valenciana muy fuerte.',
    habitat: 'Pinares mediterráneos de interior',
    season: 'Otoño (octubre a diciembre)',
    abundance: 'alta',
    icon: '🍷',
    species: [
      'Lactarius deliciosus',
      'Lactarius sanguifluus',
      'Boletus edulis',
      'Boletus pinophilus',
      'Tricholoma equestre',
      'Pleurotus eryngii',
      'Helvella crispa',
    ],
    tips: [
      'El "esclata-sang" es la estrella local',
      'Octubre-noviembre mejor temporada',
      'Cuidado con zonas privadas de caza',
    ],
  },
  {
    id: 'valencia-interior',
    name: 'Interior de Valencia - Serranía',
    region: 'Comunidad Valenciana',
    provinces: ['Valencia'],
    lat: 39.6000,
    lng: -0.8500,
    description:
      'Pinares y carrascales mediterráneos de interior. Buena producción de nizcalos y seta de cardo. Tierras bajas con cardos extensos.',
    habitat: 'Pinares y carrascales mediterráneos',
    season: 'Otoño',
    abundance: 'alta',
    icon: '🌿',
    species: [
      'Lactarius deliciosus',
      'Lactarius sanguifluus',
      'Pleurotus eryngii',
      'Tricholoma equestre',
      'Boletus edulis',
      'Suillus luteus',
    ],
    tips: [
      'La seta de cardo en estepas y campos',
      'Evitar zonas de caza menor',
      'Abril-mayo: temporada secundaria',
    ],
  },
  {
    id: 'alicante-alcoy',
    name: 'Sierra de Mariola (Alicante)',
    region: 'Comunidad Valenciana',
    provinces: ['Alicante'],
    lat: 38.7000,
    lng: -0.5333,
    description:
      'Parque Natural con pinares y carrascales mediterráneos. Conocida por su producción de nízcalos y setas mediterráneas. Zona de gran tradición.',
    habitat: 'Pinares mediterráneos',
    season: 'Otoño y primavera',
    abundance: 'media',
    icon: '🌲',
    species: [
      'Lactarius deliciosus',
      'Lactarius sanguifluus',
      'Pleurotus eryngii',
      'Tricholoma equestre',
      'Helvella crispa',
    ],
    tips: [
      'Banyulit, Bocairent: zona muy frecuentada',
      'Mejor tras lluvias torrenciales de otoño',
      'Planificar acceso: carreteras estrechas',
    ],
  },

  // ─── CATALUÑA INTERIOR / PRELITORAL ───
  {
    id: 'catalunya-prepirineo',
    name: 'Prepirineo de Lleida - Solsonès',
    region: 'Cataluña',
    provinces: ['Lleida'],
    lat: 41.8500,
    lng: 1.5167,
    description:
      'Una de las comarcas con más tradición micóloga de Cataluña. Pinares y robledales con grandes producciones. Capital cultural de la micología catalana.',
    habitat: 'Pinares y robledales submediterráneos',
    season: 'Otoño y primavera',
    abundance: 'alta',
    icon: '🍂',
    species: [
      'Lactarius deliciosus',
      'Lactarius sanguifluus',
      'Boletus edulis',
      'Cantharellus cibarius',
      'Hydnum repandum',
      'Tricholoma equestre',
      'Morchella esculenta',
    ],
    tips: [
      'Fira del Bolet de Sant Llorenç en octubre',
      'Zona de trufa importante',
      'Acceso a pinares por Olius',
    ],
  },

  // ─── ANDALUCÍA ───
  {
    id: 'andalucia-granada',
    name: 'Sierra de Huétor y Sierra Nevada (Granada)',
    region: 'Andalucía',
    provinces: ['Granada'],
    lat: 37.2500,
    lng: -3.4500,
    description:
      'Pinares de alta montaña mediterránea. Gran producción de boletus y nízcalos. Una de las zonas más ricas del sur de España.',
    habitat: 'Pinares de alta montaña mediterránea',
    season: 'Otoño y primavera',
    abundance: 'alta',
    icon: '⛰️',
    species: [
      'Boletus edulis',
      'Boletus pinophilus',
      'Lactarius deliciosus',
      'Lactarius sanguifluus',
      'Tricholoma equestre',
      'Suillus luteus',
    ],
    tips: [
      'Sierra de Huétor: Parque Natural regulado',
      'Acceso a 2000m, llevar abrigo',
      'Primavera con deshielo: gran producción',
    ],
  },
  {
    id: 'andalucia-jaen-cazorla',
    name: 'Sierra de Cazorla (Jaén)',
    region: 'Andalucía',
    provinces: ['Jaén'],
    lat: 37.9167,
    lng: -2.9333,
    description:
      'El Parque Natural protegido más grande de España. Pinares y sabinares con gran biodiversidad. Espectaculares producciones en otoño.',
    habitat: 'Pinares y sabinares mediterráneos',
    season: 'Otoño y primavera',
    abundance: 'media',
    icon: '🌳',
    species: [
      'Boletus edulis',
      'Lactarius deliciosus',
      'Lactarius sanguifluus',
      'Tricholoma equestre',
      'Suillus luteus',
      'Pleurotus eryngii',
    ],
    tips: [
      'Parque Natural con regulación específica',
      'Zona extensa, planificar recorridos',
      'Cazorla pueblo como punto de partida',
    ],
  },
  {
    id: 'andalucia-huelva-aracena',
    name: 'Sierra de Aracena (Huelva)',
    region: 'Andalucía',
    provinces: ['Huelva'],
    lat: 37.8667,
    lng: -6.5667,
    description:
      'Castañares y robledales atlánticos del sur. Espectacular producción de setas de castaño en otoño. Zona de gran tradición gastronómica.',
    habitat: 'Castañares y robledales',
    season: 'Otoño',
    abundance: 'alta',
    icon: '🌰',
    species: [
      'Boletus aereus',
      'Boletus edulis',
      'Cantharellus cibarius',
      'Russula virescens',
      'Lactarius deliciosus',
      'Macrolepiota procera',
    ],
    tips: [
      'La seta de castaño es estrella local',
      'Jabugo y Aracena: puntos de partida',
      'Octubre-noviembre tras castañas caídas',
    ],
  },
  {
    id: 'andalucia-malaga-rionda',
    name: 'Serranía de Ronda (Málaga)',
    region: 'Andalucía',
    provinces: ['Málaga'],
    lat: 36.7333,
    lng: -5.1667,
    description:
      'Pinares y alcornocales andaluces. Diversidad de setas mediterráneas con producción otoñal e invernal tras lluvias.',
    habitat: 'Pinares y alcornocales mediterráneos',
    season: 'Otoño e invierno',
    abundance: 'media',
    icon: '🌲',
    species: [
      'Boletus edulis',
      'Lactarius deliciosus',
      'Tricholoma equestre',
      'Pleurotus eryngii',
      'Cantharellus cibarius',
    ],
    tips: [
      'Sierra de las Nieves: Parque Nacional',
      'Mejor tras lluvias otoñales',
      'Combinar con turismo gastronómico',
    ],
  },

  // ─── EXTREMADURA ───
  {
    id: 'extremadura-caceres',
    name: 'Sierra de Gata y Las Hurdes (Cáceres)',
    region: 'Extremadura',
    provinces: ['Cáceres'],
    lat: 40.2167,
    lng: -6.5833,
    description:
      'Castañares extremehos únicos en España. Producción espectacular de setas de castaño. Comarca con poca presión recolectora.',
    habitat: 'Castañares y robledales',
    season: 'Otoño',
    abundance: 'alta',
    icon: '🌰',
    species: [
      'Boletus aereus',
      'Boletus edulis',
      'Cantharellus cibarius',
      'Russula virescens',
      'Lactarius deliciosus',
      'Macrolepiota procera',
      'Coprinus comatus',
    ],
    tips: [
      'Castañares de Hervás muy productivos',
      'Hurdes: comarca remota poco explorada',
      'Ruta de los castaños floridos en primavera',
    ],
  },
  {
    id: 'extremadura-badajoz',
    name: 'Siberia Extremeña (Badajoz)',
    region: 'Extremadura',
    provinces: ['Badajoz'],
    lat: 39.0833,
    lng: -5.0333,
    description:
      'Dehesas y pinares de la Siberia Extremeña. Gran extensión de encinares y pinares con producción de setas mediterráneas.',
    habitat: 'Dehesas y pinares',
    season: 'Otoño y primavera',
    abundance: 'media',
    icon: '🌳',
    species: [
      'Boletus aereus',
      'Boletus edulis',
      'Lactarius deliciosus',
      'Pleurotus eryngii',
      'Tricholoma equestre',
      'Cantharellus cibarius',
    ],
    tips: [
      'Zona de dehesas, cuidar con ganado',
      'Mejor en primavera con deshielo',
      'Talarrubias como punto de partida',
    ],
  },

  // ─── CASTILLA Y LEÓN (más zonas) ───
  {
    id: 'leon-picos',
    name: 'Picos de Europa - Valdeón (León)',
    region: 'Castilla y León',
    provinces: ['León'],
    lat: 43.1500,
    lng: -4.9000,
    description:
      'Bosques mixtos de montaña en pleno macizo de los Picos. Producción otoñal abundante con gran diversidad. Paisaje espectacular.',
    habitat: 'Bosques mixtos de montaña',
    season: 'Otoño',
    abundance: 'alta',
    icon: '🏔️',
    species: [
      'Boletus edulis',
      'Boletus aereus',
      'Cantharellus cibarius',
      'Hydnum repandum',
      'Russula virescens',
      'Lactarius deliciosus',
    ],
    tips: [
      'Acceso por Caín de Valdeón',
      'Zona de alta montaña, precaución con clima',
      'Permiso en Parque Nacional',
    ],
  },
  {
    id: 'soria-pinares',
    name: 'Pinares de Soria - Vinuesa',
    region: 'Castilla y León',
    provinces: ['Soria'],
    lat: 41.9167,
    lng: -2.7667,
    description:
      'Los pinares más extensos de Castilla. Producción espectacular de nízcalos y seta de los caballeros. Tradición muy fuerte.',
    habitat: 'Pinares albares extensos',
    season: 'Otoño',
    abundance: 'alta',
    icon: '🌲',
    species: [
      'Lactarius deliciosus',
      'Lactarius sanguifluus',
      'Tricholoma equestre',
      'Boletus edulis',
      'Boletus pinophilus',
      'Suillus luteus',
    ],
    tips: [
      'Vinuesa y Covaleda como puntos de partida',
      'Temporada alta: octubre',
      'Consultar ordenanzas de recolección',
    ],
  },
  {
    id: 'palencia-aguilar',
    name: 'Montaña Palentina - Aguilar de Campoo',
    region: 'Castilla y León',
    provinces: ['Palencia'],
    lat: 42.7950,
    lng: -4.2603,
    description:
      'Bosques mixtos y pinares de montaña. Una de las zonas con mejor producción de boletus de Castilla y León.',
    habitat: 'Bosques mixtos y pinares',
    season: 'Otoño',
    abundance: 'alta',
    icon: '🍂',
    species: [
      'Boletus edulis',
      'Boletus pinophilus',
      'Lactarius deliciosus',
      'Cantharellus cibarius',
      'Hydnum repandum',
      'Tricholoma equestre',
    ],
    tips: [
      'Valle de Polaciones muy productivo',
      'Acceso por Aguilar de Campoo',
      'Bienes de propio con regulación',
    ],
  },

  // ─── CASTILLA-LA MANCHA ───
  {
    id: 'clm-cuenca',
    name: 'Serranía de Cuenca',
    region: 'Castilla-La Mancha',
    provinces: ['Cuenca'],
    lat: 40.3000,
    lng: -1.9667,
    description:
      'Pinares y sabinares únicos en un karst espectacular. Gran producción de setas mediterráneas y de montaña.',
    habitat: 'Pinares, sabinares y robledales',
    season: 'Otoño y primavera',
    abundance: 'media',
    icon: '🌳',
    species: [
      'Lactarius deliciosus',
      'Lactarius sanguifluus',
      'Boletus edulis',
      'Tricholoma equestre',
      'Suillus luteus',
      'Hydnum repandum',
    ],
    tips: [
      'Ciudad Encantada: paisaje único',
      'Tragaciel y Beteta como zonas clave',
      'Respetar sabinares protegidos',
    ],
  },
  {
    id: 'clm-toledo',
    name: 'Montes de Toledo',
    region: 'Castilla-La Mancha',
    provinces: ['Toledo', 'Ciudad Real'],
    lat: 39.5500,
    lng: -4.4500,
    description:
      'Dehesas y montes mediterráneos. Zona tradicional de seta de cardo y especies de dehesa. Producción variable según lluvias.',
    habitat: 'Dehesas y montes mediterráneos',
    season: 'Otoño y primavera',
    abundance: 'media',
    icon: '🌿',
    species: [
      'Pleurotus eryngii',
      'Boletus aereus',
      'Lactarius deliciosus',
      'Tricholoma equestre',
      'Cantharellus cibarius',
    ],
    tips: [
      'La seta de cardo es la estrella',
      'Dehesas con ganado bravo: precaución',
      'Cabañeros: Parque Nacional regulado',
    ],
  },

  // ─── LA RIOJA ───
  {
    id: 'rioja-cameros',
    name: 'Sierra de los Cameros (La Rioja)',
    region: 'La Rioja',
    provinces: ['La Rioja'],
    lat: 42.2167,
    lng: -2.5167,
    description:
      'Pinares y robledales de montaña. Una de las comarcas más productivas del norte. Jornadas Micológicas nacionales en Logroño.',
    habitat: 'Pinares y robledales',
    season: 'Otoño y primavera',
    abundance: 'alta',
    icon: '🍷',
    species: [
      'Boletus edulis',
      'Lactarius deliciosus',
      'Tricholoma equestre',
      'Cantharellus cibarius',
      'Hydnum repandum',
      'Morchella esculenta',
    ],
    tips: [
      'Zona de trufa cultivada en zonas bajas',
      'Mejor en octubre tras lluvias',
      'Feria del hongo en Lumbreras',
    ],
  },

  // ─── ARAGÓN / SISTEMA IBÉRICO ───
  {
    id: 'aragon-teruel',
    name: 'Maestrazgo Turolense',
    region: 'Aragón',
    provinces: ['Teruel'],
    lat: 40.5000,
    lng: -0.4500,
    description:
      'Pinares y sabinares del Sistema Ibérico. Gran producción de nízcalos y trufa negra. Una de las principales zonas truferas del mundo.',
    habitat: 'Pinares, sabinares y encinares',
    season: 'Otoño e invierno (trufa)',
    abundance: 'alta',
    icon: '💎',
    species: [
      'Tuber melanosporum',
      'Lactarius deliciosus',
      'Lactarius sanguifluus',
      'Boletus edulis',
      'Tricholoma equestre',
      'Pleurotus eryngii',
    ],
    tips: [
      'Sarrión: capital mundial de la trufa',
      'Zona trufera por excelencia de España',
      'Trufa: invierno con perros entrenados',
    ],
  },

  // ─── CANARIAS ───
  {
    id: 'canarias-tenerife',
    name: 'Bosque de la Laurisilva (Tenerife)',
    region: 'Canarias',
    provinces: ['Santa Cruz de Tenerife'],
    lat: 28.3167,
    lng: -16.6333,
    description:
      'Bosque relicto subtropical único. Flora y fauna endémica. Producción de setas en otoño-invierno. Especies diferentes al continente.',
    habitat: 'Laurisilva subtropical',
    season: 'Invierno (diciembre a marzo)',
    abundance: 'media',
    icon: '🌴',
    species: [
      'Pleurotus ostreatus',
      'Lactarius deliciosus',
      'Cantharellus cibarius',
      'Agaricus campestris',
    ],
    tips: [
      'Especies distintas al resto de España',
      'Bosque del Monte del Agua',
      'Mejor en invierno con lluvias atlánticas',
    ],
  },

  // ─── BALEARES ───
  {
    id: 'baleares-mallorca',
    name: 'Serra de Tramuntana (Mallorca)',
    region: 'Islas Baleares',
    provinces: ['Islas Baleares'],
    lat: 39.7333,
    lng: 2.7500,
    description:
      'Patrimonio Mundial. Encinares y pinares mediterráneos en sierras calcáreas. Producción variable, mejor tras lluvias otoñales.',
    habitat: 'Encinares y pinares mediterráneos',
    season: 'Otoño',
    abundance: 'baja',
    icon: '🏝️',
    species: [
      'Boletus edulis',
      'Lactarius deliciosus',
      'Pleurotus eryngii',
      'Cantharellus cibarius',
    ],
    tips: [
      'Patrimonio Mundial, respeto máximo',
      'Producción menor, pero calidad',
      'Mejor en Valldemossa y Esporles',
    ],
  },

  // ─── MURCIA ───
  {
    id: 'murcia-interior',
    name: 'Sierra de Espuña (Murcia)',
    region: 'Murcia',
    provinces: ['Murcia'],
    lat: 37.8500,
    lng: -1.5000,
    description:
      'Parque Natural con pinares mediterráneos reforestados. Producción de nízcalos y setas mediterráneas tras lluvias.',
    habitat: 'Pinares mediterráneos',
    season: 'Otoño y primavera',
    abundance: 'media',
    icon: '🌳',
    species: [
      'Lactarius deliciosus',
      'Lactarius sanguifluus',
      'Tricholoma equestre',
      'Pleurotus eryngii',
      'Boletus edulis',
    ],
    tips: [
      'Parque Natural con regulación',
      'Mejor tras lluvias de otoño',
      'Berro y Totana como puntos de partida',
    ],
  },
]

/** Spain center for initial map view */
export const SPAIN_CENTER: [number, number] = [40.0, -3.5]
export const SPAIN_ZOOM = 6

export function getZonesByRegion(region: string): MushroomZone[] {
  return mushroomZones.filter((z) => z.region === region)
}

export function getZoneById(id: string): MushroomZone | undefined {
  return mushroomZones.find((z) => z.id === id)
}

export function getAllRegions(): string[] {
  return [...new Set(mushroomZones.map((z) => z.region))].sort()
}