# Fuentes de fotos de setas y partners

## Qué usamos ya (abierto / reutilizable)

| Fuente | API | Licencias típicas | Notas |
|--------|-----|-------------------|--------|
| **iNaturalist** | `api.inaturalist.org` | CC0, CC-BY, CC-BY-SA (y a veces NC) | Open Data CDN; preferimos research-grade |
| **GBIF** | `api.gbif.org` | CC0 / CC-BY vía ocurrencias | StillImage + taxonKey match |
| **Wikimedia Commons** | MediaWiki API | CC-BY / CC-BY-SA / PD | Búsqueda por nombre científico |
| **Wikipedia** | REST summary | Imagen de página | Último recurso educativo |

Script: `python scripts/fill_all_photos.py`  
Precompute: `python scripts/precompute_species_images.py --fetch`

## Qué NO scrapamos (privado / comercial)

Estas bases **no se descargan en masa** sin acuerdo:

| Fuente | Por qué | Contacto / acción |
|--------|---------|-------------------|
| **Mushroom Observer** | ToS; muchas fotos con derechos del autor | Contactar maintainers para API partnership |
| **MycoBank** | Metadatos de nomenclatura, no banco de fotos libre | — |
| **Index Fungorum** | Nombres, no imágenes | — |
| **Fungipedia / sociedades locales** | Contenido editorial | Pedir permiso de reuso educativo |
| **Stock (Shutterstock, Getty)** | Comercial | Fuera de alcance open-source |
| **iNaturalist “all rights reserved”** | Sin licencia abierta | Se saltan en el script |

## Emails / partners a solicitar (plantilla)

Asunto: *Solicitud de reuso educativo de fotos de setas — VisionSetil (safety-first PWA)*

```
Hola,

Somos VisionSetil, una app educativa de micología (orientación de campo,
nunca permiso de consumo). Queremos mostrar fotos reales con atribución
clara bajo licencia abierta o permiso escrito de reuso educativo no comercial.

¿Podéis indicar:
1) API o dump con licencias CC0 / CC-BY / CC-BY-SA,
2) o un contacto de permisos para un set de taxones ibéricos prioritarios?

Atribución: siempre visible (autor + licencia + enlace).
Contacto técnico: media@visionsetil.local  (sustituir por email real de ops)

Gracias.
```

Destinatarios sugeridos (completar con email real cuando se contacte):

- Sociedades micológicas autonómicas (ES)
- Herbario / universidades con colecciones fotográficas CC
- Proyectos citizen-science regionales
- Autores con álbumes Flickr CC marcados

## Política de producto

1. Preferir **CC0 / CC-BY / CC-BY-SA**.
2. **CC-BY-NC** solo como último recurso, marcado `educational_noncommercial_display_only`.
3. **ND** no se usa (no permite derivados WebP).
4. Nunca “segura para comer” en la UI de fotos.
5. Si no hay foto: cascade FE (404 local → catálogo remoto → ilustración honesta), no fondo roto.

## KPI

- `ok_real` / `ok_real_nc` en `media/species/*/meta.json`
- `frontend/src/data/speciesPhotos.json` → `stats.with_photo`
- `python scripts/audit_media.py --strict-stubs` (objetivo: 0 stubs)
