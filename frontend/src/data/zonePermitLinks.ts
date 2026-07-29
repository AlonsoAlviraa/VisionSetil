/**
 * Parques micológicos, acotados y enlaces oficiales de permisos / info.
 * Producto educativo: VisionSetil NO vende permisos; solo enlaza a gestores.
 *
 * Fuentes principales (2026):
 * - MicoAragón / Gobierno de Aragón
 * - MicologíaCyL / MicoCyL (Castilla y León)
 * - Portales autonómicos de medio ambiente
 */

export type ZoneResourceLink = {
  label: string
  url: string
  /** permit | info | park | tourism */
  kind: 'permit' | 'info' | 'park' | 'tourism'
}

export type ZoneResourcePack = {
  note?: string
  links: ZoneResourceLink[]
}

// ── Shared portals ──────────────────────────────────────────────────────────

const L = {
  // Aragón
  aragonGov: {
    label: 'Gobierno de Aragón · setas y trufas',
    url: 'https://www.aragon.es/planificacion-y-conservacion-de-areas-forestales/gestion/setas-y-trufas',
    kind: 'info' as const,
  },
  aragonDecree: {
    label: 'Decreto 179/2014 (BOA) · normativa Aragón',
    url: 'https://www.boa.aragon.es/cgi-bin/EBOA/BRSCGI?CMD=VEROBJ&MLKOB=821237503131',
    kind: 'info' as const,
  },
  micoAragon: {
    label: 'MicoAragón · parques micológicos',
    url: 'https://www.micoaragon.es/',
    kind: 'tourism' as const,
  },
  micoAragonPermisos: {
    label: 'Tramitar / comprar permiso (MicoAragón)',
    url: 'https://micoaragon-permisos-albarracin.com/',
    kind: 'permit' as const,
  },
  albarracinPark: {
    label: 'Parque micológico Comunidad de Albarracín',
    url: 'https://www.micoaragon.es/parques/comunidad-de-albarracin/',
    kind: 'park' as const,
  },
  albarracinInfo: {
    label: 'Micología Albarracín · permisos e info',
    url: 'https://micologiaalbarracin.es/',
    kind: 'permit' as const,
  },
  moncayoPark: {
    label: 'Parque micológico del Moncayo',
    url: 'https://www.micoaragon.es/parques/del-moncayo',
    kind: 'park' as const,
  },
  ordesa: {
    label: 'Parque Nacional Ordesa y Monte Perdido',
    url: 'https://www.miteco.gob.es/es/red-parques-nacionales/nuestros-parques/ordesa.html',
    kind: 'park' as const,
  },

  // Castilla y León
  micologiaCyl: {
    label: 'MicologíaCyL · portal oficial permisos',
    url: 'https://www.micologiacyl.es/',
    kind: 'permit' as const,
  },
  micologiaCylExpedicion: {
    label: 'Expedición de permisos micológicos CyL',
    url: 'https://micologiacyl.es/expedicion-de-permisos-micologicos',
    kind: 'permit' as const,
  },
  micologiaCylVisor: {
    label: 'Visor de acotados micológicos CyL',
    url: 'https://www.micologiacyl.es/visor/',
    kind: 'park' as const,
  },
  micocyl: {
    label: 'MicoCyL · programa micológico',
    url: 'https://www.micocyl.es/',
    kind: 'tourism' as const,
  },
  jcylMicologia: {
    label: 'Junta CyL · aprovechamiento micológico',
    url: 'https://medioambiente.jcyl.es/web/es/medio-natural/aprovechamiento-micologico-setas-trufas.html',
    kind: 'info' as const,
  },
  permisosGredos: {
    label: 'Permisos acotado Gredos (Ávila)',
    url: 'https://permisos.micologiacyl.es/acotado/gredos',
    kind: 'permit' as const,
  },
  permisosMontesAvila: {
    label: 'Permisos Montes CyL en Ávila',
    url: 'https://permisos.micologiacyl.es/acotado/montes-comunidad-castilla-y-leon-en-avila',
    kind: 'permit' as const,
  },
  permisosMontesSoria: {
    label: 'Permisos Parque Micológico Montes de Soria',
    url: 'https://permisos.micologiacyl.es/acotado/montes-de-soria',
    kind: 'permit' as const,
  },
  permisosMontesSoriaJcyl: {
    label: 'Permisos Montes CyL en Soria',
    url: 'https://permisos.micologiacyl.es/acotado/montes-comunidad-y-castilla-leon-en-soria',
    kind: 'permit' as const,
  },
  montesDeSoriaAsoc: {
    label: 'Asociación Montes de Soria · permisos',
    url: 'https://asociacionmontesdesoria.com/permiso-de-recoleccion-de-setas/',
    kind: 'permit' as const,
  },
  // CyL provincia a provincia (códigos MicologíaCyL)
  permisosFresnedaTiron: {
    label: 'Permisos Fresneda de la Sierra Tirón (Burgos)',
    url: 'https://permisos.micologiacyl.es/acotado/fresneda-de-la-sierra-tiron',
    kind: 'permit' as const,
  },
  permisosMontesOca: {
    label: 'Permisos Montes de Oca (Burgos)',
    url: 'https://permisos.micologiacyl.es/acotado/montes-de-oca',
    kind: 'permit' as const,
  },
  permisosRioCea: {
    label: 'Permisos Río Cea (León)',
    url: 'https://permisos.micologiacyl.es/acotado/rio-cea',
    kind: 'permit' as const,
  },
  permisosVelilla: {
    label: 'Permisos Parque micológico Velilla (Palencia)',
    url: 'https://permisos.micologiacyl.es/acotado/parque-micologico-velilla-del-rio-carrion',
    kind: 'permit' as const,
  },
  permisosFranciaBejar: {
    label: 'Permisos Sierras de Francia, Béjar, Quilamas y El Rebollar',
    url: 'https://permisos.micologiacyl.es/acotado/parque-micologico-sierras-de-francia-bejar-quilamas-y-el-rebollar',
    kind: 'permit' as const,
  },
  permisosTorozos: {
    label: 'Permisos Torozos, Mayorga y Pinares (Valladolid)',
    url: 'https://permisos.micologiacyl.es/acotado/torozos-mayorga-y-pinares-de-valladolid',
    kind: 'permit' as const,
  },
  permisosNoroesteZamora: {
    label: 'Permisos Montes del Noroeste Zamorano',
    url: 'https://permisos.micologiacyl.es/acotado/parque-micologico-montes-del-noroeste-zamorano',
    kind: 'permit' as const,
  },
  permisosCamarzana: {
    label: 'Permisos Camarzana, Rabanales y otros (Zamora)',
    url: 'https://permisos.micologiacyl.es/acotado/camarzana-de-tera-y-otros',
    kind: 'permit' as const,
  },
  permisosDemandaSanMillan: {
    label: 'Permisos Demanda – San Millán (Burgos)',
    url: 'https://permisos.micologiacyl.es/acotado/demanda-san-millan',
    kind: 'permit' as const,
  },
  permisosValleMena: {
    label: 'Permisos Valle de Mena (Burgos)',
    url: 'https://permisos.micologiacyl.es/acotado/valle-de-mena',
    kind: 'permit' as const,
  },
  permisosSanZadornil: {
    label: 'Permisos San Zadornil (Burgos)',
    url: 'https://permisos.micologiacyl.es/acotado/san-zadornil',
    kind: 'permit' as const,
  },
  permisosTriollo: {
    label: 'Permisos Junta Vecinal de Triollo (Palencia)',
    url: 'https://permisos.micologiacyl.es/acotado/junta-vecinal-triollo',
    kind: 'permit' as const,
  },
  permisosRiberaCanedo: {
    label: 'Permisos Ribera de Cañedo (Salamanca)',
    url: 'https://permisos.micologiacyl.es/acotado/ribera-de-canedo',
    kind: 'permit' as const,
  },
  permisosMontesSegovia: {
    label: 'Permisos Montes de Segovia',
    url: 'https://permisos.micologiacyl.es/acotado/montes-de-segovia',
    kind: 'permit' as const,
  },
  permisosMontesSegoviaJunta: {
    label: 'Permisos Montes CyL en Segovia',
    url: 'https://permisos.micologiacyl.es/acotado/montes-comunidad-castilla-y-leon-en-segovia',
    kind: 'permit' as const,
  },

  // Cataluña
  gencatBolets: {
    label: 'Parques naturales Cataluña · coger setas',
    url: 'https://parcsnaturals.gencat.cat/es/detalls/Article/09-Collir-bolets',
    kind: 'info' as const,
  },
  gencatMedi: {
    label: 'Generalitat · medio ambiente',
    url: 'https://mediambient.gencat.cat/',
    kind: 'info' as const,
  },
  altPirineuRegulacio: {
    label: 'Alt Pirineu · regulación de actividades (bolets)',
    url: 'https://parcsnaturals.gencat.cat/ca/xarxa-de-parcs/alt-pirineu/gaudeix-del-parc/consells/regulacio-activitats/',
    kind: 'permit' as const,
  },
  portsRegulacio: {
    label: 'Parc Natural dels Ports · regulación de actividades',
    url: 'https://parcsnaturals.gencat.cat/ca/xarxa-de-parcs/ports/gaudeix-del-parc/consells/regulacio-dactivitats/',
    kind: 'info' as const,
  },
  cadiBoletaire: {
    label: 'Cadí–Moixeró · tradición boletaire',
    url: 'https://parcsnaturals.gencat.cat/ca/xarxa-de-parcs/cadi/el-parc/patrimoni-natural-i-cultural/fongs-i-liquens/tradicio-boletaire/',
    kind: 'info' as const,
  },

  // Navarra
  navarraMedio: {
    label: 'Gobierno de Navarra · medio ambiente',
    url: 'https://www.navarra.es/es/medio-ambiente',
    kind: 'info' as const,
  },
  navarraSetas: {
    label: 'Navarra · setas y hongos (red de acotados)',
    url: 'https://www.navarra.es/es/medio-ambiente/setas-y-hongos',
    kind: 'info' as const,
  },
  iratiInfo: {
    label: 'Selva de Irati · micología',
    url: 'https://www.irati.org/micologia/',
    kind: 'tourism' as const,
  },
  ultzamaPermisos: {
    label: 'Parque Micológico Ultzama · permisos',
    url: 'https://parquemicologicoultzama.com/es/permisos',
    kind: 'permit' as const,
  },
  erroPermisos: {
    label: 'Parque Micológico Erro · permiso diario',
    url: 'https://www.parquemicologicoerro.com/producto/permiso-diario/',
    kind: 'permit' as const,
  },
  aezkoaPermisos: {
    label: 'Valle de Aezkoa · productos naturales',
    url: 'https://aezkoa.org/areas/productos-naturales/',
    kind: 'permit' as const,
  },
  abaurreaPermisos: {
    label: 'Acotado Abaurregaina · reservas',
    url: 'https://reservas.redexploranavarra.es/esp-AcotadoAbaurreagaina',
    kind: 'permit' as const,
  },

  // País Vasco
  euskadiMedio: {
    label: 'Euskadi · medio ambiente',
    url: 'https://www.euskadi.eus/gobierno-vasco/medio-ambiente/',
    kind: 'info' as const,
  },
  gorbeiaPermisos: {
    label: 'Parque Micológico Gorbeialdea · permisos',
    url: 'https://www.gorbeiamikologia.eus/es/permisos/',
    kind: 'permit' as const,
  },
  asparrenaPark: {
    label: 'Parque Micológico Asparrena–San Millán',
    url: 'https://www.asparrena.eus/ocio-y-turismo/parque-micologico-asparrena-san-millan',
    kind: 'permit' as const,
  },
  arraiaCoto: {
    label: 'Coto de setas Arraia-Maeztu',
    url: 'https://www.arraia-maeztu.eus/servicios/coto-de-setas/',
    kind: 'permit' as const,
  },
  arcenaPermisos: {
    label: 'Sierra de Árcena · solicitud de permisos',
    url: 'https://micolosa.net/sierra-de-arcena/solicitud-de-permisos/',
    kind: 'permit' as const,
  },
  nanclaresPermisos: {
    label: 'Coto Nanclares · tickets',
    url: 'https://cotonanclares.com/',
    kind: 'permit' as const,
  },

  // Galicia
  xuntaMedio: {
    label: 'Xunta · medio rural / montes',
    url: 'https://mediorural.xunta.gal/',
    kind: 'info' as const,
  },
  mycoGalicia: {
    label: 'MycoGalicia · coutos micolóxicos',
    url: 'https://mycogalicia.es/coutos/',
    kind: 'permit' as const,
  },
  mycoBeade: {
    label: 'Couto Beade · permisos',
    url: 'https://mycogalicia.es/coutos/couto-micoloxico-beade/',
    kind: 'permit' as const,
  },
  mycoMatama: {
    label: 'Couto Matamá · permisos',
    url: 'https://mycogalicia.es/coutos/couto-micoloxico-matama/',
    kind: 'permit' as const,
  },
  mycoRebordelo: {
    label: 'Coutos Rebordelo · permisos',
    url: 'https://mycogalicia.es/coutos/couto-micoloxico-souto-san-brais-e-souto-pereiral/',
    kind: 'permit' as const,
  },
  mycoBarona: {
    label: 'Couto Baroña · permisos',
    url: 'https://mycogalicia.es/coutos/couto-micoloxico-baronha/',
    kind: 'permit' as const,
  },
  aveigaTurismo: {
    label: 'A Veiga · turismo micolóxico (Tregumelos)',
    url: 'https://www.mieldetrevinca.com/turismo/',
    kind: 'tourism' as const,
  },

  // Aragón municipal / comarcal
  maestrazgoPases: {
    label: 'Maestrazgo · pases de setas',
    url: 'https://comarcamaestrazgo.org/pases-setas/',
    kind: 'permit' as const,
  },
  maestrazgoInfo: {
    label: 'Turismo Maestrazgo · micología',
    url: 'https://turismomaestrazgo.org/micologia/',
    kind: 'tourism' as const,
  },
  ansoSetas: {
    label: 'Ansó · permisos de setas',
    url: 'https://www.xn--ans-ina.es/setas',
    kind: 'permit' as const,
  },
  nogueruelasCoto: {
    label: 'Nogueruelas · coto micológico',
    url: 'https://www.nogueruelas.es/institucional/coto-micologico-nogueruelas/',
    kind: 'permit' as const,
  },
  mosqueruelaPermisos: {
    label: 'Mosqueruela · venta de permisos',
    url: 'https://mosqueruela.es/venta-de-permisos-de-recogida-de-setas/',
    kind: 'permit' as const,
  },
  puenteJaca: {
    label: 'Puente la Reina de Jaca · coto de hongos',
    url: 'https://puentelareinadejaca.com/',
    kind: 'permit' as const,
  },
  loarreSetas: {
    label: 'Loarre · setas',
    url: 'https://www.loarre.es/setas',
    kind: 'permit' as const,
  },
  planSetas: {
    label: 'Plan · trámite setas (sede)',
    url: 'https://plan.sedipualba.es/carpetaciudadana/tramite.aspx?idtramite=28170',
    kind: 'permit' as const,
  },
  canfrancMicologia: {
    label: 'Canfranc · micología / turismo',
    url: 'https://www.canfranc.es/turismo_canfranc_pirineos.php?idRec=36',
    kind: 'permit' as const,
  },
  hechoSetas: {
    label: 'Valle de Hecho · trámite setas',
    url: 'https://hecho.sedipualba.es/carpetaciudadana/tramite.aspx?idtramite=23432',
    kind: 'permit' as const,
  },
  biescasSetas: {
    label: 'Biescas · setas y hongos',
    url: 'https://www.turismobiescas.com/noticias/setas-y-hongos-todo-lo-que-hay-que-saber/',
    kind: 'permit' as const,
  },
  tramacastillaMicologia: {
    label: 'Tramacastilla de Tena · micología',
    url: 'https://www.tramacastilladetena.es/actividades-tramacastilla.php?Nombre=Micolog%C3%ADa',
    kind: 'info' as const,
  },

  // Andalucía municipal
  juzcarOrdenanza: {
    label: 'Júzcar · ordenanza aprovechamiento setas (PDF)',
    url: 'https://static.malaga.es/municipios/subidas/archivos/9/7/arc_33179.pdf',
    kind: 'permit' as const,
  },
  lojaSolicitudes: {
    label: 'Loja · impresos y solicitudes',
    url: 'http://www.aytoloja.org/ayuntamiento/impresosysolicitudes.htm',
    kind: 'permit' as const,
  },
  alhamaSede: {
    label: 'Alhama de Granada · sede electrónica',
    url: 'https://alhamadegranada.sedelectronica.es/',
    kind: 'permit' as const,
  },
  bazaOrdenanza: {
    label: 'Baza · ordenanza fiscal recogida de setas (PN)',
    url: 'https://ayuntamientodebaza.es/download/1108/ordenanzas-fiscales/5325/44-ordenanza-fiscal-reguladora-recogida-de-setas-en-parque-natural.pdf',
    kind: 'permit' as const,
  },
  bayarcalTablon: {
    label: 'Bayárcal · tablón / ordenanzas',
    url: 'https://www.dipalme.org/Servicios/cmsdipro/index.nsf/tablon.xsp?p=SedeBayarcal&documentId=75A179470D6AC04EC1257F8B003FFA36',
    kind: 'permit' as const,
  },
  castillonuevoOrdenanza: {
    label: 'Castillonuevo · ordenanza acotado',
    url: 'https://castillonuevo.com/2023/09/24/ordenanza-reguladora-del-acotado-para-el-aprovechamiento-de-hongos-setas-y-demas-productos-naturales-en-el-termino-municipal-de-castillonuevo/',
    kind: 'permit' as const,
  },

  // Asturias
  asturiasMedio: {
    label: 'Principado de Asturias · medio ambiente',
    url: 'https://www.asturias.es/medio-ambiente',
    kind: 'info' as const,
  },
  picosEuropa: {
    label: 'Parque Nacional Picos de Europa',
    url: 'https://www.miteco.gob.es/es/red-parques-nacionales/nuestros-parques/picos-europa.html',
    kind: 'park' as const,
  },

  // Cantabria
  cantabriaMedio: {
    label: 'Gobierno de Cantabria · medio ambiente',
    url: 'https://www.cantabria.es/web/direccion-general-biodiversidad',
    kind: 'info' as const,
  },

  // La Rioja
  riojaMedio: {
    label: 'Gobierno de La Rioja · medio ambiente',
    url: 'https://www.larioja.org/medio-ambiente/es',
    kind: 'info' as const,
  },

  // Madrid
  madridMedio: {
    label: 'Comunidad de Madrid · medio ambiente',
    url: 'https://www.comunidad.madrid/servicios/medio-ambiente',
    kind: 'info' as const,
  },
  guadarrama: {
    label: 'Parque Nacional Sierra de Guadarrama',
    url: 'https://www.parquenacionalsierraguadarrama.es/',
    kind: 'park' as const,
  },

  // Andalucía
  juntaAndalucia: {
    label: 'Junta de Andalucía · medio ambiente',
    url: 'https://www.juntadeandalucia.es/medioambiente/',
    kind: 'info' as const,
  },

  // Valencia
  gvaMedio: {
    label: 'GVA · medio natural (setas)',
    url: 'https://mediambient.gva.es/es/web/medio-natural',
    kind: 'info' as const,
  },

  // Extremadura
  juntaExtremadura: {
    label: 'Junta de Extremadura · medio ambiente',
    url: 'https://www.juntaex.es/temas/medio-ambiente',
    kind: 'info' as const,
  },

  // CLM
  clmMedio: {
    label: 'Castilla-La Mancha · medio ambiente',
    url: 'https://www.castillalamancha.es/gobierno/desarrollosostenible',
    kind: 'info' as const,
  },

  // Murcia / Baleares / Canarias
  murciaMedio: {
    label: 'Región de Murcia · medio ambiente',
    url: 'https://www.carm.es/web/pagina?IDCONTENIDO=59&IDTIPO=140&RASTRO=c$m122,59',
    kind: 'info' as const,
  },
  balearsMedio: {
    label: 'Govern Illes Balears · medi ambient',
    url: 'https://www.caib.es/sites/mediambient/',
    kind: 'info' as const,
  },
  canariasMedio: {
    label: 'Gobierno de Canarias · medio ambiente',
    url: 'https://www.gobiernodecanarias.org/medioambiente/',
    kind: 'info' as const,
  },

  mapa: {
    label: 'MAPA · info general (Estado)',
    url: 'https://www.mapa.gob.es/',
    kind: 'info' as const,
  },
}

// ── Packs by explicit zone id ───────────────────────────────────────────────

const BY_ZONE_ID: Record<string, ZoneResourcePack> = {
  // ── Aragón ──
  'aragon-moncayo': {
    note: 'Parque Natural / parque micológico del Moncayo. Permisos vía MicoAragón.',
    links: [L.moncayoPark, L.micoAragonPermisos, L.micoAragon, L.aragonGov, L.aragonDecree],
  },
  'zaragoza-moncayo': {
    note: 'Sierra del Moncayo (Zaragoza): parque micológico + normativa aragonesa.',
    links: [L.moncayoPark, L.micoAragonPermisos, L.micoAragon, L.aragonGov, L.aragonDecree],
  },
  'aragon-teruel': {
    note: 'Maestrazgo / Teruel: cotos y parque micológico de Albarracín (referencia).',
    links: [L.micoAragonPermisos, L.albarracinPark, L.albarracinInfo, L.micoAragon, L.aragonGov, L.aragonDecree],
  },
  'aragon-gudar-javalambre': {
    note: 'Gúdar–Javalambre: cotos municipales y regulación aragonesa.',
    links: [L.micoAragonPermisos, L.micoAragon, L.aragonGov, L.aragonDecree],
  },
  'teruel-gudar': {
    note: 'Gúdar–Javalambre (Teruel): consulta cotos y MicoAragón.',
    links: [L.micoAragonPermisos, L.micoAragon, L.aragonGov, L.aragonDecree],
  },
  'pirineo-aragones': {
    note: 'Ordesa y valles: ENP con restricciones fuertes. Normativa Aragón + Parque Nacional.',
    links: [L.ordesa, L.aragonGov, L.aragonDecree, L.micoAragon],
  },
  'huesca-ordesa-entorno': {
    note: 'Recolección muy restringida o prohibida dentro del Parque Nacional de Ordesa.',
    links: [L.ordesa, L.aragonGov, L.aragonDecree, L.micoAragon],
  },
  'aragon-guara': {
    note: 'Sierra de Guara (Huesca): consulta ENP y Decreto 179/2014 de Aragón.',
    links: [L.aragonGov, L.aragonDecree, L.micoAragon, L.micoAragonPermisos],
  },
  'park-albarracin': {
    note: 'Parque micológico oficial de la Comunidad de Albarracín (Teruel).',
    links: [L.micoAragonPermisos, L.albarracinPark, L.albarracinInfo, L.micoAragon, L.aragonGov, L.aragonDecree],
  },

  // ── Scraped national cotos ──
  'coto-ar-moncayo': {
    note: 'Parque micológico del Moncayo. Confirma venta de permisos de la temporada en MicoAragón o la comarca.',
    links: [L.moncayoPark, L.micoAragon, L.micoAragonPermisos, L.aragonGov, L.aragonDecree],
  },
  'coto-ar-maestrazgo': {
    note: 'Coto comarcal del Maestrazgo (Teruel). Pases turísticos oficiales.',
    links: [L.maestrazgoPases, L.maestrazgoInfo, L.aragonGov, L.aragonDecree, L.micoAragon],
  },
  'coto-ar-anso-fago': {
    note: 'Mancomunidad Forestal Ansó–Fago. Permisos municipales/mancomunidad.',
    links: [L.ansoSetas, L.aragonGov, L.aragonDecree],
  },
  'coto-ar-nogueruelas': {
    note: 'Coto municipal de Nogueruelas (Gúdar–Javalambre).',
    links: [L.nogueruelasCoto, L.aragonGov, L.aragonDecree, L.micoAragon],
  },
  'coto-ar-mosqueruela': {
    note: 'Coto municipal de Mosqueruela con venta online de abonos.',
    links: [L.mosqueruelaPermisos, L.aragonGov, L.aragonDecree],
  },
  'coto-ar-puente-jaca': {
    note: 'Coto del Carrascal de Javierregay (Puente la Reina de Jaca).',
    links: [L.puenteJaca, L.aragonGov, L.aragonDecree],
  },
  'coto-ar-loarre': {
    note: 'Coto de Loarre — remite a MicoAragón; confirma producto de temporada.',
    links: [L.loarreSetas, L.micoAragon, L.micoAragonPermisos, L.aragonGov],
  },
  'coto-ar-plan': {
    note: 'Permiso diario vía sede electrónica del Ayuntamiento de Plan.',
    links: [L.planSetas, L.aragonGov, L.aragonDecree],
  },
  'coto-ar-canfranc': {
    note: 'Coto municipal de Canfranc / Canal Roya.',
    links: [L.canfrancMicologia, L.aragonGov, L.aragonDecree],
  },
  'coto-ar-hecho': {
    note: 'Trámite setas del Ayuntamiento de Valle de Hecho.',
    links: [L.hechoSetas, L.aragonGov, L.aragonDecree],
  },
  'coto-ar-biescas': {
    note: 'Autorizaciones municipales en Biescas (presencial).',
    links: [L.biescasSetas, L.aragonGov, L.aragonDecree],
  },
  'coto-ar-tramacastilla-tena': {
    note: 'Ordenanza de Tramacastilla de Tena; confirma expedición actual.',
    links: [L.tramacastillaMicologia, L.aragonGov, L.aragonDecree],
  },
  'coto-cat-viros': {
    note: 'Acotado Bosc de Virós — tiquet diario del Parc Natural de l’Alt Pirineu.',
    links: [L.altPirineuRegulacio, L.gencatBolets, L.gencatMedi],
  },
  'coto-cat-esterri-cardos': {
    note: 'Acotado Vall d’Esterri de Cardós — tiquet del parc.',
    links: [L.altPirineuRegulacio, L.gencatBolets, L.gencatMedi],
  },
  'coto-cat-alt-pirineu': {
    note: 'Regulación de bolets del Parc Natural de l’Alt Pirineu.',
    links: [L.altPirineuRegulacio, L.gencatBolets, L.gencatMedi],
  },
  'coto-cat-ports': {
    note: 'Els Ports: propiedad y señalización; no hay tienda de permisos de parque.',
    links: [L.portsRegulacio, L.gencatBolets, L.gencatMedi],
  },
  'coto-cat-cadi': {
    note: 'Cadí–Moixeró: tradición boletaire; respeta propiedad y regulación local.',
    links: [L.cadiBoletaire, L.gencatBolets, L.gencatMedi],
  },
  'coto-ga-beade': {
    note: 'Couto Micolóxico de Beade (Montes de Vigo) — MycoGalicia.',
    links: [L.mycoBeade, L.mycoGalicia, L.xuntaMedio],
  },
  'coto-ga-matama': {
    note: 'Couto Micolóxico de Matamá — MycoGalicia.',
    links: [L.mycoMatama, L.mycoGalicia, L.xuntaMedio],
  },
  'coto-ga-rebordelo': {
    note: 'Coutos Souto de San Brais e Souto do Pereiral — MycoGalicia.',
    links: [L.mycoRebordelo, L.mycoGalicia, L.xuntaMedio],
  },
  'coto-ga-barona': {
    note: 'Couto Micolóxico de Baroña — MycoGalicia.',
    links: [L.mycoBarona, L.mycoGalicia, L.xuntaMedio],
  },
  'coto-ga-forgoselo': {
    note: 'Monte Forgoselo: verifica expedición con la AVV; directorio MycoGalicia.',
    links: [L.mycoGalicia, L.xuntaMedio],
  },
  'coto-ga-aveiga': {
    note: 'A Veiga (Tregumelos): autorización turística municipal.',
    links: [L.aveigaTurismo, L.xuntaMedio],
  },
  'coto-na-ultzama': {
    note: 'Parque Micológico Ultzama — permisos online oficiales.',
    links: [L.ultzamaPermisos, L.navarraSetas, L.navarraMedio],
  },
  'coto-na-erro': {
    note: 'Parque Micológico Erro–Roncesvalles — permiso diario online.',
    links: [L.erroPermisos, L.navarraSetas, L.navarraMedio],
  },
  'coto-na-aezkoa': {
    note: 'Acotado Junta del Valle de Aezkoa (Monte Aezkoa / Irati).',
    links: [L.aezkoaPermisos, L.iratiInfo, L.navarraSetas],
  },
  'coto-na-salazar': {
    note: 'Acotado Valle de Salazar (Irati) — Casa del Valle.',
    links: [L.iratiInfo, L.navarraSetas, L.navarraMedio],
  },
  'coto-na-roncal': {
    note: 'Valle de Roncal: régimen foral de acotados; verifica junta actual.',
    links: [L.navarraSetas, L.navarraMedio],
  },
  'coto-na-abaurrea-alta': {
    note: 'Acotado Abaurregaina — Red Explora Navarra.',
    links: [L.abaurreaPermisos, L.navarraSetas, L.navarraMedio],
  },
  'coto-na-castillonuevo': {
    note: 'Acotado Castillonuevo / Gazteluberri — ordenanza municipal.',
    links: [L.castillonuevoOrdenanza, L.navarraSetas, L.navarraMedio],
  },
  'coto-na-urraul-alto': {
    note: 'Acotado Urraul Alto — ayuntamiento y puntos autorizados.',
    links: [L.navarraSetas, L.navarraMedio],
  },
  'coto-pv-gorbeialdea': {
    note: 'Parque Micológico de Gorbeialdea — permisos online.',
    links: [L.gorbeiaPermisos, L.euskadiMedio],
  },
  'coto-pv-asparrena': {
    note: 'Parque Micológico Asparrena–Apota (Aizkorri-Aratz).',
    links: [L.asparrenaPark, L.euskadiMedio],
  },
  'coto-pv-arraia': {
    note: 'Coto de setas Arraia-Maeztu (Montaña Alavesa).',
    links: [L.arraiaCoto, L.euskadiMedio],
  },
  'coto-pv-arcena': {
    note: 'Coto Sierra de Árcena / Consierra de Árcena.',
    links: [L.arcenaPermisos, L.euskadiMedio],
  },
  'coto-pv-nanclares': {
    note: 'Coto micológico Nanclares–Montevite–Ollávarre.',
    links: [L.nanclaresPermisos, L.euskadiMedio],
  },
  'coto-an-juzcar': {
    note: 'Monte Lomas y Ferreiras (Júzcar) — autorización municipal.',
    links: [L.juzcarOrdenanza, L.juntaAndalucia],
  },
  'coto-an-loja': {
    note: 'Montes públicos de Loja (Sierra de Loja) — solicitud municipal.',
    links: [L.lojaSolicitudes, L.juntaAndalucia],
  },
  'coto-an-alhama': {
    note: 'Monte Público Sierras – Alhama de Granada (licencias limitadas).',
    links: [L.alhamaSede, L.juntaAndalucia],
  },
  'coto-an-baza': {
    note: 'Montes de Baza en PN Sierra de Baza — ordenanza fiscal de setas.',
    links: [L.bazaOrdenanza, L.juntaAndalucia],
  },
  'coto-an-bayarcal': {
    note: 'Montes públicos de Bayárcal — autorización y tasa municipal.',
    links: [L.bayarcalTablon, L.juntaAndalucia],
  },

  // ── Castilla y León — acotados MicoCyL ──
  'park-montes-soria': {
    note: 'Parque Micológico Montes de Soria: permisos recreativos y de temporada online.',
    links: [L.permisosMontesSoria, L.montesDeSoriaAsoc, L.permisosMontesSoriaJcyl, L.micologiaCyl, L.jcylMicologia],
  },
  'park-gredos-acotado': {
    note: 'Acotado Gredos (AV-50003) — permisos MicologíaCyL.',
    links: [L.permisosGredos, L.micologiaCylExpedicion, L.micocyl, L.jcylMicologia],
  },
  'park-montes-cyl-avila': {
    note: 'Montes de la Comunidad en Ávila (AV-50006).',
    links: [L.permisosMontesAvila, L.micologiaCylExpedicion, L.jcylMicologia],
  },
  'park-montes-cyl-soria': {
    note: 'Montes de la Comunidad en Soria (SO-50003).',
    links: [L.permisosMontesSoriaJcyl, L.permisosMontesSoria, L.micologiaCyl, L.jcylMicologia],
  },
  'park-sierras-francia': {
    note: 'Sierras de Francia: red de acotados MicologíaCyL / MicoCyL.',
    links: [L.micologiaCylExpedicion, L.micologiaCylVisor, L.micocyl, L.jcylMicologia],
  },

  // CyL cotos (cylCotosZones) — provincia a provincia
  'cyl-av-gredos': {
    note: 'Acotado Gredos AV-50003. Permisos recreativos y comerciales online.',
    links: [L.permisosGredos, L.permisosMontesAvila, L.micologiaCylExpedicion, L.jcylMicologia],
  },
  'cyl-av-montes-junta': {
    note: 'Montes de la Comunidad en Ávila (AV-50006).',
    links: [L.permisosMontesAvila, L.micologiaCylExpedicion, L.jcylMicologia],
  },
  'cyl-bu-fresneda-tiron': {
    note: 'Acotado Fresneda de la Sierra Tirón (Burgos).',
    links: [L.permisosFresnedaTiron, L.micologiaCylExpedicion, L.micologiaCylVisor, L.jcylMicologia],
  },
  'cyl-bu-montes-oca': {
    note: 'Acotado Montes de Oca (Burgos).',
    links: [L.permisosMontesOca, L.micologiaCylExpedicion, L.jcylMicologia],
  },
  'cyl-bu-demanda-san-millan': {
    note: 'Acotado Demanda – San Millán (BU-50017).',
    links: [L.permisosDemandaSanMillan, L.micologiaCylExpedicion, L.micologiaCylVisor, L.jcylMicologia],
  },
  'cyl-bu-valle-mena': {
    note: 'Acotado Valle de Mena (BU-50019).',
    links: [L.permisosValleMena, L.micologiaCylExpedicion, L.jcylMicologia],
  },
  'cyl-bu-san-zadornil': {
    note: 'Acotado San Zadornil (BU-50003).',
    links: [L.permisosSanZadornil, L.micologiaCylExpedicion, L.jcylMicologia],
  },
  'cyl-bu-merindades': {
    note: 'Merindades: localiza el acotado exacto en el visor MicologíaCyL.',
    links: [L.micologiaCylVisor, L.micologiaCylExpedicion, L.jcylMicologia],
  },
  'cyl-le-rio-cea': {
    note: 'Acotado Río Cea (León).',
    links: [L.permisosRioCea, L.micologiaCylExpedicion, L.jcylMicologia],
  },
  'cyl-le-laciana': {
    note: 'Laciana / Alto Sil: consulta acotados y ENP en el visor CyL.',
    links: [L.micologiaCylVisor, L.micologiaCylExpedicion, L.jcylMicologia],
  },
  'cyl-le-bierzo': {
    note: 'Bierzo–Ancares: acotados CyL y posible linde con Galicia.',
    links: [L.micologiaCylExpedicion, L.micologiaCylVisor, L.jcylMicologia, L.xuntaMedio],
  },
  'cyl-pa-velilla': {
    note: 'Parque micológico Velilla del Río Carrión (Palencia).',
    links: [L.permisosVelilla, L.micologiaCylExpedicion, L.jcylMicologia],
  },
  'cyl-pa-fuentes-carrionas': {
    note: 'Fuentes Carrionas: ENP + acotados CyL colindantes.',
    links: [L.permisosVelilla, L.micologiaCylVisor, L.jcylMicologia],
  },
  'cyl-pa-triollo': {
    note: 'Acotado Junta Vecinal de Triollo (PA-50033).',
    links: [L.permisosTriollo, L.micologiaCylExpedicion, L.jcylMicologia],
  },
  'cyl-sa-francia-bejar': {
    note: 'Parque micológico Sierras de Francia, Béjar, Quilamas y El Rebollar.',
    links: [L.permisosFranciaBejar, L.micologiaCylExpedicion, L.micocyl, L.jcylMicologia],
  },
  'cyl-sa-ribera-canedo': {
    note: 'Acotado Ribera de Cañedo (SA-50005).',
    links: [L.permisosRiberaCanedo, L.micologiaCylExpedicion, L.micocyl, L.jcylMicologia],
  },
  'cyl-sg-montes-segovia': {
    note: 'Acotado Montes de Segovia (SG-50002) — reconocimiento mutuo con SG-50005 en algunos casos.',
    links: [L.permisosMontesSegovia, L.permisosMontesSegoviaJunta, L.micologiaCylExpedicion, L.jcylMicologia],
  },
  'cyl-sg-montes-junta': {
    note: 'Montes de la Comunidad en Segovia (SG-50005).',
    links: [L.permisosMontesSegoviaJunta, L.permisosMontesSegovia, L.micologiaCylExpedicion, L.jcylMicologia],
  },
  'cyl-so-montes-soria': {
    note: 'Parque Micológico Montes de Soria (PMSO-50001).',
    links: [
      L.permisosMontesSoria,
      L.montesDeSoriaAsoc,
      L.permisosMontesSoriaJcyl,
      L.micologiaCyl,
      L.jcylMicologia,
    ],
  },
  'cyl-so-montes-junta': {
    note: 'Montes de la Comunidad en Soria (SO-50003).',
    links: [L.permisosMontesSoriaJcyl, L.permisosMontesSoria, L.jcylMicologia],
  },
  'cyl-so-pinar-grande': {
    note: 'Pinar Grande / comarca de Pinares: zona regulada bajo Montes de Soria / CyL.',
    links: [L.permisosMontesSoria, L.montesDeSoriaAsoc, L.permisosMontesSoriaJcyl, L.micologiaCyl],
  },
  'cyl-va-torozos': {
    note: 'Acotado Torozos, Mayorga y Pinares de Valladolid (VA-50001).',
    links: [L.permisosTorozos, L.micologiaCylExpedicion, L.jcylMicologia],
  },
  'cyl-za-noroeste': {
    note: 'Parque micológico Montes del Noroeste Zamorano.',
    links: [L.permisosNoroesteZamora, L.micologiaCylExpedicion, L.jcylMicologia],
  },
  'cyl-za-camarzana': {
    note: 'Acotado Camarzana de Tera, Rabanales y otros (Zamora).',
    links: [L.permisosCamarzana, L.micologiaCylExpedicion, L.jcylMicologia],
  },
  'cyl-za-sanabria': {
    note: 'Sanabria: Parque Natural + acotados del noroeste zamorano.',
    links: [L.permisosNoroesteZamora, L.micologiaCylVisor, L.jcylMicologia],
  },

  'soria-pinares': {
    note: 'Pinares de Soria / Vinuesa: Parque Micológico Montes de Soria y acotados CyL.',
    links: [
      L.permisosMontesSoria,
      L.permisosMontesSoriaJcyl,
      L.montesDeSoriaAsoc,
      L.micologiaCyl,
      L.micocyl,
      L.jcylMicologia,
    ],
  },
  'soria-pinares-lobo': {
    note: 'Pinares de Soria – Urbión: permisos Montes de Soria (MicologíaCyL).',
    links: [L.permisosMontesSoria, L.permisosMontesSoriaJcyl, L.montesDeSoriaAsoc, L.micologiaCyl, L.jcylMicologia],
  },
  'sierra-gredos': {
    note: 'Gredos (Ávila): acotado micológico AV-50003 y montes de la Junta.',
    links: [L.permisosGredos, L.permisosMontesAvila, L.micologiaCylExpedicion, L.micocyl, L.jcylMicologia],
  },
  'cyl-avila-gredos-norte': {
    note: 'Gredos Norte: acotados Gredos / Montes CyL en Ávila.',
    links: [L.permisosGredos, L.permisosMontesAvila, L.micologiaCyl, L.jcylMicologia],
  },
  'avila-gredos-norte': {
    note: 'Sierra de Gredos – vertiente norte: permisos MicologíaCyL.',
    links: [L.permisosGredos, L.permisosMontesAvila, L.micologiaCylExpedicion, L.jcylMicologia],
  },
  'cyl-segovia-vailsain': {
    note: 'Valsaín / Segovia: consulta acotados CyL y montes de la Comunidad.',
    links: [L.micologiaCylExpedicion, L.micologiaCylVisor, L.micocyl, L.jcylMicologia],
  },
  'cyl-salamanca-francia': {
    note: 'Sierra de Francia: acotados MicologíaCyL (consulta visor / expedición).',
    links: [L.micologiaCylExpedicion, L.micocyl, L.micologiaCylVisor, L.jcylMicologia],
  },
  'cyl-burgos-merindades': {
    note: 'Merindades (Burgos): acotados locales vía MicologíaCyL.',
    links: [L.micologiaCylExpedicion, L.micologiaCylVisor, L.jcylMicologia],
  },
  'cyl-zamora-sanabria': {
    note: 'Sanabria (Zamora): Parque Natural + acotados CyL si aplica.',
    links: [L.micologiaCyl, L.jcylMicologia, L.micocyl],
  },
  'palencia-aguilar': {
    note: 'Montaña Palentina: consulta acotados MicologíaCyL y normativa autonómica.',
    links: [L.micologiaCylExpedicion, L.micologiaCylVisor, L.jcylMicologia],
  },
  'palencia-fuentes-carrionas': {
    note: 'Fuentes Carrionas: ENP + posibles acotados CyL.',
    links: [L.micologiaCyl, L.jcylMicologia, L.micocyl],
  },
  'leon-picos': {
    note: 'Picos de Europa (León): Parque Nacional — restricciones severas.',
    links: [L.picosEuropa, L.jcylMicologia, L.micologiaCyl],
  },
  'leon-ancones': {
    note: 'Riaño / montaña leonesa: consulta acotados y ENP.',
    links: [L.micologiaCylExpedicion, L.jcylMicologia, L.micocyl],
  },
  'sierra-guadarrama': {
    note: 'Guadarrama (Madrid–Segovia): Parque Nacional + tramos CyL/Madrid.',
    links: [L.guadarrama, L.micologiaCyl, L.madridMedio, L.jcylMicologia],
  },

  // ── Navarra / Irati ──
  'pirineo-navarro': {
    note: 'Selva de Irati: acotados de Aezkoa/Salazar y normas forales.',
    links: [L.iratiInfo, L.aezkoaPermisos, L.navarraSetas, L.navarraMedio],
  },
  'navarra-hayedo-irati': {
    note: 'Irati zona norte: acotados del valle y medio ambiente foral.',
    links: [L.iratiInfo, L.aezkoaPermisos, L.navarraSetas, L.navarraMedio],
  },
  'navarra-irati-sur': {
    note: 'Irati accesos sur: normativa foral y gestores locales.',
    links: [L.iratiInfo, L.navarraSetas, L.navarraMedio],
  },
  'navarra-ultzama': {
    note: 'Ultzama: parque micológico con permisos online.',
    links: [L.ultzamaPermisos, L.navarraSetas, L.navarraMedio],
  },
  'navarra-bertiz': {
    note: 'Parque Natural de Bertiz: consulta restricciones de uso.',
    links: [L.navarraMedio, L.navarraSetas],
  },

  // ── Asturias / Cantabria / Picos ──
  'asturias-oriental': {
    note: 'Picos de Europa / oriente: Parque Nacional y normativa autonómica.',
    links: [L.picosEuropa, L.asturiasMedio],
  },
  'asturias-somiedo': {
    note: 'Parque Natural de Somiedo: consulta usos permitidos.',
    links: [L.asturiasMedio],
  },
  'asturias-redes': {
    note: 'Parque Natural de Redes.',
    links: [L.asturiasMedio],
  },
  'asturias-fuentes-del-narcea': {
    note: 'Fuentes del Narcea – Degaña: ENP asturiano.',
    links: [L.asturiasMedio],
  },
  'asturias-muniellos': {
    note: 'Reserva Integral de Muniellos: acceso muy restringido.',
    links: [L.asturiasMedio],
  },
  'cantabria-saja': {
    note: 'Saja–Nansa: consulta Gobierno de Cantabria.',
    links: [L.cantabriaMedio],
  },
  'cantabria-picos-liébana': {
    note: 'Liébana / Picos: Parque Nacional + Cantabria.',
    links: [L.picosEuropa, L.cantabriaMedio],
  },
  'cantabria-campoo': {
    note: 'Campoo–Los Valles.',
    links: [L.cantabriaMedio],
  },
  'cantabria-cabuerniga': {
    note: 'Valle de Cabuérniga.',
    links: [L.cantabriaMedio],
  },

  // ── País Vasco ──
  'pv-gorbeia': {
    note: 'Gorbeia: ENP + Parque Micológico de Gorbeialdea (permisos comarcales).',
    links: [L.gorbeiaPermisos, L.euskadiMedio],
  },
  'bizkaia-gorbeia': {
    note: 'Gorbeia (Bizkaia) / entorno Gorbeialdea.',
    links: [L.gorbeiaPermisos, L.euskadiMedio],
  },
  'pv-urkiola': {
    note: 'Parque Natural de Urkiola.',
    links: [L.euskadiMedio],
  },
  'pais-vaso-izki': {
    note: 'Parque Natural de Izki (Álava); cotos cercanos en Montaña Alavesa.',
    links: [L.arraiaCoto, L.euskadiMedio],
  },
  'gipuzkoa-aiako': {
    note: 'Aiako Harria – Jaizkibel.',
    links: [L.euskadiMedio],
  },

  // ── Galicia ──
  'galicia-courel': {
    note: 'Serra do Courel: consulta montes, Xunta y MycoGalicia.',
    links: [L.mycoGalicia, L.xuntaMedio],
  },
  'galicia-baixa-limia': {
    note: 'Baixa Limia – Xurés.',
    links: [L.xuntaMedio, L.mycoGalicia],
  },
  'galicia-ancares': {
    note: 'Ancares (Galicia–León): doble normativa posible.',
    links: [L.xuntaMedio, L.jcylMicologia, L.mycoGalicia],
  },
  'galicia-costadamorte': {
    note: 'Costa da Morte: montes, CMVMC y MycoGalicia.',
    links: [L.mycoBarona, L.mycoGalicia, L.xuntaMedio],
  },
  'ourense-ribeira-sacra': {
    note: 'Ribeira Sacra / Ourense: montes y posible regulación local (p. ej. A Veiga).',
    links: [L.aveigaTurismo, L.xuntaMedio, L.mycoGalicia],
  },
  'pontevedra-groba': {
    note: 'Serra da Groba / Vigo: coutos MycoGalicia cercanos.',
    links: [L.mycoBeade, L.mycoMatama, L.mycoGalicia, L.xuntaMedio],
  },

  // ── Cataluña ──
  'pirineo-catalan': {
    note: 'Pirineo catalán: Alt Pirineu con acotados de tiquet; resto Gencat / propiedad.',
    links: [L.altPirineuRegulacio, L.gencatBolets, L.gencatMedi],
  },

  // ── La Rioja ──
  'rioja-cameros': {
    note: 'Sierra de Cameros.',
    links: [L.riojaMedio],
  },
  'la-rioja-cameros': {
    note: 'Sierra de Cameros.',
    links: [L.riojaMedio],
  },
  'rioja-ebro': {
    note: 'La Rioja Baja / Ebro.',
    links: [L.riojaMedio],
  },

  // ── Madrid ──
  // (guadarrama already above)
}

// ── Region-level fallbacks ──────────────────────────────────────────────────

const BY_REGION: Record<string, ZoneResourcePack> = {
  Aragón: {
    note: 'Aragón: Decreto 179/2014. En zonas reguladas (parques micológicos / cotos) hace falta permiso del titular. MicoAragón gestiona varios parques.',
    links: [L.micoAragonPermisos, L.micoAragon, L.aragonGov, L.aragonDecree],
  },
  'Castilla y León': {
    note: 'CyL es la comunidad con más acotados y parques micológicos. Permisos online en MicologíaCyL / MicoCyL. Usa el visor para localizar el acotado exacto.',
    links: [
      L.micologiaCylExpedicion,
      L.micologiaCylVisor,
      L.micologiaCyl,
      L.micocyl,
      L.jcylMicologia,
    ],
  },
  Cataluña: {
    note: 'En general no hay permiso autonómico único; hay recomendaciones y reglas en parques naturales. Informa siempre en el ENP o ayuntamiento.',
    links: [L.gencatBolets, L.gencatMedi],
  },
  Navarra: {
    note: 'Red de acotados forales y parques micológicos (Ultzama, Erro, valles de Irati…). Permisos de gestores locales — VisionSetil no vende permisos.',
    links: [L.navarraSetas, L.ultzamaPermisos, L.iratiInfo, L.navarraMedio],
  },
  'País Vasco': {
    note: 'Normativa foral y parques/cotos micológicos comarcales (Gorbeialdea, Asparrena, Arraia…).',
    links: [L.gorbeiaPermisos, L.euskadiMedio],
  },
  Galicia: {
    note: 'Coutos de CMVMC vía MycoGalicia y ordenanzas municipales; montes de la Xunta.',
    links: [L.mycoGalicia, L.xuntaMedio],
  },
  'Galicia / Castilla y León': {
    note: 'Zona limítrofe: puede aplicar normativa gallega y/o castellanoleonesa.',
    links: [L.xuntaMedio, L.mycoGalicia, L.micologiaCyl, L.jcylMicologia],
  },
  Asturias: {
    note: 'ENP y montes del Principado. Picos de Europa: Parque Nacional.',
    links: [L.asturiasMedio, L.picosEuropa],
  },
  Cantabria: {
    note: 'Normativa de Cantabria y posibles ENP (Picos, Saja…).',
    links: [L.cantabriaMedio, L.picosEuropa],
  },
  'La Rioja': {
    note: 'Gobierno de La Rioja · medio ambiente.',
    links: [L.riojaMedio],
  },
  Madrid: {
    note: 'Comunidad de Madrid y ENP (Guadarrama).',
    links: [L.madridMedio, L.guadarrama],
  },
  'Madrid / Castilla y León': {
    note: 'Guadarrama compartido: PN + posibles acotados CyL.',
    links: [L.guadarrama, L.madridMedio, L.micologiaCyl, L.jcylMicologia],
  },
  Andalucía: {
    note: 'Junta de Andalucía · montes y ENP. Varios ayuntamientos (Loja, Baza, Júzcar…) exigen autorización municipal.',
    links: [L.juntaAndalucia, L.bazaOrdenanza],
  },
  'Comunidad Valenciana': {
    note: 'Hasta ciertos kilos puede no requerir autorización forestal; verifica ENP y GVA.',
    links: [L.gvaMedio],
  },
  'Comunitat Valenciana': {
    note: 'Normativa GVA y parques naturales (mismo marco que Comunidad Valenciana).',
    links: [L.gvaMedio],
  },
  Extremadura: {
    note: 'Junta de Extremadura · medio ambiente.',
    links: [L.juntaExtremadura],
  },
  'Castilla-La Mancha': {
    note: 'Castilla-La Mancha · desarrollo sostenible / montes.',
    links: [L.clmMedio],
  },
  Murcia: {
    note: 'Región de Murcia · medio ambiente.',
    links: [L.murciaMedio],
  },
  'Islas Baleares': {
    note: 'Govern Illes Balears · medi ambient.',
    links: [L.balearsMedio],
  },
  'Illes Balears': {
    note: 'Govern Illes Balears · medi ambient (mismo marco que Islas Baleares).',
    links: [L.balearsMedio],
  },
  Canarias: {
    note: 'Gobierno de Canarias · medio ambiente y ENP insulares.',
    links: [L.canariasMedio],
  },
}

const SPAIN_FALLBACK: ZoneResourcePack = {
  note: 'La regulación es autonómica o local (cotos, montes, ENP). Verifica siempre el permiso del titular del terreno.',
  links: [L.mapa, L.micologiaCyl, L.micoAragon],
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function blobOf(zone: {
  id: string
  name: string
  region: string
  provinces?: string[]
}): string {
  return normalize(
    `${zone.id} ${zone.name} ${zone.region} ${(zone.provinces || []).join(' ')}`,
  )
}

/** Heuristics when zone id is not in the explicit table. */
function heuristicPack(zone: {
  id: string
  name: string
  region: string
  provinces?: string[]
}): ZoneResourcePack | null {
  const b = blobOf(zone)

  if (b.includes('albarracin') || (b.includes('teruel') && b.includes('maestrazgo'))) {
    return {
      note: 'Teruel / Albarracín: parque micológico y permisos MicoAragón.',
      links: [L.micoAragonPermisos, L.albarracinPark, L.albarracinInfo, L.aragonGov],
    }
  }
  if (b.includes('moncayo')) {
    return {
      note: 'Moncayo: parque micológico + normativa Aragón.',
      links: [L.moncayoPark, L.micoAragonPermisos, L.micoAragon, L.aragonGov],
    }
  }
  if (b.includes('ordesa') || b.includes('monte perdido')) {
    return {
      note: 'Ordesa / Monte Perdido: Parque Nacional — restricciones máximas.',
      links: [L.ordesa, L.aragonGov, L.aragonDecree],
    }
  }
  if (b.includes('soria') || b.includes('urbion') || b.includes('vinuesa') || b.includes('pinar grande')) {
    return {
      note: 'Soria / pinares: Parque Micológico Montes de Soria y acotados CyL.',
      links: [L.permisosMontesSoria, L.permisosMontesSoriaJcyl, L.montesDeSoriaAsoc, L.micologiaCyl],
    }
  }
  if (b.includes('gredos') || b.includes('hoyos del espino')) {
    return {
      note: 'Gredos: acotados MicologíaCyL (Ávila).',
      links: [L.permisosGredos, L.permisosMontesAvila, L.micologiaCylExpedicion],
    }
  }
  if (b.includes('valsa') || b.includes('segovia') || b.includes('torozos') || b.includes('valladolid')) {
    return {
      note: 'Segovia / Valladolid: acotados MicologíaCyL (Montes de Segovia, Torozos…).',
      links: [L.micologiaCylExpedicion, L.micologiaCylVisor, L.permisosTorozos, L.jcylMicologia],
    }
  }
  if (b.includes('francia') || b.includes('bejar') || b.includes('quilamas') || b.includes('rebollar')) {
    return {
      note: 'Sierras de Francia / Béjar / Quilamas: parque micológico PMSA-50001.',
      links: [L.permisosFranciaBejar, L.micologiaCylExpedicion, L.micocyl, L.jcylMicologia],
    }
  }
  if (b.includes('sanabria') || b.includes('camarzana') || b.includes('zamora') || b.includes('noroeste zamorano')) {
    return {
      note: 'Zamora: Parque Noroeste Zamorano y acotados (Camarzana…).',
      links: [L.permisosNoroesteZamora, L.permisosCamarzana, L.micologiaCylExpedicion, L.jcylMicologia],
    }
  }
  if (b.includes('velilla') || b.includes('carrion') || b.includes('palencia')) {
    return {
      note: 'Palencia: Parque micológico Velilla y montaña palentina.',
      links: [L.permisosVelilla, L.micologiaCylExpedicion, L.jcylMicologia],
    }
  }
  if (b.includes('burgos') || b.includes('merindades') || b.includes('tiron') || b.includes('montes de oca')) {
    return {
      note: 'Burgos: acotados Fresneda Tirón, Montes de Oca y visor CyL.',
      links: [L.permisosFresnedaTiron, L.permisosMontesOca, L.micologiaCylVisor, L.jcylMicologia],
    }
  }
  if (b.includes('leon') || b.includes('laciana') || b.includes('bierzo') || b.includes('rio cea') || b.includes('cea')) {
    return {
      note: 'León: acotado Río Cea y red MicologíaCyL (visor para el resto).',
      links: [L.permisosRioCea, L.micologiaCylExpedicion, L.micologiaCylVisor, L.jcylMicologia],
    }
  }
  if (b.includes('irati') || b.includes('aezkoa') || b.includes('salazar')) {
    return {
      note: 'Irati / valles navarros: acotados de junta y normas forales.',
      links: [L.iratiInfo, L.aezkoaPermisos, L.navarraSetas, L.navarraMedio],
    }
  }
  if (b.includes('ultzama')) {
    return {
      note: 'Parque Micológico Ultzama.',
      links: [L.ultzamaPermisos, L.navarraSetas],
    }
  }
  if (b.includes('gorbeia') || b.includes('gorbeialdea')) {
    return {
      note: 'Gorbeialdea / Gorbeia: parque micológico comarcal.',
      links: [L.gorbeiaPermisos, L.euskadiMedio],
    }
  }
  if (b.includes('mycogalicia') || b.includes('couto') || b.includes('beade') || b.includes('matama')) {
    return {
      note: 'Coutos gallegos MycoGalicia / CMVMC.',
      links: [L.mycoGalicia, L.xuntaMedio],
    }
  }
  if (b.includes('alt pirineu') || b.includes('viros') || b.includes('esterri')) {
    return {
      note: 'Alt Pirineu: acotados con tiquet diario.',
      links: [L.altPirineuRegulacio, L.gencatBolets],
    }
  }
  if (b.includes('maestrazgo')) {
    return {
      note: 'Maestrazgo (Teruel): pases comarcales de setas.',
      links: [L.maestrazgoPases, L.maestrazgoInfo, L.aragonGov],
    }
  }
  if (b.includes('picos de europa') || b.includes('valdeon') || b.includes('liebana')) {
    return {
      note: 'Picos de Europa: Parque Nacional + normativa de la CCAA limítrofe.',
      links: [L.picosEuropa, L.asturiasMedio, L.cantabriaMedio, L.jcylMicologia],
    }
  }
  if (b.includes('guadarrama')) {
    return {
      note: 'Sierra de Guadarrama: Parque Nacional.',
      links: [L.guadarrama, L.madridMedio, L.micologiaCyl],
    }
  }
  if (normalize(zone.region).includes('aragon')) {
    return BY_REGION['Aragón']
  }
  if (normalize(zone.region).includes('castilla y leon')) {
    return BY_REGION['Castilla y León']
  }
  return null
}

/** Resolve permit/info links for a map zone. */
export function getZoneResourcePack(zone: {
  id: string
  name: string
  region: string
  provinces?: string[]
}): ZoneResourcePack {
  const byId = BY_ZONE_ID[zone.id]
  if (byId) return byId

  const heur = heuristicPack(zone)
  if (heur) return heur

  const byRegion = BY_REGION[zone.region]
  if (byRegion) return byRegion

  for (const [k, pack] of Object.entries(BY_REGION)) {
    if (
      normalize(zone.region).includes(normalize(k)) ||
      normalize(k).includes(normalize(zone.region))
    ) {
      return pack
    }
  }

  return SPAIN_FALLBACK
}

export function kindLabelEs(kind: ZoneResourceLink['kind']): string {
  switch (kind) {
    case 'permit':
      return 'Permiso'
    case 'park':
      return 'Parque'
    case 'tourism':
      return 'Portal'
    default:
      return 'Info'
  }
}

/** Catalog of major regulated parks (for docs / UI lists). */
export const MYCOLOGICAL_PARKS_CATALOG: Array<{
  name: string
  region: string
  permitUrl: string
  infoUrl?: string
}> = [
  {
    name: 'Parque micológico Comunidad de Albarracín',
    region: 'Aragón (Teruel)',
    permitUrl: L.micoAragonPermisos.url,
    infoUrl: L.albarracinPark.url,
  },
  {
    name: 'Parque micológico del Moncayo',
    region: 'Aragón (Zaragoza)',
    permitUrl: L.micoAragonPermisos.url,
    infoUrl: L.moncayoPark.url,
  },
  // Castilla y León — provincia a provincia (MicologíaCyL)
  {
    name: 'Acotado Gredos (AV-50003)',
    region: 'Castilla y León (Ávila)',
    permitUrl: L.permisosGredos.url,
    infoUrl: L.micologiaCylExpedicion.url,
  },
  {
    name: 'Montes CyL en Ávila (AV-50006)',
    region: 'Castilla y León (Ávila)',
    permitUrl: L.permisosMontesAvila.url,
    infoUrl: L.jcylMicologia.url,
  },
  {
    name: 'Fresneda de la Sierra Tirón (BU-50073)',
    region: 'Castilla y León (Burgos)',
    permitUrl: L.permisosFresnedaTiron.url,
    infoUrl: L.micologiaCyl.url,
  },
  {
    name: 'Montes de Oca (BU-50015)',
    region: 'Castilla y León (Burgos)',
    permitUrl: L.permisosMontesOca.url,
    infoUrl: L.micologiaCylVisor.url,
  },
  {
    name: 'Río Cea (LE-50003)',
    region: 'Castilla y León (León)',
    permitUrl: L.permisosRioCea.url,
    infoUrl: L.micologiaCylExpedicion.url,
  },
  {
    name: 'Parque micológico Velilla del Río Carrión',
    region: 'Castilla y León (Palencia)',
    permitUrl: L.permisosVelilla.url,
    infoUrl: L.micologiaCyl.url,
  },
  {
    name: 'Sierras de Francia, Béjar, Quilamas y El Rebollar',
    region: 'Castilla y León (Salamanca)',
    permitUrl: L.permisosFranciaBejar.url,
    infoUrl: L.micocyl.url,
  },
  {
    name: 'Montes de Segovia / Montes Junta Segovia',
    region: 'Castilla y León (Segovia)',
    permitUrl: L.micologiaCylExpedicion.url,
    infoUrl: L.micologiaCylVisor.url,
  },
  {
    name: 'Parque Micológico Montes de Soria (PMSO-50001)',
    region: 'Castilla y León (Soria)',
    permitUrl: L.permisosMontesSoria.url,
    infoUrl: L.montesDeSoriaAsoc.url,
  },
  {
    name: 'Montes CyL en Soria (SO-50003)',
    region: 'Castilla y León (Soria)',
    permitUrl: L.permisosMontesSoriaJcyl.url,
    infoUrl: L.jcylMicologia.url,
  },
  {
    name: 'Torozos, Mayorga y Pinares de Valladolid (VA-50001)',
    region: 'Castilla y León (Valladolid)',
    permitUrl: L.permisosTorozos.url,
    infoUrl: L.micologiaCyl.url,
  },
  {
    name: 'Montes del Noroeste Zamorano (PMZA-50001)',
    region: 'Castilla y León (Zamora)',
    permitUrl: L.permisosNoroesteZamora.url,
    infoUrl: L.micologiaCylExpedicion.url,
  },
  {
    name: 'Camarzana, Rabanales y otros (ZA-50024)',
    region: 'Castilla y León (Zamora)',
    permitUrl: L.permisosCamarzana.url,
    infoUrl: L.micologiaCyl.url,
  },
  {
    name: 'Red completa de acotados CyL (visor + expedición)',
    region: 'Castilla y León',
    permitUrl: L.micologiaCylExpedicion.url,
    infoUrl: L.micologiaCylVisor.url,
  },
]
