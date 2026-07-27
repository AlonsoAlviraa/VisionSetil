# Outreach — contactos y emails para datos / colaboración

Documento listo para enviar. Sustituye siempre:

| Placeholder | Valor |
|-------------|--------|
| `[NOMBRE]` | Tu nombre real |
| `[EMAIL]` | Email profesional de VisionSetil (no genérico temporal) |
| `[WEB]` | URL del proyecto o GitHub |
| `[TEL]` | Opcional |

**Política del mensaje (siempre igual):**  
app **educativa y de orientación de campo**, **nunca permiso de consumo**;  
pedimos fotos **con licencia abierta o acuerdo escrito**;  
atribución clara; interés especial en **Iberia + especies mortales**.

---

## 1. Mapa de contactos (prioridad)

### P0 — Datasets ML / investigación (abrir el modelo)

| Quién | Rol | Contacto | Qué pedir |
|-------|-----|----------|-----------|
| **Lukáš Picek** | Danish Fungi / FungiCLEF | `picekl@ntis.zcu.cz` · `lukaspicek@gmail.com` | Acceso full DF20/FungiTastic, multi-vista, citación |
| **Milan Šulc** | Co-autor Danish Fungi | (web dataset; co-citar paper) | Mismo hilo o CC |
| **Jacob Heilmann-Clausen** | Atlas of Danish Fungi / U. Copenhagen | `jheilmann-clausen@snm.ku.dk` | Observaciones expertas, metadatos |
| **Tobias G. Frøslev** | Atlas Danish Fungi | `tobiasgf@snm.ku.dk` | DNA / labels de calidad |
| **Thomas Læssøe** | Atlas Danish Fungi | `thomasl@bio.ku.dk` | Validación taxonómica |
| **Mushroom Observer** | Observaciones CC | `webmaster@mushroomobserver.org` | API / dump / partnership educativo |

### P0 — España / Iberia (dominio local)

| Quién | Rol | Contacto | Qué pedir |
|-------|-----|----------|-----------|
| **GBIF España** | Nodo nacional datos | `support@gbif.es` · `info@gbif.es` | Datasets hongos ES con media, contactos de publicadores |
| **Herbario U. Granada** | Tipos hongos/líquenes GBIF | `mariate@ugr.es` (M. Teresa Vizoso) | Imágenes de herbario / tipos, licencia |
| **Asociación Española de Micología (AEM)** | Nacional | `secretaria@aemicol.com` | Red de sociedades, convenio datos |
| **Sociedad Micológica de Madrid** | Divulgación / afición | `s.micologica.mad.drive@gmail.com` | Fotos validadas, revisores voluntarios |
| **Prof. Gabriel Moreno (UAH)** | Micología académica (ref. SMM) | `gabriel.moreno@uah.es` | Asesoría taxonómica / lookalikes |
| **Montes de Soria** | Gestión micológica CyL | `asociacion@montesdesoria.org` · +34 975 23 39 98 | Observaciones de campo CyL/Soria |

### P1 — Más Iberia / partners de campo

| Quién | Contacto / vía | Nota |
|-------|----------------|------|
| Micocyl / MIKOGEST / Marca de Garantía CyL | Webs `micologiacyl.es` | Convenio territorial setas CyL |
| CESEFOR | Buscar contacto actual en web | I+D forestal / setas |
| Sociedades listadas en foromicologico / lactarius.org | Emails variables por provincia | Campaña “1 sociedad por CCAA” |
| Real Jardín Botánico – CSIC (MA-Fungi / FMI) | Vía GBIF.ES o web RJB | Distribución ibérica, no siempre fotos |

### P2 — Ya usables sin email (pero citar)

| Fuente | Uso |
|--------|-----|
| iNaturalist research-grade vía GBIF | Descarga masiva con licencia por foto |
| Danish Fungi 2020 (sitio público) | Train benchmark; contactar autores si full pack |
| Wikimedia Commons | Fotos con license API |

---

## 2. Orden de envío recomendado (2 semanas)

| Día | Enviar a | Idioma |
|-----|----------|--------|
| 1 | Picek + Heilmann-Clausen (CC Frøslev) | EN |
| 1 | GBIF.ES | ES |
| 2 | AEM + Sociedad Micológica Madrid | ES |
| 2 | Montes de Soria | ES |
| 3 | Herbario Granada | ES |
| 4 | Mushroom Observer | EN |
| 5 | Gabriel Moreno (cortesía académica) | ES |
| 7–14 | 5 sociedades autonómicas (seguimiento) | ES |

---

## 3. Emails listos para copiar

---

### E1 — Danish Fungi / FungiCLEF (EN)

**To:** `picekl@ntis.zcu.cz`, `lukaspicek@gmail.com`  
**Cc:** `jheilmann-clausen@snm.ku.dk`, `tobiasgf@snm.ku.dk`  
**Subject:** Research collaboration request — VisionSetil (safety-first fungi ID, Iberia)

```
Dear Dr. Picek, dear Danish Fungi / FungiCLEF team,

I am [NOMBRE], working on VisionSetil, an open safety-first educational app for
mushroom orientation (field guidance only — never consumption advice).

We already have a product surface (multi-view capture, encyclopedia, lookalikes,
daily educational games) and a fail-closed quality gate: our current multi-view
checkpoint is not allowed to return species IDs until MAP@3 and deadly-species
recall meet minimum thresholds.

We would like to collaborate around public fungi vision data:

1) Access / best-practice use of Danish Fungi / FungiTastic (full multi-view where
   available), including recommended train/val splits and any Iberian-relevant
   subsetting guidance.
2) Advice on hard negatives for deadly lookalikes (Amanita, Galerina, small
   Lepiota, Cortinarius).
3) Permission to cite your dataset and paper in our model card and documentation.

In return we can share:
- Evaluation reports (MAP@3, deadly recall, open-set rejection).
- Attribution and links to your project.
- Feedback from a Spanish/Iberian field-oriented product use case.

Project: [WEB]
Contact: [EMAIL]

Thank you for your pioneering work on DF20 / FungiCLEF.

Kind regards,
[NOMBRE]
VisionSetil
[EMAIL] · [WEB]
```

---

### E2 — Atlas of Danish Fungi / University of Copenhagen (EN)

**To:** `jheilmann-clausen@snm.ku.dk`  
**Cc:** `tobiasgf@snm.ku.dk`, `thomasl@bio.ku.dk`  
**Subject:** Citizen-science fungi observations — educational AI safety project (Spain)

```
Dear Dr. Heilmann-Clausen and colleagues,

I am contacting you regarding the Atlas of Danish Fungi / related observation
pipelines. We are building VisionSetil, a safety-first educational mycology app
for the Iberian context (orientation only; never forage permission).

We are looking for:
1) Guidance on using expert-validated observation photos and metadata for
   non-commercial research training of vision models.
2) Any published dumps or APIs suitable for multi-view (cap / gills / stipe /
   habitat) learning.
3) Possible future collaboration on deadly-species recognition metrics.

We already consume open GBIF/iNaturalist streams under their licenses and want
to do this correctly with expert communities.

Contact: [EMAIL] · [WEB]

Thank you for your time.
[NOMBRE]
```

---

### E3 — GBIF España (ES)

**To:** `support@gbif.es`  
**Cc:** `info@gbif.es`  
**Subject:** Solicitud de orientación — datasets de hongos con imágenes (España / Iberia)

```
Estimado equipo de GBIF.ES,

Somos VisionSetil, un proyecto de micología de campo con enfoque safety-first
(orientación educativa; nunca autorización de consumo). Estamos montando un
dataset de entrenamiento multi-vista y un catálogo ibérico.

Necesitamos vuestra ayuda para:

1) Identificar publicadores españoles (herbarios, universidades, proyectos)
   con registros de Fungi + StillImage de calidad.
2) Mejores prácticas de descarga masiva (API / DwC-A) filtrando España/Portugal
   y licencias abiertas (CC0 / CC-BY / CC-BY-SA).
3) Si es posible, contactos de colecciones o proyectos dispuestos a un convenio
   de investigación no comercial (atribución + citación).

A cambio: citación de GBIF.ES y de cada dataset, informe de métricas del modelo
(MAP@3, recall de especies mortales) y transparencia en la documentación.

Contacto: [EMAIL]
Web/proyecto: [WEB]

Muchas gracias,
[NOMBRE]
VisionSetil
```

---

### E4 — Asociación Española de Micología (ES)

**To:** `secretaria@aemicol.com`  
**Subject:** Colaboración educativa — fotos validadas y red de sociedades (VisionSetil)

```
Estimados/as de la Asociación Española de Micología,

Me dirijo a ustedes desde VisionSetil, una aplicación educativa de micología de
campo (PWA) centrada en seguridad: multi-vista, catálogo, confusiones peligrosas
y juegos de memoria. No autorizamos consumo ni recolección.

Buscamos colaboración con la red de micólogos y sociedades:

1) Fotografías de campo con identificación revisada (especialmente mortales y
   confusiones clásicas de la península).
2) Metadatos mínimos: taxón, fecha, provincia o comarca, hábitat/sustrato,
   y si es posible varias vistas del mismo ejemplar.
3) Licencia CC-BY / CC-BY-SA o acuerdo de uso no comercial para entrenamiento
   de un modelo de visión y para la enciclopedia (siempre con atribución).
4) Voluntarios revisores para una cola de “revisión experta” en la app.

Ofrecemos:
- Visibilidad y citación de la AEM / sociedades colaboradoras.
- Dashboard de calidad del modelo (incluida sensibilidad a especies mortales).
- Posible taller o webinar sobre IA y límites honestos de la identificación.

Quedamos a disposición para una videollamada breve.

Saludos cordiales,
[NOMBRE]
[EMAIL] · [TEL] · [WEB]
```

---

### E5 — Sociedad Micológica de Madrid (ES)

**To:** `s.micologica.mad.drive@gmail.com`  
**Subject:** Colaboración VisionSetil — fotos de campo y revisión de confusiones

```
Estimados/as de la Sociedad Micológica de Madrid,

Somos VisionSetil, un proyecto de app educativa de setas (orientación de campo,
nunca consumo). Nos gustaría colaborar con vuestra sociedad:

Qué necesitamos:
- Fotos propias de socios/as con licencia abierta o permiso escrito (CC-BY ideal).
- Pares de confusiones clásicas (p. ej. oronja vs mortal, níscalos vs riesgos).
- Personas dispuestas a revisar identificaciones dudosas (cola de expertos).

Qué ofrecemos:
- Crédito visible en ficha y en documentación.
- Acceso prioritario a la app y a informes de errores del modelo.
- Charla gratuita sobre límites de la IA en micología.

¿Os encaja una reunión corta (30 min) o un hilo por correo?

Un saludo,
[NOMBRE]
[EMAIL] · [WEB]
```

---

### E6 — Montes de Soria / territorio CyL (ES)

**To:** `asociacion@montesdesoria.org`  
**Subject:** Convenio de datos de campo — setas CyL/Soria y app educativa VisionSetil

```
Estimados/as de la Asociación Montes de Soria,

Contactamos desde VisionSetil, aplicación de micología educativa con enfoque en
seguridad y territorio ibérico. No damos permiso de recolección ni de consumo.

Nos interesa un convenio de datos de campo en Soria / Castilla y León:

1) Observaciones fotográficas de setas de la zona (ideal multi-vista) con
   identificación revisada.
2) Información de temporada / hábitat útil para un “radar educativo” (no
   cotos ni datos sensibles de propietarios).
3) Posible validación de un set de test “campo real CyL” para medir el modelo.

Garantizamos:
- Uso no comercial o bajo acuerdo escrito.
- Atribución a Montes de Soria.
- Política pública: ante la duda, abstención y micólogo humano.

¿Podemos agendar una llamada?

Atentamente,
[NOMBRE]
[EMAIL] · [TEL] · [WEB]
```

---

### E7 — Herbario Universidad de Granada (ES)

**To:** `mariate@ugr.es`  
**Subject:** Solicitud de colaboración — imágenes de herbario de hongos (uso educativo / ML)

```
Estimada M. Teresa Vizoso,

Escribo desde VisionSetil, proyecto de identificación orientativa de hongos
(educativo, safety-first). Hemos visto el dataset de tipos de hongos y líquenes
del Herbario de la Universidad de Granada en GBIF.

Solicitamos orientación sobre:

1) Disponibilidad de imágenes digitales de especímenes de basidiomicetos /
   ascomicetos con licencia clara para investigación no comercial.
2) Condiciones de uso y citación del herbario.
3) Si existe un procedimiento formal de solicitud de lote de imágenes para
   entrenamiento de un modelo de visión (con atribución).

Nuestro uso excluye cualquier mensaje de comestibilidad.

Quedo a su disposición.
[NOMBRE]
[EMAIL] · [WEB]
```

---

### E8 — Mushroom Observer (EN)

**To:** `webmaster@mushroomobserver.org`  
**Subject:** Educational partnership — open-license fungi images for safety-first ID research

```
Hello Mushroom Observer team,

I am [NOMBRE] from VisionSetil, a safety-first educational mycology app
(orientation only; never consumption guidance).

We already respect Creative Commons licenses on individual images. We would like
to explore:

1) Best way to bulk-export observations/images with license + attribution for
   non-commercial research training.
2) Whether a formal educational partnership or API guidance exists.
3) How to correctly credit MO and photographers in an app UI.

We will not scrape against your ToS; we prefer an agreed path.

Thank you for keeping MO open.
[NOMBRE]
[EMAIL] · [WEB]
```

---

### E9 — Contacto académico (Gabriel Moreno / UAH) (ES)

**To:** `gabriel.moreno@uah.es`  
**Subject:** Consulta breve — lookalikes mortales ibéricos y posible asesoría (VisionSetil)

```
Estimado Prof. Moreno,

Soy [NOMBRE], del proyecto VisionSetil (app educativa de micología, safety-first).
Hemos visto su vínculo con la micología académica y la Sociedad Micológica de Madrid.

Nos ayudaría enormemente:

1) Una lista priorizada de confusiones peligrosas en la península (10–20 pares).
2) Criterios mínimos de evidencia fotográfica (multi-vista) antes de mostrar un top-3.
3) Si conoce estudiantes o sociedades abiertas a etiquetar un set de test.

No buscamos un aval de “comestible”; al contrario: queremos que el sistema se
abstenga cuando no esté seguro.

Muchas gracias por su tiempo.
[NOMBRE]
[EMAIL] · [WEB]
```

---

### E10 — Plantilla corta para cualquier sociedad local (ES)

**Subject:** Colaboración fotos de setas — VisionSetil (educación, no consumo)

```
Hola,

Somos VisionSetil, app educativa de setas (orientación de campo; nunca consumo).
Buscamos fotos de campo con ID revisada y licencia abierta (CC-BY ideal) o
permiso escrito, sobre todo mortales y confusiones.

A cambio: crédito visible + informe de utilidad del material para un modelo
honesto (si duda, se calla).

¿Os interesa? [EMAIL] · [WEB]

Gracias,
[NOMBRE]
```

---

## 4. Qué pedir exactamente (checklist para adjuntar)

Adjunta o pega en el cuerpo cuando te respondan:

```
Preferencias de datos VisionSetil
--------------------------------
Formato: carpetas por taxón o CSV + rutas de imagen
Campos ideales por observación:
  - scientific_name
  - common_name_es (opcional)
  - observation_id
  - date
  - locality (municipio / provincia; GPS opcional y anonimizable)
  - habitat / substrate
  - view_type: cap | gills | stipe | base | habitat | other
  - license + creator + source_url
  - validation: expert | research_grade | amateur

Prioridad taxonómica:
  1) Mortales ibéricos (Amanita phalloides/virosa/verna, Galerina,
     Lepiota brunneoincarnata, Cortinarius rubellus/orellanus, ...)
  2) Confusiones clásicas de mercado/campo
  3) Top 100–150 spp frecuentes en península

Uso:
  - Entrenamiento ML no comercial / investigación
  - Enciclopedia con atribución
  - Nunca consejo de consumo
```

---

## 5. CRM — envíos realizados (2026-07-23)

Remitente Gmail: **Alonso Alvira Ballano** `<alonso.alvbal@gmail.com>`

| Partner | Email | Fecha envío | Estado |
|---------|-------|-------------|--------|
| Danish Fungi / Picek | picekl@ntis.zcu.cz, lukaspicek@gmail.com | 2026-07-23 | Enviado |
| Atlas Danish Fungi | jheilmann-clausen@snm.ku.dk (+ CC Frøslev, Læssøe) | 2026-07-23 | Enviado |
| GBIF España | support@gbif.es, info@gbif.es | 2026-07-23 | Enviado |
| iNaturalist | help@inaturalist.org | 2026-07-23 | Enviado |
| Mushroom Observer | webmaster@mushroomobserver.org | 2026-07-23 | Enviado |
| Faces of Fungi | facesoffungi@gmail.com | 2026-07-23 | Enviado |
| Index Fungorum (Kew) | m.bakhshi@kew.org | 2026-07-23 | Enviado |
| UNITE / PlutoF | info@plutof.ut.ee | 2026-07-23 | Enviado |
| AEM | secretaria@aemicol.com | 2026-07-23 | Enviado |
| Soc. Micológica Madrid | s.micologica.mad.drive@gmail.com | 2026-07-23 | Enviado |
| Montes de Soria | asociacion@montesdesoria.org | 2026-07-23 | Enviado |
| Herbario UGR | mariate@ugr.es | 2026-07-23 | Enviado |
| Gabriel Moreno (UAH) | gabriel.moreno@uah.es | 2026-07-23 | Enviado |
| MycoBank | (solo formulario web) | — | Pendiente manual: https://www.mycobank.org/Contact |

---

## 6. Notas legales / tono

1. No prometáis “IA que identifica al 99%”.  
2. Sí prometed **abstención** y **atribución**.  
3. No pedid cotos GPS exactos ni datos de propietarios.  
4. Preferid **CC0 / CC-BY / CC-BY-SA**; NC solo con acuerdo.  
5. Si alguien manda fotos sin licencia: pedid autorización por escrito antes de entrenar.

---

## 7. Siguiente paso operativo

1. Crear buzón `datos@…` o `partners@…` real.  
2. Enviar **E1 + E3 + E4** el mismo día.  
3. Registrar respuestas en la tabla §5.  
4. Con el primer “sí”, montar carpeta `data/partners/<org>/` y `LICENSE.txt`.

Ver también: `docs/DATA_SOURCES_SPAIN_SORIA.md`, `docs/MEDIA_SOURCES_AND_PARTNERS.md`.
