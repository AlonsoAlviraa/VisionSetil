/**
 * Extra regulated / educational mycological zones (2026 expansion).
 * Official-manager framing only — VisionSetil does not sell permits
 * or authorize foraging/consumption.
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
  atlantic: [
    'Boletus edulis',
    'Cantharellus cibarius',
    'Hydnum repandum',
    'Russula virescens',
    'Amanita caesarea',
  ],
  mediterranean: [
    'Lactarius deliciosus',
    'Suillus luteus',
    'Macrolepiota procera',
    'Amanita caesarea',
    'Boletus aereus',
  ],
  dehesa: [
    'Amanita caesarea',
    'Boletus aereus',
    'Macrolepiota procera',
    'Agaricus campestris',
    'Lactarius deliciosus',
  ],
}

/** New pins — educational, with tips pointing to official managers where known. */
export const extraCotosZones: MushroomZone[] = [
  // ─── LA RIOJA ────────────────────────────────────────────────────────────
  {
    id: 'coto-lr-cameros',
    name: 'Sierra de Cameros (montes de La Rioja)',
    region: 'La Rioja',
    provinces: ['La Rioja'],
    lat: 42.168,
    lng: -2.645,
    description:
      'Montes de Cameros y entorno de hayedo-pinar. En montes públicos y acotados puede exigirse autorización o cupos locales. Solo orientación educativa; consulta el ayuntamiento o la web de la comunidad.',
    habitat: 'Hayedos, pinares y pastizales de sierra',
    season: 'Otoño (septiembre–noviembre)',
    abundance: 'alta',
    icon: '🌲',
    species: [...spp.boletus, 'Lactarius deliciosus', 'Hydnum repandum'],
    tips: [
      'Consulta normativa de montes de La Rioja / ayuntamientos locales',
      'Respeta señalización de acotados y cupos',
      'Educativo: no es permiso de VisionSetil',
    ],
  },
  {
    id: 'coto-lr-demanda',
    name: 'Sierra de la Demanda (vertiente riojana)',
    region: 'La Rioja',
    provinces: ['La Rioja'],
    lat: 42.205,
    lng: -3.05,
    description:
      'Vertiente riojana de la Sierra de la Demanda. Bosques de haya y pino con alta diversidad fúngica. Zonas de monte público y regulaciones locales variables.',
    habitat: 'Hayedos y pinares de montaña',
    season: 'Otoño',
    abundance: 'alta',
    icon: '⛰️',
    species: spp.atlantic,
    tips: [
      'Cruza con normativa de montes y ENP colindantes',
      'Lleva cesta rígida y corta con navaja (buenas prácticas educativas)',
    ],
  },

  // ─── EXTREMADURA ─────────────────────────────────────────────────────────
  {
    id: 'coto-ex-gredos-sur',
    name: 'Valle del Jerte / Gredos sur (Cáceres)',
    region: 'Extremadura',
    provinces: ['Cáceres'],
    lat: 40.22,
    lng: -5.75,
    description:
      'Vertiente extremeña de Gredos y Jerte. Castañares, robledales y pinares. En montes públicos y cotos municipales puede requerirse autorización; confirma en el ayuntamiento o la Junta.',
    habitat: 'Castañares, robledales y pinares',
    season: 'Otoño y primavera',
    abundance: 'alta',
    icon: '🌰',
    species: [...spp.boletus, 'Amanita caesarea', 'Cantharellus cibarius'],
    tips: [
      'Información de montes · Junta de Extremadura',
      'No recolectes en fincas privadas sin permiso del titular',
    ],
  },
  {
    id: 'coto-ex-hurdes',
    name: 'Las Hurdes (Cáceres)',
    region: 'Extremadura',
    provinces: ['Cáceres'],
    lat: 40.38,
    lng: -6.28,
    description:
      'Comarca de Las Hurdes: pinares, jarales y robledales. Interés micológico elevado en otoño. Regulación local por municipios y montes públicos.',
    habitat: 'Pinares y matorral mediterráneo de sierra',
    season: 'Otoño',
    abundance: 'media',
    icon: '🌲',
    species: spp.mediterranean,
    tips: [
      'Consulta el ayuntamiento de la zona antes de recolectar',
      'Educativo · no autoriza consumo',
    ],
  },
  {
    id: 'coto-ex-monfrague',
    name: 'Entorno de Monfragüe (Cáceres)',
    region: 'Extremadura',
    provinces: ['Cáceres'],
    lat: 39.84,
    lng: -6.03,
    description:
      'Dehesas y sierras del entorno del Parque Nacional de Monfragüe. En el PN y zonas de protección la recolección está restringida o prohibida. Solo estudio de distribución educativa.',
    habitat: 'Dehesa y matorral mediterráneo',
    season: 'Otoño e invierno',
    abundance: 'media',
    icon: '🦅',
    species: spp.dehesa,
    tips: [
      'En el Parque Nacional prioriza observación; no recolectes sin autorización expresa',
      'Fuera del PN aplica normativa de montes de Extremadura',
    ],
  },

  // ─── CASTILLA-LA MANCHA ──────────────────────────────────────────────────
  {
    id: 'coto-cm-alto-tajo',
    name: 'Alto Tajo (Guadalajara)',
    region: 'Castilla-La Mancha',
    provinces: ['Guadalajara'],
    lat: 40.72,
    lng: -2.05,
    description:
      'Parque Natural del Alto Tajo y montes limítrofes. Pinares y quejigares con interés micológico. En ENP y montes públicos rigen cupos y autorizaciones de la Junta / ayuntamientos.',
    habitat: 'Pinares y quejigares de paramera',
    season: 'Otoño',
    abundance: 'alta',
    icon: '🌲',
    species: [...spp.niscalo, 'Boletus edulis', 'Tricholoma terreum'],
    tips: [
      'Normativa de ENP y montes · Junta de Castilla-La Mancha',
      'Respeta cupos y especies protegidas',
    ],
  },
  {
    id: 'coto-cm-serrania-cuenca',
    name: 'Serranía de Cuenca',
    region: 'Castilla-La Mancha',
    provinces: ['Cuenca'],
    lat: 40.12,
    lng: -1.95,
    description:
      'Serranía de Cuenca: pinares de pino laricio y albar. Níscalos y boletáceas en temporada. Cotos y montes con regulación autonómica y local.',
    habitat: 'Pinares de montaña',
    season: 'Otoño e invierno',
    abundance: 'alta',
    icon: '🌲',
    species: spp.niscalo,
    tips: [
      'Consulta permisos y acotados en la provincia de Cuenca',
      'Educativo · no es guía de recolección libre',
    ],
  },
  {
    id: 'coto-cm-cabaneros',
    name: 'Entorno de Cabañeros (Ciudad Real / Toledo)',
    region: 'Castilla-La Mancha',
    provinces: ['Ciudad Real', 'Toledo'],
    lat: 39.35,
    lng: -4.5,
    description:
      'Dehesas y sierras del entorno del Parque Nacional de Cabañeros. Dentro del PN la recolección está muy limitada. Pin educativo de distribución regional.',
    habitat: 'Dehesa, jarales y robledales',
    season: 'Otoño',
    abundance: 'media',
    icon: '🦌',
    species: spp.dehesa,
    tips: [
      'En el PN Cabañeros prioriza visita guiada / observación',
      'Fuera del PN: normativa de montes de CLM',
    ],
  },

  // ─── MADRID ──────────────────────────────────────────────────────────────
  {
    id: 'coto-md-guadarrama',
    name: 'Sierra de Guadarrama (vertiente madrileña)',
    region: 'Madrid',
    provinces: ['Madrid'],
    lat: 40.75,
    lng: -3.98,
    description:
      'Pinares y robledales de la sierra madrileña. En el Parque Nacional y montes protegidos la recolección está regulada o prohibida. Solo orientación educativa de hábitats.',
    habitat: 'Pinares de pino silvestre y robledales',
    season: 'Otoño',
    abundance: 'media',
    icon: '⛰️',
    species: [...spp.boletus, 'Lactarius deliciosus', 'Tricholoma terreum'],
    tips: [
      'Consulta normas del PN Sierra de Guadarrama y montes de la CAM',
      'Muchas zonas son solo observación',
    ],
  },
  {
    id: 'coto-md-rascafria',
    name: 'Valle de Lozoya / Rascafría',
    region: 'Madrid',
    provinces: ['Madrid'],
    lat: 40.905,
    lng: -3.88,
    description:
      'Valle de Lozoya: hayedos y pinares con tradición micológica. Superposición de montes públicos, ENP y regulaciones locales.',
    habitat: 'Hayedos y pinares de valle',
    season: 'Otoño',
    abundance: 'alta',
    icon: '🌳',
    species: spp.atlantic,
    tips: [
      'Infórmate en el ayuntamiento y en la red de parques de la CAM',
      'Educativo · multi-vista en campo si identificas',
    ],
  },

  // ─── COMUNITAT VALENCIANA ────────────────────────────────────────────────
  {
    id: 'coto-vc-espada',
    name: 'Sierra de Espadán (Castellón)',
    region: 'Comunitat Valenciana',
    provinces: ['Castellón'],
    lat: 39.88,
    lng: -0.45,
    description:
      'Parque Natural de la Sierra de Espadán: alcornoques, pinares y umbrías. Recolección sujeta a normativa de ENP y montes de la Generalitat Valenciana.',
    habitat: 'Alcornocales y pinares',
    season: 'Otoño e invierno',
    abundance: 'media',
    icon: '🌲',
    species: spp.mediterranean,
    tips: [
      'Normativa de parques naturales · gva.es',
      'Cupos y especies permitidas según decreto autonómico',
    ],
  },
  {
    id: 'coto-vc-mariola',
    name: 'Serra de Mariola (Alicante / Valencia)',
    region: 'Comunitat Valenciana',
    provinces: ['Alicante', 'Valencia'],
    lat: 38.75,
    lng: -0.55,
    description:
      'Parque Natural de la Serra de Mariola. Montes mediterráneos con interés micológico en otoño-invierno. Regulación de ENP y montes públicos.',
    habitat: 'Pinares y matorral mediterráneo de sierra',
    season: 'Otoño e invierno',
    abundance: 'media',
    icon: '🏔️',
    species: spp.mediterranean,
    tips: [
      'Consulta la ficha del PN Serra de Mariola',
      'No recolectes sin cumplir la normativa autonómica',
    ],
  },

  // ─── REGIÓN DE MURCIA ────────────────────────────────────────────────────
  {
    id: 'coto-mu-noroeste',
    name: 'Noroeste murciano (Caravaca / Moratalla)',
    region: 'Región de Murcia',
    provinces: ['Murcia'],
    lat: 38.12,
    lng: -1.98,
    description:
      'Sierras del noroeste de Murcia: pinares y matorral. Temporada otoño-invierno. Montes públicos con regulación regional y municipal.',
    habitat: 'Pinares de pino carrasco y silvestre',
    season: 'Otoño e invierno',
    abundance: 'media',
    icon: '🌲',
    species: spp.mediterranean,
    tips: [
      'Normativa de montes · Comunidad Autónoma de la Región de Murcia',
      'Educativo · no autoriza consumo',
    ],
  },

  // ─── NAVARRA / EUSKADI extras ────────────────────────────────────────────
  {
    id: 'coto-na-irati',
    name: 'Selva de Irati (entorno)',
    region: 'Navarra',
    provinces: ['Navarra'],
    lat: 42.98,
    lng: -1.12,
    description:
      'Hayedos y abetales del entorno de Irati. Alta productividad en otoño. Zonas reguladas y montes con permisos según comarca / Gobierno de Navarra.',
    habitat: 'Hayedos y abetales atlánticos',
    season: 'Otoño',
    abundance: 'alta',
    icon: '🌳',
    species: spp.atlantic,
    tips: [
      'Infórmate en turismo de Aezkoa / Salazar y permisos forales',
      'Respeta zonas de reserva y señalización',
    ],
  },
  {
    id: 'coto-pv-gorbeia',
    name: 'Parque Natural de Gorbeia (entorno)',
    region: 'País Vasco',
    provinces: ['Álava', 'Bizkaia'],
    lat: 43.035,
    lng: -2.78,
    description:
      'Hayedos y pastizales del Gorbeia. Tradición micológica fuerte. Permisos y cupos según diputaciones forales y normativa del parque.',
    habitat: 'Hayedos y pastos de montaña',
    season: 'Otoño',
    abundance: 'alta',
    icon: '⛰️',
    species: spp.atlantic,
    tips: [
      'Permisos forales Álava / Bizkaia según la ladera',
      'Educativo · enlaces oficiales en la ficha de recursos',
    ],
  },

  // ─── GALICIA extras ──────────────────────────────────────────────────────
  {
    id: 'coto-ga-ancares',
    name: 'Os Ancares (Lugo)',
    region: 'Galicia',
    provinces: ['Lugo'],
    lat: 42.82,
    lng: -6.88,
    description:
      'Os Ancares: robledales, castañares y pinares de montaña. Red de coutos y montes con gestores (p. ej. MycoGalicia / comunidades de montes).',
    habitat: 'Robledales, castañares y pinares',
    season: 'Otoño',
    abundance: 'alta',
    icon: '🌳',
    species: spp.atlantic,
    tips: [
      'Coutos y pases: consulta mycogalicia.gal y comunidades de montes',
      'No recolectes fuera de las normas del couto',
    ],
  },
  {
    id: 'coto-ga-courel',
    name: 'Serra do Courel (Lugo)',
    region: 'Galicia',
    provinces: ['Lugo'],
    lat: 42.6,
    lng: -7.15,
    description:
      'Geoparque Courel: castañares y bosques mixtos de alta diversidad fúngica. Coutos y montes comunales con regulación propia.',
    habitat: 'Castañares y bosque mixto atlántico',
    season: 'Otoño',
    abundance: 'alta',
    icon: '🌰',
    species: [...spp.atlantic, 'Boletus aereus'],
    tips: [
      'Infórmate en el geoparque y en MycoGalicia',
      'Educativo · multi-vista en identificación',
    ],
  },

  // ─── CATALUÑA extras ─────────────────────────────────────────────────────
  {
    id: 'coto-ct-ports',
    name: 'Els Ports (Tarragona / Teruel / Castellón)',
    region: 'Cataluña',
    provinces: ['Tarragona'],
    lat: 40.78,
    lng: 0.28,
    description:
      'Parque Natural dels Ports: pinares y roquedos. Recolección sujeta a normativa catalana de setas y reglas del parque. Pin educativo triprovincial.',
    habitat: 'Pinares y matorral de sierra',
    season: 'Otoño e invierno',
    abundance: 'media',
    icon: '🏔️',
    species: spp.mediterranean,
    tips: [
      'Normativa de setas en Cataluña · gencat.cat',
      'En el PN aplica también el plan del espacio protegido',
    ],
  },
  {
    id: 'coto-ct-montseny',
    name: 'Montseny (Barcelona / Girona)',
    region: 'Cataluña',
    provinces: ['Barcelona', 'Girona'],
    lat: 41.78,
    lng: 2.43,
    description:
      'Parque Natural del Montseny: hayedos, robledales y pinares. Alta afluencia; respeta normativa de ENP y cupos autonómicos de setas.',
    habitat: 'Hayedos, robledales y pinares',
    season: 'Otoño',
    abundance: 'alta',
    icon: '🌳',
    species: spp.atlantic,
    tips: [
      'Consulta la ficha del PN Montseny y la normativa de setas de Cataluña',
      'Educativo · no es permiso de VisionSetil',
    ],
  },

  // ─── ANDALUCÍA extras ────────────────────────────────────────────────────
  {
    id: 'coto-an-cazorla',
    name: 'Sierras de Cazorla, Segura y Las Villas (entorno)',
    region: 'Andalucía',
    provinces: ['Jaén'],
    lat: 37.92,
    lng: -2.92,
    description:
      'PN Cazorla-Segura-Las Villas: pinares de montaña con interés micológico. Recolección sujeta a ENP, montes de la Junta y cotos municipales.',
    habitat: 'Pinares de montaña y matorral',
    season: 'Otoño e invierno',
    abundance: 'alta',
    icon: '🌲',
    species: [...spp.niscalo, 'Boletus aereus', 'Macrolepiota procera'],
    tips: [
      'Normativa de ENP y montes · Junta de Andalucía',
      'Confirma acotados municipales de la temporada',
    ],
  },
  {
    id: 'coto-an-grazalema',
    name: 'Sierra de Grazalema (Cádiz)',
    region: 'Andalucía',
    provinces: ['Cádiz'],
    lat: 36.76,
    lng: -5.37,
    description:
      'PN Sierra de Grazalema: pinsapos, quejigos y pinares. Clima húmedo atípico del sur. Regulación de parque y montes públicos.',
    habitat: 'Pinsapar, quejigares y pinares',
    season: 'Otoño e invierno',
    abundance: 'media',
    icon: '🌧️',
    species: spp.mediterranean,
    tips: [
      'Consulta normas del PN Sierra de Grazalema',
      'Alta pluviosidad: temporada variable',
    ],
  },

  // ─── CASTILLA Y LEÓN extras (beyond MicologíaCyL ids already listed) ─────
  {
    id: 'coto-cyl-sanabria',
    name: 'Lago de Sanabria y sierras (Zamora)',
    region: 'Castilla y León',
    provinces: ['Zamora'],
    lat: 42.12,
    lng: -6.72,
    description:
      'Entorno del PN Lago de Sanabria: robledales, abedulares y pinares. Cruza con acotados MicologíaCyL de Zamora y normas de ENP.',
    habitat: 'Robledales, abedulares y pinares de montaña',
    season: 'Otoño',
    abundance: 'alta',
    icon: '🏞️',
    species: spp.atlantic,
    tips: [
      'Permisos CyL: permisos.micologiacyl.es cuando aplique acotado',
      'En el PN prioriza las reglas del espacio protegido',
    ],
  },
  {
    id: 'coto-cyl-babia',
    name: 'Babia y Luna (León)',
    region: 'Castilla y León',
    provinces: ['León'],
    lat: 42.98,
    lng: -6.05,
    description:
      'Alta montaña leonesa: pastos, hayedos y pinares. Cotos y montes en red MicologíaCyL / montes de la comunidad.',
    habitat: 'Pastizales de altura, hayedos y pinares',
    season: 'Final de verano y otoño',
    abundance: 'media',
    icon: '⛰️',
    species: [...spp.boletus, 'Cantharellus cibarius', 'Hydnum repandum'],
    tips: [
      'Visor de acotados: micologiacyl.es/visor',
      'Temporada corta por altitud',
    ],
  },

  // ─── BALEARES (educativo) ────────────────────────────────────────────────
  {
    id: 'coto-ib-tramuntana',
    name: 'Serra de Tramuntana (Mallorca)',
    region: 'Illes Balears',
    provinces: ['Illes Balears'],
    lat: 39.78,
    lng: 2.75,
    description:
      'Serra de Tramuntana: encinares y pinares mediterráneos. Recolección sujeta a normativa balear y de montes. Pin educativo de hábitat insular.',
    habitat: 'Encinares y pinares mediterráneos',
    season: 'Otoño e invierno',
    abundance: 'media',
    icon: '🏝️',
    species: spp.mediterranean,
    tips: [
      'Normativa de montes y medio ambiente · Govern de les Illes Balears',
      'Educativo · no autoriza consumo',
    ],
  },
]
