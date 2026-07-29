# Auditoría: 10 webs de setas + apps líderes (2026-07-29)

**Método:** tráfico/reputación pública (foros micológicos, App Store/Play, menciones r/mycology, First Nature / MushroomExpert / iNat).  
**Regla VisionSetil:** copiar **patrones de producto** y **fuentes abiertas**; **no** copiar fotos con copyright ni claims “edible”.

## Top webs (referencia de visitas / autoridad)

| # | Sitio | Por qué manda | Qué copiar (legal/UX) |
|---|--------|---------------|------------------------|
| 1 | **iNaturalist.org** | Observaciones globales, comunidad, AI computer vision | Mapa de observaciones, multi-foto, segunda opinión humana, links a taxón |
| 2 | **Wikipedia / Commons** | Tráfico enciclopédico + fotos reutilizables | Ficha estructurada, galería multi-ángulo, atribución |
| 3 | **First-Nature.com** | Guía EU muy citada, índice ordenable | Índice por familia/nombre, **galería por familias**, esporada, hábitat |
| 4 | **MushroomExpert.com** | Estándar NA (Kuo), claves y macro/micro | Claves por caracteres, lookalikes, “how to use this key” |
| 5 | **GBIF.org** | Datos de distribución abiertos | Mapas de presencia (orientación), no forraje |
| 6 | **Index Fungorum / Species Fungorum** | Nomenclatura Kew | Solo nombres / sinónimos (ya en VS) |
| 7 | **MycoBank** | Taxonomía + descripciones | Referencia nomenclatural secundaria |
| 8 | **Mushroom Observer** | Comunidad fotográfica micológica | Multi-vista usuario, comparación visual |
| 9 | **Fungimap / regional atlases** | Mapas de conservación | Educación de distribución, no cotos de recolección |
| 10 | **Mushroom Appreciation / field blogs** | Tráfico SEO “how to ID” | Guías para principiantes, multi-foto explicada |

## Top apps

| App | Fortaleza | Qué copiar en VS |
|-----|-----------|------------------|
| **Picture Mushroom** | ID por foto en segundos, **varias vistas**, enciclopedia, similares | Wizard multi-vista (ya), top-3 + compare images |
| **Seek (iNaturalist)** | Gamificación educativa, fotos reales, offline parcial | Badges de estudio (ya), challenges de temporada |
| **iNaturalist** | Comunidad, mapa, multi-taxon | Comunidad + handoff experto (ya) |
| **Shroomify** | **Top 20 del mes**, filtros por rasgos, pack offline regional | Tira “De temporada”, filtros morfológicos (ya traits) |
| **Shroom ID / clones** | Biblioteca grande + scanner | Catálogo Iberia + fotos reales prioritarias |
| **Book of Mushrooms class** | Biblioteca offline rica | Offline pack (ya) |

## Qué **no** copiar

- “Safe to eat / comestible OK” (Picture Mushroom y clones reciben críticas por esto).
- Fotos de apps de pago o sites con all-rights-reserved.
- Scraping masivo de First-Nature / MushroomExpert HTML.

## Imágenes y bibliotecas (legal)

| Fuente | Uso en VS |
|--------|-----------|
| Wikimedia Commons / Wikipedia | URLs en `speciesPhotos.json` (ya) |
| iNaturalist open photos | Catálogo cuando licencia lo permita |
| Local `/media` WebP | Pack propio monorepo |
| Leaflet | Mapas (ya) |
| React + Vite PWA | Shell app/web (ya) |

## Implementación en este ciclo

1. Home: **tira “De temporada”** (patrón Shroomify Top of month).  
2. Enciclopedia: **guía visual por familias** (patrón First Nature).  
3. Ficha: **enlaces de estudio abiertos** (Wikipedia + iNaturalist taxon search).  
4. Más: sección **Recursos del mundo** (links a las 10 webs, educación).  
5. Doc de auditoría + graph STATE.

## Residual

- Clave dicotómica simple (MushroomExpert-lite) como flujo educativo.  
- Mapa de observaciones GBIF (capa opcional, no cotos).  
- Más multi-ángulos curados en `speciesGalleryExtras`.
