# Contact pack — datos validados España / Soria (Semana 2+)

**Política VisionSetil:** identificación **solo orientativa**. Nunca autorizamos consumo.  
Objetivo de la colaboración: fotos multi-vista con ID experta + metadatos para **mejorar recall de especies de alto riesgo** y un hold-out regional.

## Destinatarios prioritarios

| Organización | Enfoque de la petición |
|--------------|------------------------|
| **Micocyl / CESEFOR / Junta CyL** | Inventarios, parcelas, series con especie validada; permiso ML investigación |
| **Asociación Montes de Soria** | Fotos de acotados etiquetadas; validadores locales |
| **MA-Fungi RJB-CSIC** | Darwin Core + permiso de imágenes de ejemplar basidiomicetos carnosos |

## Qué pedimos (checklist)

- [ ] Fotos de basidiomicetos (ideal: himenio + perfil + base + hábitat)
- [ ] Nombre científico validado (experto / herbario / research-grade)
- [ ] Fecha + municipio o UTM
- [ ] Hábitat / sustrato si existe
- [ ] Licencia: preferible **CC-BY** o convenio investigación no comercial
- [ ] Prioridad: taxa de `deadly_set.json` (Amanita phalloides, Galerina marginata, etc.)

## Qué ofrecemos

- Informe de métricas (MAP@3, recall mortales, open-set)
- Citación del organismo en data card / model card
- Dashboard de salud del modelo
- Política de seguridad explícita (no consumo)

## Plantilla corta

```
Asunto: Colaboración dataset micológico validado — VisionSetil (seguridad R7)

Estimados/as,

Desarrollamos VisionSetil, app de orientación micológica (nunca autoriza consumo).
Buscamos colaboración para un dataset multi-vista con identificación experta,
priorizando especies de alto riesgo y cobertura Castilla y León / Soria.

A cambio: métricas transparentes, citación y uso alineado a investigación/seguridad.

Adjunto allowlist (40 spp) y lista de mortales prioritarios.
¿Sería posible una reunión o NDA/convenio?

Saludos,
[Nombre] — [email]
```

## Estado

- Allowlist: `data/industrial_v1/species_allowlist.json`
- Deadly: `data/industrial_v1/deadly_set.json`
- GBIF ES probe: ~24.7k StillImage (suma keys); *A. virosa* solo 7 en ES media
- **Bloqueo externo:** envío de correos requiere acción humana; no automatizable aquí
