# Inventario de datasets — VisionSetil (2026-07-25)

Barrido: Gmail partners, Kaggle, GitHub, Reddit, X y web.  
**Política:** solo fuentes con licencia abierta o permiso escrito.  
**No scrape:** Mushroom Observer, Fungipedia, stock, iNat all-rights-reserved, mushroom.world.

Allowlist industrial: **40 spp** hasta MAP@3 ≥ 0.22 y deadly@3 ≥ 0.50.

---

## P0 — Oficiales (prioridad train)

| ID | Fuente | Escala | Acceso | Estado en repo |
|----|--------|--------|--------|----------------|
| fungitastic | FungiTastic (Picek et al.) | ~350k obs, >600k imgs | [Kaggle](https://www.kaggle.com/datasets/picekl/fungitastic), [docs full-res](https://bohemianvra.github.io/FungiTastic/) | E16–E18 |
| df20 | Danish Fungi 2020 | ~276k imgs, 1604 spp | [GitHub](https://github.com/BohemianVRA/DanishFungiDataset), [site](https://sites.google.com/view/danish-fungi-dataset) | converter existe; **montar E19** |
| fgvcx_2018 | FGVCx Fungi 2018 | 1394 spp, ~85k train | [Kaggle comp](https://www.kaggle.com/c/fungi-challenge-fgvc-2018), [visipedia](https://github.com/visipedia/fgvcx_fungi_comp) | pendiente |
| gbif_es | GBIF Fungi ES StillImage | ~244k c/ imagen (probe) | API + download autenticado | package JSON listo |
| inat_via_gbif | iNat research-grade vía GBIF | subset | Solo CC0/CC-BY/CC-BY-SA | vía GBIF |

**Gmail Picek:** datos ya online; citación esperada; no pack privado.

---

## P1 — Packs Kaggle de imágenes (filtrar allowlist)

| Slug | Notas |
|------|--------|
| `thehir0/mushroom-species` | ~10 GB carpetas especie |
| `daniilonishchenko/mushrooms-images-classification-215` | 215 spp |
| `maysee/mushrooms-classification-common-genuss-images` | géneros comunes |
| `lizhecheng/mushroom-classification` | imágenes |
| `marcosvolpato/edible-and-poisonous-fungi` | **solo taxón**, no label comestible |
| `zlatan599/mushroom1` | en E18 |
| `dariobaumberger/combined-kaggle-mushrooms-dataset` | en E18 |

---

## P1b — Niche / eval

| Fuente | Uso |
|--------|-----|
| OpenFungi (Cighir et al. 2025, MDPI Life) | ~1249 imgs macro+micro; few-shot / género |
| HF BVRA FungiTastic models | baselines, no datos nuevos |
| Wikimedia Commons CC | media encyclopedia; train solo CC filtrado |

---

## P2 — No usar para ID de especie en campo

- UCI / tabular mushroom-classification  
- DeFungi solo micro  
- Plant pathogen datasets  
- Genomas  
- Deep Shrooms / mushroom.world scrape (ToS)  
- Scrapers Reddit/X de fotos de usuarios  

---

## P3 — Partners (async Gmail)

Micocyl / CESEFOR / Junta CyL / Montes de Soria / sociedades / herbario / UNITE / Faces of Fungi  
→ sin dumps aún; CRM humano.

---

## Orden de ingesta recomendado

1. DF20 oficial + FGVCx 2018  
2. GBIF ES CC × allowlist (mortales primero)  
3. FungiTastic full-res si hace falta  
4. Packs P1 con overlap allowlist medido  
5. OpenFungi hold-out  
6. Partners cuando respondan  

## Gates (sin cambiar)

| Meta | MAP@3 | Deadly@3 |
|------|------:|---------:|
| Expandir a 80 spp | ≥ 0.22 | ≥ 0.50 |
| Soft shippable A | ≥ 0.25 | ≥ 0.90 |
