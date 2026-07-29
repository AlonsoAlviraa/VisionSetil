# Index Fungorum — usage & citation (VisionSetil)

**Status:** integrated (graph eng v1.9.0+)  
**Role:** nomenclatural backbone (names / synonyms / IF RecordIDs)  
**Not a role:** images, edibility, classify labels, product_unlock  

## Citation (copy-paste)

### Full (docs, model card, papers)

> Nomenclatural data from **Index Fungorum** (https://www.indexfungorum.org/), Royal Botanic Gardens, Kew. Used as an educational taxonomic name backbone only. Not consumption or forage permission. VisionSetil SSOT catalog names are not auto-overwritten by IF current names.

### Short (UI footer / chips)

> Index Fungorum (RBG Kew) — names only · never consumption · https://www.indexfungorum.org/

## Live API

| Item | Value |
|------|--------|
| Base | `https://www.indexfungorum.org/ixfwebservice/fungus.asmx` |
| Health | `GET …/IsAlive` → `true` |
| Search | `GET …/NameSearch?SearchText=…&AnywhereInText=false&MaxNumber=15` |
| Synonym cluster | `GET …/NamesByCurrentKey?CurrentKey={record}` |
| Record page | `https://www.indexfungorum.org/Names/NamesRecord.asp?RecordID={id}` |

Legacy path `…/IXFWebService/FungusName.asmx` → **404** (do not use).

### Product proxy (preferred in app)

| Route | Purpose |
|-------|---------|
| `GET /nomenclature/health` | Upstream IsAlive |
| `GET /nomenclature/attribution` | Kew citation block |
| `GET /nomenclature/resolve?q=` | Best match + current name + synonyms |

Client: `backend/app/services/index_fungorum.py`  
Probe: `python scripts/probe_index_fungorum.py`

## Product surfaces

1. Species detail — IF panel (`species-if-nomen`)  
2. Encyclopedia — search boost + hint (`ency-if-search-hint`)  
3. Footer — always-visible attribution  
4. ML dashboard — model-card nomenclature panel  
5. This file + `docs/MODEL_CARD.md` §4  

## Policy rules (non-negotiable)

1. **Attribute** Index Fungorum + link when used as backbone.  
2. **Never** map IF fields to edible/safe labels.  
3. **Never** auto-replace product SSOT scientific names from IF alone.  
4. Show **diff banner** when IF current name ≠ ficha SSOT.  
5. Optional Kew **CSV bulk** (curator offer) is operator-scheduled (P16).  

## Bulk synonym expand (P16)

**Script:** `python scripts/expand_synonyms_if_bulk.py --apply --delay 0.2`

| Mode | Flag | Notes |
|------|------|-------|
| Live API | default | NameSearch + synonym cluster per SSOT taxon |
| Kew CSV | `--csv path.csv --no-api` | Flexible headers; maps onto SSOT only |
| Dry-run | omit `--apply` | Report only |

**Outputs:**

- `data/species_catalog/taxon_synonyms.json` (+ FE mirror)
- `eval/reports/ml_experiments/if_synonym_bulk_report.json`

**Merge rules:** curated keys never overwritten · alias never another SSOT taxon · preferred must be SSOT · SSOT preferred spelling never flipped to IF current.

**2026-07-28 bulk run:** 523 taxa scanned · **6951** new aliases · 6954 total · `product_unlock=false`.

When Kew provides official CSV dumps, re-run with `--csv` to merge additional edges without removing curated/API edges (curated still wins conflicts).

## Kew collaboration note

Correspondence with Index Fungorum curators (2026-07) confirmed:

- Open **API** use is appropriate for app integration.  
- **CSV dumps** can be arranged for bulk needs.  
- Clear **acknowledgement + link** required on site/app.  
- Substantial research use → full acknowledgement; major intellectual contribution may warrant curator co-authorship discussion.

## Related

- `docs/MODEL_CARD.md`  
- `docs/MEDIA_SOURCES_AND_PARTNERS.md`  
- `docs/SAFETY_POLICY.md`  
- `.grok/graph-engineering/STATE.md`  
