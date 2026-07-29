# VisionSetil — Model Card (product honesty)

**Product:** VisionSetil (educational field mycology)  
**Policy:** orientation only · never consumption permission · `product_unlock=false` by design  
**Updated:** 2026-07-28 · Graph eng **v1.9.2**

This card describes **what the model is for**, **what data backs names vs pixels**, and **how to cite third-party sources**. It is not a forage licence.

---

## 1. Intended use

| Allowed | Not allowed |
|---------|-------------|
| Field **orientation** (tentative species cues) | Permission to eat or forage |
| Multi-view capture coaching | “Safe to eat” / green edible clearance |
| Open-set abstention (`decision: rejected`) | Medical or legal identification |
| Encyclopedia / study / games | Offline food-safe AI ID |

Primary serve path (E20 era): MultiView classifier with calibrated open-set thresholds; dual deadly honesty metrics on holdout.

---

## 2. Model / serve stack (summary)

| Layer | Role |
|-------|------|
| Multi-view image encoder (industrial lineage) | Species ranking among closed set |
| Open-set (conf / margin / entropy) | Abstain when uncertain |
| Quality gate | `species_id_allowed` serve policy (product unlock still forced false) |
| SSOT catalog + lookalikes | Educational confusions; risk chips |
| **Index Fungorum** | **Nomenclatural names only** (not visual training labels of truth) |

Metrics and checkpoint paths: see `eval/reports/ml_experiments/`, `docs/QUALITY_GATE.md`, operator unlock runbook.  
**Do not** treat MAP@3 or deadly@3 as forage safety.

---

## 3. Data sources (training / eval pixels)

Public ML datasets and occurrence media (non-exhaustive; registry SSOT):

- FungiCLEF / Danish Fungi lineage  
- FungiTastic (when local)  
- GBIF Fungi still images (Spain / regional probes)  
- iNaturalist research-grade via open licences where used  

Registry: `data/training_sources_registry.json`  
Guide: `docs/DATA_SOURCES_SPAIN_SORIA.md`, `docs/MEDIA_SOURCES_AND_PARTNERS.md`

---

## 4. Nomenclatural backbone — Index Fungorum (required citation)

**Source:** [Index Fungorum](https://www.indexfungorum.org/)  
**Maintainer:** Royal Botanic Gardens, Kew (curatorial contact: Index Fungorum / Species Fungorum team)  
**API (live):** `https://www.indexfungorum.org/ixfwebservice/fungus.asmx`  
**Probe artifact:** `eval/reports/ml_experiments/index_fungorum_probe.json`  
**Product docs:** `docs/INDEX_FUNGORUM.md`

### What we use IF for

- Resolve scientific names (status, authors, IF RecordID)  
- Surface **current name** vs product SSOT when they differ  
- Educational synonym lists on species fichas / encyclopedia search boost  
- Stable deep-links: `NamesRecord.asp?RecordID=…`

### What we never use IF for

- Edibility, toxicity, or consumption clearance  

- Overwriting VisionSetil **product SSOT** scientific names automatically  
- Image training labels or classify logits  

### Recommended citation (product / docs / model card)

> Nomenclatural data for scientific names and synonyms are provided by **Index Fungorum** ([https://www.indexfungorum.org/](https://www.indexfungorum.org/)), maintained at the **Royal Botanic Gardens, Kew**. VisionSetil uses Index Fungorum as a **taxonomic name backbone for educational orientation only**, not as permission for consumption or foraging. Product species identifiers may retain local SSOT spellings; IF current names are shown for transparency.

### Short UI attribution

`Index Fungorum (Royal Botanic Gardens, Kew) — names only, never consumption.`  
Link: https://www.indexfungorum.org/

### API / code hooks

| Surface | Path |
|---------|------|
| BE resolve | `GET /nomenclature/resolve?q=` |
| BE attribution | `GET /nomenclature/attribution` |
| BE models registry | `GET /models/data-sources` → `nomenclature` |
| FE ficha | Species detail `species-if-nomen` |
| FE search | Encyclopedia IF search boost |
| FE footer | `footer-index-fungorum` |

When Index Fungorum contributes **substantially** to a **scientific publication**, follow Kew guidance: acknowledge Index Fungorum and consider co-authorship with relevant curators where intellectual contribution is significant (see curator correspondence 2026-07).

---

## 5. Safety & honesty

- Always `orientation_only` / `unsafe_to_consume` semantics in classify outputs  
- Open-set rejection is a first-class product state  
- Multi-view without diagnostic slots is **not** marketed as deadly-safe ID  
- `product_unlock` remains **false** until explicit operator cycle (never auto from metrics)

See: `docs/SAFETY_POLICY.md`, `docs/OPERATOR_UNLOCK_RUNBOOK.md`.

---

## 6. Limitations

- Closed-set class list is limited (E20 industrial ~40 classes for real weights; catalog broader for education)  
- Nomenclatural current names can lag or differ from regional checklists  
- Community labels (GBIF/iNat) are not expert mycologist certificates  
- Model confidence is **not** research-grade verification  

---

## 7. Contact / ops

- Product safety policy owners: VisionSetil engineering  
- Index Fungorum data issues: [Index Fungorum contact](https://www.indexfungorum.org/Contact.asp) / Kew fungal systematics  
- Training source collaboration: `docs/PARTNER_OUTREACH_EMAILS.md`
