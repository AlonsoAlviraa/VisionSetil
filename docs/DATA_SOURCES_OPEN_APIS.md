# VisionSetil — destilado de modelos, fotos y APIs (graph engineering)

**Updated:** 2026-07-29 · **Policy:** open APIs only · orientation never forage · **never** scrape paid apps or proprietary models.

## 1. Qué piden las apps comerciales (público) vs qué hacemos

| Producto comercial | De dónde suelen sacar datos (público / inferido) | ¿Scrape en VS? |
|--------------------|--------------------------------------------------|----------------|
| Picture Mushroom / clones | Modelo propio cerrado + base de fotos licenciadas/compradas | **NO** — cerrado, ToS, copyright |
| Shroomify | Pack regional offline + catálogo curado | **NO** — app propietaria |
| Seek / iNaturalist | **API iNaturalist** + modelo CV iNat/Seek | **SÍ vía API pública** (con límites) |
| Wikipedia-based tools | **Wikipedia / Commons REST + MediaWiki API** | **SÍ vía API pública** |
| Datasets de investigación | FungiCLEF, Danish Fungi, FungiTastic, GBIF media | **SÍ** con licencia filtrada |

**Conclusión:** no “destilamos” pesos de apps de pago. Destilamos **fuentes abiertas** que ellas también usan de forma legítima (iNat, Wiki, GBIF) y datasets de challenge.

## 2. APIs abiertas en VisionSetil (SSOT)

| API | Base URL | Uso en repo | Script / cliente |
|-----|----------|-------------|------------------|
| **Wikipedia REST** | `https://{lang}.wikipedia.org/api/rest_v1` | Thumbnail / original page image | `scripts/build_species_photos.py`, `frontend/src/api/wikipedia.ts` |
| **MediaWiki API** | `https://{lang}.wikipedia.org/w/api.php` | Búsqueda / media list | `frontend/src/api/wikipedia.ts` |
| **Wikimedia Commons** | `https://commons.wikimedia.org/w/api.php` | Imágenes reutilizables | `wikipedia.ts` COM_BASE |
| **iNaturalist API v1** | `https://api.inaturalist.org/v1` | Taxon default_photo | `build_species_photos.py` `inat_image()` |
| **GBIF API v1** | `https://api.gbif.org/v1` | Occurrences + StillImage (ES) | `scripts/probe_gbif_spain_fungi.py`, `download_gbif_media.py`, `frontend/src/api/gbif.ts` |
| **Index Fungorum** | SOAP/HTTP legacy | Solo nombres | `scripts/probe_index_fungorum.py`, FE resolve |

### Producto foto (runtime)

1. `frontend/src/data/speciesPhotos.json` — URLs remotas (Wiki/iNat) generadas por `build_species_photos.py`  
2. `media/species/{slug}/*.webp` — derivados locales (`precompute_species_images.py` / `fill_all_photos.py`)  
3. Cascada FE: **catalog URL primero** → local → placeholder (`SpeciesImage`, `speciesMediaStack`)

### Entrenamiento ML (no es el catálogo de producto)

| Fuente | Rol | Registro |
|--------|-----|----------|
| FungiCLEF / Danish Fungi | labels + multi-view challenge | `data/training_sources_registry.json` |
| FungiTastic | research multi-modal | idem |
| GBIF ES fungi media | holdout / regional media | scripts `gbif_*` |
| Checkpoint E20 | `kaggle/kernel_output_v20/models/best.pt` | MAP@3 ~0.86 · unlock **false** |

## 3. Licencias (obligatorio filtrar)

| Licencia | Uso producto | Notas |
|----------|--------------|-------|
| CC0 / Public Domain | OK | Preferida |
| CC-BY / CC-BY-SA | OK con atribución | Guardar artist + license URL en meta |
| CC-BY-NC | **Cuidado** | Solo no comercial; muchas fotos iNat vía GBIF son NC |
| All rights reserved / app ToS | **Prohibido** | No scrape |

Allowlist práctica en `scripts/refresh_species_images.py` (`LICENSE_ALLOWLIST`).

## 4. Comandos graph-engineering (legales)

```bash
# Regenerar mapa taxon → foto (Wiki en/es + iNat)
python scripts/build_species_photos.py

# Sondeo GBIF ES fungi + media
python scripts/probe_gbif_spain_fungi.py

# Descarga media GBIF filtrada (allowlist)
python scripts/download_gbif_media.py --help

# Health check multi-API (nuevo)
python scripts/harvest_open_media_apis.py --probe --limit 20

# Refresh / takedown HEAD de fuentes
python scripts/refresh_species_images.py --help
```

## 5. Anti-patrones (no hacer)

1. Scrape HTML de First-Nature, MushroomExpert, Picture Mushroom, Shroomify.  
2. Extraer modelos `.tflite` / `.onnx` de APK de apps.  
3. Hotlink masivo sin User-Agent y sin rate limit.  
4. Mezclar fotos NC en un producto comercial sin revisión legal.  
5. Presentar media scrapeada como “nuestro dataset cerrado”.

## 6. Próximo residual (legal)

1. Correr `harvest_open_media_apis.py --probe` en CI semanal.  
2. Preferir Commons API con `extmetadata` de licencia antes de guardar.  
3. Atribución visible en ficha cuando `provider` sea wiki/inat.  
4. GBIF download request (cuenta humana) para bulk con filtro CC0/BY.
