# Fuentes de datos micológicos — España / Soria / CyL

Guía operativa para **entrenar y evaluar** VisionSetil con datos públicos o
solicitables a organismos. No inventa registros: lista canales reales y el
papel de cada uno.

## Resumen ejecutivo

| Prioridad | Fuente | Qué aporta | Imágenes lista para ML |
|-----------|--------|------------|-------------------------|
| P0 | **FungiCLEF / Danish Fungi / FungiTastic** (ya en pipeline Kaggle) | Multi-vista + etiquetas + benchmark | Sí (descarga dataset challenge) |
| P0 | **GBIF + iNaturalist** (España, `taxonKey=5` Fungi) | Ocurrencias + fotos con licencia | Sí vía API / download (~244k con media en ES, sondeo 2026-07) |
| P1 | **MA-Fungi (RJB-CSIC)** | Herbario ~100k especímenes, metadatos taxonómicos | Parcial (fichas/GBIF; fotos no siempre ML-ready) |
| P1 | **Micodata / Micocyl / CESEFOR / Junta CyL** | Producción, regulación, territorio CyL-Soria | No es un dump de fotos de entrenamiento; **hay que pedir colaboración** |
| P2 | **Asociación Montes de Soria** | Gestión de acotados, conocimiento local | Contacto / convenio |
| P2 | **Sociedades micológicas / bancos de setas** | Listas de especies, ID comunitaria | Contacto caso a caso |

**Estado actual del modelo en repo (`kernel_output_v9`):** entrenado con subsample
FungiTastic + FungiCLEF (500 spp, 2800/600/600 obs). Métricas test bajas
(MAP@3 ≈ 0.076) — esperable en few-shot; **hace falta más datos y más epochs**,
no solo “conectar pesos”.

---

## 1. Datos ya cableados en VisionSetil

| Dataset | Rol en repo | Config / scripts |
|---------|-------------|------------------|
| FungiTastic | Entrenamiento multi-modal | `kaggle/converters/fungitastic_to_visionsetil.py`, configs `fungitastic_*` |
| FungiCLEF | Benchmark + train | `kaggle/converters/fungiclef_to_visionsetil.py`, `fungiclef2025_*` |
| DF20 | Base regional opcional | `kaggle/converters/df20_to_visionsetil.py` |
| Pesos v9 | Checkpoint multi-view v8 | `kaggle/kernel_output_v9/models/best.pt` + `metrics.json` |

Descarga de challenges (Kaggle / LifeCLEF) y empaquetado:

```bash
# Ver kaggle/README.md y docs/dataset_strategy.md
python kaggle/prepare_kaggle_dataset.py --help
```

---

## 2. GBIF + iNaturalist (público, API, España)

### Conteos de sondeo (API GBIF, sin login)

Ejecutar:

```bash
python scripts/probe_gbif_spain_fungi.py
```

Resultados de referencia (2026-07-17):

| Query | Count |
|-------|------:|
| Fungi en España (cualquier media) | ~1 149 714 |
| Fungi en España **con imagen** | ~244 010 |
| Fungi ES + `HUMAN_OBSERVATION` + imagen | ~235 225 |
| Bbox Soria-ish (lat 41.4–42.2, lon −3.2…−1.8) + imagen | ~4 337 |

### Cómo pedir / descargar

1. Cuenta en [gbif.org](https://www.gbif.org/) (gratuita).
2. Occurrence search:
   - Taxon: **Fungi**
   - Country: **Spain**
   - Media type: **StillImage**
   - Licencias preferidas para reentrenamiento: **CC0 / CC-BY** (evitar NC si el producto es comercial).
3. Download API (lotes grandes):  
   https://techdocs.gbif.org/en/data-use/api-downloads  
4. iNaturalist research-grade (vía GBIF dataset):  
   https://www.gbif.org/dataset/50c9509d-22c7-4a22-a47d-8c48425ef4a7  

**Atribución obligatoria** en cualquier modelo entrenado con GBIF/iNat.

### Enlace de exploración rápida

- ES + Fungi + imágenes:  
  https://www.gbif.org/occurrence/search?country=ES&taxon_key=5&media_type=StillImage  
- Portal nacional GBIF.es: https://gbif.es/en/portal-nacional-de-datos/

---

## 3. Organismos y proyectos (Soria / Castilla y León / España)

### 3.1 Micodata + programa micológico CyL (origen Soria)

- **Qué es:** SIG de producción / aprovechamiento / ordenación del recurso micológico en Castilla y León (piloto ligado a Soria, CIF Valonsadero + CESEFOR + Junta).
- **Portal histórico / servicios:** predicción de producción, ID, documentación (MicodataSIG / MicodataID).
- **Referencias:**  
  - Ficha PFCyL: https://pfcyl.es/sites/default/files/biblioteca/documentos/FICHA_MICODATA_0.pdf  
  - Micocyl / regulación: https://www.micocyl.es/  
  - Junta CyL aprovechamiento: https://medioambiente.jcyl.es/web/es/medio-natural/aprovechamiento-micologico-setas-trufas.html  
  - CESEFOR (fundación técnica): https://cesefor.com/

**Qué pedir (carta modelo en §5):**

- Acceso a series históricas de parcelas / inventarios con **especies validadas** y, si existen, **fotografías de campo** con permiso de uso en ML no comercial o con licencia explícita.
- Metadatos: hábitat, hospedador, fecha, municipio, validación experta.
- Colaboración de evaluación regional (Soria / CyL) para un *hold-out* geográfico.

### 3.2 Asociación Montes de Soria

- Web: https://asociacionmontesdesoria.com/
- Enfoque: aprovechamiento sostenible de montes y recurso micológico, valor en pueblos.
- **Qué pedir:** convenio de fotos etiquetadas por recolectores/guías, acceso a listados de especies por acotado (no secretos comerciales), participación en validación humana de VisionSetil.

### 3.3 Real Jardín Botánico – CSIC (MA-Fungi)

- Mayor colección de hongos de España (~100 000 especímenes, 2026).
- GBIF / IPT:  
  - https://ipt.gbif.es/resource?r=ma-fungi  
  - Dataset histórico: https://www.gbif.org/es/dataset/835e62e2-f762-11e1-a439-00145eb45e9a  
  - DIGITAL.CSIC: https://digital.csic.es/handle/10261/256896  
- **Qué pedir:**  
  - Descarga Darwin Core ya pública vía GBIF.  
  - Permiso para uso de **imágenes de ejemplar** (si las publican) en entrenamiento con citación.  
  - Contacto herbario MA-Fungi / RJB para subset ibérico de basidiomicetos carnosos (no liquenes).

### 3.4 Otras pistas España

| Recurso | URL / nota |
|---------|------------|
| Banco de Setas | https://www.bancodesetas.es/ — base de caracteres (no es dump de fotos) |
| Cotos de setas | https://cotosdesetas.es/ — regulación, no dataset ML |
| Sociedades micológicas provinciales | Contactar vía federaciones / ayuntamientos; suelen tener herbaria fotográficas de salidas |
| Universidad de Granada – tipos hongos/líquenes | GBIF dataset de tipos: https://www.gbif.org/dataset/7ac0504d-0230-4029-afbe-04657ae47c48 |

---

## 4. Datasets ML internacionales (seguir usando)

| Dataset | Enlace | Notas |
|---------|--------|-------|
| Danish Fungi / DF20 | https://sites.google.com/view/danish-fungi-dataset | Multi-imagen por observación |
| FungiCLEF (LifeCLEF / Kaggle) | https://www.imageclef.org/FungiCLEF2025 | Benchmark few-shot actual |
| FungiTastic | OpenReview / papers FungiTastic | 20 años de registros multi-modal |
| FGVCx Fungi | https://github.com/visipedia/fgvcx_fungi_comp | ~1.4k spp clásicas |

**Estrategia recomendada:**  
1) Re-entrenar con **FungiCLEF/DF full** (no subsample 500×8) en Kaggle GPU.  
2) Fine-tune o evaluación regional con **GBIF ES + bbox Soria**.  
3) Convenio CyL/Soria para etiquetas expertas y test set “campo real”.

---

## 5. Plantilla de solicitud (correo)

```
Asunto: Solicitud de colaboración — dataset de fotos de setas validadas (VisionSetil / investigación)

Estimados/as [Micocyl | CESEFOR | Montes de Soria | MA-Fungi RJB-CSIC],

Somos el equipo de VisionSetil, una aplicación de identificación orientativa de
hongos con política de seguridad (nunca autoriza consumo). Estamos construyendo
un modelo multi-vista y buscamos:

1) Fotografías de campo o de herbario de basidiomicetos de Castilla y León /
   Soria / España, con identificación validada (experto o research-grade).
2) Metadatos: especie, fecha, localidad (municipio o UTM), hábitat/sustrato,
   y si es posible vistas (sombrero, himenio, pie, base).
3) Licencia de uso para entrenamiento de modelos de visión (preferible CC-BY
   o acuerdo de investigación no comercial).

A cambio ofrecemos:
- Informe de métricas (MAP@3, recall de especies peligrosas, open-set).
- Dashboard de salud del modelo y posibilidad de validación humana.
- Citación del organismo y del dataset en documentación y papers.

Quedamos a su disposición para una reunión o NDA/convenio.

Saludos cordiales,
[Nombre] — [email] — [web]
```

---

## 6. Checklist “dejar listo para que funcione”

- [x] Pesos multi-view descubiertos y cargables (`best.pt` v8).
- [x] Métricas de entrenamiento expuestas en API/dashboard (`metrics.json`).
- [x] Inventario de fuentes ES/Soria + script GBIF.
- [ ] Descargar dump GBIF ES+Fungi+imagen (cuenta GBIF) o subset Soria.
- [ ] Re-entrenar notebook Kaggle con más especies/obs (subir `max_species` / epochs).
- [ ] Enviar cartas a Micocyl/CESEFOR, Montes de Soria, MA-Fungi.
- [ ] Hold-out geográfico CyL en evaluación.

Ver también: `data/training_sources_registry.json`, `docs/dataset_strategy.md`,
`docs/model_metrics_report.md`.
