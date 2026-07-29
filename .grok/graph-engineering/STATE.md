# VisionSetil Graph Engineering — STATE

**Mode:** Graph Engineering (audit → photo + nav + dual layout)  
**Updated:** 2026-07-29  
**Goal:** Store-ready app shell + trustworthy real photos · never product_unlock · never forage

## Active graph version

`v1.10.4-competitive-world`

## Current status

| Area | Status | Notes |
|------|--------|--------|
| Dual layout App / Web | **SHIPPED** | `app--mode-app` · `app--mode-web` · toggle header |
| Más duplication | **FIXED** | single hub+menu; app mode hides header Más (bottom nav) |
| Real photo cascade | **FIXED** | catalog first · no crossOrigin CORS kill · night placeholders |
| Stitch B skin | **SHIPPED** | campo-nocturno + web layer |
| Mapa | **KEEP CURRENT** | user lock |
| product_unlock | **BLOCKED** | false |
| Competitive audit | **SHIPPED** | `docs/design/COMPETITIVE_AUDIT_2026.md` |
| Top10 web + apps | **SHIPPED** | `docs/design/COMPETITIVE_TOP10_WEB_AND_APPS.md` |
| Season strip + family guide | **SHIPPED** | Home + Enciclopedia |
| Open study links | **SHIPPED** | Ficha → Wiki / iNat / GBIF |
| World resources hub | **SHIPPED** | Más → 10 webs/apps |

## Audit findings (this cycle)

1. **Más ×2** in header (primaryNav link + dropdown label) → fixed  
2. **Wiki/iNat imgs blank** with `crossOrigin=anonymous` (no CORS) → removed  
3. **SpeciesImage** tried local before catalog despite `preferCatalog` → catalog first  
4. Games cards **opacity 0.5** washed photos → restored full opacity  
5. Light-green skeletons on night UI → dark night skeletons  

## Residual next

1. Identify/result pixel vs Stitch 02–03  
2. Weaker local `/media` taxa (under 15kb) optional re-fetch  
3. Operator deploy residual  

## product_unlock

Always **false**.
