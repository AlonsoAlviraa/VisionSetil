# Open mycology knowledge sources (VisionSetil)

**Policy:** orientation only · never forage · never consumption permission · `product_unlock=false`  
**License gate:** only open APIs and CC0 / CC-BY / CC-BY-SA / ODbL / MIT / Apache-2.0 / Public Domain.  
**Hard no:** paid field-guide PDFs, closed copyright books, “descargar el libro entero” from commercial publishers.

This document is the **SSOT for which external knowledge VisionSetil may ingest**.

---

## 1. Taxonomic & occurrence APIs (preferred)

| Source | License / terms | Product use |
|--------|-----------------|-------------|
| [Index Fungorum](http://www.indexfungorum.org/) | Public taxonomic names | Canonical names, synonyms (`taxon_synonyms`, IF join) |
| [GBIF](https://www.gbif.org/) | Varies per dataset (filter open) | Iberia occurrence layers (`layers/gbif_iberia_top.json`) |
| [iNaturalist Open Data](https://www.inaturalist.org/pages/developers) | CC0 / CC-BY / CC-BY-NC (filter NC for commercial) | Photos, research-grade observations |
| [Wikidata](https://www.wikidata.org/) | CC0 | Taxon IDs, links to Commons |
| [Wikimedia Commons](https://commons.wikimedia.org/) | File-level free licenses | Hero/catalog photos (`speciesPhotos.json`) |
| [GBIF Backbone / COL](https://www.catalogueoflife.org/) | Open checklist APIs | Name resolution |

## 2. Trait / ecology open projects

| Source | License | Product use |
|--------|---------|-------------|
| [FUNGuild](https://github.com/UMNFuN/FUNGuild) (+ [FUNGuildR](https://github.com/brendanf/FUNGuildR)) | Open research | Future ecological guild tags (education only) |
| [WeMush open standard](https://github.com/wemush/open-standard) | Open spec | Future structured observation notes |
| Local `multiview_diagnostic_map.json` | Project | Critical views for deadly confusions |

## 3. In-repo knowledge already wired

| Path | Content |
|------|---------|
| `data/species_catalog/species_catalog_v2.json` | ~523 taxa Iberia-oriented |
| `data/species_catalog/classic_lookalike_pairs.json` | Educational confusion pairs |
| `data/species_catalog/multiview_diagnostic_map.json` | Critical multi-view packets |
| `data/species_catalog/layers/gbif_iberia_top.json` | GBIF Iberia popularity layer |
| `data/species_catalog/layers/iberia_common.json` | Common Iberian set |
| `frontend/src/data/speciesPhotos.json` | Open-license photo cascade |
| `frontend/src/lib/foodQuality*` | Curated educational food-class index (not permission) |
| `frontend/src/lib/dailyGames.ts` | Verified daily games pool |

## 4. What we will **not** do

- Download full commercial mycological books or paid PDFs.
- Scrape behind paywalls or “copy the whole guide” from closed sites.
- Treat any open photo or label as **permission to eat**.
- Raise `product_unlock` based on more knowledge.

## 5. Ingest pipeline (allowed)

1. Prefer **API + open dump** over HTML scrape.  
2. Record **license + URL + retrieval date** per asset.  
3. Drop **CC-BY-NC** if product becomes commercial (already noted in audits).  
4. Unit-test verification: `speciesMediaVerify`, lookalike pair ids, dailyGames pool.  
5. Human residual for any “forage-adjacent” copy.

## 6. Priority knowledge gaps → product

| Gap | Open approach | Surface |
|-----|---------------|---------|
| More deadly confusions | Expand `classic_lookalike_pairs.json` from open field knowledge + IF names | Lookalike Studio, Quiz, Result |
| Trait depth on ficha | Curate from catalog + IF + open descriptions (no closed books) | SpeciesDetail tabs |
| Phenology honesty | Already educational bar; keep “never harvest calendar” | Encyclopedia habitat |
| Photo quality | Commons/iNat open only; quality=display/hd | Cards, hero, games |
| Games daily depth | `dailyGames` verified pool + LoLdle modes | `/juegos` |

---

*Last updated: 2026-07-31 · workflow `visionsetil-mycology-perf-uplift`*
